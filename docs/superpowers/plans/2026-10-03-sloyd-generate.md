# Generate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user describes a piece of furniture, picks constraints, clicks Generate, and gets 1–3 prototype designs — ordinary Sloyd boards — each saved as a new project in the library, built by Claude through a submit-whole-design-then-repair loop.

**Architecture:** Two pure document modules (`generated.ts` converts the model's world boxes into boards; `designCheck.ts` finds overlaps, floating parts and limit violations), an `LlmClient` seam with one Claude implementation, a pure `runGeneration` loop, an App-level `useGenerations` hook that writes finished designs with `createProject(doc, { activate: false })`, and two modal dialogs. Generation never adopts a project and never touches the open document.

**Tech Stack:** React 19, TypeScript 7, Zustand, Vitest 4 + Testing Library (jsdom), `@anthropic-ai/sdk` (new), nginx CSP.

**Spec:** `docs/superpowers/specs/2026-10-03-sloyd-generate-design.md` — read it before starting any task. Where this plan and the spec disagree, the two **Deviations** below are the only intended ones; anything else is a plan error — stop and escalate.

## Deviations from the spec (approved with the plan)

1. **Vectors are `{x, y, z}` objects, not `[x, y, z]` tuples** (spec §4.1). Structured outputs do not support "complex array constraints", so a fixed-length tuple cannot be enforced by the schema; an object with three required number fields can.
2. **The dialogs use the existing `CutList` overlay pattern, not native `<dialog>`** (spec §6.2). `.app-shell` already goes `inert` for the cut list; generalising that flag to "any modal open" gives the same inertness with code the suite already exercises, and avoids depending on jsdom's `showModal` support.
3. **"An exported document never contains the key" is tested as "no stored key other than `sloyd.llm.v1` contains the key"** (spec §8.1). Export serialises the document, which has no field the key could ride in; the reachable mistake is the adapter writing settings into a project or index key, and this is the assertion that can fail on it.

## Global Constraints

- Layer order: `units` → `document` → `store`/`storage` → `llm` → `generate` → `viewport`/`panels`/`App`. `llm/` imports nothing from the app. `generate/` imports only `document` and `llm`. `src/useGenerations.ts` sits beside `App.tsx`.
- `SNAP_INCHES = 1/16` moves to `document/geometry.ts`; `Gizmo.tsx` imports it from there. One home.
- `TOUCH = 1/32`, `MIN_SIDE = 1/8`, detail caps `simple: 12, moderate: 30, detailed: 60`, `MAX_REPAIRS = 3` (4 calls total).
- Models: `claude-opus-5-5` (default, label "Claude Opus 5.5") and `claude-sonnet-5-5` ("Claude Sonnet 5.5"). Effort `medium` for both as the starting value (confirmed in Task 11).
- Storage key `sloyd.llm.v1` = `{ provider: 'anthropic', apiKey, model }`, only through `StorageAdapter`.
- Generation must **not** bump `switchToken`, call `replaceDocument`, `edit()`, or any store action.
- Max size labels are **Width × Depth × Height** = world X × Z × Y.
- Model-facing messages use decimal inches (`0.75in`) — they are for the model, not printed on a sheet, so `document/designCheck.ts` does **not** take the `→ units` edge.
- `npm test` does not typecheck: run `npm run build` before claiming a task compiles.
- No pull requests. Work on a branch `generate`, merge locally with `--no-ff` at the end.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Double-clicking Generate** — expected: one batch, never two. Pinned in Task 8 (button disabled while `live > 0`) and Task 6 (`start` is a no-op while runs are live).
2. **An unparseable max size** (`abc`, `-3`) — expected: inline field error and Generate blocked, not a silently ignored limit. Pinned in Task 8.
3. **A whitespace-only description** — expected: Generate disabled. Pinned in Task 8.
4. **Non-finite, zero or negative numbers in model output** — expected: that part becomes a `too-small`/`not-finite` violation, the rest of the design survives, nothing NaN reaches the document. Pinned in Task 1.
5. **Duplicate part names in model output** — expected: names are deduped by `migrateDocument` and the check's messages use the **stored** names, so the model is told about the part it can actually find. Pinned in Task 4.

---

## File map

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/document/geometry.ts` | Modify | gains `SNAP_INCHES` |
| `src/viewport/Gizmo.tsx` | Modify | imports `SNAP_INCHES` |
| `src/document/generated.ts` (+ test) | Create | design types, JSON schema, `parseDesign`, `designToDocument` |
| `src/document/designCheck.ts` (+ test) | Create | `checkDesign`, `rejectedViolations` |
| `src/storage/types.ts`, `src/storage/browser.ts` (+ test) | Modify | LLM settings methods |
| `src/App.test.tsx` | Modify | storage fake gains LLM methods; new App tests |
| `src/llm/types.ts` | Create | `LlmClient` seam |
| `src/generate/prompt.ts` (+ test) | Create | system prompt, user message, repair message |
| `src/generate/run.ts` (+ test) | Create | `runGeneration` |
| `src/llm/anthropic.ts` (+ test) | Create | `AnthropicClient`, `CLAUDE_MODELS`, `toLlmError` |
| `src/useGenerations.ts` (+ test) | Create | batch of runs, writing projects |
| `src/panels/SettingsDialog.tsx` (+ test) | Create | key + model |
| `src/panels/GenerateDialog.tsx` (+ test) | Create | form + progress rows |
| `src/panels/Toolbar.tsx`, `src/panels/ProjectMenu.tsx` (+ tests) | Modify | buttons, new badge |
| `src/App.tsx` | Modify | modal flag, wiring |
| `src/styles.css` | Modify | dialog and badge styles |
| `security-headers.conf` | Modify | `connect-src` |
| `docs/browser-verification-generate.md`, `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`, `DEPLOYMENT.local.md` | Modify/Create | the round's record |

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b generate` from a clean `master`. Run `npm test` and record the baseline count (expect 954 passing across 36 files).

---

### Task 1: `generated.ts` — the model's design, converted to boards

**Files:**
- Modify: `src/document/geometry.ts`, `src/viewport/Gizmo.tsx:10-12`
- Create: `src/document/generated.ts`, `src/document/generated.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Vec3 { x: number; y: number; z: number }
  export type MaterialKey = string; // a key of MATERIALS
  export interface GeneratedPart { name: string; material: MaterialKey; at: Vec3; size: Vec3 }
  export interface GeneratedDesign { name: string; parts: GeneratedPart[] }
  export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' }
  export const DESIGN_SCHEMA: Record<string, unknown>;
  export function parseDesign(json: unknown): GeneratedDesign | null;
  export function designToDocument(design: GeneratedDesign): { doc: SloydDocument; rejected: RejectedPart[] };
  export function orient(size: [number, number, number]): Pick<Board, 'length' | 'width' | 'thickness' | 'posture' | 'rotation'>;
  // geometry.ts:
  export const SNAP_INCHES = 1 / 16;
  ```

- [ ] **Step 1: Move `SNAP_INCHES`.** In `src/document/geometry.ts`, after `DIMENSION_ORDER`, add:

```ts
/**
 * The 1/16" grid a FREE value is rounded to — a gizmo drag, or a model's
 * generated part. Lives here rather than in viewport so that document code
 * (generated.ts) can round to the same grid without importing upward. Never
 * applied to an exact position or a difference of two (invariant 25).
 */
export const SNAP_INCHES = 1 / 16;
```

In `src/viewport/Gizmo.tsx` replace `export const SNAP_INCHES = 1 / 16;` with `import { SNAP_INCHES } from '../document/geometry';` placed with the other imports, and add `export { SNAP_INCHES };` only if `grep -rn "from './Gizmo'" src | grep SNAP_INCHES` finds an importer (it currently finds none). Run `npm run build` — expect success.

- [ ] **Step 2: Write the failing tests** — `src/document/generated.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { designToDocument, orient, parseDesign, DESIGN_SCHEMA } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { boardExtents } from './geometry';
import { MATERIALS } from './types';
import type { Board } from './types';

const part = (name: string, at: [number, number, number], size: [number, number, number], material = 'pine'): GeneratedPart => ({
  name, material,
  at: { x: at[0], y: at[1], z: at[2] },
  size: { x: size[0], y: size[1], z: size[2] },
});
const design = (...parts: GeneratedPart[]): GeneratedDesign => ({ name: 'Test', parts });

// Bound from OUTSIDE the converter: the expected extents come from the
// existing boardExtents, never from orient's own arithmetic (invariant 23).
const asBoard = (o: ReturnType<typeof orient>): Board => ({
  id: 'x', name: 'x', position: [0, 0, 0], grain: 'length', material: 'pine', cuts: [], ...o,
});

describe('orient', () => {
  const PERMUTATIONS: [number, number, number][] = [
    [30, 0.75, 11], [30, 11, 0.75], [11, 30, 0.75],
    [0.75, 30, 11], [11, 0.75, 30], [0.75, 11, 30],
  ];
  it.each(PERMUTATIONS)('reproduces world size %s', (x, y, z) => {
    expect(boardExtents(asBoard(orient([x, y, z])))).toEqual([x, y, z]);
  });
  it('makes the longest side length and the shortest thickness', () => {
    const o = orient([11, 30, 0.75]);
    expect([o.length, o.width, o.thickness]).toEqual([30, 11, 0.75]);
  });
  it.each([[[24, 24, 0.75]], [[12, 12, 12]], [[0.75, 24, 24]]] as [[number, number, number]][])(
    'handles ties: %s', (size) => {
      expect(boardExtents(asBoard(orient(size)))).toEqual(size);
    });
});

describe('designToDocument', () => {
  it('rounds every at and size component to 1/16"', () => {
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [10.03, 0.74, 3.97])));
    expect(boardExtents(doc.boards[0])).toEqual([10, 0.75, 4]);
  });

  it('puts the design on the floor and centres its footprint on the origin', () => {
    const { doc } = designToDocument(design(
      part('A', [10, 5, 20], [4, 1, 2]),
      part('B', [14, 5, 20], [4, 1, 2]),
    ));
    const [a, b] = doc.boards;
    expect(a.position).toEqual([-4, 0, -1]);
    expect(b.position).toEqual([0, 0, -1]);
  });

  it('keeps every translated position on the 1/16" grid', () => {
    // footprint 1/16 wide: centring by half of it would land on 1/32
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [1 / 16, 1, 1])));
    const x = doc.boards[0].position[0];
    expect(Math.round(x * 16)).toBe(x * 16);
  });

  it('rejects a part with a non-finite number and keeps the rest', () => {
    const { doc, rejected } = designToDocument(design(
      part('Bad', [0, 0, 0], [Number.NaN, 1, 1]),
      part('Good', [0, 0, 0], [10, 1, 1]),
    ));
    expect(rejected).toEqual([{ name: 'Bad', reason: 'not-finite' }]);
    expect(doc.boards.map((b) => b.name)).toEqual(['Good']);
    expect(doc.boards.flatMap((b) => b.position).every(Number.isFinite)).toBe(true);
  });

  it.each([[0], [-2], [0.01]])('rejects a part whose size rounds to %s or below zero as too-small', (s) => {
    const { rejected } = designToDocument(design(part('Thin', [0, 0, 0], [10, s, 1])));
    expect(rejected).toEqual([{ name: 'Thin', reason: 'too-small' }]);
  });

  it('passes the result through migrateDocument — duplicate names are deduped', () => {
    const { doc } = designToDocument(design(
      part('Shelf', [0, 0, 0], [10, 1, 1]),
      part('Shelf', [0, 1, 0], [10, 1, 1]),
    ));
    const names = doc.boards.map((b) => b.name);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe('Shelf');
    expect(new Set(doc.boards.map((b) => b.id)).size).toBe(2);
  });

  it('falls back to a default name when the design name is blank', () => {
    expect(designToDocument({ name: '   ', parts: [] }).doc.name).toBe('Generated design');
  });

  it('generates no cuts and grain along length', () => {
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [10, 1, 1])));
    expect(doc.boards[0].cuts).toEqual([]);
    expect(doc.boards[0].grain).toBe('length');
  });
});

describe('parseDesign', () => {
  it('accepts a well-formed design', () => {
    const d = design(part('A', [0, 0, 0], [1, 2, 3]));
    expect(parseDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it.each([
    null, 42, {}, { name: 'x' }, { name: 'x', parts: [] },
    { name: 'x', parts: [{ name: 'A', material: 'pine', at: { x: 0, y: 0 }, size: { x: 1, y: 1, z: 1 } }] },
    { name: 'x', parts: [{ name: 'A', material: 'unobtanium', at: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }] },
  ])('rejects %j', (bad) => {
    expect(parseDesign(bad)).toBeNull();
  });
});

describe('DESIGN_SCHEMA', () => {
  it("offers exactly MATERIALS' keys", () => {
    const parts = (DESIGN_SCHEMA as any).properties.parts.items;
    expect(parts.properties.material.enum).toEqual(Object.keys(MATERIALS));
  });
  it('sets additionalProperties: false on every object', () => {
    const walk = (s: any): boolean =>
      s.type !== 'object' || (s.additionalProperties === false && Object.values(s.properties).every(walk));
    const root = DESIGN_SCHEMA as any;
    expect(walk(root) && walk(root.properties.parts.items)).toBe(true);
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/document/generated.test.ts` — expect FAIL (module not found).

- [ ] **Step 4: Implement** `src/document/generated.ts`:

```ts
import { createDocument, migrateDocument } from './document';
import type { SloydDocument } from './document';
import { DIMENSION_ORDER, SNAP_INCHES, axisDimensions } from './geometry';
import { MATERIALS } from './types';
import type { Board, Dimension, Posture, Rotation } from './types';

/**
 * What the model sends back (spec §4.1). The model thinks in WORLD BOXES —
 * a min-corner and an extent along each world axis — and never in Sloyd's
 * length/width/thickness + posture + rotation encoding, which is ours to
 * derive (`orient`). Vectors are objects, not tuples, because structured
 * outputs cannot constrain an array's length.
 */
export interface Vec3 { x: number; y: number; z: number }
export type MaterialKey = string;
export interface GeneratedPart { name: string; material: MaterialKey; at: Vec3; size: Vec3 }
export interface GeneratedDesign { name: string; parts: GeneratedPart[] }
export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' }

const vec3Schema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false,
};

/** Built from MATERIALS at load, so a new material reaches the model with no second edit. */
export const DESIGN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          material: { type: 'string', enum: Object.keys(MATERIALS) },
          at: vec3Schema,
          size: vec3Schema,
        },
        required: ['name', 'material', 'at', 'size'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'parts'],
  additionalProperties: false,
};

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isVec3 = (v: unknown): v is Vec3 =>
  isObj(v) && (['x', 'y', 'z'] as const).every((k) => typeof v[k] === 'number');

/**
 * Shape check on the parsed output. The API enforces the schema, but this is
 * the client's own gate — a provider without structured outputs, or a
 * truncated stream, must not reach the converter. Numbers are only checked
 * for TYPE here; non-finite values are the converter's to reject per part.
 * An empty parts list is unusable, not a design.
 */
export function parseDesign(json: unknown): GeneratedDesign | null {
  if (!isObj(json) || typeof json.name !== 'string' || !Array.isArray(json.parts)) return null;
  if (json.parts.length === 0) return null;
  for (const p of json.parts) {
    if (!isObj(p) || typeof p.name !== 'string' || typeof p.material !== 'string') return null;
    if (!(p.material in MATERIALS) || !isVec3(p.at) || !isVec3(p.size)) return null;
  }
  return json as unknown as GeneratedDesign;
}

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

const POSTURE_FOR_UP: Record<Dimension, Posture> = {
  thickness: 'flat',
  width: 'on-edge',
  length: 'upright',
};

/**
 * World extents → Sloyd's encoding. Longest side is length, shortest is
 * thickness. Three postures × two rotations cover all six assignments of
 * dimensions to axes, so this is total; the rotation is found by asking the
 * ONE mapping (`axisDimensions`) which of the two reproduces the target,
 * rather than restating that mapping here. Ties sort by axis index, so the
 * choice is deterministic — and any choice has identical extents.
 */
export function orient(size: [number, number, number]): Pick<Board, 'length' | 'width' | 'thickness' | 'posture' | 'rotation'> {
  const order = [0, 1, 2].sort((a, b) => size[b] - size[a] || a - b);
  const onAxis: Dimension[] = [];
  onAxis[order[0]] = 'length';
  onAxis[order[1]] = 'width';
  onAxis[order[2]] = 'thickness';
  const dims = { length: size[order[0]], width: size[order[1]], thickness: size[order[2]] };
  const posture = POSTURE_FOR_UP[onAxis[1]];
  for (const rotation of [0, 90] as Rotation[]) {
    const probe = { ...dims, posture, rotation } as Board;
    const got = axisDimensions(probe);
    if (got[0] === onAxis[0] && got[2] === onAxis[2]) return { ...dims, posture, rotation };
  }
  // Unreachable: DIMENSION_ORDER has three entries and two rotations swap the
  // two horizontals. Kept as a loud failure rather than a silent default.
  throw new Error(`orient: no encoding for ${DIMENSION_ORDER.join('/')} ${size.join('x')}`);
}

/**
 * Model output → a trusted document (spec §4.2). Round first (invariant 25:
 * model output is a FREE value, like a drag), then encode, then translate the
 * whole design onto the floor with its footprint centred — by a multiple of
 * SNAP_INCHES, so the translation keeps every part on the grid — then
 * migrateDocument, the same gate an imported file passes, which dedupes
 * names (inv 8) and mints ids (inv 33).
 */
export function designToDocument(design: GeneratedDesign): { doc: SloydDocument; rejected: RejectedPart[] } {
  const rejected: RejectedPart[] = [];
  const boards: Omit<Board, 'id'>[] = [];
  for (const p of design.parts) {
    const raw = [p.at.x, p.at.y, p.at.z, p.size.x, p.size.y, p.size.z];
    if (!raw.every(Number.isFinite)) {
      rejected.push({ name: p.name, reason: 'not-finite' });
      continue;
    }
    const [ax, ay, az, sx, sy, sz] = raw.map(snap);
    if (sx <= 0 || sy <= 0 || sz <= 0) {
      rejected.push({ name: p.name, reason: 'too-small' });
      continue;
    }
    boards.push({
      name: p.name,
      material: p.material,
      grain: 'length',
      cuts: [],
      position: [ax, ay, az],
      ...orient([sx, sy, sz]),
    });
  }

  if (boards.length > 0) {
    const ext = boards.map((b) => [b.position, extentsOf(b)] as const);
    const min = [0, 1, 2].map((i) => Math.min(...ext.map(([p]) => p[i])));
    const max = [0, 1, 2].map((i) => Math.max(...ext.map(([p, e]) => p[i] + e[i])));
    const shift = [snap(-(min[0] + max[0]) / 2), -min[1], snap(-(min[2] + max[2]) / 2)];
    for (const b of boards) {
      b.position = [b.position[0] + shift[0], b.position[1] + shift[1], b.position[2] + shift[2]];
    }
  }

  const name = design.name.trim() || 'Generated design';
  const doc = migrateDocument({ ...createDocument(name), boards });
  return { doc, rejected };
}

function extentsOf(b: Omit<Board, 'id'>): [number, number, number] {
  const [x, y, z] = axisDimensions(b as Board);
  return [b[x], b[y], b[z]];
}
```

If `migrateDocument` turns out to refuse a board with no `id`, stop and report — the spec's §3.2 rests on it minting one (invariant 33 says it does).

- [ ] **Step 5: Run** `npx vitest run src/document/generated.test.ts` — expect PASS. Then `npm run build` — expect success.

- [ ] **Step 6: Mutation check.** Temporarily make `orient` return rotation `0` unconditionally; the permutation tests must go red. Temporarily remove the `snap(...)` around the X shift; the grid test must go red. Revert both.

- [ ] **Step 7: Commit**

```bash
git add src/document/geometry.ts src/viewport/Gizmo.tsx src/document/generated.ts src/document/generated.test.ts
git commit -m "feat(generate): convert a model's world-box design into boards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `designCheck.ts` — what the model gets told to fix

**Files:**
- Create: `src/document/designCheck.ts`, `src/document/designCheck.test.ts`

**Interfaces:**
- Consumes: `RejectedPart` from Task 1; `boardExtents` from `geometry.ts`.
- Produces:
  ```ts
  export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts';
  export interface Violation { kind: ViolationKind; message: string }
  export interface DesignLimits { width: number | null; depth: number | null; height: number | null; maxParts: number }
  export const TOUCH: number;      // 1/32
  export const MIN_SIDE: number;   // 1/8
  export function checkDesign(doc: SloydDocument, limits: DesignLimits): Violation[];
  export function rejectedViolations(rejected: RejectedPart[]): Violation[];
  ```

- [ ] **Step 1: Write the failing tests** — `src/document/designCheck.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkDesign, rejectedViolations, TOUCH } from './designCheck';
import type { DesignLimits } from './designCheck';
import { createBoard, createDocument } from './document';
import type { SloydDocument } from './document';
import type { Board } from './types';

const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };

// A flat board: length on X, thickness on Y, width on Z.
const box = (name: string, at: [number, number, number], size: [number, number, number]): Board =>
  createBoard({ name, position: at, length: size[0], thickness: size[1], width: size[2], posture: 'flat', rotation: 0 });
const docOf = (...boards: Board[]): SloydDocument => ({ ...createDocument('T'), boards });
const kinds = (doc: SloydDocument, limits = NO_LIMITS) => checkDesign(doc, limits).map((v) => v.kind);

describe('overlap', () => {
  it('passes two boxes whose faces touch', () => {
    expect(kinds(docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 1, 0], [10, 1, 10])))).toEqual([]);
  });
  it('passes interpenetration of exactly TOUCH', () => {
    expect(kinds(docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 1 - TOUCH, 0], [10, 1, 10])))).toEqual([]);
  });
  it('flags interpenetration just past TOUCH, naming both parts and the axis', () => {
    const v = checkDesign(docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 1 - TOUCH - 1 / 64, 0], [10, 1, 10])), NO_LIMITS);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('overlap');
    expect(v[0].message).toContain('B');
    expect(v[0].message).toContain('A');
    expect(v[0].message).toContain('along Y');
  });
});

describe('unsupported', () => {
  it('passes a stack reaching the floor', () => {
    expect(kinds(docOf(
      box('Base', [0, 0, 0], [10, 1, 10]),
      box('Mid', [0, 1, 0], [10, 1, 10]),
      box('Top', [0, 2, 0], [10, 1, 10]),
    ))).toEqual([]);
  });
  it('flags a part hovering above the rest', () => {
    const v = checkDesign(docOf(box('Base', [0, 0, 0], [10, 1, 10]), box('Top', [0, 1.5, 0], [10, 1, 10])), NO_LIMITS);
    expect(v.map((x) => x.kind)).toEqual(['unsupported']);
    expect(v[0].message).toContain('Top');
    expect(v[0].message).toContain('Base');
  });
  it('flags a FLOATING ISLAND — two parts touching each other but not the floor', () => {
    // The case a naive "touches something" rule passes.
    const v = checkDesign(docOf(
      box('Base', [0, 0, 0], [10, 1, 10]),
      box('IslandA', [20, 5, 0], [10, 1, 10]),
      box('IslandB', [20, 6, 0], [10, 1, 10]),
    ), NO_LIMITS);
    expect(v.filter((x) => x.kind === 'unsupported').map((x) => x.message.split(' ')[0])).toEqual(['IslandA', 'IslandB']);
  });
  it('does not count EDGE contact as support', () => {
    // Top sits exactly on Base's edge line: spans overlap on one axis only.
    expect(kinds(docOf(box('Base', [0, 0, 0], [10, 1, 10]), box('Top', [10, 1, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
});

describe('limits', () => {
  const two = docOf(box('A', [0, 0, 0], [30, 1, 12]), box('B', [0, 1, 0], [30, 40, 1]));
  it('passes when every set limit holds', () => {
    expect(kinds(two, { width: 30, depth: 12, height: 41, maxParts: 2 })).toEqual([]);
  });
  it('flags each exceeded dimension: width X, depth Z, height Y', () => {
    const v = checkDesign(two, { width: 29, depth: 11, height: 40, maxParts: 2 });
    expect(v.map((x) => x.kind)).toEqual(['too-large', 'too-large', 'too-large']);
    expect(v.map((x) => x.message.split(' ')[1])).toEqual(['width', 'depth', 'height']);
  });
  it('ignores unset limits', () => {
    expect(kinds(two, { width: null, depth: null, height: null, maxParts: 2 })).toEqual([]);
  });
  it('flags a part count over the cap', () => {
    expect(kinds(two, { ...NO_LIMITS, maxParts: 1 })).toEqual(['too-many-parts']);
  });
});

describe('too-small', () => {
  it('flags a side under 1/8"', () => {
    expect(kinds(docOf(box('Strip', [0, 0, 0], [10, 1 / 16, 1])))).toEqual(['too-small']);
  });
  it('passes a side of exactly 1/8"', () => {
    expect(kinds(docOf(box('Strip', [0, 0, 0], [10, 1 / 8, 1])))).toEqual([]);
  });
});

describe('ordering and rejected parts', () => {
  it('orders by kind, then by part order, stably', () => {
    const d = docOf(box('Thin', [0, 0, 0], [10, 1 / 16, 1]), box('Float', [0, 5, 0], [10, 1, 10]));
    expect(kinds(d, { ...NO_LIMITS, maxParts: 1 })).toEqual(['too-small', 'unsupported', 'too-many-parts']);
    expect(checkDesign(d, NO_LIMITS)).toEqual(checkDesign(d, NO_LIMITS));
  });
  it('turns rejected parts into violations naming them', () => {
    expect(rejectedViolations([{ name: 'Bad', reason: 'not-finite' }, { name: 'Thin', reason: 'too-small' }]))
      .toEqual([
        { kind: 'too-small', message: expect.stringContaining('Bad') },
        { kind: 'too-small', message: expect.stringContaining('Thin') },
      ]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/document/designCheck.test.ts` — expect FAIL.

- [ ] **Step 3: Implement** `src/document/designCheck.ts`:

```ts
import type { SloydDocument } from './document';
import type { RejectedPart } from './generated';
import { boardExtents } from './geometry';

/**
 * The checks a generated design is held to (spec §4.3). Pure, against the
 * rounded and migrated boards — the exact values that will be stored.
 *
 * Messages are written FOR THE MODEL, in decimal inches, naming parts by
 * their STORED (post-dedupe) names and the axis involved, so they are
 * actionable. Not a person-facing string, which is why this module does not
 * take the → units edge (CLAUDE.md, Architecture).
 *
 * PHASE 2 NOTE (spec §4.4): `overlap` must become "interpenetration not
 * accounted for by a cut" when joinery is generated. Relax it on purpose.
 */
export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts';
export interface Violation { kind: ViolationKind; message: string }
export interface DesignLimits { width: number | null; depth: number | null; height: number | null; maxParts: number }

export const TOUCH = 1 / 32;
export const MIN_SIDE = 1 / 8;

const AXES = ['X', 'Y', 'Z'] as const;
const inches = (v: number) => `${+v.toFixed(3)}in`;

interface Box { name: string; min: number[]; max: number[] }

/** Length of the shared span on one axis; negative is a gap. */
const shared = (a: Box, b: Box, i: number) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);

/**
 * Connected for support: no gap wider than TOUCH on any axis, and real
 * shared span (> TOUCH) on at least two. Face contact and interpenetration
 * both qualify; EDGE contact (shared span on one axis only) does not — a box
 * balanced on another's edge is a defect to report, not a joint.
 */
const connected = (a: Box, b: Box) => {
  const s = [0, 1, 2].map((i) => shared(a, b, i));
  return s.every((v) => v >= -TOUCH) && s.filter((v) => v > TOUCH).length >= 2;
};

const distance = (a: Box, b: Box) =>
  Math.hypot(...[0, 1, 2].map((i) => Math.max(0, -shared(a, b, i))));

export function checkDesign(doc: SloydDocument, limits: DesignLimits): Violation[] {
  const boxes: Box[] = doc.boards.map((b) => {
    const e = boardExtents(b);
    return { name: b.name, min: [...b.position], max: b.position.map((p, i) => p + e[i]) };
  });
  const out: Violation[] = [];

  for (const b of boxes) {
    const i = [0, 1, 2].find((k) => b.max[k] - b.min[k] < MIN_SIDE - 1e-9);
    if (i !== undefined) {
      out.push({ kind: 'too-small', message: `${b.name} is ${inches(b.max[i] - b.min[i])} along ${AXES[i]}; the minimum is ${inches(MIN_SIDE)}.` });
    }
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      const s = [0, 1, 2].map((k) => shared(boxes[i], boxes[j], k));
      if (s.every((v) => v > TOUCH)) {
        const axis = s.indexOf(Math.min(...s));
        out.push({ kind: 'overlap', message: `${boxes[i].name} passes ${inches(s[axis])} into ${boxes[j].name} along ${AXES[axis]}.` });
      }
    }
  }

  const grounded = new Set<number>();
  const queue = boxes.flatMap((b, i) => (b.min[1] <= TOUCH ? [i] : []));
  queue.forEach((i) => grounded.add(i));
  while (queue.length) {
    const i = queue.shift()!;
    boxes.forEach((b, j) => {
      if (!grounded.has(j) && connected(boxes[i], b)) {
        grounded.add(j);
        queue.push(j);
      }
    });
  }
  boxes.forEach((b, i) => {
    if (grounded.has(i)) return;
    const near = [...grounded].map((g) => boxes[g]).sort((p, q) => distance(b, p) - distance(b, q))[0];
    const hint = near ? `; the nearest supported part is ${near.name}, ${inches(distance(b, near))} away` : '';
    out.push({ kind: 'unsupported', message: `${b.name} is not connected to the floor through touching parts${hint}.` });
  });

  if (boxes.length > 0) {
    const size = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])) - Math.min(...boxes.map((b) => b.min[k])));
    const checks: [string, number | null, number][] = [
      ['width', limits.width, size[0]],
      ['depth', limits.depth, size[2]],
      ['height', limits.height, size[1]],
    ];
    for (const [label, limit, actual] of checks) {
      if (limit !== null && actual > limit + 1e-9) {
        out.push({ kind: 'too-large', message: `Overall ${label} ${inches(actual)} exceeds the ${inches(limit)} limit.` });
      }
    }
  }

  if (boxes.length > limits.maxParts) {
    out.push({ kind: 'too-many-parts', message: `${boxes.length} parts; the limit is ${limits.maxParts}.` });
  }
  return out;
}

/** Parts the converter could not turn into boards, reported in the same voice. */
export function rejectedViolations(rejected: RejectedPart[]): Violation[] {
  return rejected.map((r) => ({
    kind: 'too-small' as const,
    message: r.reason === 'not-finite'
      ? `${r.name} has a position or size that is not a finite number.`
      : `${r.name} has a size of zero or less after rounding to 1/16in.`,
  }));
}
```

- [ ] **Step 4: Run** the test file — expect PASS. `npm run build` — expect success.

- [ ] **Step 5: Mutation check — every check.** One at a time, revert after each, each must turn at least one test red:
  - overlap: `s.every((v) => v > TOUCH)` → `s.every((v) => v >= 0)` (touching faces start to fail).
  - support: replace `connected(...)` with `[0,1,2].every((k) => shared(boxes[i], b, k) >= -TOUCH)` (edge-contact test must fail).
  - support: seed `grounded` with every box that is `connected` to *any* other box instead of the floor test (island test must fail).
  - too-large: swap `size[2]` and `size[1]` in `checks`.
  - too-small: `<` → `<=` (the exactly-1/8 test must fail).

  If any mutation survives, the test is wrong — fix the test, not the code.

- [ ] **Step 6: Commit** (`feat(generate): the design checks a generated prototype is repaired against`).

---

### Task 3: Storage — the LLM settings key

**Files:**
- Modify: `src/storage/types.ts`, `src/storage/browser.ts`, `src/storage/browser.test.ts`, `src/App.test.tsx:237-275`

**Interfaces:**
- Produces:
  ```ts
  // storage/types.ts
  export interface LlmSettings { provider: 'anthropic'; apiKey: string; model: string }
  // on StorageAdapter:
  getLlmSettings(): Promise<LlmSettings | null>;
  setLlmSettings(settings: LlmSettings): Promise<boolean>;
  clearLlmSettings(): Promise<void>;
  // browser.ts
  export const LLM_KEY = 'sloyd.llm.v1';
  ```

- [ ] **Step 1: Write the failing tests** — append to `src/storage/browser.test.ts` (it already has `FakeStorage`):

```ts
describe('LLM settings', () => {
  const settings = { provider: 'anthropic' as const, apiKey: 'sk-ant-SECRET-123', model: 'claude-opus-5-5' };

  it('round-trips', async () => {
    const a = new BrowserStorageAdapter(new FakeStorage());
    expect(await a.getLlmSettings()).toBeNull();
    expect(await a.setLlmSettings(settings)).toBe(true);
    expect(await a.getLlmSettings()).toEqual(settings);
    await a.clearLlmSettings();
    expect(await a.getLlmSettings()).toBeNull();
  });

  it.each(['not json', '{}', '{"provider":"anthropic","apiKey":"","model":"m"}', '{"provider":"other","apiKey":"k","model":"m"}', '[]'])(
    'reads %s as no settings, never a throw', async (raw) => {
      const s = new FakeStorage();
      s.setItem(LLM_KEY, raw);
      expect(await new BrowserStorageAdapter(s).getLlmSettings()).toBeNull();
    });

  it('reports a failed write as false and does not touch `available`', async () => {
    const s = new FakeStorage();
    const a = new BrowserStorageAdapter(s);
    s.full = true;
    expect(await a.setLlmSettings(settings)).toBe(false);
    expect(a.available).toBe(true);
  });

  it('never writes the key into any other storage key', async () => {
    const s = new FakeStorage();
    const a = new BrowserStorageAdapter(s);
    await a.openLibrary();
    await a.setLlmSettings(settings);
    const id = await a.createProject(createDocument('P'), { activate: false });
    await a.autoSave(id!, createDocument('P'));
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)!;
      if (k !== LLM_KEY) expect(s.getItem(k)).not.toContain('SECRET');
    }
  });
});
```

Add `LLM_KEY` to the file's import from `./browser`.

- [ ] **Step 2: Run** `npx vitest run src/storage/browser.test.ts` — expect FAIL.

- [ ] **Step 3: Implement.** In `src/storage/types.ts` add above `StorageAdapter`:

```ts
/**
 * The bring-your-own-key settings for Generate. Stored in this browser only,
 * under its own key — never in the library index and never inside a
 * SloydDocument, so no export can carry it.
 */
export interface LlmSettings {
  provider: 'anthropic';
  apiKey: string;
  model: string;
}
```

and at the end of `StorageAdapter`:

```ts
  /** The LLM settings, or null when none are set or the stored value is unusable. Never throws. */
  getLlmSettings(): Promise<LlmSettings | null>;
  /**
   * Store the LLM settings; false if the write failed. Deliberately does NOT
   * move `available`, which reports PROJECT persistence — a settings write
   * failing says nothing about whether autosave works.
   */
  setLlmSettings(settings: LlmSettings): Promise<boolean>;
  /** Forget the key. */
  clearLlmSettings(): Promise<void>;
```

In `src/storage/browser.ts` add `export const LLM_KEY = 'sloyd.llm.v1';` beside the other keys, import `LlmSettings`, and add before `listRecent`:

```ts
  async getLlmSettings(): Promise<LlmSettings | null> {
    if (!this.store) return null;
    const raw = readRaw(this.store, LLM_KEY);
    if (raw === null) return null;
    try {
      const v = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof v === 'object' && v !== null && !Array.isArray(v) &&
        v.provider === 'anthropic' &&
        typeof v.apiKey === 'string' && v.apiKey.length > 0 &&
        typeof v.model === 'string' && v.model.length > 0
      ) {
        return { provider: 'anthropic', apiKey: v.apiKey, model: v.model };
      }
    } catch {
      // fall through: malformed reads as absent
    }
    return null;
  }

  async setLlmSettings(settings: LlmSettings): Promise<boolean> {
    if (!this.store) return false;
    try {
      this.store.setItem(LLM_KEY, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }

  async clearLlmSettings(): Promise<void> {
    try {
      this.store?.removeItem(LLM_KEY);
    } catch {
      // nothing to report: the key is either gone or storage is unusable
    }
  }
```

(`readRaw(store: Storage, key: string): string | null` already exists at the bottom of `browser.ts` — it is what `openLibrary` uses.)

- [ ] **Step 4: Extend the App test fake** so later tasks can render the app. In `src/App.test.tsx`, beside the other `vi.fn()` declarations used by the mock, add:

```ts
let llmSettings: import('./storage/types').LlmSettings | null = null;
const getLlmSettings = vi.fn(async () => llmSettings);
const setLlmSettings = vi.fn(async (s: import('./storage/types').LlmSettings) => { llmSettings = s; return true; });
const clearLlmSettings = vi.fn(async () => { llmSettings = null; });
```

add to the mocked `storage` object:

```ts
    getLlmSettings: () => getLlmSettings(),
    setLlmSettings: (s: import('./storage/types').LlmSettings) => setLlmSettings(s),
    clearLlmSettings: () => clearLlmSettings(),
```

and in `beforeEach`: `llmSettings = null; getLlmSettings.mockClear(); setLlmSettings.mockClear(); clearLlmSettings.mockClear();`. (These `vi.fn`s must be declared with `vi.hoisted` if the existing mocks are — match whatever the neighbouring declarations do.)

- [ ] **Step 5: Run** `npm test` — all PASS (baseline + the new ones). `npm run build` — success.

- [ ] **Step 6: Commit** (`feat(storage): LLM settings behind the storage seam`).

---

### Task 4: The LLM seam, the prompt, and the repair loop

**Files:**
- Create: `src/llm/types.ts`, `src/generate/prompt.ts`, `src/generate/prompt.test.ts`, `src/generate/run.ts`, `src/generate/run.test.ts`

**Interfaces:**
- Consumes: Task 1 (`DESIGN_SCHEMA`, `parseDesign`, `designToDocument`), Task 2 (`checkDesign`, `rejectedViolations`, `Violation`, `DesignLimits`).
- Produces:
  ```ts
  // llm/types.ts
  export type LlmMessage = unknown;
  export interface LlmUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  export interface LlmRequest { system: string; messages: LlmMessage[]; schema: Record<string, unknown> }
  export interface LlmResult { json: unknown | null; unusable?: 'truncated' | 'unparseable'; assistantTurn: LlmMessage; usage: LlmUsage }
  export type LlmErrorKind = 'auth' | 'rate-limit' | 'overloaded' | 'refused' | 'network' | 'cancelled' | 'other';
  export class LlmError extends Error { readonly kind: LlmErrorKind }
  export interface LlmClient {
    complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult>;
    userTurn(text: string): LlmMessage;
    estimateCostUsd(usage: LlmUsage): number | null;
  }
  export const ZERO_USAGE: LlmUsage;
  export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage;
  // generate/prompt.ts
  export type Style = 'any' | 'shaker' | 'mission' | 'modern' | 'farmhouse' | 'mid-century' | 'shop';
  export type Detail = 'simple' | 'moderate' | 'detailed';
  export const STYLES: { value: Style; label: string }[];
  export const DETAIL_CAPS: Record<Detail, number>;
  export interface GenerateSettings { description: string; width: number | null; depth: number | null; height: number | null; material: string /* MATERIALS key or 'any' */; style: Style; detail: Detail }
  export const SYSTEM_PROMPT: string;
  export function userMessage(s: GenerateSettings): string;
  export function repairMessage(v: Violation[]): string;
  export function unusableMessage(reason: 'truncated' | 'unparseable'): string;
  export function limitsOf(s: GenerateSettings): DesignLimits;
  // generate/run.ts
  export const MAX_REPAIRS = 3;
  export type RunProgress = { phase: 'designing' } | { phase: 'repairing'; round: number; issues: number };
  export interface RunOutcome { doc: SloydDocument; violations: Violation[]; usage: LlmUsage }
  export class RunFailed extends Error { readonly usage: LlmUsage }
  export function runGeneration(client: LlmClient, settings: GenerateSettings, signal: AbortSignal, onProgress: (p: RunProgress) => void): Promise<RunOutcome>;
  ```

- [ ] **Step 1: Write `src/llm/types.ts`** (types only — no test of its own; exercised by run tests):

```ts
/**
 * The provider seam — the StorageAdapter move applied to the network. The
 * generation loop talks to this, never to a provider SDK, so a second
 * provider is a second implementation rather than a second code path.
 *
 * `LlmMessage` is OPAQUE to callers: they append exactly what `complete`
 * hands back and build user turns only through `userTurn`. That is what lets
 * each provider carry its own message shape — and it is what keeps the
 * history append-only (spec §4.5): a caller that cannot read a message
 * cannot edit one.
 */
export type LlmMessage = unknown;

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: LlmUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  /** Structured-output JSON schema the response must match. */
  schema: Record<string, unknown>;
}

export interface LlmResult {
  /** Parsed output, or null when the attempt produced nothing usable. */
  json: unknown | null;
  unusable?: 'truncated' | 'unparseable';
  /** Append verbatim; never edit. */
  assistantTurn: LlmMessage;
  usage: LlmUsage;
}

/**
 * A closed set, so the UI can say one plain sentence per kind. `truncated`
 * and `unparseable` are deliberately NOT here: they are unusable ATTEMPTS
 * inside the repair loop, not failures of the call.
 */
export type LlmErrorKind = 'auth' | 'rate-limit' | 'overloaded' | 'refused' | 'network' | 'cancelled' | 'other';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
  }
}

export interface LlmClient {
  /** One call. Streams internally; resolves with the final result; rejects with LlmError. */
  complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult>;
  /** A user turn in this provider's message shape. */
  userTurn(text: string): LlmMessage;
  /** Estimated cost in US dollars, or null when the model's price is unknown. */
  estimateCostUsd(usage: LlmUsage): number | null;
}
```

- [ ] **Step 2: Write the failing prompt tests** — `src/generate/prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DETAIL_CAPS, SYSTEM_PROMPT, limitsOf, repairMessage, userMessage } from './prompt';
import type { GenerateSettings } from './prompt';

const base: GenerateSettings = {
  description: 'A bookcase with five shelves', width: 36, depth: null, height: 72,
  material: 'plywood', style: 'shaker', detail: 'moderate',
};

describe('prompt', () => {
  it('keeps the system prompt free of anything per-run, so it caches', () => {
    expect(SYSTEM_PROMPT).not.toContain('bookcase');
    expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it('states hard limits as limits and soft settings as preferences', () => {
    const m = userMessage(base);
    expect(m).toContain('A bookcase with five shelves');
    expect(m).toMatch(/width.*36in/i);
    expect(m).toMatch(/height.*72in/i);
    expect(m).not.toMatch(/depth.*in/i);
    expect(m).toMatch(/at most 30 parts/i);
    expect(m).toMatch(/prefer.*plywood/i);
    expect(m).toMatch(/shaker/i);
  });
  it('omits material and style preferences when they are "any"', () => {
    const m = userMessage({ ...base, material: 'any', style: 'any' });
    expect(m).not.toMatch(/prefer/i);
    expect(m).not.toMatch(/style/i);
  });
  it('maps settings to limits — width X, depth Z, height Y, the detail cap', () => {
    expect(limitsOf(base)).toEqual({ width: 36, depth: null, height: 72, maxParts: DETAIL_CAPS.moderate });
  });
  it('lists every violation in the repair message', () => {
    const m = repairMessage([{ kind: 'overlap', message: 'A passes 1in into B along X.' }, { kind: 'unsupported', message: 'C is not connected.' }]);
    expect(m).toContain('A passes 1in into B along X.');
    expect(m).toContain('C is not connected.');
    expect(m).toMatch(/whole/i);
  });
});
```

- [ ] **Step 3: Implement `src/generate/prompt.ts`:**

```ts
import { MATERIALS } from '../document/types';
import type { DesignLimits, Violation } from '../document/designCheck';

export type Style = 'any' | 'shaker' | 'mission' | 'modern' | 'farmhouse' | 'mid-century' | 'shop';
export type Detail = 'simple' | 'moderate' | 'detailed';

export const STYLES: { value: Style; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'shaker', label: 'Shaker' },
  { value: 'mission', label: 'Mission / Arts & Crafts' },
  { value: 'modern', label: 'Modern / minimal' },
  { value: 'farmhouse', label: 'Farmhouse / rustic' },
  { value: 'mid-century', label: 'Mid-century' },
  { value: 'shop', label: 'Shop / utility' },
];

/** Hard part caps per detail level (spec §2). */
export const DETAIL_CAPS: Record<Detail, number> = { simple: 12, moderate: 30, detailed: 60 };

export interface GenerateSettings {
  description: string;
  /** Max overall size in inches; null = no limit. Width = X, depth = Z, height = Y. */
  width: number | null;
  depth: number | null;
  height: number | null;
  /** A MATERIALS key, or 'any'. Soft. */
  material: string;
  style: Style;
  detail: Detail;
}

const STYLE_NOTES: Record<Exclude<Style, 'any'>, string> = {
  shaker: 'Shaker: plain, light, well-proportioned; tapered or square legs; no ornament.',
  mission: 'Mission / Arts & Crafts: heavy, rectilinear, thick stock, exposed structure, vertical slats.',
  modern: 'Modern / minimal: flat planes, thin profiles, few parts, clean overhangs.',
  farmhouse: 'Farmhouse / rustic: chunky, sturdy, thick tops and legs, simple aprons.',
  'mid-century': 'Mid-century: light cases on separate bases or splayed legs, raised off the floor.',
  shop: 'Shop / utility: strong and plain; sheet goods and construction lumber; function first.',
};

/**
 * FIXED TEXT — nothing per-run (no date, no settings), so it is a cacheable
 * prefix across a run's calls and across parallel runs (spec §4.6).
 */
export const SYSTEM_PROMPT = `You design woodworking projects as a list of rectangular parts for Sloyd, a woodworking planner.

Coordinates and units:
- All numbers are inches. Y is up. X is width, Z is depth.
- Each part is an axis-aligned box. "at" is its MINIMUM corner (smallest x, y, z). "size" is its extent along X, Y and Z.
- A part's top is at.y + size.y. A part resting on another has at.y equal to the lower part's top.

Rules every design must follow:
- Parts touch face to face. Parts must NOT pass into each other — there is no joinery in this tool yet, so a shelf sits between two sides, not inside them.
- Every part must connect to the floor (y = 0) through a chain of parts touching face to face. Nothing floats.
- Use real stock: 3/4in and 1-1/2in solid wood; 3/4in and 1/2in plywood or MDF from 96 x 48in sheets. Typical solid board widths are 3-1/2, 5-1/2, 7-1/4, 9-1/4 and 11-1/4in.
- Give every part a short, distinct, human name (e.g. "Left side", "Shelf 2", "Front apron").
- Stay within any limits given. If the request cannot fit, make the closest design that does.

Style notes, used when a style is requested:
${Object.values(STYLE_NOTES).map((n) => `- ${n}`).join('\n')}

When told about problems with your design, return the WHOLE corrected design, not just the changed parts.`;

export function limitsOf(s: GenerateSettings): DesignLimits {
  return { width: s.width, depth: s.depth, height: s.height, maxParts: DETAIL_CAPS[s.detail] };
}

export function userMessage(s: GenerateSettings): string {
  const lines = [`Design this: ${s.description.trim()}`, '', 'Hard limits:'];
  if (s.width !== null) lines.push(`- Overall width (X) at most ${s.width}in.`);
  if (s.depth !== null) lines.push(`- Overall depth (Z) at most ${s.depth}in.`);
  if (s.height !== null) lines.push(`- Overall height (Y) at most ${s.height}in.`);
  lines.push(`- At most ${DETAIL_CAPS[s.detail]} parts (${s.detail} detail).`);
  if (s.material !== 'any' || s.style !== 'any') lines.push('', 'Preferences:');
  if (s.material !== 'any') {
    lines.push(`- Prefer ${MATERIALS[s.material]?.label ?? s.material} (material key "${s.material}") for most parts.`);
  }
  if (s.style !== 'any') lines.push(`- Style: ${STYLE_NOTES[s.style]}`);
  return lines.join('\n');
}

export function repairMessage(v: Violation[]): string {
  return `Your design has ${v.length} problem${v.length === 1 ? '' : 's'}:\n${v.map((x) => `- ${x.message}`).join('\n')}\n\nReturn the whole corrected design.`;
}

export function unusableMessage(reason: 'truncated' | 'unparseable'): string {
  return reason === 'truncated'
    ? 'Your response was cut off before the design was complete. Return the whole design again, more compactly.'
    : 'Your response was not a usable design. Return the whole design again, matching the schema.';
}
```

- [ ] **Step 4: Run** `npx vitest run src/generate/prompt.test.ts` — expect PASS.

- [ ] **Step 5: Write the failing run tests** — `src/generate/run.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { MAX_REPAIRS, RunFailed, runGeneration } from './run';
import type { GenerateSettings } from './prompt';
import { LlmError } from '../llm/types';
import type { LlmClient, LlmRequest, LlmResult } from '../llm/types';

const settings: GenerateSettings = {
  description: 'a box', width: null, depth: null, height: null, material: 'any', style: 'any', detail: 'simple',
};
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const p = (name: string, y: number) => ({
  name, material: 'pine', at: { x: 0, y, z: 0 }, size: { x: 10, y: 1, z: 10 },
});
const GOOD = { name: 'Stack', parts: [p('A', 0), p('B', 1)] };
const ONE_ISSUE = { name: 'One', parts: [p('A', 0), p('B', 5)] };                 // B floats
const TWO_ISSUES = { name: 'Two', parts: [p('A', 0), p('B', 5), p('C', 9)] };     // B, C float

type Step = unknown | 'truncated' | 'unparseable' | LlmError;

/** A scripted client that records a COPY of every request's history. */
function fakeClient(steps: Step[]) {
  const seen: unknown[][] = [];
  let i = 0;
  const client: LlmClient = {
    userTurn: (text) => ({ role: 'user', text }),
    estimateCostUsd: () => 0,
    complete: vi.fn(async (req: LlmRequest): Promise<LlmResult> => {
      seen.push([...req.messages]);
      const step = steps[Math.min(i, steps.length - 1)];
      const turn = { role: 'assistant', n: i++ };
      if (step instanceof LlmError) throw step;
      if (step === 'truncated' || step === 'unparseable') return { json: null, unusable: step, assistantTurn: turn, usage };
      return { json: step, assistantTurn: turn, usage };
    }),
  };
  return { client, seen };
}
const run = (client: LlmClient, signal = new AbortController().signal) =>
  runGeneration(client, settings, signal, () => {});

describe('runGeneration', () => {
  it('stops after one call when the first design is clean', async () => {
    const { client } = fakeClient([GOOD]);
    const out = await run(client);
    expect(out.violations).toEqual([]);
    expect(out.doc.boards).toHaveLength(2);
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it(`stops at ${MAX_REPAIRS + 1} calls and still returns the best attempt`, async () => {
    const { client } = fakeClient([ONE_ISSUE]);
    const out = await run(client);
    expect(client.complete).toHaveBeenCalledTimes(MAX_REPAIRS + 1);
    expect(out.violations).toHaveLength(1);
  });

  it('keeps the FEWEST-violation attempt when a later one is worse', async () => {
    const { client } = fakeClient([ONE_ISSUE, TWO_ISSUES, TWO_ISSUES, TWO_ISSUES]);
    const out = await run(client);
    expect(out.doc.name).toBe('One');
  });

  it('keeps the later attempt on a tie', async () => {
    const tieLater = { ...ONE_ISSUE, name: 'Later' };
    const { client } = fakeClient([ONE_ISSUE, tieLater, TWO_ISSUES, TWO_ISSUES]);
    expect((await run(client)).doc.name).toBe('Later');
  });

  it('keeps the history APPEND-ONLY — every request extends the previous one unedited', async () => {
    const { client, seen } = fakeClient([ONE_ISSUE, 'truncated', ONE_ISSUE, GOOD]);
    await run(client);
    for (let k = 1; k < seen.length; k++) {
      expect(seen[k].slice(0, seen[k - 1].length)).toEqual(seen[k - 1]);
      expect(seen[k].length).toBe(seen[k - 1].length + 2);
    }
  });

  it('counts truncated and unparseable replies as attempts and recovers', async () => {
    const { client } = fakeClient(['truncated', 'unparseable', GOOD]);
    const out = await run(client);
    expect(client.complete).toHaveBeenCalledTimes(3);
    expect(out.violations).toEqual([]);
  });

  it('fails when no attempt yields a usable design, carrying the usage spent', async () => {
    const { client } = fakeClient(['unparseable']);
    const err = await run(client).catch((e) => e);
    expect(err).toBeInstanceOf(RunFailed);
    expect(err.usage.inputTokens).toBe(10 * (MAX_REPAIRS + 1));
  });

  it('propagates an auth error at once', async () => {
    const { client } = fakeClient([new LlmError('auth', 'bad key')]);
    await expect(run(client)).rejects.toMatchObject({ kind: 'auth' });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it('tells the model about DEDUPED names — the ones it can find in its next answer', async () => {
    const dup = { name: 'Dup', parts: [p('Shelf', 0), p('Shelf', 5)] };
    const { client, seen } = fakeClient([dup, GOOD]);
    await run(client);
    // dedupeNames keeps the first "Shelf" and renames the second "Shelf (1)"
    // (names.ts: `${stem} (${n})`, n from 1). The floating one is the second.
    const feedback = (seen[1][2] as { text: string }).text;
    expect(feedback).toContain('Shelf (1) is not connected');
  });

  it('reports progress: designing, then each repair round with its issue count', async () => {
    const { client } = fakeClient([TWO_ISSUES, ONE_ISSUE, GOOD]);
    const progress = vi.fn();
    await runGeneration(client, settings, new AbortController().signal, progress);
    expect(progress.mock.calls.map((c) => c[0])).toEqual([
      { phase: 'designing' },
      { phase: 'repairing', round: 1, issues: 2 },
      { phase: 'repairing', round: 2, issues: 1 },
    ]);
  });
});
```

- [ ] **Step 6: Run** `npx vitest run src/generate/run.test.ts` — expect FAIL.

- [ ] **Step 7: Implement `src/generate/run.ts`:**

```ts
import type { SloydDocument } from '../document/document';
import { DESIGN_SCHEMA, designToDocument, parseDesign } from '../document/generated';
import { checkDesign, rejectedViolations } from '../document/designCheck';
import type { Violation } from '../document/designCheck';
import { ZERO_USAGE, addUsage } from '../llm/types';
import type { LlmClient, LlmMessage, LlmUsage } from '../llm/types';
import { SYSTEM_PROMPT, limitsOf, repairMessage, unusableMessage, userMessage } from './prompt';
import type { GenerateSettings } from './prompt';

/** Repair rounds after the first call — 4 calls at most (spec §4.5). */
export const MAX_REPAIRS = 3;

export type RunProgress = { phase: 'designing' } | { phase: 'repairing'; round: number; issues: number };

export interface RunOutcome {
  doc: SloydDocument;
  violations: Violation[];
  usage: LlmUsage;
}

/** No attempt produced a usable design. Carries what was spent, for the cost display. */
export class RunFailed extends Error {
  readonly usage: LlmUsage;
  constructor(usage: LlmUsage) {
    super('The model did not produce a usable design.');
    this.name = 'RunFailed';
    this.usage = usage;
  }
}

/**
 * One generation: design → check → feedback, at most MAX_REPAIRS times.
 *
 * APPEND-ONLY: every assistant turn goes into `messages` exactly as the
 * client returned it, and nothing earlier is ever edited — current models
 * reject edited history carrying thinking blocks, and it is also what keeps
 * the cached prefix valid. Each request gets a COPY of the history so a
 * client cannot observe it changing afterward.
 *
 * Keeps the attempt with the fewest violations, ties to the later one, and
 * returns it even with violations remaining — a flawed prototype is still a
 * prototype (spec §4.5). LlmErrors propagate unchanged.
 */
export async function runGeneration(
  client: LlmClient,
  settings: GenerateSettings,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
): Promise<RunOutcome> {
  const limits = limitsOf(settings);
  const messages: LlmMessage[] = [client.userTurn(userMessage(settings))];
  let usage = ZERO_USAGE;
  let best: { doc: SloydDocument; violations: Violation[] } | null = null;
  let lastIssues = 0;

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    onProgress(attempt === 0 ? { phase: 'designing' } : { phase: 'repairing', round: attempt, issues: lastIssues });
    const res = await client.complete({ system: SYSTEM_PROMPT, messages: [...messages], schema: DESIGN_SCHEMA }, signal);
    usage = addUsage(usage, res.usage);
    messages.push(res.assistantTurn);

    const design = res.json === null ? null : parseDesign(res.json);
    let feedback: string;
    if (!design) {
      feedback = unusableMessage(res.unusable ?? 'unparseable');
      lastIssues = 1;
    } else {
      const { doc, rejected } = designToDocument(design);
      const violations = [...rejectedViolations(rejected), ...checkDesign(doc, limits)];
      if (!best || violations.length <= best.violations.length) best = { doc, violations };
      if (violations.length === 0) break;
      feedback = repairMessage(violations);
      lastIssues = violations.length;
    }
    if (attempt < MAX_REPAIRS) messages.push(client.userTurn(feedback));
  }

  if (!best) throw new RunFailed(usage);
  return { ...best, usage };
}
```

- [ ] **Step 8: Run** the run and prompt tests — PASS. `npm run build` — success.

- [ ] **Step 9: Mutation check.** One at a time, revert after each:
  - `violations.length <= best.violations.length` → `true` (always take latest): the fewest-violation test must fail.
  - `<=` → `<`: the tie test must fail.
  - `messages.push(res.assistantTurn)` → `messages[messages.length - 1] = res.assistantTurn` after the first push: the append-only test must fail.
  - `attempt <= MAX_REPAIRS` → `attempt < MAX_REPAIRS`: the call-count test must fail.

- [ ] **Step 10: Commit** (`feat(generate): the LLM seam and the submit-then-repair loop`).

---

### Task 5: `AnthropicClient`

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/llm/anthropic.ts`, `src/llm/anthropic.test.ts`

**Interfaces:**
- Consumes: Task 4's `llm/types.ts`.
- Produces:
  ```ts
  export const CLAUDE_MODELS: { id: string; label: string }[];   // Opus 5.5 first = default
  export const DEFAULT_MODEL: string;                              // 'claude-opus-5-5'
  export class AnthropicClient implements LlmClient {
    constructor(apiKey: string, model: string, sdk?: SdkLike);
  }
  export function toLlmError(e: unknown, signal: AbortSignal): LlmError;
  ```

- [ ] **Step 1: Install and verify the SDK surface.** `npm install @anthropic-ai/sdk`. Then confirm each of these in `node_modules/@anthropic-ai/sdk` **before writing code** — the plan names them from documentation, and the rule is never to guess an SDK binding:
  - `grep -rn "dangerouslyAllowBrowser" node_modules/@anthropic-ai/sdk/*.d.ts node_modules/@anthropic-ai/sdk/**/*.d.ts | head` — the client option that permits browser use.
  - `grep -rln "fallbacks" node_modules/@anthropic-ai/sdk/resources/beta/messages/` — `fallbacks` on the beta message params.
  - `grep -rn "json_schema" node_modules/@anthropic-ai/sdk/resources/beta/messages/messages.d.ts | head` — the `output_config.format` JSON-schema shape.
  - `grep -n "class APIUserAbortError\|class APIConnectionError\|class APIError" -r node_modules/@anthropic-ai/sdk/*.d.ts node_modules/@anthropic-ai/sdk/core/*.d.ts` — the error classes.

  If any is absent or shaped differently, **stop and report** rather than casting around it.

- [ ] **Step 2: Write the failing tests** — `src/llm/anthropic.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicClient, CLAUDE_MODELS, DEFAULT_MODEL, toLlmError } from './anthropic';

// Error instances built from the SDK's OWN classes without depending on
// their constructor signatures.
const sdkError = (cls: Function, props: Record<string, unknown> = {}) =>
  Object.assign(Object.create(cls.prototype), { message: 'x', ...props });
const live = new AbortController().signal;

describe('toLlmError', () => {
  it.each([
    [sdkError(Anthropic.APIError, { status: 401 }), 'auth'],
    [sdkError(Anthropic.APIError, { status: 403 }), 'auth'],
    [sdkError(Anthropic.APIError, { status: 429 }), 'rate-limit'],
    [sdkError(Anthropic.APIError, { status: 529 }), 'overloaded'],
    [sdkError(Anthropic.APIError, { status: 500 }), 'overloaded'],
    [sdkError(Anthropic.APIError, { status: 400 }), 'other'],
    [sdkError(Anthropic.APIConnectionError), 'network'],
    [sdkError(Anthropic.APIUserAbortError), 'cancelled'],
    [new TypeError('boom'), 'other'],
  ])('maps %o to %s', (e, kind) => {
    expect(toLlmError(e, live).kind).toBe(kind);
  });
  it('reports anything after an abort as cancelled', () => {
    const c = new AbortController();
    c.abort();
    expect(toLlmError(new TypeError('x'), c.signal).kind).toBe('cancelled');
  });
});

function fakeSdk(message: Record<string, unknown>) {
  const stream = vi.fn(() => ({ finalMessage: async () => message }));
  return { sdk: { beta: { messages: { stream } } }, stream };
}
const msg = (over: Record<string, unknown>) => ({
  content: [{ type: 'text', text: '{"name":"x","parts":[]}' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20, cache_creation_input_tokens: 10 },
  ...over,
});
const req = { system: 'SYS', messages: [{ role: 'user', content: 'hi' }], schema: { type: 'object' } };

describe('AnthropicClient', () => {
  it('offers Opus 5.5 first, as the default', () => {
    expect(CLAUDE_MODELS[0].id).toBe('claude-opus-5-5');
    expect(DEFAULT_MODEL).toBe('claude-opus-5-5');
    expect(CLAUDE_MODELS.map((m) => m.id)).toContain('claude-sonnet-5-5');
  });

  it('sends the schema, cached system prompt, fallback and model, and streams', async () => {
    const { sdk, stream } = fakeSdk(msg({}));
    await new AnthropicClient('k', 'claude-sonnet-5-5', sdk as never).complete(req, live);
    const [params, opts] = stream.mock.calls[0] as unknown as [Record<string, any>, Record<string, any>];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.output_config.format).toEqual({ type: 'json_schema', schema: req.schema });
    expect(params.system).toEqual([{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }]);
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.messages).toEqual(req.messages);
    expect(opts.signal).toBe(live);
  });

  it('parses JSON and returns the assistant turn verbatim', async () => {
    const m = msg({});
    const { sdk } = fakeSdk(m);
    const r = await new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live);
    expect(r.json).toEqual({ name: 'x', parts: [] });
    expect(r.assistantTurn).toEqual({ role: 'assistant', content: m.content });
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 50, cacheReadTokens: 20, cacheWriteTokens: 10 });
  });

  it('marks a max_tokens stop as truncated, not an error', async () => {
    const { sdk } = fakeSdk(msg({ stop_reason: 'max_tokens' }));
    const r = await new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live);
    expect(r).toMatchObject({ json: null, unusable: 'truncated' });
  });

  it('marks bad JSON as unparseable', async () => {
    const { sdk } = fakeSdk(msg({ content: [{ type: 'text', text: '{nope' }] }));
    const r = await new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live);
    expect(r).toMatchObject({ json: null, unusable: 'unparseable' });
  });

  it('turns a refusal into a refused LlmError', async () => {
    const { sdk } = fakeSdk(msg({ stop_reason: 'refusal' }));
    await expect(new AnthropicClient('k', DEFAULT_MODEL, sdk as never).complete(req, live))
      .rejects.toMatchObject({ kind: 'refused' });
  });

  it('estimates cost from the price table, null for an unknown model', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(new AnthropicClient('k', 'claude-opus-5-5', {} as never).estimateCostUsd(u)).toBeCloseTo(24);
    expect(new AnthropicClient('k', 'claude-sonnet-5-5', {} as never).estimateCostUsd(u)).toBeCloseTo(12);
    expect(new AnthropicClient('k', 'mystery', {} as never).estimateCostUsd(u)).toBeNull();
  });
});
```

- [ ] **Step 3: Run** — expect FAIL.

- [ ] **Step 4: Implement `src/llm/anthropic.ts`** (adjust only the SDK names Step 1 corrected):

```ts
import Anthropic from '@anthropic-ai/sdk';
import { LlmError } from './types';
import type { LlmClient, LlmMessage, LlmRequest, LlmResult, LlmUsage } from './types';

export const CLAUDE_MODELS: { id: string; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
];
export const DEFAULT_MODEL = CLAUDE_MODELS[0].id;

/**
 * $ per million tokens. THE one place to update when prices change; the UI
 * labels the result an estimate. Cache writes at 1.25x input.
 */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

/** Starting value — confirmed or retuned in the browser pass (plan Task 11). */
const EFFORT = 'medium';
/** Streaming, so a large ceiling costs nothing unless used. */
const MAX_TOKENS = 32000;

/** The slice of the SDK this client uses — what lets tests pass a fake. */
type SdkLike = Pick<Anthropic, 'beta'>;

export function toLlmError(e: unknown, signal: AbortSignal): LlmError {
  if (e instanceof LlmError) return e;
  if (signal.aborted || e instanceof Anthropic.APIUserAbortError) return new LlmError('cancelled', 'Cancelled.');
  if (e instanceof Anthropic.APIConnectionError) return new LlmError('network', 'Could not reach the Claude API.');
  if (e instanceof Anthropic.APIError) {
    const status = (e as { status?: number }).status ?? 0;
    if (status === 401 || status === 403) return new LlmError('auth', 'API key was rejected — check Settings.');
    if (status === 429) return new LlmError('rate-limit', 'Rate limited by the Claude API — try again shortly.');
    if (status >= 500) return new LlmError('overloaded', 'The Claude API is overloaded — try again shortly.');
    return new LlmError('other', `The Claude API returned an error (${status}).`);
  }
  return new LlmError('other', e instanceof Error ? e.message : 'Unexpected error.');
}

export class AnthropicClient implements LlmClient {
  private sdk: SdkLike;
  private model: string;

  constructor(apiKey: string, model: string, sdk?: SdkLike) {
    this.model = model;
    // The explicit browser opt-in: this app has no server, the key is the
    // user's own, and it never leaves their browser except to the API.
    this.sdk = sdk ?? new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }

  userTurn(text: string): LlmMessage {
    return { role: 'user', content: text };
  }

  estimateCostUsd(u: LlmUsage): number | null {
    const p = PRICES[this.model];
    if (!p) return null;
    return (u.inputTokens * p.input + u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead + u.cacheWriteTokens * p.cacheWrite) / 1_000_000;
  }

  async complete(req: LlmRequest, signal: AbortSignal): Promise<LlmResult> {
    let message;
    try {
      const stream = this.sdk.beta.messages.stream(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          thinking: { type: 'adaptive' },
          output_config: { effort: EFFORT, format: { type: 'json_schema', schema: req.schema } },
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages: req.messages as Anthropic.Beta.BetaMessageParam[],
        },
        { signal },
      );
      message = await stream.finalMessage();
    } catch (e) {
      throw toLlmError(e, signal);
    }

    if (message.stop_reason === 'refusal') throw new LlmError('refused', 'The model declined this request.');
    const usage: LlmUsage = {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    // Verbatim: the whole content, thinking blocks included (spec §4.5).
    const assistantTurn = { role: 'assistant', content: message.content };
    if (message.stop_reason === 'max_tokens') return { json: null, unusable: 'truncated', assistantTurn, usage };
    const text = message.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
    try {
      return { json: JSON.parse(text), assistantTurn, usage };
    } catch {
      return { json: null, unusable: 'unparseable', assistantTurn, usage };
    }
  }
}
```

- [ ] **Step 5: Run** tests — PASS. **`npm run build` — must succeed with no `as any` added** beyond the single `messages` cast above. If the SDK's param type rejects `fallbacks`, `betas` or `output_config.effort`, report which — do not suppress.

- [ ] **Step 6: Bundle check.** `npm run build` output: note the new main-chunk size against the previous build's (`git stash; npm run build; git stash pop` if needed). Record both in the commit message. If the SDK adds more than ~150 kB gzipped, stop and raise lazy-loading it (`import()` inside `useGenerations`) as a question.

- [ ] **Step 7: Commit** (`feat(llm): Claude client — streaming, structured output, fallback, error kinds`).

---

### Task 6: `useGenerations` — a batch of runs, written as projects

**Files:**
- Create: `src/useGenerations.ts`, `src/useGenerations.test.tsx`

**Interfaces:**
- Consumes: `runGeneration`, `RunFailed` (Task 4); `LlmClient`, `LlmError` (Task 4); `storage.createProject` (existing).
- Produces:
  ```ts
  export type RunStatus = 'designing' | 'repairing' | 'ready' | 'failed' | 'cancelled';
  export interface RunRow {
    key: number; letter: string | null; status: RunStatus;
    round?: number; issues?: number;          // repairing: issues being fixed; ready: issues remaining
    projectId?: string; projectName?: string; error?: string; costUsd: number | null;
  }
  export function useGenerations(opts: {
    onCreated: (projectId: string) => void;   // App: add to newIds
    onStorageVerdict: () => void;             // App: setAvailable(storage.available)
  }): {
    rows: RunRow[]; live: number;
    start: (client: LlmClient, settings: GenerateSettings, count: 1 | 2 | 3) => void;
    cancel: () => void;
  };
  ```

- [ ] **Step 1: Write the failing tests** — `src/useGenerations.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerations } from './useGenerations';
import { LlmError } from './llm/types';
import type { LlmClient, LlmResult } from './llm/types';
import type { GenerateSettings } from './generate/prompt';
import { storage } from './storage/browser';
import { useStore } from './store/store';

vi.mock('./storage/browser', () => ({
  storage: { available: true, createProject: vi.fn() },
}));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;

const settings: GenerateSettings = {
  description: 'a box', width: null, depth: null, height: null, material: 'any', style: 'any', detail: 'simple',
};
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const GOOD = {
  name: 'Bench',
  parts: [{ name: 'Top', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } }],
};
const ok = (): Promise<LlmResult> => Promise.resolve({ json: GOOD, assistantTurn: {}, usage });

function client(complete: LlmClient['complete']): LlmClient {
  return { complete: vi.fn(complete), userTurn: (t) => t, estimateCostUsd: () => 0.01 };
}
const setup = () => {
  const onCreated = vi.fn();
  const onStorageVerdict = vi.fn();
  const hook = renderHook(() => useGenerations({ onCreated, onStorageVerdict }));
  return { ...hook, onCreated, onStorageVerdict };
};

beforeEach(() => {
  let n = 0;
  createProject.mockReset().mockImplementation(async () => `p${++n}`);
});

describe('useGenerations', () => {
  it('writes each finished design as a project WITHOUT activating it, lettered A/B/C', async () => {
    const { result, onCreated } = setup();
    act(() => result.current.start(client(ok), settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject).toHaveBeenCalledTimes(3);
    for (const call of createProject.mock.calls) expect(call[1]).toEqual({ activate: false });
    expect(createProject.mock.calls.map((c) => c[0].name).sort()).toEqual(['Bench — A', 'Bench — B', 'Bench — C']);
    expect(result.current.rows.map((r) => r.status)).toEqual(['ready', 'ready', 'ready']);
    expect(onCreated).toHaveBeenCalledTimes(3);
  });

  it('does not suffix a single generation', async () => {
    const { result } = setup();
    act(() => result.current.start(client(ok), settings, 1));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject.mock.calls[0][0].name).toBe('Bench');
  });

  it('never touches the open document or its undo history', async () => {
    const before = useStore.getState().doc;
    const past = useStore.getState().past.length;
    const { result } = setup();
    act(() => result.current.start(client(ok), settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(useStore.getState().doc).toBe(before);
    expect(useStore.getState().past.length).toBe(past);
  });

  it('ignores start() while a batch is live — a double click is one batch', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const c = client(async () => { await gate; return ok(); });
    const { result } = setup();
    act(() => result.current.start(c, settings, 1));
    act(() => result.current.start(c, settings, 1));
    expect(result.current.rows).toHaveLength(1);
    release();
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it('cancel writes nothing for runs still in flight', async () => {
    const c = client((_req, signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
    }));
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.rows.map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
  });

  it('an auth failure stops every run and says why on each row', async () => {
    let calls = 0;
    const c = client((_req, signal) => {
      if (++calls === 1) return Promise.reject(new LlmError('auth', 'API key was rejected — check Settings.'));
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
      });
    });
    const { result } = setup();
    act(() => result.current.start(c, settings, 3));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.rows.every((r) => r.status === 'failed' && r.error?.includes('API key'))).toBe(true);
    expect(createProject).not.toHaveBeenCalled();
  });

  it('a rate limit fails only its own run', async () => {
    let calls = 0;
    const c = client(() => (++calls === 1 ? Promise.reject(new LlmError('rate-limit', 'Rate limited.')) : ok()));
    const { result } = setup();
    act(() => result.current.start(c, settings, 2));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.rows.map((r) => r.status).sort()).toEqual(['failed', 'ready']);
  });

  it('reports a failed project write and asks App to refresh the storage verdict', async () => {
    createProject.mockResolvedValue(null);
    const { result, onStorageVerdict } = setup();
    act(() => result.current.start(client(ok), settings, 1));
    await waitFor(() => expect(result.current.live).toBe(0));
    expect(result.current.rows[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/storage/i) });
    expect(onStorageVerdict).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Implement `src/useGenerations.ts`:**

```ts
import { useCallback, useRef, useState } from 'react';
import { runGeneration, RunFailed } from './generate/run';
import type { GenerateSettings } from './generate/prompt';
import { LlmError } from './llm/types';
import type { LlmClient } from './llm/types';
import { storage } from './storage/browser';

export type RunStatus = 'designing' | 'repairing' | 'ready' | 'failed' | 'cancelled';

export interface RunRow {
  key: number;
  letter: string | null;
  status: RunStatus;
  /** repairing: the round number. */
  round?: number;
  /** repairing: issues being fixed; ready: issues remaining. */
  issues?: number;
  projectId?: string;
  projectName?: string;
  error?: string;
  costUsd: number | null;
}

const LETTERS = ['A', 'B', 'C'];

/**
 * The batch of generation runs, owned by App so closing the dialog does not
 * cancel anything (spec §3.4).
 *
 * GENERATION NEVER ADOPTS A PROJECT (spec §3.3). Each finished design is
 * written with `createProject(doc, { activate: false })` and nothing else:
 * no switchToken bump, no replaceDocument, no store action. That is what
 * keeps it out of invariant 32 entirely — it cannot move the persisted
 * activeId — and what lets the user keep editing while runs are out.
 *
 * One batch at a time: `start` is a no-op while any run is live, which is
 * what makes a double-clicked Generate one batch.
 */
export function useGenerations(opts: { onCreated: (projectId: string) => void; onStorageVerdict: () => void }) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [live, setLive] = useState(0);
  const liveRef = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const patch = (key: number, p: Partial<RunRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const start = useCallback((client: LlmClient, settings: GenerateSettings, count: 1 | 2 | 3) => {
    if (liveRef.current > 0) return;
    const ctl = new AbortController();
    controller.current = ctl;
    let authError: string | null = null;
    const keys = Array.from({ length: count }, (_, i) => Date.now() * 10 + i);
    setRows(keys.map((key, i) => ({ key, letter: count > 1 ? LETTERS[i] : null, status: 'designing', costUsd: null })));
    liveRef.current = count;
    setLive(count);

    keys.forEach((key, i) => {
      const letter = count > 1 ? LETTERS[i] : null;
      void (async () => {
        try {
          const out = await runGeneration(client, settings, ctl.signal, (p) =>
            patch(key, p.phase === 'designing' ? { status: 'designing' } : { status: 'repairing', round: p.round, issues: p.issues }));
          const costUsd = client.estimateCostUsd(out.usage);
          // A cancel that lands after the model answered but before the write
          // still means "write nothing" (spec §3.4).
          if (ctl.signal.aborted) {
            patch(key, authError ? { status: 'failed', error: authError, costUsd } : { status: 'cancelled', costUsd });
            return;
          }
          const name = letter ? `${out.doc.name} — ${letter}` : out.doc.name;
          const id = await storage.createProject({ ...out.doc, name }, { activate: false });
          optsRef.current.onStorageVerdict();
          if (!id) {
            patch(key, { status: 'failed', error: 'Could not save the project — storage is unavailable.', costUsd });
            return;
          }
          optsRef.current.onCreated(id);
          patch(key, { status: 'ready', projectId: id, projectName: name, issues: out.violations.length, costUsd });
        } catch (e) {
          if (e instanceof LlmError && e.kind === 'auth') {
            // Every sibling would fail identically — stop them, and say why on each.
            authError = e.message;
            ctl.abort();
          }
          const costUsd = e instanceof RunFailed ? client.estimateCostUsd(e.usage) : null;
          if (authError) patch(key, { status: 'failed', error: authError, costUsd });
          else if (e instanceof LlmError && e.kind === 'cancelled') patch(key, { status: 'cancelled', costUsd });
          else patch(key, { status: 'failed', error: e instanceof Error ? e.message : 'Unexpected error.', costUsd });
        } finally {
          liveRef.current -= 1;
          setLive(liveRef.current);
        }
      })();
    });
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { rows, live, start, cancel };
}
```

- [ ] **Step 4: Run** — PASS. `npm run build` — success.

- [ ] **Step 5: Mutation check.** `{ activate: false }` → `{}`: the first test must fail. Remove the `liveRef.current > 0` guard: the double-click test must fail. Remove `ctl.abort()` in the auth branch: the auth test must fail (siblings never settle → `waitFor` times out).

- [ ] **Step 6: Commit** (`feat(generate): run a batch of generations into new, unactivated projects`).

---

### Task 7: `SettingsDialog`

**Files:**
- Create: `src/panels/SettingsDialog.tsx`, `src/panels/SettingsDialog.test.tsx`
- Modify: `src/styles.css` (append)

**Interfaces:**
- Consumes: `LlmSettings` (Task 3), `CLAUDE_MODELS`, `DEFAULT_MODEL` (Task 5).
- Produces:
  ```tsx
  export function SettingsDialog(props: {
    settings: LlmSettings | null;
    onSave: (s: LlmSettings) => Promise<boolean>;
    onForget: () => Promise<void>;
    onClose: () => void;
  }): JSX.Element;
  ```
- Shared modal markup used by Tasks 7 and 8: `<div className="modal-overlay" role="dialog" aria-modal="true" aria-label=...><div className="modal-sheet" tabIndex={-1} ref=...>`; focus the sheet on mount; a window `keydown` listener for Escape → `onClose` (the `CutList` pattern, which is a dialog's own listener and so not inv 27's business).

- [ ] **Step 1: Write the failing tests:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsDialog } from './SettingsDialog';

const saved = { provider: 'anthropic' as const, apiKey: 'sk-ant-abc', model: 'claude-sonnet-5-5' };

describe('SettingsDialog', () => {
  it('saves a key and model', async () => {
    const onSave = vi.fn(async () => true);
    const onClose = vi.fn();
    render(<SettingsDialog settings={null} onSave={onSave} onForget={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('API key'), ' sk-ant-new ');
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'claude-sonnet-5-5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-new', model: 'claude-sonnet-5-5' });
    expect(onClose).toHaveBeenCalled();
  });

  it('defaults the model to Opus 5.5 and masks the key', () => {
    render(<SettingsDialog settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-opus-5-5');
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('shows the stored model, and maps an unknown stored model to the default', () => {
    const { unmount } = render(<SettingsDialog settings={saved} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-sonnet-5-5');
    unmount();
    render(<SettingsDialog settings={{ ...saved, model: 'gone' }} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).value).toBe('claude-opus-5-5');
  });

  it('will not save a blank key', async () => {
    render(<SettingsDialog settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('reports a failed save inline and stays open', async () => {
    const onClose = vi.fn();
    render(<SettingsDialog settings={null} onSave={vi.fn(async () => false)} onForget={vi.fn()} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('API key'), 'k');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('status')).toHaveTextContent(/could not save/i);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('forgets the key', async () => {
    const onForget = vi.fn(async () => {});
    render(<SettingsDialog settings={saved} onSave={vi.fn()} onForget={onForget} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Forget key' }));
    expect(onForget).toHaveBeenCalled();
  });

  it('closes on Escape and says where the key is stored', async () => {
    const onClose = vi.fn();
    render(<SettingsDialog settings={null} onSave={vi.fn()} onForget={vi.fn()} onClose={onClose} />);
    expect(screen.getByText(/stored in this browser only/i)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `src/panels/SettingsDialog.tsx`:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { CLAUDE_MODELS, DEFAULT_MODEL } from '../llm/anthropic';
import type { LlmSettings } from '../storage/types';

interface Props {
  settings: LlmSettings | null;
  onSave: (s: LlmSettings) => Promise<boolean>;
  onForget: () => Promise<void>;
  onClose: () => void;
}

/**
 * The bring-your-own-key settings. The CutList modal pattern: App makes
 * `.app-shell` inert while this is open, this takes focus on mount, and its
 * own Escape listener closes it.
 */
export function SettingsDialog({ settings, onSave, onForget, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const known = CLAUDE_MODELS.some((m) => m.id === settings?.model);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(known ? settings!.model : DEFAULT_MODEL);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const key = apiKey.trim() || settings?.apiKey || '';
  const save = async () => {
    const ok = await onSave({ provider: 'anthropic', apiKey: key, model });
    if (ok) onClose();
    else setError('Could not save — browser storage is unavailable.');
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-sheet" ref={sheet} tabIndex={-1}>
        <h2>Settings</h2>
        <div className="field">
          <label htmlFor="llm-provider">Provider</label>
          <select id="llm-provider" className="input" value="anthropic" disabled>
            <option value="anthropic">Claude (Anthropic)</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="llm-key">API key</label>
          <input
            id="llm-key"
            className="input"
            type="password"
            autoComplete="off"
            placeholder={settings ? 'Saved — type to replace' : 'sk-ant-…'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="llm-model">Model</label>
          <select id="llm-model" className="input" value={model} onChange={(e) => setModel(e.target.value)}>
            {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>
        <p className="modal-note">Stored in this browser only. Anyone with access to this browser profile can read it.</p>
        {error && <p className="field-error" role="status">{error}</p>}
        <div className="modal-actions">
          {settings && <button onClick={() => void onForget()}>Forget key</button>}
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!key} onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append modal styles to `src/styles.css`** (reusing the overlay values from `.cutlist-overlay` and the existing palette variables — check `grep -n "^:root" -A30 src/styles.css` for the variable names before using any):

```css
/* Generate / Settings dialogs — the cut list's overlay idiom, smaller sheet. */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 48px 16px;
  overflow: auto;
  background: rgba(12, 14, 16, 0.72);
}
.modal-sheet {
  width: min(560px, 100%);
  padding: 20px 24px;
  background: var(--graphite-800);
  border: 1px solid var(--graphite-600);
  border-radius: 8px;
  outline: none;
}
.modal-sheet h2 { margin: 0 0 16px; }
.modal-note { font-size: 12px; opacity: 0.75; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
```

(`--graphite-800` exists in `:root`.)

- [ ] **Step 5: Run** — PASS. Build — success. **Commit** (`feat(panels): Settings dialog for the API key and model`).

---

### Task 8: `GenerateDialog`

**Files:**
- Create: `src/panels/GenerateDialog.tsx`, `src/panels/GenerateDialog.test.tsx`
- Modify: `src/styles.css` (append)

**Interfaces:**
- Consumes: `GenerateSettings`, `STYLES`, `DETAIL_CAPS` (Task 4); `RunRow` (Task 6); `parseLength` (`units/length.ts`, returns `number | null`); `MATERIALS`.
- Produces:
  ```tsx
  export function GenerateDialog(props: {
    hasKey: boolean;
    libraryAvailable: boolean;
    rows: RunRow[];
    live: number;
    onGenerate: (s: GenerateSettings, count: 1 | 2 | 3) => void;
    onCancel: () => void;
    onOpenProject: (projectId: string) => void;
    onOpenSettings: () => void;
    onClose: () => void;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests:**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GenerateDialog } from './GenerateDialog';
import type { RunRow } from '../useGenerations';

const props = (over: Partial<Parameters<typeof GenerateDialog>[0]> = {}) => ({
  hasKey: true, libraryAvailable: true, rows: [] as RunRow[], live: 0,
  onGenerate: vi.fn(), onCancel: vi.fn(), onOpenProject: vi.fn(), onOpenSettings: vi.fn(), onClose: vi.fn(),
  ...over,
});

describe('GenerateDialog', () => {
  it('generates with parsed limits and the chosen count', async () => {
    const p = props();
    render(<GenerateDialog {...p} />);
    await userEvent.type(screen.getByLabelText('Description'), 'A five-shelf bookcase');
    await userEvent.type(screen.getByLabelText('Max width'), '3\'');
    await userEvent.type(screen.getByLabelText('Max height'), '72');
    await userEvent.selectOptions(screen.getByLabelText('Primary material'), 'plywood');
    await userEvent.selectOptions(screen.getByLabelText('Style'), 'shaker');
    await userEvent.click(screen.getByRole('radio', { name: '3' }));
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(p.onGenerate).toHaveBeenCalledWith({
      description: 'A five-shelf bookcase', width: 36, depth: null, height: 72,
      material: 'plywood', style: 'shaker', detail: 'moderate',
    }, 3);
  });

  it('disables Generate for a whitespace-only description', async () => {
    render(<GenerateDialog {...props()} />);
    await userEvent.type(screen.getByLabelText('Description'), '   ');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it.each(['abc', '-3', '0'])('blocks an unparseable or non-positive max size: %s', async (bad) => {
    render(<GenerateDialog {...props()} />);
    await userEvent.type(screen.getByLabelText('Description'), 'a box');
    await userEvent.type(screen.getByLabelText('Max depth'), bad);
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText(/not a length/i)).toBeInTheDocument();
  });

  it('disables Generate while a batch is live — a double click cannot start two', async () => {
    render(<GenerateDialog {...props({ live: 2 })} />);
    await userEvent.type(screen.getByLabelText('Description'), 'a box');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('replaces Generate with a settings link when there is no key', async () => {
    const p = props({ hasKey: false });
    render(<GenerateDialog {...p} />);
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /set up your api key/i }));
    expect(p.onOpenSettings).toHaveBeenCalled();
  });

  it('disables Generate with the reason when the library is unavailable', async () => {
    render(<GenerateDialog {...props({ libraryAvailable: false })} />);
    await userEvent.type(screen.getByLabelText('Description'), 'a box');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText(/storage is unavailable/i)).toBeInTheDocument();
  });

  it('renders each run row and opens a ready project', async () => {
    const rows: RunRow[] = [
      { key: 1, letter: 'A', status: 'repairing', round: 1, issues: 2, costUsd: null },
      { key: 2, letter: 'B', status: 'ready', projectId: 'p2', projectName: 'Bench — B', issues: 1, costUsd: 0.081 },
      { key: 3, letter: 'C', status: 'failed', error: 'Rate limited.', costUsd: null },
    ];
    const p = props({ rows });
    render(<GenerateDialog {...p} />);
    expect(screen.getByText(/fixing 2 issues \(round 1\/3\)/i)).toBeInTheDocument();
    expect(screen.getByText(/1 issue/)).toBeInTheDocument();
    expect(screen.getByText('≈ $0.08')).toBeInTheDocument();
    expect(screen.getByText(/rate limited/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Bench — B' }));
    expect(p.onOpenProject).toHaveBeenCalledWith('p2');
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement `src/panels/GenerateDialog.tsx`:**

```tsx
import { useEffect, useRef, useState } from 'react';
import { parseLength } from '../units/length';
import { MATERIALS } from '../document/types';
import { DETAIL_CAPS, STYLES } from '../generate/prompt';
import type { Detail, GenerateSettings, Style } from '../generate/prompt';
import { MAX_REPAIRS } from '../generate/run';
import type { RunRow } from '../useGenerations';

interface Props {
  hasKey: boolean;
  libraryAvailable: boolean;
  rows: RunRow[];
  live: number;
  onGenerate: (s: GenerateSettings, count: 1 | 2 | 3) => void;
  onCancel: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

/** '' → null (no limit); a positive length → inches; anything else → 'bad'. */
function parseLimit(text: string): number | null | 'bad' {
  if (!text.trim()) return null;
  const v = parseLength(text);
  return v !== null && v > 0 ? v : 'bad';
}

function statusText(r: RunRow): string {
  switch (r.status) {
    case 'designing': return 'Designing…';
    case 'repairing': return `Fixing ${r.issues} issue${r.issues === 1 ? '' : 's'} (round ${r.round}/${MAX_REPAIRS})…`;
    case 'ready': return r.issues ? `Ready · ${r.issues} issue${r.issues === 1 ? '' : 's'}` : 'Ready';
    case 'cancelled': return 'Cancelled';
    case 'failed': return `Failed: ${r.error}`;
  }
}

/**
 * The Generate form and its progress rows. The runs belong to App
 * (useGenerations), so closing this does not cancel them and reopening it
 * shows the same rows (spec §3.4). Form state is local and resets on reopen.
 */
export function GenerateDialog(p: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState('');
  const [count, setCount] = useState<1 | 2 | 3>(1);
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [height, setHeight] = useState('');
  const [material, setMaterial] = useState('any');
  const [style, setStyle] = useState<Style>('any');
  const [detail, setDetail] = useState<Detail>('moderate');

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onClose]);

  const limits = { width: parseLimit(width), depth: parseLimit(depth), height: parseLimit(height) };
  const badLimit = Object.values(limits).some((v) => v === 'bad');
  const canGenerate = description.trim() !== '' && !badLimit && p.live === 0 && p.libraryAvailable;

  const generate = () => {
    if (!canGenerate) return;
    p.onGenerate({
      description: description.trim(),
      width: limits.width as number | null,
      depth: limits.depth as number | null,
      height: limits.height as number | null,
      material, style, detail,
    }, count);
  };

  const limitField = (label: string, value: string, set: (v: string) => void) => (
    <div className="field generate-limit">
      <label htmlFor={`gen-${label}`}>{`Max ${label}`}</label>
      <input id={`gen-${label}`} className={`input${parseLimit(value) === 'bad' ? ' invalid' : ''}`}
        placeholder="no limit" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate">
      <div className="modal-sheet" ref={sheet} tabIndex={-1}>
        <h2>Generate a prototype</h2>
        <div className="field">
          <label htmlFor="gen-description">Description</label>
          <textarea id="gen-description" className="input" rows={3} value={description}
            placeholder="A 36in-wide bookcase with five adjustable-looking shelves"
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <fieldset className="field generate-count">
          <legend>Generations</legend>
          {([1, 2, 3] as const).map((n) => (
            <label key={n}><input type="radio" name="gen-count" checked={count === n} onChange={() => setCount(n)} aria-label={String(n)} />{n}</label>
          ))}
        </fieldset>
        <div className="generate-limits">
          {limitField('width', width, setWidth)}
          {limitField('depth', depth, setDepth)}
          {limitField('height', height, setHeight)}
        </div>
        {badLimit && <p className="field-error" role="status">A max size is not a length — try 36, 3', or 914mm.</p>}
        <div className="field">
          <label htmlFor="gen-material">Primary material</label>
          <select id="gen-material" className="input" value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="any">Any</option>
            {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gen-style">Style</label>
          <select id="gen-style" className="input" value={style} onChange={(e) => setStyle(e.target.value as Style)}>
            {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gen-detail">Detail</label>
          <select id="gen-detail" className="input" value={detail} onChange={(e) => setDetail(e.target.value as Detail)}>
            {(Object.keys(DETAIL_CAPS) as Detail[]).map((d) => (
              <option key={d} value={d}>{`${d[0].toUpperCase()}${d.slice(1)} (up to ${DETAIL_CAPS[d]} parts)`}</option>
            ))}
          </select>
        </div>
        {!p.libraryAvailable && <p className="field-error" role="status">Generate is unavailable — storage is unavailable, so a design would have nowhere to go.</p>}

        {p.rows.length > 0 && (
          <ul className="generate-runs">
            {p.rows.map((r) => (
              <li key={r.key} className={`generate-run generate-run-${r.status}`}>
                {r.letter && <span className="generate-run-letter">{r.letter}</span>}
                <span className="generate-run-status">{statusText(r)}</span>
                {r.costUsd !== null && <span className="generate-run-cost">{`≈ $${r.costUsd.toFixed(2)}`}</span>}
                {r.status === 'ready' && r.projectId && (
                  <button aria-label={`Open ${r.projectName}`} onClick={() => p.onOpenProject(r.projectId!)}>Open</button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          {p.live > 0 && <button onClick={p.onCancel}>Cancel</button>}
          <button onClick={p.onClose}>Close</button>
          {p.hasKey
            ? <button className="btn-primary" disabled={!canGenerate} onClick={generate}>Generate</button>
            : <button className="btn-primary" onClick={p.onOpenSettings}>Set up your API key</button>}
        </div>
      </div>
    </div>
  );
}
```

Note the Cancel button exists only while `live > 0`, and the **Close** button is what closes the dialog; the test "Cancel enabled while live" depends on that split.

- [ ] **Step 4: Append styles:**

```css
.generate-limits { display: flex; gap: 8px; }
.generate-limit { flex: 1; min-width: 0; }
.generate-count { display: flex; gap: 12px; border: 0; padding: 0; }
.generate-count legend { padding: 0; margin-bottom: 4px; }
.generate-runs { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 6px; }
.generate-run { display: flex; gap: 8px; align-items: center; }
.generate-run-letter { font-family: var(--font-num); width: 1.5em; }
.generate-run-status { flex: 1; }
.generate-run-cost { font-family: var(--font-num); opacity: 0.75; }
.generate-run-failed .generate-run-status { color: var(--danger, #e06c5a); }
```

(`list-style: none; padding: 0` on the list from the start — follow-up 162's lesson.)

- [ ] **Step 5: Run** — PASS. Build — success. **Commit** (`feat(panels): Generate dialog — settings form and progress rows`).

---

### Task 9: Wire it into the app

**Files:**
- Modify: `src/App.tsx`, `src/panels/Toolbar.tsx`, `src/panels/ProjectMenu.tsx`, `src/App.test.tsx`, `src/panels/Toolbar.test.tsx`, `src/panels/ProjectMenu.test.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: everything above.
- Produces (props added):
  - `Toolbar`: `onOpenGenerate: () => void; onOpenSettings: () => void; generating: { live: number; total: number } | null; newIds: ReadonlySet<string>`.
  - `ProjectMenu`: `newIds: ReadonlySet<string>`.

- [ ] **Step 1: Write the failing App tests** — add to `src/App.test.tsx` (it already mocks the viewport and storage; reuse its helpers, e.g. `mountWithOneBoard`). Mock the Anthropic client module so no network is touched:

```tsx
// At the top, with the other mocks:
const completeImpl = vi.hoisted(() => ({ current: null as null | ((...a: unknown[]) => Promise<unknown>) }));
vi.mock('./llm/anthropic', async (orig) => {
  const real = await orig<typeof import('./llm/anthropic')>();
  return {
    ...real,
    AnthropicClient: class {
      userTurn(t: string) { return t; }
      estimateCostUsd() { return 0.01; }
      complete(...a: unknown[]) { return completeImpl.current!(...a); }
    },
  };
});

describe('Generate', () => {
  const GOOD = {
    name: 'Bench',
    parts: [{ name: 'Top', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } }],
  };
  const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

  beforeEach(() => {
    completeImpl.current = async () => ({ json: GOOD, assistantTurn: {}, usage });
  });

  it('suspends shortcuts and makes the shell inert while a dialog is open', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /generate/i }));
    expect(viewportProps.current?.shortcutsSuspended).toBe(true);
    expect(document.querySelector('.app-shell')!.hasAttribute('inert')).toBe(true);
    // Typing in the description must not arm the Move tool behind the dialog.
    await user.type(screen.getByLabelText('Description'), 'm');
    expect(useStore.getState().tool).toBe('select');
    await user.keyboard('{Escape}');
    expect(viewportProps.current?.shortcutsSuspended).toBe(false);
  });

  it('a finished generation lands in the library without switching or touching the document', async () => {
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    await mountWithOneBoard();
    const docBefore = useStore.getState().doc;
    const pastBefore = useStore.getState().past.length;
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByRole('button', { name: 'Open Bench' });
    expect(createProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Bench' }), { activate: false });
    expect(setActiveProject).not.toHaveBeenCalled();
    expect(useStore.getState().doc).toBe(docBefore);
    expect(useStore.getState().past.length).toBe(pastBefore);
  });

  it('closing the dialog does not cancel; reopening shows the same rows', async () => {
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    completeImpl.current = async () => { await gate; return { json: GOOD, assistantTurn: {}, usage }; };
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /generating 0\/1/i })).toBeInTheDocument();
    release();
    await user.click(await screen.findByRole('button', { name: /generate/i }));
    await screen.findByRole('button', { name: 'Open Bench' });
  });

  it('opening a generated project goes through openProject and clears its new badge', async () => {
    llmSettings = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /generate/i }));
    await user.type(screen.getByLabelText('Description'), 'a bench');
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await user.click(await screen.findByRole('button', { name: 'Open Bench' }));
    await waitFor(() => expect(setActiveProject).toHaveBeenCalled());
    expect(useStore.getState().doc.name).toBe('Bench');
    await user.click(screen.getByRole('button', { name: 'Open project menu' }));
    expect(screen.queryByText('new')).toBeNull();
  });

  it('Settings saves through the storage seam', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /settings/i }));
    await user.type(screen.getByLabelText('API key'), 'sk-ant-x');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(setLlmSettings).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: 'sk-ant-x', model: 'claude-opus-5-5' });
  });
});
```

Match the names used here (`createProject`, `setActiveProject`, `mountWithOneBoard`, `viewportProps`, `llmSettings`, `setLlmSettings`) to the ones actually declared in `App.test.tsx`; adjust these tests, not the file's existing helpers. Also add to `ProjectMenu.test.tsx`: a row whose id is in `newIds` renders a `new` badge, and one whose id is not does not. And to `Toolbar.test.tsx`: `generating={{ live: 1, total: 3 }}` labels the button `Generating 2/3…` (done = total − live).

- [ ] **Step 2: Run** `npm test` — the new tests FAIL.

- [ ] **Step 3: `ProjectMenu.tsx`.** Add `newIds: ReadonlySet<string>;` to `Props` (doc comment: *"Generated this session and not yet opened — session-only App state, not persisted (spec §6.3)."*), destructure it, and inside `.project-row-open` after the name span:

```tsx
{newIds.has(p.id) && <span className="project-row-new">new</span>}
```

- [ ] **Step 4: `Toolbar.tsx`.** Add the four props above with doc comments, pass `newIds` to `ProjectMenu`, and after the Cut list button:

```tsx
<button onClick={onOpenGenerate} title="Generate a prototype from a description">
  {generating ? `Generating ${generating.total - generating.live}/${generating.total}…` : 'Generate…'}
</button>
```

and in the right group, before `{children}`:

```tsx
<button onClick={onOpenSettings} aria-label="Settings" title="Settings">⚙</button>
```

- [ ] **Step 5: `App.tsx`.** Make these changes:

  1. Imports: `GenerateDialog`, `SettingsDialog`, `useGenerations`, `AnthropicClient`, `LlmSettings`.
  2. State, beside `cutListOpen`:

  ```tsx
  // Which dialog is open. View state like `cutListOpen`, and it joins that
  // flag as a reason the shell is inert and every window shortcut is
  // suspended (invariant 27) — `inert` cannot reach a window listener, so
  // typing "make it 36in wide" in the description would otherwise arm the
  // Move tool behind the dialog.
  const [dialog, setDialog] = useState<'generate' | 'settings' | null>(null);
  const modalOpen = cutListOpen || dialog !== null;
  const [llmSettings, setLlmSettingsState] = useState<LlmSettings | null>(null);
  // Generated this session and not yet opened (spec §6.3). Session-only.
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(new Set());
  const [batchSize, setBatchSize] = useState(0);
  const generations = useGenerations({
    onCreated: (id) => setNewIds((s) => new Set(s).add(id)),
    onStorageVerdict: () => setAvailable(storage.available),
  });
  useEffect(() => {
    void storage.getLlmSettings().then(setLlmSettingsState);
  }, []);
  ```

  3. In `openProject`, after `setActiveId(id);` add `setNewIds((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });`.
  4. Replace `if (cutListOpen) return;` in the keydown effect with `if (modalOpen) return;` and update its comment's first line to *"The cut list or a dialog covers the app, so …"*; change the effect's dep `cutListOpen` → `modalOpen`.
  5. The focus-restore effect: key it on `modalOpen` instead of `cutListOpen` (`if (modalOpen) return;` and deps `[modalOpen]`), and set `opener.current = document.activeElement as HTMLElement | null;` in both dialog-opening handlers as `onOpenCutList` does.
  6. `<div className="app-shell" inert={modalOpen}>` and `shortcutsSuspended={modalOpen}`.
  7. Toolbar props:

  ```tsx
  onOpenGenerate={() => { opener.current = document.activeElement as HTMLElement | null; setDialog('generate'); }}
  onOpenSettings={() => { opener.current = document.activeElement as HTMLElement | null; setDialog('settings'); }}
  generating={generations.live > 0 ? { live: generations.live, total: batchSize } : null}
  newIds={newIds}
  ```

  8. After the CutList line:

  ```tsx
  {dialog === 'settings' && (
    <SettingsDialog
      settings={llmSettings}
      onSave={async (s) => {
        const ok = await storage.setLlmSettings(s);
        if (ok) setLlmSettingsState(s);
        return ok;
      }}
      onForget={async () => { await storage.clearLlmSettings(); setLlmSettingsState(null); }}
      onClose={() => setDialog(null)}
    />
  )}
  {dialog === 'generate' && (
    <GenerateDialog
      hasKey={llmSettings !== null}
      libraryAvailable={libraryAvailable}
      rows={generations.rows}
      live={generations.live}
      onGenerate={(s, n) => {
        if (!llmSettings) return;
        setBatchSize(n);
        generations.start(new AnthropicClient(llmSettings.apiKey, llmSettings.model), s, n);
      }}
      onCancel={generations.cancel}
      onOpenProject={(id) => { setDialog(null); void openProject(id); }}
      onOpenSettings={() => setDialog('settings')}
      onClose={() => setDialog(null)}
    />
  )}
  ```

  The dialogs render as children of `.app`, outside `.app-shell`, exactly like `CutList`. Check the print rule (`.app > *:not(.cutlist-overlay)`) hides them when printing — it does, since they are not `.cutlist-overlay`.

- [ ] **Step 6: Badge style:**

```css
.project-row-new {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--brass);
  color: var(--graphite-800);
}
```

(`--brass` and `--graphite-800` both exist in `:root`. The brass-on-graphite chip is the app's existing idiom — CLAUDE.md, TapeReadout — so no new hue.)

- [ ] **Step 7: Run** `npm test` — ALL PASS, including every pre-existing `App.test.tsx` test (the shortcut and cut-list tests are the ones this task can break). `npm run build` — success.

- [ ] **Step 8: Mutation check.** `inert={modalOpen}` → `inert={cutListOpen}`: the inert test must fail. In the keydown effect `if (modalOpen) return;` → `if (cutListOpen) return;`: the typed-`m` test must fail. Revert.

- [ ] **Step 9: Commit** (`feat: wire Generate and Settings into the toolbar, project menu and shortcuts`).

---

### Task 10: The security policy

**Files:**
- Modify: `security-headers.conf`

- [ ] **Step 1: Edit the policy.** Change `connect-src 'self';` to `connect-src 'self' https://api.anthropic.com;` in the `Content-Security-Policy` line. Rewrite the comment paragraph beginning *"Sloyd itself is entirely self-contained: no CDN, no external fonts, and no network calls of its own"* so it states: Sloyd makes **exactly one** kind of outside call — to `https://api.anthropic.com`, only when the user clicks Generate with their own key (Generate round, 2026-10) — and that this is the first third-party origin the app *itself* talks to, the analytics beacon being Cloudflare's. Keep the rest of the comment (the Cloudflare reasoning) intact.

- [ ] **Step 2: Verify against a throwaway container, not production.**

```bash
cd /home/alec/docker/sloyd
docker build -t sloyd-csp-check .
docker run --rm -d --name sloyd-csp-check -p 127.0.0.1:18080:80 sloyd-csp-check
curl -sI http://127.0.0.1:18080/ | grep -i content-security-policy
```

Expected: the header contains `connect-src 'self' https://api.anthropic.com`. Then, with the Playwright MCP, open `http://127.0.0.1:18080/`, and in the page run `fetch('https://api.anthropic.com/v1/models').then(r => r.status).catch(e => 'blocked: ' + e)`. Expected: a **status number** (401 without a key), and **no** CSP violation in the console — that proves the policy permits the origin. Then `docker stop sloyd-csp-check && docker rmi sloyd-csp-check`.

- [ ] **Step 3: Commit** (`feat(nginx): allow the Claude API origin for Generate`).

---

### Task 11: Browser verification and the round's record

**Files:**
- Create: `docs/browser-verification-generate.md`, screenshots in `docs/img/generate-*.png`
- Modify: `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`

- [ ] **Step 1: Dev server.** `npm run dev -- --port 5180`. With the Playwright MCP (the only browser tool that works on this host — see the memory note), verify without a key: Generate opens; the no-key state shows *Set up your API key*; Settings opens, masks the key, Escape closes both; typing `m` in the description does not arm Move; the shell is inert behind each dialog.

- [ ] **Step 2: Real generations — ASK THE USER FIRST.** This spends money on the user's key. Ask for approval and for the key to be entered in the dev-server browser by the user (or pasted for this session only — never committed, never echoed into a doc). With approval, run three prompts, at least one per model:
  1. *"A 36in-wide bookcase with five shelves"* — plywood, Shaker, max height 72, 2 generations.
  2. *"A simple workbench"* — Any, Shop, Moderate, 1 generation, Sonnet 5.5.
  3. *"A side table"* — oak, Mid-century, Detailed, 3 generations.

  For each, record: calls used, issues remaining, the cost estimate, whether the cut list reads believably, and a screenshot of the opened design. Watch for the `cache_read_input_tokens` being non-zero on repair calls (add a temporary `console.log` of usage if needed, removed before commit). If designs are routinely failing one check, record it — do not retune the prompt silently; raise it with the user.

- [ ] **Step 3: Effort.** If Opus 5.5 at `medium` produces designs that routinely leave issues after 4 calls, try `high` on the same prompt and record both. Change `EFFORT` only with the user's agreement.

- [ ] **Step 4: Write `docs/browser-verification-generate.md`** in the shape of the existing `docs/browser-verification-*.md` files: what was checked, how, what was seen, what could not be confirmed. Clear `localStorage` in the verifying browser afterward and record that you checked `sloyd.llm.v1` is gone.

- [ ] **Step 5: CLAUDE.md** — the rules, not the narrative:
  - Status block: test count, the new round, *"no successor chosen"* updated to name phase 2 (refine/joinery) as the planned successor.
  - Rounds-shipped table row: `generate | 10-03 | — | prototypes from a description via Claude; each generation is a new, unactivated project (invariant 36)`.
  - Layer order: add `llm` and `generate`.
  - Where-things-live: the new files, one or two lines each.
  - **Invariant 36 — Generation never adopts a project.** `createProject(doc, { activate: false })` and nothing else; no `switchToken` bump, no `replaceDocument`, no store action; opening one goes through `openProject`. Breaking it pulls the user out of their work and re-enters invariant 32's race.
  - **Invariant 37 — The generation history is append-only, and `LlmMessage` is opaque so it stays that way.** Editing a past turn breaks thinking-block validation and the cache.
  - **Invariant 38 — `overlap` is phase-1-only** (spec §4.4) — relax it to "not accounted for by a cut" in phase 2, deliberately.
  - Invariant 27: add *"a dialog is open"* beside `cutListOpen`.
  - Deployment rule: production verification of this round is page load + bundle hash + the CSP header; generation is never exercised against production.

- [ ] **Step 6: `docs/history.md`** — the narrative of the round, including the three plan deviations and why. **`docs/follow-ups.md`** — new entries: phase 2 (refine/joinery); a design-quality eval set; budget and "use what I have" settings; other providers; any surviving mutation or measured finding from this round.

- [ ] **Step 7: Full verification.** `npm test` (all pass, record the count) and `npm run build` (success). Commit the docs (`docs: the Generate round — browser verification and the rules it adds`).

- [ ] **Step 8: Merge.** `git checkout master && git merge --no-ff generate`, run `npm test` and `npm run build` on the merged tree, then `git branch -d generate`. **Do not deploy** — deployment is a separate request; `DEPLOYMENT.local.md` gets its entry when it happens.
