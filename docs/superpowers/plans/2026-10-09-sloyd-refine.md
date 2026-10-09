# Refine by instruction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Refine…" action sends the open prototype plus a change request to the model and saves the revised design as a new project, checked like Generate's output, with a list of exactly what changed.

**Architecture:** `documentToDesign` (document layer) turns the open tree into Generate's design format, refusing what it cannot express. `runRefine` runs the existing repair loop with the unchanged `SYSTEM_PROMPT`, a refine user turn, and Generate's evaluation step (extracted so both share it), converting without horizontal re-centring so untouched parts stay put, carrying grain over by name, and filtering problems the original already had. `diffDesigns` lists the changes. `useRefine` + `RefineDialog` mirror joinery's hook and dialog.

**Tech Stack:** TypeScript, React, Vitest, Vite (`npm run build` is the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-09-sloyd-refine-design.md` (note the §4 amendment: no offset realignment; `centre: false` instead). Also read `CLAUDE.md` invariants 19, 27, 36, 41, 45, 46 and the `→ units` edge rule.

## Global Constraints

- No schema change; documents stay `version: 11`.
- Never adopt (invariant 36): the result is written ONLY by `storage.createProject({ ...doc, name }, { activate: false })`, `name = "<original name> — refined"`; opened only through App's `openProject`.
- `SYSTEM_PROMPT` is not edited; refine text rides in the USER turn.
- Refusal messages, verbatim:
  - empty: `There is nothing to refine yet.`
  - cuts: `Refine works on prototypes without joints. Refine first, then add joinery.`
  - turned: `Refine cannot keep a turned assembly. Turn it back to 0°, or ungroup it.`
  - nested: `Refine cannot keep an assembly inside another assembly. Ungroup the inner one.`
  - too-large (distinct): `` `This design has ${n} distinct parts; Refine handles up to ${max}.` ``
  - too-large (placed): `` `${n} placed parts; Refine handles up to ${max}.` ``
- Refusal order: empty, cuts, turned, nested, too-large (distinct, then placed). Limits: 60 distinct (`DETAIL_CAPS.detailed`), 240 placed (`placedCeiling('detailed')`).
- Keep line, verbatim: `Keep every part you are not asked to change exactly as it is: the same name, role, material, size and position. Keep assembly and placement names. Return the whole design.`
- Only NEW problems (not matching `problemKey` — kind + sorted part names — of the original's raw `checkDesign` violations) count toward "fewest" and go back as repair feedback.
- Identity for matching (grain carry-over, change list, already-present) is the flat display name.
- Change-list text is assembled in `designDiff.ts` with `formatLength` (the `→ units` edge); the dialog shows the first 12 and `and N more`.
- Generate's behaviour must not change: its existing tests stay green unmodified (except where a task says otherwise).
- Commits on branch `refine`; merge locally `--no-ff` at the end; no PRs. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Mutate every equality, ordering and boundary test once (break the code, see red, restore) and record it.

## Review Focus

1. **The instruction removes something low (a toe kick) and the model lowers the case.** Expected: the refined case sits on the floor, not lifted back. Pinned in Task 1 (floor rule with `centre: false`) and Task 4.
2. **The model renames an assembly but keeps placement and part names.** Expected: no change entries (matching is by flat display name, not assembly name). Pinned in Task 3.
3. **The original already had a problem that the refine leaves alone, with slightly different numbers.** Expected: listed as already present, not counted, not sent back. Pinned in Task 4 (an overlap whose depth changes).
4. **A placement is renamed.** Expected: one "Removed placement" and one "Added placement", its parts not listed one by one. Pinned in Task 3.
5. **Blank instruction, or a size limit that isn't a length.** Expected: Refine disabled. Pinned in Task 5.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/document/generated.ts` | modify | `parseDesign` returns a normalised copy; optional TS-only `grain`; `designToDocument(design, { centre })` |
| `src/document/refineDesign.ts` | create | `documentToDesign` (+ refusals), `carryGrain` |
| `src/document/designDiff.ts` | create | `diffDesigns` → `Change[]` with display text |
| `src/generate/prompt.ts` | modify | `limitLines` (shared), `limitsOf` takes the limit fields only |
| `src/generate/refine.ts` | create | `RefineSettings`, `REFINE_MAX`, `KEEP_LINE`, `refineMessage`, `detailFor`, `refineRefusal` |
| `src/generate/run.ts` | modify | `evaluateDesign` (shared), `runRefine`, `refineEstimateUsd` |
| `src/useRefine.ts` | create | the run hook (never adopts) |
| `src/panels/RefineDialog.tsx` | create | the dialog |
| `src/panels/GenerateDialog.tsx` | modify | export `parseLimit` |
| `src/panels/Toolbar.tsx`, `src/App.tsx` | modify | "Refine…" button and wiring |

---

### Task 0: Branch

- [ ] `cd /home/alec/docker/sloyd && git checkout -b refine && npm test 2>&1 | grep -E "Tests "` — expect 2147 passing.

---

### Task 1: Converter options — normalised parse, grain, no re-centring

**Files:** Modify `src/document/generated.ts`; Test `src/document/generated.test.ts`.

**Interfaces — Produces:**
```ts
export interface GeneratedPart { name: string; role?: string; material: MaterialKey; at: Vec3; size: Vec3; grain?: Grain }
export function parseDesign(json: unknown): GeneratedDesign | null   // now returns a fresh object with ONLY schema fields
export function designToDocument(design: GeneratedDesign, opts?: { centre?: boolean }): { doc: SloydDocument; rejected: RejectedPart[]; authored: Authored }
```
`grain` is TS-only (never in `DESIGN_SCHEMA`); only Refine sets it (Task 2's `carryGrain`). `parseDesign` must drop it (and any other unknown key) so a model cannot inject one. `centre` defaults to `true` (Generate unchanged); `false` skips the horizontal centring and keeps the floor rule.

- [ ] **Step 1: Failing tests** — add to `src/document/generated.test.ts`:

```ts
describe('parseDesign — normalised copy', () => {
  it('drops keys the schema does not have, at every level', () => {
    const raw = {
      name: 'x', extra: 1,
      parts: [{ name: 'A', role: '', material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1), grain: 'width', junk: true }],
      assemblies: [{ name: 'D', note: 'n', parts: [{ name: 'F', role: '', material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1), grain: 'width' }],
        placements: [{ name: 'P', at: { x: 0, y: 0, z: 0, w: 9 }, extra: 2 }] }],
    };
    const d = parseDesign(raw)!;
    expect(d).toEqual({
      name: 'x',
      parts: [{ name: 'A', role: '', material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1) }],
      assemblies: [{ name: 'D', parts: [{ name: 'F', role: '', material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1) }], placements: [{ name: 'P', at: v(0, 0, 0) }] }],
    });
    expect(d).not.toBe(raw);
  });
});

describe('designToDocument — options', () => {
  it('uses a valid grain on the part, and ignores an invalid one', () => {
    const { doc } = designToDocument(design(
      { ...part('A', [0, 0, 0], [10, 1, 4]), grain: 'width' },
      { ...part('B', [0, 1, 0], [10, 1, 4]), grain: 'diagonal' as never },
    ));
    expect(worldParts(doc).map((b) => b.grain)).toEqual(['width', 'length']);
  });

  it('with centre: false keeps X and Z, and still puts the lowest part on the floor', () => {
    const { doc } = designToDocument(design(
      part('A', [10, 5, 20], [4, 1, 2]),
      part('B', [14, 5, 20], [4, 1, 2]),
    ), { centre: false });
    expect(doc.boards.map((b) => b.position)).toEqual([[10, 0, 20], [14, 0, 20]]);
  });

  it('with centre: false a design the model lowered stays lowered (review focus 1)', () => {
    // The model removed a 4in toe kick and lowered the case onto the floor.
    const { doc } = designToDocument(design(part('Case', [0, 0, 0], [20, 30, 12])), { centre: false });
    expect(doc.boards[0].position).toEqual([0, 0, 0]);
  });

  it('shifts instance origins, never definition-local coordinates, with centre: false', () => {
    const { doc } = designToDocument({ name: 'T', parts: [], assemblies: [{ name: 'D', parts: [part('F', [0, 0, 0], [10, 4, 0.75])],
      placements: [{ name: 'P', at: v(7, 3, 9) }] }] }, { centre: false });
    expect(doc.instances[0].position).toEqual([7, 0, 9]);
    expect(doc.definitions[0].boards[0].position).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/document/generated.test.ts`

- [ ] **Step 3: Implement** in `src/document/generated.ts`:
  - Import `Grain` in the `./types` type import.
  - `GeneratedPart` gains `grain?: Grain` with the comment `/** TS-only, never in the schema: set by Refine's carryGrain from the original part of the same name. parseDesign drops it. */`.
  - Replace the tail of `parseDesign` (after the checks) with a normalised copy:

```ts
const vec = (o: unknown): Vec3 => { const v = o as Vec3; return { x: v.x, y: v.y, z: v.z }; };
const partOf = (o: unknown): GeneratedPart => {
  const p = o as GeneratedPart;
  return { name: p.name, role: p.role, material: p.material, at: vec(p.at), size: vec(p.size) };
};
```
and in `parseDesign`, instead of `return json as unknown as GeneratedDesign;`:
```ts
  // A fresh object with ONLY the schema's fields, so nothing the model adds
  // (a `grain`, say) reaches the converter.
  return {
    name: json.name,
    parts: json.parts.map(partOf),
    assemblies: (json.assemblies as { name: string; parts: unknown[]; placements: { name: string; at: unknown }[] }[]).map((a) => ({
      name: a.name,
      parts: a.parts.map(partOf),
      placements: a.placements.map((pl) => ({ name: pl.name, at: vec(pl.at) })),
    })),
  };
```
  - In `convertPart`, replace `grain: 'length'` with `grain: isGrain(p.grain) ? p.grain : 'length'`, where (module level) `const isGrain = (g: unknown): g is Grain => (DIMENSION_ORDER as readonly unknown[]).includes(g);`.
  - `designToDocument(design: GeneratedDesign, opts: { centre?: boolean } = {})`; in the centring block replace the `shift` line with:
```ts
    // Refine passes centre: false, so untouched parts keep the original's
    // coordinates (refine spec §4); the floor rule holds either way.
    const shift = opts.centre === false
      ? [0, -min[1], 0]
      : [snap(-(min[0] + max[0]) / 2), -min[1], snap(-(min[2] + max[2]) / 2)];
```
  Update `designToDocument`'s doc comment with one sentence about `centre`.

- [ ] **Step 4: Run, expect PASS:** `npx vitest run src/document && npm test 2>&1 | grep -E "Tests " && npm run build 2>&1 | tail -2`
- [ ] **Step 5: Mutate:** make `centre: false` still centre → the two centre tests go red; drop `isGrain(...) ?` (always `p.grain ?? 'length'`) → the invalid-grain test goes red; return `json` unnormalised → the normalised-copy test goes red. Restore each.
- [ ] **Step 6: Commit** `feat(refine): converter keeps coordinates on request, carries a TS-only grain, parse normalises` (+ trailer).

---

### Task 2: `documentToDesign` and `carryGrain`

**Files:** Create `src/document/refineDesign.ts`, `src/document/refineDesign.test.ts`.

**Interfaces:**
- Consumes: Task 1 (`designToDocument(…, { centre })`, `GeneratedPart.grain`); `distinctParts` (`./assemblyChecks`); `boardExtents` (`./geometry`); `resolveBoard`, `shapeMap`, `isShaped` (`./shapes`); `flatDocument`, `worldParts`, `NAME_SEPARATOR` (`./tree`).
- Produces:
```ts
export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large';
export interface RefineRefusal { reason: RefusalReason; message: string }
export interface RefineMax { distinct: number; placed: number }
export function documentToDesign(doc: SloydDocument, max: RefineMax): { design: GeneratedDesign } | { refused: RefineRefusal }
export function carryGrain(design: GeneratedDesign, original: SloydDocument): GeneratedDesign
```

- [ ] **Step 1: Failing tests** `src/document/refineDesign.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { carryGrain, documentToDesign } from './refineDesign';
import { designToDocument } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { createDocument } from './document';
import { boardExtents } from './geometry';
import { flatDocument } from './tree';
import type { Cut, SloydDocument } from './types';

const MAX = { distinct: 60, placed: 240 };
const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number], role = ''): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });
const LEG: [number, number, number] = [1.75, 28, 1.75];
const TABLE: GeneratedDesign = {
  name: 'Table',
  parts: [part('Top', [0, 28, 0], [30, 1, 20]),
    part('Leg 1', [0, 0, 0], LEG, 'leg'), part('Leg 2', [28.25, 0, 0], LEG, 'leg'),
    part('Leg 3', [0, 0, 18.25], LEG, 'leg'), part('Leg 4', [28.25, 0, 18.25], LEG, 'leg')],
  assemblies: [{ name: 'Drawer', parts: [part('Front', [0, 0, 0], [10, 4, 0.75]), part('Side', [0, 0, 0.75], [0.75, 4, 10])],
    placements: [{ name: 'Left drawer', at: v(2, 20, 0) }, { name: 'Right drawer', at: v(16, 20, 0) }] }],
};
const table = () => designToDocument(TABLE).doc;
const CUT: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375, stopMin: 0, stopMax: 0 };
const refused = (doc: SloydDocument) => { const r = documentToDesign(doc, MAX); return 'refused' in r ? r.refused : null; };
const snapshot = (doc: SloydDocument) => flatDocument(doc).boards
  .map((b) => [b.name, b.material, b.position, boardExtents(b)] as const)
  .sort((a, b) => a[0].localeCompare(b[0]));

describe('documentToDesign', () => {
  it('round-trips: converting back (centre: false) reproduces every placed part exactly', () => {
    const doc = table();
    const r = documentToDesign(doc, MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    const back = designToDocument(r.design, { centre: false }).doc;
    expect(snapshot(back)).toEqual(snapshot(doc));
    expect(back.definitions).toHaveLength(1);
    expect(back.instances.map((i) => [i.name, i.position])).toEqual(doc.instances.map((i) => [i.name, i.position]));
  });

  it('gives each shape one linked-<k> role and other parts ""', () => {
    const r = documentToDesign(table(), MAX);
    if ('refused' in r) throw new Error('refused');
    expect(r.design.parts.map((p) => p.role)).toEqual(['', 'linked-1', 'linked-1', 'linked-1', 'linked-1']);
    expect(r.design.assemblies![0].parts.map((p) => p.role)).toEqual(['', '']);
  });

  it('names an assembly after its first placement', () => {
    const r = documentToDesign(table(), MAX);
    if ('refused' in r) throw new Error('refused');
    expect(r.design.assemblies![0].name).toBe('Left drawer');
    expect(r.design.assemblies![0].placements.map((p) => p.name)).toEqual(['Left drawer', 'Right drawer']);
  });

  it('refuses an empty design', () => {
    expect(refused(createDocument('E'))).toEqual({ reason: 'empty', message: 'There is nothing to refine yet.' });
  });

  it('refuses a design with a cut', () => {
    const doc = table();
    const withCut = { ...doc, boards: doc.boards.map((b, i) => (i === 0 ? { ...b, cuts: [CUT] } : b)) } as SloydDocument;
    expect(refused(withCut)).toEqual({ reason: 'cuts', message: 'Refine works on prototypes without joints. Refine first, then add joinery.' });
  });

  it('refuses a turned assembly', () => {
    const doc = table();
    const turned = { ...doc, instances: doc.instances.map((i, k) => (k === 0 ? { ...i, rotation: 90 as const } : i)) };
    expect(refused(turned)?.message).toBe('Refine cannot keep a turned assembly. Turn it back to 0°, or ungroup it.');
  });

  it('refuses a nested assembly', () => {
    const doc = table();
    const d0 = doc.definitions[0];
    const inner = { id: 'inner', name: 'Inner', definition: d0.id, position: [0, 0, 0] as [number, number, number], rotation: 0 as const };
    const nested = { ...doc, definitions: [{ ...d0, instances: [inner] }] };
    expect(refused(nested)?.reason).toBe('nested');
    expect(refused(nested)?.message).toBe('Refine cannot keep an assembly inside another assembly. Ungroup the inner one.');
  });

  it('refuses at 61 distinct parts and not at 60', () => {
    const many = (n: number) => designToDocument({ name: 'M', parts: Array.from({ length: n }, (_, i) => part(`P${i}`, [i * 2, 0, 0], [1, 1, 1])), assemblies: [] }).doc;
    expect(refused(many(60))).toBeNull();
    expect(refused(many(61))).toEqual({ reason: 'too-large', message: 'This design has 61 distinct parts; Refine handles up to 60.' });
  });

  it('refuses at 241 placed parts and not at 240', () => {
    const placed = (n: number) => designToDocument({ name: 'M', parts: [], assemblies: [{ name: 'A', parts: [part('X', [0, 0, 0], [1, 1, 1])],
      placements: Array.from({ length: n }, (_, i) => ({ name: `C${i}`, at: v(i * 2, 0, 0) })) }] }).doc;
    expect(refused(placed(240))).toBeNull();
    expect(refused(placed(241))).toEqual({ reason: 'too-large', message: '241 placed parts; Refine handles up to 240.' });
  });

  it('checks refusals in order: a cut AND a turn reports the cut', () => {
    const doc = table();
    const both = { ...doc, boards: doc.boards.map((b, i) => (i === 0 ? { ...b, cuts: [CUT] } : b)),
      instances: doc.instances.map((i) => ({ ...i, rotation: 90 as const })) } as SloydDocument;
    expect(refused(both)?.reason).toBe('cuts');
  });
});

describe('carryGrain', () => {
  const original = designToDocument({ name: 'G', parts: [{ ...part('Shelf', [0, 0, 0], [30, 0.75, 11]), grain: 'width' }],
    assemblies: [{ name: 'D', parts: [{ ...part('Front', [0, 0, 0], [10, 4, 0.75]), grain: 'width' }], placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }).doc;

  it('gives a part of the same flat name the original grain, and leaves others without one', () => {
    const out = carryGrain({ name: 'G', parts: [part('Shelf', [0, 0, 0], [30, 0.75, 11]), part('New', [0, 1, 0], [5, 1, 1])], assemblies: [] }, original);
    expect(out.parts.map((p) => p.grain)).toEqual(['width', undefined]);
    expect('grain' in out.parts[1]).toBe(false);
  });

  it('matches an assembly part through its placements', () => {
    const out = carryGrain({ name: 'G', parts: [], assemblies: [{ name: 'Whatever', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])],
      placements: [{ name: 'Top drawer', at: v(0, 5, 0) }] }] }, original);
    expect(out.assemblies![0].parts[0].grain).toBe('width');
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/document/refineDesign.test.ts`

- [ ] **Step 3: Implement** `src/document/refineDesign.ts`:

```ts
import type { Board, SloydDocument, StoredBoard } from './types';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { distinctParts } from './assemblyChecks';
import { boardExtents } from './geometry';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { NAME_SEPARATOR, flatDocument, worldParts } from './tree';

/**
 * Refine's input (refine spec §2): the open design in Generate's own format —
 * loose parts as world boxes, each definition as one assembly of local boxes
 * with one placement per instance. The inverse of designToDocument, for the
 * designs that format can express; everything else is REFUSED here, on the
 * document alone, before any model call.
 */
export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large';
export interface RefineRefusal { reason: RefusalReason; message: string }
export interface RefineMax { distinct: number; placed: number }

const refuse = (reason: RefusalReason, message: string) => ({ refused: { reason, message } });

const box = (b: Board, name: string, role: string): GeneratedPart => {
  const [x, y, z] = boardExtents(b);
  return { name, role, material: b.material, at: { x: b.position[0], y: b.position[1], z: b.position[2] }, size: { x, y, z } };
};

export function documentToDesign(doc: SloydDocument, max: RefineMax): { design: GeneratedDesign } | { refused: RefineRefusal } {
  const shapes = shapeMap(doc);
  const placed = worldParts(doc).length;
  if (placed === 0) return refuse('empty', 'There is nothing to refine yet.');
  const stored: StoredBoard[] = [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)];
  if (stored.some((b) => (resolveBoard(shapes, b)?.cuts.length ?? 0) > 0)) {
    return refuse('cuts', 'Refine works on prototypes without joints. Refine first, then add joinery.');
  }
  if (doc.instances.some((i) => i.rotation !== 0)) {
    return refuse('turned', 'Refine cannot keep a turned assembly. Turn it back to 0°, or ungroup it.');
  }
  if (doc.definitions.some((d) => d.instances.length > 0)) {
    return refuse('nested', 'Refine cannot keep an assembly inside another assembly. Ungroup the inner one.');
  }
  const distinct = distinctParts(doc);
  if (distinct > max.distinct) return refuse('too-large', `This design has ${distinct} distinct parts; Refine handles up to ${max.distinct}.`);
  if (placed > max.placed) return refuse('too-large', `${placed} placed parts; Refine handles up to ${max.placed}.`);

  // One role per shape, so the model sees which parts are the same part; it
  // returns roles and Sloyd re-links by role and exact equality (invariant 45).
  const roles = new Map<string, string>();
  const roleOf = (b: StoredBoard) => {
    if (!isShaped(b)) return '';
    let r = roles.get(b.shape);
    if (!r) { r = `linked-${roles.size + 1}`; roles.set(b.shape, r); }
    return r;
  };
  const boxes = (bs: StoredBoard[]) => bs.flatMap((b) => {
    const r = resolveBoard(shapes, b);
    return r ? [box(r, b.name, roleOf(b))] : [];
  });
  const parts = boxes(doc.boards);
  const assemblies: GeneratedAssembly[] = doc.definitions.flatMap((d) => {
    const placements = doc.instances.filter((i) => i.definition === d.id)
      .map((i) => ({ name: i.name, at: { x: i.position[0], y: i.position[1], z: i.position[2] } }));
    // A Definition has no name; matching never depends on this one (spec §4).
    return placements.length === 0 ? [] : [{ name: placements[0]!.name, parts: boxes(d.boards), placements }];
  });
  return { design: { name: doc.name, parts, assemblies } };
}

/**
 * The model never sees grain (refine spec §4): each returned part whose flat
 * display name matches an original part takes that part's grain; an assembly
 * part tries each of its placements in order. Every other part has none, so
 * the converter gives it 'length'. Runs BEFORE conversion, so role linking's
 * sameShared judges the real values.
 */
export function carryGrain(design: GeneratedDesign, original: SloydDocument): GeneratedDesign {
  const grain = new Map(flatDocument(original).boards.map((b) => [b.name, b.grain] as const));
  const set = (p: GeneratedPart, names: string[]): GeneratedPart => {
    const { grain: _old, ...rest } = p;
    const hit = names.map((n) => grain.get(n)).find((g) => g !== undefined);
    return hit ? { ...rest, grain: hit } : rest;
  };
  return {
    ...design,
    parts: design.parts.map((p) => set(p, [p.name])),
    assemblies: (design.assemblies ?? []).map((a) => ({
      ...a,
      parts: a.parts.map((p) => set(p, a.placements.map((pl) => `${pl.name}${NAME_SEPARATOR}${p.name}`))),
    })),
  };
}
```
If `_old` trips an unused-variable lint in `npm run build`, use `void _old;` or a destructure pattern the codebase already uses — check `tsconfig` `noUnusedLocals` and adapt.

- [ ] **Step 4: Run, expect PASS:** `npx vitest run src/document/refineDesign.test.ts && npm run build 2>&1 | tail -2`
- [ ] **Step 5: Mutate:** swap the cuts and turned checks → the order test goes red; `>` → `>=` on distinct → the 60 test goes red; drop the placement loop in `carryGrain` (use `[p.name]`) → the assembly test goes red. Restore.
- [ ] **Step 6: Commit** `feat(refine): documentToDesign with refusals, and grain carried by name` (+ trailer).

---

### Task 3: `diffDesigns`

**Files:** Create `src/document/designDiff.ts`, `src/document/designDiff.test.ts`.

**Interfaces — Produces:**
```ts
export type ChangeKind = 'added' | 'removed' | 'resized' | 'moved' | 'material' | 'linked' | 'unlinked';
export interface Change { kind: ChangeKind; subject: 'part' | 'placement'; name: string; copies: number; text: string }
export function diffDesigns(before: SloydDocument, after: SloydDocument): Change[]
```

- [ ] **Step 1: Failing tests** `src/document/designDiff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { diffDesigns } from './designDiff';
import { designToDocument } from './generated';
import type { GeneratedAssembly, GeneratedPart } from './generated';
import { formatLength } from '../units/length';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, at: [number, number, number], size: [number, number, number], material = 'oak', role = ''): GeneratedPart =>
  ({ name, role, material, at: v(...at), size: v(...size) });
const doc = (parts: GeneratedPart[], assemblies: GeneratedAssembly[] = []) =>
  designToDocument({ name: 'T', parts, assemblies }, { centre: false }).doc;
const f = (n: number) => formatLength(n, 16);
const drawer = (name: string, placements: [string, number][], front: [number, number, number] = [10, 4, 0.75]): GeneratedAssembly =>
  ({ name, parts: [part('Front', [0, 0, 0], front), part('Side', [0, 0, 0.75], [0.75, 4, 10])],
    placements: placements.map(([n, x]) => ({ name: n, at: v(x, 0, 0) })) });
const BASE = [part('Top', [0, 10, 0], [40, 1, 12]), part('Shelf', [0, 0, 0], [40, 1, 12])];

describe('diffDesigns', () => {
  it('reports nothing for identical designs', () => {
    expect(diffDesigns(doc(BASE), doc(BASE))).toEqual([]);
  });

  it('reports a resize with old and new sizes, longest first', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Shelf', [0, 0, 0], [40, 1, 14])]));
    expect(out).toEqual([{ kind: 'resized', subject: 'part', name: 'Shelf', copies: 1,
      text: `Shelf: ${f(40)} × ${f(12)} × ${f(1)} → ${f(40)} × ${f(14)} × ${f(1)}` }]);
  });

  it('reports a move by axis with signs', () => {
    const out = diffDesigns(doc(BASE), doc([part('Top', [2, 10, -0.5], [40, 1, 12]), BASE[1]]));
    expect(out.map((c) => c.text)).toEqual([`Top moved X +${f(2)}, Z ${f(-0.5)}`]);
  });

  it('reports added and removed parts; a rename is both', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Lower shelf', [0, 0, 0], [40, 1, 12])]));
    expect(out.map((c) => [c.kind, c.name])).toEqual([['added', 'Lower shelf'], ['removed', 'Shelf']]);
    expect(out[0].text).toBe(`Added Lower shelf (${f(40)} × ${f(12)} × ${f(1)})`);
    expect(out[1].text).toBe('Removed Shelf');
  });

  it('reports a material change by label', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Shelf', [0, 0, 0], [40, 1, 12], 'walnut')]));
    expect(out.map((c) => c.text)).toEqual(['Shelf: Oak → Walnut']);
  });

  it('reports linking gained and lost', () => {
    const legs = (role: string) => [part('Leg 1', [0, 0, 0], [2, 20, 2], 'oak', role), part('Leg 2', [10, 0, 0], [2, 20, 2], 'oak', role)];
    expect(diffDesigns(doc(legs('')), doc(legs('leg'))).map((c) => c.text)).toEqual(['Leg 1 is now linked', 'Leg 2 is now linked']);
    expect(diffDesigns(doc(legs('leg')), doc(legs(''))).map((c) => c.kind)).toEqual(['unlinked', 'unlinked']);
  });

  it('merges one assembly-part change across placements into one entry (×N)', () => {
    const before = doc(BASE, [drawer('Drawer', [['D1', 0], ['D2', 12], ['D3', 24]])]);
    const after = doc(BASE, [drawer('Drawer', [['D1', 0], ['D2', 12], ['D3', 24]], [10, 5, 0.75])]);
    const out = diffDesigns(before, after);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'resized', name: `D1 › Front`, copies: 3 });
    expect(out[0].text.endsWith(' (×3)')).toBe(true);
  });

  it('reports a moved placement once, not each of its parts', () => {
    const out = diffDesigns(doc(BASE, [drawer('Drawer', [['D1', 0]])]), doc(BASE, [drawer('Drawer', [['D1', 3]])]));
    expect(out.map((c) => [c.kind, c.subject, c.text])).toEqual([['moved', 'placement', `Placement D1 moved X +${f(3)}`]]);
  });

  it('reports a renamed placement as removed + added, without listing its parts (review focus 4)', () => {
    const out = diffDesigns(doc(BASE, [drawer('Drawer', [['D1', 0]])]), doc(BASE, [drawer('Drawer', [['Top drawer', 0]])]));
    expect(out.map((c) => [c.kind, c.subject, c.name])).toEqual([['added', 'placement', 'Top drawer'], ['removed', 'placement', 'D1']]);
  });

  it('ignores an assembly rename when placement and part names are kept (review focus 2)', () => {
    expect(diffDesigns(doc(BASE, [drawer('Drawer', [['D1', 0]])]), doc(BASE, [drawer('Box', [['D1', 0]])]))).toEqual([]);
  });

  it('orders placements before parts', () => {
    const out = diffDesigns(doc(BASE), doc([BASE[0], part('Shelf', [0, 0, 0], [40, 1, 14])], [drawer('Drawer', [['D1', 0]])]));
    expect(out.map((c) => c.subject)).toEqual(['placement', 'part']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/document/designDiff.test.ts`

- [ ] **Step 3: Implement** `src/document/designDiff.ts`:

```ts
import { formatLength } from '../units/length';
import { MATERIALS } from './types';
import type { Board, Instance, SloydDocument } from './types';
import { NAME_SEPARATOR, PATH_SEPARATOR, flatDocument } from './tree';

/**
 * What a refine changed (refine spec §4), by FLAT DISPLAY NAME. The display
 * text is assembled HERE with formatLength (the `→ units` edge; invariant 19's
 * rule that a string a person reads is built in one module).
 */
export type ChangeKind = 'added' | 'removed' | 'resized' | 'moved' | 'material' | 'linked' | 'unlinked';
export interface Change { kind: ChangeKind; subject: 'part' | 'placement'; name: string; copies: number; text: string }

interface Entry { b: Board; inst: Instance | null }
interface Side { parts: Map<string, Entry>; insts: Map<string, Instance> }

function sideOf(doc: SloydDocument): Side {
  const byId = new Map(doc.instances.map((i) => [i.id, i]));
  const parts = new Map<string, Entry>();
  for (const b of flatDocument(doc).boards) {
    const seg = b.id.split(PATH_SEPARATOR);
    parts.set(b.name, { b, inst: seg.length > 1 ? byId.get(seg[0]!) ?? null : null });
  }
  return { parts, insts: new Map(doc.instances.map((i) => [i.name, i])) };
}

const sizeOf = (b: Board) => [b.length, b.width, b.thickness].sort((x, y) => y - x);
/** A part inside a placement is compared relative to the placement's origin. */
const localOf = (e: Entry) => (e.inst ? e.b.position.map((v, k) => v - e.inst!.position[k]!) : [...e.b.position]);
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((v, k) => v === b[k]);
const label = (m: string) => MATERIALS[m]?.label ?? m;

export function diffDesigns(before: SloydDocument, after: SloydDocument): Change[] {
  const len = (n: number) => formatLength(n, after.units.precision);
  const dims = (b: Board) => sizeOf(b).map(len).join(' × ');
  const delta = (d: number[]) => d.flatMap((n, k) => (n === 0 ? [] : [`${'XYZ'[k]} ${n > 0 ? '+' : ''}${len(n)}`])).join(', ');
  const A = sideOf(before);
  const B = sideOf(after);
  const out: Change[] = [];
  const merged = new Map<string, Change>();
  const push = (kind: ChangeKind, subject: Change['subject'], name: string, text: string, key: string | null) => {
    const hit = key ? merged.get(key) : undefined;
    if (hit) { hit.copies += 1; return; }
    const c: Change = { kind, subject, name, copies: 1, text };
    out.push(c);
    if (key) merged.set(key, c);
  };

  for (const [n, i] of B.insts) {
    const old = A.insts.get(n);
    if (!old) push('added', 'placement', n, `Added placement ${n}`, null);
    else if (!same(old.position, i.position)) push('moved', 'placement', n, `Placement ${n} moved ${delta(i.position.map((p, k) => p - old.position[k]!))}`, null);
  }
  for (const n of A.insts.keys()) if (!B.insts.has(n)) push('removed', 'placement', n, `Removed placement ${n}`, null);

  // A part of a placement that exists on one side only is covered by that placement's line.
  const covered = (e: Entry) => e.inst !== null && !(A.insts.has(e.inst.name) && B.insts.has(e.inst.name));
  const keyOf = (n: string, e: Entry) => (kind: string, detail: string) =>
    e.inst ? `${kind}|${e.inst.definition}|${n.slice(e.inst.name.length + NAME_SEPARATOR.length)}|${detail}` : null;

  for (const [n, e] of B.parts) {
    if (covered(e)) continue;
    const key = keyOf(n, e);
    const o = A.parts.get(n);
    if (!o) { const d = ` (${dims(e.b)})`; push('added', 'part', n, `Added ${n}${d}`, key('added', d)); continue; }
    if (!same(sizeOf(o.b), sizeOf(e.b))) { const d = `: ${dims(o.b)} → ${dims(e.b)}`; push('resized', 'part', n, `${n}${d}`, key('resized', d)); }
    const moved = localOf(e).map((p, k) => p - localOf(o)[k]!);
    if (moved.some((m) => m !== 0)) { const d = ` moved ${delta(moved)}`; push('moved', 'part', n, `${n}${d}`, key('moved', d)); }
    if (o.b.material !== e.b.material) { const d = `: ${label(o.b.material)} → ${label(e.b.material)}`; push('material', 'part', n, `${n}${d}`, key('material', d)); }
    if (!o.b.shape !== !e.b.shape) {
      const kind = e.b.shape ? 'linked' : 'unlinked';
      push(kind, 'part', n, e.b.shape ? `${n} is now linked` : `${n} is no longer linked`, key(kind, ''));
    }
  }
  for (const [n, e] of A.parts) {
    if (covered(e) || B.parts.has(n)) continue;
    push('removed', 'part', n, `Removed ${n}`, keyOf(n, e)('removed', ''));
  }
  return out.map((c) => (c.copies > 1 ? { ...c, text: `${c.text} (×${c.copies})` } : c));
}
```

- [ ] **Step 4: Run, expect PASS:** `npx vitest run src/document/designDiff.test.ts && npm run build 2>&1 | tail -2`
- [ ] **Step 5: Mutate:** compare world instead of local positions for placement parts → the moved-placement test goes red; drop the `key` merge (pass `null`) → the ×3 test goes red; compare unsorted `[length, width, thickness]` — keep a note if nothing goes red and add a test where a part's encoding swaps width/thickness with the same extents (e.g. before `[10, 4, 0.75]` built flat vs after the same box) if needed. Restore.
- [ ] **Step 6: Commit** `feat(refine): diffDesigns lists what a refine changed` (+ trailer).

---

### Task 4: The run — shared evaluation, `runRefine`, the prompt, the estimate

**Files:**
- Modify `src/generate/prompt.ts`, `src/generate/run.ts`
- Create `src/generate/refine.ts`, `src/generate/refine.test.ts`
- Test `src/generate/run.test.ts` (add a `runRefine` describe), `src/generate/prompt.test.ts` (unchanged literal must stay green)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
```ts
// prompt.ts
export type LimitSettings = Pick<GenerateSettings, 'width' | 'depth' | 'height' | 'detail'>;
export function limitsOf(s: LimitSettings): DesignLimits;
export function limitLines(s: LimitSettings): string[];
// refine.ts
export interface RefineSettings { instruction: string; width: number | null; depth: number | null; height: number | null; detail: Detail }
export const REFINE_MAX: RefineMax;            // { distinct: DETAIL_CAPS.detailed, placed: placedCeiling('detailed') }
export const KEEP_LINE: string;
export function refineMessage(design: GeneratedDesign, s: RefineSettings): string;
export function detailFor(doc: SloydDocument): Detail;
export function refineRefusal(doc: SloydDocument): string | null;
// run.ts
export interface RefineOutcome { doc: SloydDocument; violations: Violation[]; present: Violation[]; changes: Change[]; usage: LlmUsage }
export function runRefine(client: LlmClient, doc: SloydDocument, settings: RefineSettings, signal: AbortSignal, onProgress: (p: RunProgress) => void): Promise<RefineOutcome | { refused: RefineRefusal }>;
export function refineEstimateUsd(client: LlmClient, doc: SloydDocument, settings: RefineSettings): number | null;
```

- [ ] **Step 1: Failing tests.**

`src/generate/refine.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { KEEP_LINE, REFINE_MAX, detailFor, refineMessage, refineRefusal } from './refine';
import type { RefineSettings } from './refine';
import { limitLines } from './prompt';
import { designToDocument } from '../document/generated';
import type { GeneratedDesign } from '../document/generated';
import { createDocument } from '../document/document';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const p = (name: string, i: number) => ({ name, role: '', material: 'pine', at: v(i * 2, 0, 0), size: v(1, 1, 1) });
const S: RefineSettings = { instruction: '  make it taller  ', width: 36, depth: null, height: null, detail: 'moderate' };
const D: GeneratedDesign = { name: 'T', parts: [p('A', 0)], assemblies: [] };

describe('refine', () => {
  it('builds the user turn: design JSON, instruction, keep line, limits', () => {
    expect(refineMessage(D, S)).toBe([
      'Here is the current design, in the same format you return:', JSON.stringify(D), '',
      'Change it as follows: make it taller', '', KEEP_LINE, '', 'Hard limits:', ...limitLines(S),
    ].join('\n'));
    expect(KEEP_LINE).toBe('Keep every part you are not asked to change exactly as it is: the same name, role, material, size and position. Keep assembly and placement names. Return the whole design.');
  });

  it('caps at Detailed', () => {
    expect(REFINE_MAX).toEqual({ distinct: 60, placed: 240 });
  });

  it('preselects the smallest detail the design fits, by distinct AND placed parts', () => {
    const loose = (n: number) => designToDocument({ name: 'T', parts: Array.from({ length: n }, (_, i) => p(`P${i}`, i)), assemblies: [] }).doc;
    expect(detailFor(loose(12))).toBe('simple');
    expect(detailFor(loose(13))).toBe('moderate');
    const stacked = designToDocument({ name: 'T', parts: [], assemblies: [{ name: 'A', parts: Array.from({ length: 12 }, (_, i) => p(`X${i}`, i)),
      placements: Array.from({ length: 5 }, (_, i) => ({ name: `C${i}`, at: v(0, i * 2, 0) })) }] }).doc;
    expect(detailFor(stacked)).toBe('moderate'); // 12 distinct fits Simple, 60 placed > 48 does not
  });

  it('says why a design is refused, or null', () => {
    expect(refineRefusal(createDocument('E'))).toBe('There is nothing to refine yet.');
    expect(refineRefusal(designToDocument(D).doc)).toBeNull();
  });
});
```

`src/generate/run.test.ts` — add (imports: `runRefine`, `refineEstimateUsd` from `./run`; `SYSTEM_PROMPT` from `./prompt`; `refineMessage`, `REFINE_MAX` from `./refine`; `documentToDesign` from `../document/refineDesign`; `flatDocument` from `../document/document`; `designToDocument` already imported):
```ts
describe('runRefine', () => {
  const RS = { instruction: 'make the top thicker', width: null, depth: null, height: null, detail: 'simple' as const };
  const v3 = (x: number, y: number, z: number) => ({ x, y, z });
  const bp = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', material: 'pine', at: v3(...at), size: v3(...size) });
  const orig = (parts: ReturnType<typeof bp>[]) => designToDocument({ name: 'Box', parts, assemblies: [] }).doc;
  const echo = (doc: Parameters<typeof documentToDesign>[0]) => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error('refused'); return r.design; };
  const go = (client: LlmClient, doc: Parameters<typeof runRefine>[1]) => runRefine(client, doc, RS, new AbortController().signal, () => {});

  it('refuses with no call', async () => {
    const { client } = fakeClient([GOOD]);
    const out = await go(client, createDocumentForTest());
    expect(out).toEqual({ refused: { reason: 'empty', message: 'There is nothing to refine yet.' } });
    expect(client.complete).not.toHaveBeenCalled();
  });

  it('sends the unchanged SYSTEM_PROMPT and the refine user turn', async () => {
    const doc = orig([bp('Base', [0, 0, 0], [10, 1, 10]), bp('Top', [0, 1, 0], [10, 1, 10])]);
    const { client, seen } = fakeClient([echo(doc)]);
    await go(client, doc);
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls[0][0].system).toBe(SYSTEM_PROMPT);
    expect(seen[0]).toEqual([client.userTurn(refineMessage(echo(doc), RS))]);
  });

  it('keeps untouched parts exactly where they were, and carries settings over', async () => {
    const base = orig([bp('Base', [0, 0, 0], [10, 1, 10]), bp('Top', [0, 1, 0], [10, 1, 10])]);
    const doc = { ...base, stock: { kerf: 0.1 }, guides: [{ id: 'g1', at: [1, 2, 3] as [number, number, number] }] };
    const d = echo(doc);
    const wider = { ...d, parts: [d.parts[0]!, { ...d.parts[1]!, size: { ...d.parts[1]!.size, x: 14 } }] };
    const { client } = fakeClient([wider]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    const pos = (x: typeof doc) => flatDocument(x).boards.map((b) => [b.name, b.position]);
    expect(pos(out.doc)).toEqual(pos(doc));          // Top grew to the right; nothing moved
    expect(out.doc.stock.kerf).toBe(0.1);
    expect(out.doc.guides).toEqual(doc.guides);
    expect(out.changes.map((c) => c.kind)).toEqual(['resized']);
  });

  it('carries grain over by name', async () => {
    const doc = designToDocument({ name: 'G', parts: [{ ...bp('Shelf', [0, 0, 0], [30, 0.75, 11]), grain: 'width' }], assemblies: [] }).doc;
    const { client } = fakeClient([echo(doc)]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(flatDocument(out.doc).boards[0].grain).toBe('width');
  });

  it('a problem the original had is already present, even when its numbers change (review focus 3)', async () => {
    // A and B overlap 0.5in in the original; the refine leaves them overlapping 0.25in.
    const doc = orig([bp('A', [0, 0, 0], [10, 1, 10]), bp('B', [9.5, 0, 0], [10, 1, 10])]);
    const d = echo(doc);
    const shifted = { ...d, parts: [d.parts[0]!, { ...d.parts[1]!, at: { ...d.parts[1]!.at, x: d.parts[1]!.at.x + 0.25 } }] };
    const { client } = fakeClient([shifted]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(out.violations).toEqual([]);
    expect(out.present.map((v) => v.kind)).toEqual(['overlap']);
    expect(client.complete).toHaveBeenCalledTimes(1);   // nothing new: no repair round
  });

  it('a new problem drives repair; "fewest" ignores already-present ones', async () => {
    const doc = orig([bp('A', [0, 0, 0], [10, 1, 10]), bp('B', [9.5, 0, 0], [10, 1, 10])]);   // one old overlap
    const d = echo(doc);
    const floating = { ...d, parts: [...d.parts, bp('C', [0, 5, 0], [10, 1, 10])] };          // + one new problem
    const { client } = fakeClient([floating, d]);
    const out = await go(client, doc);
    if ('refused' in out) throw new Error('refused');
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(out.violations).toEqual([]);                 // the second attempt has no NEW problem
  });

  it('estimates cost, or null when refused', () => {
    const estimate = vi.fn(() => 0.05);
    const c = { ...fakeClient([GOOD]).client, estimateCostUsd: estimate };
    expect(refineEstimateUsd(c, createDocumentForTest(), RS)).toBeNull();
    const doc = orig([bp('A', [0, 0, 0], [10, 1, 10])]);
    expect(refineEstimateUsd(c, doc, RS)).toBe(0.05);
    expect((estimate.mock.calls[0] as unknown[])[0]).toMatchObject({ cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});
```
Define `const createDocumentForTest = () => createDocument('Empty');` (import `createDocument` from `../document/document`).

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/generate`

- [ ] **Step 3: Implement.**

`src/generate/prompt.ts`:
```ts
export type LimitSettings = Pick<GenerateSettings, 'width' | 'depth' | 'height' | 'detail'>;

export function limitsOf(s: LimitSettings): DesignLimits {
  return { width: s.width, depth: s.depth, height: s.height, maxParts: placedCeiling(s.detail) };
}

/** The hard-limit lines Generate and Refine both send — one source. */
export function limitLines(s: LimitSettings): string[] {
  const lines: string[] = [];
  if (s.width !== null) lines.push(`- Overall width (X) at most ${s.width}in.`);
  if (s.depth !== null) lines.push(`- Overall depth (Z) at most ${s.depth}in.`);
  if (s.height !== null) lines.push(`- Overall height (Y) at most ${s.height}in.`);
  lines.push(`- At most ${DETAIL_CAPS[s.detail]} different parts (an assembly's parts count once) and ${placedCeiling(s.detail)} placed parts (${s.detail} detail).`);
  return lines;
}
```
and in `userMessage` replace the four limit `push` lines with: `const lines = [`Design this: ${s.description.trim()}`, '', 'Hard limits:', ...limitLines(s)];` (the pinned literal test must stay byte-identical).

`src/generate/refine.ts`:
```ts
import { distinctParts } from '../document/assemblyChecks';
import type { GeneratedDesign } from '../document/generated';
import { documentToDesign } from '../document/refineDesign';
import type { RefineMax } from '../document/refineDesign';
import { worldParts } from '../document/tree';
import type { SloydDocument } from '../document/types';
import { DETAIL_CAPS, limitLines, placedCeiling } from './prompt';
import type { Detail } from './prompt';

/** Refine by instruction (refine spec §3). The refine text rides in the USER turn; SYSTEM_PROMPT is Generate's, unchanged. */
export interface RefineSettings { instruction: string; width: number | null; depth: number | null; height: number | null; detail: Detail }

/** Refine handles what Detailed allows; beyond it the model would be forced to drop parts. */
export const REFINE_MAX: RefineMax = { distinct: DETAIL_CAPS.detailed, placed: placedCeiling('detailed') };

export const KEEP_LINE = 'Keep every part you are not asked to change exactly as it is: the same name, role, material, size and position. Keep assembly and placement names. Return the whole design.';

export function refineMessage(design: GeneratedDesign, s: RefineSettings): string {
  return [
    'Here is the current design, in the same format you return:', JSON.stringify(design), '',
    `Change it as follows: ${s.instruction.trim()}`, '', KEEP_LINE, '', 'Hard limits:', ...limitLines(s),
  ].join('\n');
}

/** The smallest detail level whose cap and ceiling the design already fits. */
export function detailFor(doc: SloydDocument): Detail {
  const distinct = distinctParts(doc);
  const placed = worldParts(doc).length;
  return (['simple', 'moderate', 'detailed'] as const).find((d) => DETAIL_CAPS[d] >= distinct && placedCeiling(d) >= placed) ?? 'detailed';
}

export function refineRefusal(doc: SloydDocument): string | null {
  const r = documentToDesign(doc, REFINE_MAX);
  return 'refused' in r ? r.refused.message : null;
}
```

`src/generate/run.ts`:
- Imports: add `carryGrain`, `documentToDesign` and type `RefineRefusal` from `../document/refineDesign`; `diffDesigns` and type `Change` from `../document/designDiff`; type `GeneratedDesign` from `../document/generated`; `REFINE_MAX`, `refineMessage` and type `RefineSettings` from `./refine`; type `LimitSettings` from `./prompt`.
- Add, above `runGeneration`:

```ts
/** What one usable attempt is worth: the tree kept, its NEW problems, and (Refine) the old ones. */
export interface DesignValue { doc: SloydDocument; violations: Violation[]; present: Violation[] }
interface EvaluateOpts {
  /** Refine's grain carry-over, applied to the parsed design before conversion. */
  prepare?: (d: GeneratedDesign) => GeneratedDesign;
  /** False keeps the model's X/Z (Refine); the floor rule holds either way. */
  centre?: boolean;
  /** problemKeys of the original's raw violations (Refine; invariant 41's rule). */
  preexisting?: ReadonlySet<string>;
}

/**
 * THE design evaluation, shared by Generate and Refine so they cannot drift
 * (refine spec §3.1): parse → tree → flatten → zero-board guard → distinct cap
 * → checkDesign → collapse. With `preexisting`, a raw violation whose
 * problemKey the original already had is set aside as `present` and neither
 * counts toward "fewest" nor goes back as feedback.
 */
function evaluateDesign(res: LlmResult, s: LimitSettings, opts: EvaluateOpts = {}): { value: DesignValue | null; feedback: string } {
  const parsed = res.json === null ? null : parseDesign(res.json);
  const design = parsed && (opts.prepare ? opts.prepare(parsed) : parsed);
  const converted = design && designToDocument(design, { centre: opts.centre ?? true });
  if (!converted) return { value: null, feedback: unusableMessage(res.unusable ?? 'unparseable') };
  // Checks read the placed world (generate-assemblies spec §5.1); the TREE is what is kept.
  const flat = flatDocument(converted.doc);
  // Every part rejected: unusable, and never a `best` — a zero-board
  // document is not a prototype.
  if (flat.boards.length === 0) return { value: null, feedback: repairMessage(rejectedViolations(converted.rejected)) };
  const distinct = distinctPartsViolation(converted.doc, DETAIL_CAPS[s.detail]);
  const raw = checkDesign(flat, limitsOf(s));
  const old = opts.preexisting;
  const fresh = old ? raw.filter((v) => !old.has(problemKey(v))) : raw;
  // Merged per authored part, so "fewest" is not biased by placement count (generate-assemblies spec §5.3).
  const violations = [
    ...rejectedViolations(converted.rejected),
    ...(distinct ? [distinct] : []),
    ...collapseViolations(fresh, converted.authored),
  ];
  const present = old ? collapseViolations(raw.filter((v) => old.has(problemKey(v))), converted.authored) : [];
  return { value: { doc: converted.doc, violations, present }, feedback: repairMessage(violations) };
}
```
- `runGeneration` becomes: `return runRepairLoop(client, { system: SYSTEM_PROMPT, schema: DESIGN_SCHEMA, first: userMessage(settings, concept), evaluate: (res) => evaluateDesign(res, settings) }, signal, onProgress);` (drop its local `limits`).
- Move `export const problemKey = …` ABOVE `evaluateDesign` (it is a `const`; keep it exported).
- Add after `runGeneration`:

```ts
export interface RefineOutcome { doc: SloydDocument; violations: Violation[]; present: Violation[]; changes: Change[]; usage: LlmUsage }

/**
 * Refine by instruction (refine spec §3): the open design in Generate's format
 * plus the instruction, through the shared loop and evaluation. Refusals are
 * decided before any call. Converted with centre: false so untouched parts keep
 * their coordinates; grain carried by name; only NEW problems drive repairs.
 */
export async function runRefine(
  client: LlmClient,
  doc: SloydDocument,
  settings: RefineSettings,
  signal: AbortSignal,
  onProgress: (p: RunProgress) => void,
): Promise<RefineOutcome | { refused: RefineRefusal }> {
  const from = documentToDesign(doc, REFINE_MAX);
  if ('refused' in from) return { refused: from.refused };
  const preexisting = new Set(checkDesign(flatDocument(doc), limitsOf(settings)).map(problemKey));
  const out = await runRepairLoop(client, {
    system: SYSTEM_PROMPT,
    schema: DESIGN_SCHEMA,
    first: refineMessage(from.design, settings),
    evaluate: (res) => evaluateDesign(res, settings, { prepare: (d) => carryGrain(d, doc), centre: false, preexisting }),
  }, signal, onProgress);
  // Document-level facts the model never sees travel with the result.
  const kept: SloydDocument = { ...out.doc, stock: doc.stock, units: doc.units, guides: doc.guides };
  return { doc: kept, violations: out.violations, present: out.present, changes: diffDesigns(doc, kept), usage: out.usage };
}

/** A rough before-you-run estimate: the prompt and design in, about the design's own size out. */
export function refineEstimateUsd(client: LlmClient, doc: SloydDocument, settings: RefineSettings): number | null {
  const from = documentToDesign(doc, REFINE_MAX);
  if ('refused' in from) return null;
  const input = SYSTEM_PROMPT.length + refineMessage(from.design, settings).length;
  const output = JSON.stringify(from.design).length * 1.25;
  return client.estimateCostUsd({ inputTokens: Math.ceil(input / 4), outputTokens: Math.ceil(output / 4), cacheReadTokens: 0, cacheWriteTokens: 0 });
}
```

- [ ] **Step 4: Run, expect PASS:** `npm test 2>&1 | grep -E "Tests |FAIL" ; npm run build 2>&1 | tail -2`. Generate's existing tests (run.test.ts, prompt.test.ts literal) must pass unmodified.
- [ ] **Step 5: Mutate:** key the preexisting filter on `v.message` → review-focus-3 goes red; pass `centre: true` in `runRefine` → "keeps untouched parts" goes red; drop `prepare` → the grain test goes red; drop the `preexisting` option → "new problem drives repair" and focus 3 go red. Restore.
- [ ] **Step 6: Commit** `feat(refine): runRefine through the shared evaluation, with the refine prompt and estimate` (+ trailer).

---

### Task 5: `useRefine`, `RefineDialog`, the toolbar button, App wiring

**Files:**
- Create `src/useRefine.ts`, `src/useRefine.test.tsx`, `src/panels/RefineDialog.tsx`, `src/panels/RefineDialog.test.tsx`
- Modify `src/panels/GenerateDialog.tsx` (export `parseLimit`), `src/panels/Toolbar.tsx`, `src/panels/Toolbar.test.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `runRefine`, `refineEstimateUsd`, `RefineOutcome`, `RunFailed` (`./generate/run`); `RefineSettings`, `detailFor`, `refineRefusal` (`./generate/refine`); `DETAIL_CAPS`, `Detail` (`./generate/prompt`).
- Produces:
```ts
// useRefine.ts
export type RefineStatus = 'designing' | 'repairing' | 'retrying' | 'ready' | 'failed' | 'cancelled';
export interface RefineRun { status: RefineStatus; round?: number; issues?: number; projectId?: string; projectName?: string; outcome?: RefineOutcome; error?: string; costUsd: number | null }
export function useRefine(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }): { run: RefineRun | null; live: boolean; start: (client: LlmClient, doc: SloydDocument, settings: RefineSettings) => void; cancel: () => void; reset: () => void }
// RefineDialog.tsx
export const CHANGES_SHOWN = 12;
export function RefineDialog(p: Props): JSX.Element
```

- [ ] **Step 1: Failing tests.**

`src/useRefine.test.tsx` (mirror `src/useJoinery.test.tsx`):
```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRefine } from './useRefine';
import { designToDocument } from './document/generated';
import { documentToDesign } from './document/refineDesign';
import { REFINE_MAX } from './generate/refine';
import { LlmError } from './llm/types';
import type { LlmClient, LlmResult } from './llm/types';
import { storage } from './storage/browser';

vi.mock('./storage/browser', () => ({ storage: { available: true, createProject: vi.fn() } }));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const doc = designToDocument({ name: 'Box', parts: [
  { name: 'Base', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 } },
], assemblies: [] }).doc;
const echo = (() => { const r = documentToDesign(doc, REFINE_MAX); if ('refused' in r) throw new Error('refused'); return r.design; })();
const S = { instruction: 'taller', width: null, depth: null, height: null, detail: 'simple' as const };
const client = (complete: LlmClient['complete']): LlmClient => ({ complete: vi.fn(complete), userTurn: (t) => t, estimateCostUsd: () => 0.02 });
const ok = async (): Promise<LlmResult> => ({ json: echo, assistantTurn: {}, usage });
const setup = () => {
  const onCreated = vi.fn();
  const onStorageVerdict = vi.fn();
  return { ...renderHook(() => useRefine({ onCreated, onStorageVerdict })), onCreated };
};
beforeEach(() => { createProject.mockReset().mockResolvedValue('p1'); });

describe('useRefine', () => {
  it('writes the refined design WITHOUT activating it, named "<name> — refined"', async () => {
    const { result, onCreated } = setup();
    act(() => result.current.start(client(ok), doc, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0][1]).toEqual({ activate: false });
    expect(createProject.mock.calls[0][0].name).toBe('Box — refined');
    expect(result.current.run).toMatchObject({ status: 'ready', projectId: 'p1', projectName: 'Box — refined' });
    expect(onCreated).toHaveBeenCalledWith('p1');
  });

  it('a refused design writes nothing and says why', async () => {
    const { result } = setup();
    const empty = { ...doc, boards: [] };
    act(() => result.current.start(client(ok), empty, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run).toMatchObject({ status: 'failed', error: 'There is nothing to refine yet.' });
  });

  it('a cancel landing after the model answered writes nothing', async () => {
    const { result } = setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    act(() => result.current.start(client(async () => { await gate; return { json: echo, assistantTurn: {}, usage }; }), doc, S));
    act(() => result.current.cancel());
    release();
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run?.status).toBe('cancelled');
  });

  it('a rejected key writes nothing and says why', async () => {
    const { result } = setup();
    act(() => result.current.start(client(async () => { throw new LlmError('auth', 'API key was rejected — check Settings.'); }), doc, S));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run).toMatchObject({ status: 'failed', error: 'API key was rejected — check Settings.' });
  });
});
```

`src/panels/RefineDialog.test.tsx`:
```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CHANGES_SHOWN, RefineDialog } from './RefineDialog';
import type { RefineRun } from '../useRefine';

const base = {
  hasKey: true, libraryAvailable: true, projectName: 'Box', refusal: null as string | null, initialDetail: 'moderate' as const,
  model: 'claude-opus-5-5', estimate: () => 0.05, run: null as RefineRun | null, live: false,
  onRun: vi.fn(), onCancel: vi.fn(), onOpenProject: vi.fn(), onOpenSettings: vi.fn(), onClose: vi.fn(),
};
const refineButton = () => screen.getByRole('button', { name: 'Refine' });

describe('RefineDialog', () => {
  it('shows a refusal and disables Refine', () => {
    render(<RefineDialog {...base} refusal="There is nothing to refine yet." />);
    expect(screen.getByRole('status').textContent).toBe('There is nothing to refine yet.');
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('disables Refine for a blank instruction or a bad limit (review focus 5)', () => {
    render(<RefineDialog {...base} />);
    expect(refineButton()).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: '   ' } });
    expect(refineButton()).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    expect(refineButton()).toHaveProperty('disabled', false);
    fireEvent.change(screen.getByLabelText('Max width'), { target: { value: 'wide' } });
    expect(refineButton()).toHaveProperty('disabled', true);
  });

  it('preselects the detail it is given and sends the settings', () => {
    const onRun = vi.fn();
    render(<RefineDialog {...base} onRun={onRun} />);
    expect((screen.getByLabelText('Detail') as HTMLSelectElement).value).toBe('moderate');
    fireEvent.change(screen.getByLabelText('Instruction'), { target: { value: 'taller' } });
    fireEvent.change(screen.getByLabelText('Max height'), { target: { value: '36' } });
    fireEvent.click(refineButton());
    expect(onRun).toHaveBeenCalledWith({ instruction: 'taller', width: null, depth: null, height: 36, detail: 'moderate' });
  });

  it('shows the result: counts, new issues, at most CHANGES_SHOWN changes and "and N more"', () => {
    const changes = Array.from({ length: CHANGES_SHOWN + 3 }, (_, i) => ({ kind: 'added' as const, subject: 'part' as const, name: `P${i}`, copies: 1, text: `Added P${i}` }));
    const run: RefineRun = { status: 'ready', projectId: 'p1', projectName: 'Box — refined', costUsd: 0.07, outcome: {
      doc: {} as never, usage: {} as never, changes,
      violations: [{ kind: 'hangs', message: 'Shelf is not held.', parts: ['Shelf'] }],
      present: [{ kind: 'overlap', message: 'A passes 0.5in into B along X.', parts: ['A', 'B'] }, { kind: 'tips', message: 't', parts: [] }],
    } };
    render(<RefineDialog {...base} run={run} />);
    expect(screen.getByText("Saved as 'Box — refined'")).toBeTruthy();
    expect(screen.getByText('1 new issue · 2 already present')).toBeTruthy();
    expect(screen.getByText('Shelf is not held.')).toBeTruthy();
    expect(screen.getAllByRole('listitem').filter((li) => li.textContent?.startsWith('Added P'))).toHaveLength(CHANGES_SHOWN);
    expect(screen.getByText('and 3 more')).toBeTruthy();
  });
});
```

`src/panels/Toolbar.test.tsx`: add `onOpenRefine={noop}` to the rendered props, and a test that clicking `Refine…` calls a spy (`onOpenRefine`), modelled on any existing button test in that file.

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/useRefine.test.tsx src/panels/RefineDialog.test.tsx src/panels/Toolbar.test.tsx`

- [ ] **Step 3: Implement.**

`src/panels/GenerateDialog.tsx`: change `function parseLimit` to `export function parseLimit`.

`src/useRefine.ts`:
```ts
import { useCallback, useRef, useState } from 'react';
import { RunFailed, runRefine } from './generate/run';
import type { RefineOutcome, RunProgress } from './generate/run';
import type { RefineSettings } from './generate/refine';
import type { SloydDocument } from './document/document';
import { LlmError } from './llm/types';
import type { LlmClient } from './llm/types';
import { storage } from './storage/browser';

export type RefineStatus = 'designing' | 'repairing' | 'retrying' | 'ready' | 'failed' | 'cancelled';
export interface RefineRun {
  status: RefineStatus; round?: number; issues?: number;
  projectId?: string; projectName?: string; outcome?: RefineOutcome;
  error?: string; costUsd: number | null;
}

const progressPatch = (p: RunProgress): Partial<RefineRun> =>
  p.phase === 'designing' ? { status: 'designing' }
    : p.phase === 'repairing' ? { status: 'repairing', round: p.round, issues: p.issues }
      : { status: 'retrying', round: p.round };

/**
 * One refine run, owned by App so closing the dialog does not cancel it.
 * NEVER ADOPTS (invariant 36): the result is written with
 * createProject(doc, { activate: false }) and nothing else. Open goes
 * through App's openProject.
 */
export function useRefine(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }) {
  const [run, setRun] = useState<RefineRun | null>(null);
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback((client: LlmClient, doc: SloydDocument, settings: RefineSettings) => {
    if (liveRef.current) return;
    const ctl = new AbortController();
    controller.current = ctl;
    liveRef.current = true;
    setLive(true);
    setRun({ status: 'designing', costUsd: null });
    void (async () => {
      try {
        const out = await runRefine(client, doc, settings, ctl.signal, (p) => setRun((r) => (r ? { ...r, ...progressPatch(p) } : r)));
        if ('refused' in out) { setRun({ status: 'failed', error: out.refused.message, costUsd: null }); return; }
        const costUsd = client.estimateCostUsd(out.usage);
        // A cancel that lands after the model answered still means "write nothing".
        if (ctl.signal.aborted) { setRun({ status: 'cancelled', costUsd }); return; }
        const name = `${doc.name} — refined`;
        const id = await storage.createProject({ ...out.doc, name }, { activate: false });
        optsRef.current.onStorageVerdict();
        if (!id) { setRun({ status: 'failed', error: 'Could not save the project — storage is unavailable.', costUsd }); return; }
        optsRef.current.onCreated(id);
        setRun({ status: 'ready', projectId: id, projectName: name, outcome: out, costUsd });
      } catch (e) {
        const costUsd = e instanceof RunFailed ? client.estimateCostUsd(e.usage) : null;
        if (e instanceof LlmError && e.kind === 'cancelled') setRun({ status: 'cancelled', costUsd });
        else setRun({ status: 'failed', error: e instanceof Error ? e.message : 'Unexpected error.', costUsd });
      } finally {
        liveRef.current = false;
        setLive(false);
      }
    })();
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => { if (!liveRef.current) setRun(null); }, []);
  return { run, live, start, cancel, reset };
}
```
Note: the fake client in the cancel test ignores the signal; the `ctl.signal.aborted` check after the answer is what makes it write nothing.

`src/panels/RefineDialog.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { DETAIL_CAPS } from '../generate/prompt';
import type { Detail } from '../generate/prompt';
import { MAX_REPAIRS } from '../generate/run';
import type { RefineSettings } from '../generate/refine';
import type { RefineRun } from '../useRefine';
import { parseLimit } from './GenerateDialog';

interface Props {
  hasKey: boolean; libraryAvailable: boolean; projectName: string;
  /** Why the open design cannot be refined, or null (decided before any call). */
  refusal: string | null;
  initialDetail: Detail; model: string | null;
  estimate: (s: RefineSettings) => number | null;
  run: RefineRun | null; live: boolean;
  onRun: (s: RefineSettings) => void; onCancel: () => void; onOpenProject: (id: string) => void;
  onOpenSettings: () => void; onClose: () => void;
}

export const CHANGES_SHOWN = 12;

function statusText(r: RefineRun): string {
  switch (r.status) {
    case 'designing': return 'Refining…';
    case 'repairing': return `Fixing ${r.issues} issue${r.issues === 1 ? '' : 's'} (round ${r.round}/${MAX_REPAIRS})…`;
    case 'retrying': return `Retrying (round ${r.round}/${MAX_REPAIRS})…`;
    case 'ready': return 'Done';
    case 'cancelled': return 'Cancelled';
    case 'failed': return `Failed: ${r.error}`;
  }
}

/** Refine's form and result. The run belongs to App (useRefine), so closing this does not cancel it. */
export function RefineDialog(p: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const [instruction, setInstruction] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [height, setHeight] = useState('');
  const [detail, setDetail] = useState<Detail>(p.initialDetail);
  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onClose]);

  const limits = { width: parseLimit(width), depth: parseLimit(depth), height: parseLimit(height) };
  const badLimit = Object.values(limits).some((v) => v === 'bad');
  const settings: RefineSettings | null = badLimit ? null : {
    instruction: instruction.trim(), width: limits.width as number | null, depth: limits.depth as number | null,
    height: limits.height as number | null, detail,
  };
  const canRun = p.refusal === null && settings !== null && settings.instruction !== '' && !p.live && p.libraryAvailable;
  const estimate = p.hasKey && settings ? p.estimate(settings) : null;
  const out = p.run?.status === 'ready' ? p.run.outcome : undefined;
  const field = (label: string, value: string, set: (v: string) => void) => (
    <div className="field generate-limit">
      <label htmlFor={`refine-${label}`}>{`Max ${label}`}</label>
      <input id={`refine-${label}`} className={`input${parseLimit(value) === 'bad' ? ' invalid' : ''}`}
        placeholder="no limit" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Refine">
      <div className="modal-sheet" ref={sheet} tabIndex={-1}>
        <h2>Refine</h2>
        <p>{`Describe a change to ${p.projectName}. The result is saved as a new project; this one is not changed.`}</p>
        {p.refusal !== null ? <p className="field-error" role="status">{p.refusal}</p> : (
          <>
            <div className="field">
              <label htmlFor="refine-instruction">Instruction</label>
              <textarea id="refine-instruction" className="input" rows={3} value={instruction}
                placeholder="Make the legs 2in longer and add a lower shelf" onChange={(e) => setInstruction(e.target.value)} />
            </div>
            <div className="generate-limits">
              {field('width', width, setWidth)}
              {field('depth', depth, setDepth)}
              {field('height', height, setHeight)}
            </div>
            {badLimit && <p className="field-error" role="status">A max size is not a length — try 36, 3', or 914mm.</p>}
            <div className="field">
              <label htmlFor="refine-detail">Detail</label>
              <select id="refine-detail" className="input" value={detail} onChange={(e) => setDetail(e.target.value as Detail)}>
                {(Object.keys(DETAIL_CAPS) as Detail[]).map((d) => (
                  <option key={d} value={d}>{`${d[0]!.toUpperCase()}${d.slice(1)} (up to ${DETAIL_CAPS[d]} different parts)`}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {!p.libraryAvailable && <p className="field-error" role="status">Refine is unavailable — storage is unavailable, so the result would have nowhere to go.</p>}
        {p.hasKey && p.refusal === null && (
          <p className="generate-plan">
            {p.model && <span>{`Model: ${p.model}`}</span>}
            {estimate !== null && <span className="generate-run-cost">{`≈ $${estimate.toFixed(2)}`}</span>}
          </p>
        )}

        {p.run && (
          <div className={`generate-run generate-run-${p.run.status}`}>
            <span className="generate-run-status">{statusText(p.run)}</span>
            {p.run.costUsd !== null && <span className="generate-run-cost">{`≈ $${p.run.costUsd.toFixed(2)}`}</span>}
          </div>
        )}
        {out && p.run && (
          <div className="joinery-result">
            <p>{`Saved as '${p.run.projectName}'`}</p>
            <p>{`${out.violations.length} new issue${out.violations.length === 1 ? '' : 's'} · ${out.present.length} already present`}</p>
            {out.violations.map((v, i) => <p key={`v${i}`} className="field-error">{v.message}</p>)}
            {out.changes.length === 0 ? <p>No changes.</p> : (
              <ul className="generate-runs">
                {out.changes.slice(0, CHANGES_SHOWN).map((c, i) => <li key={i}>{c.text}</li>)}
              </ul>
            )}
            {out.changes.length > CHANGES_SHOWN && <p>{`and ${out.changes.length - CHANGES_SHOWN} more`}</p>}
          </div>
        )}

        <div className="modal-actions">
          {p.live && <button onClick={p.onCancel}>Cancel</button>}
          <button onClick={p.onClose}>Close</button>
          {p.run?.status === 'ready' && p.run.projectId && (
            <button aria-label={`Open ${p.run.projectName}`} onClick={() => p.onOpenProject(p.run!.projectId!)}>Open</button>
          )}
          {p.hasKey
            ? <button className="btn-primary" disabled={!canRun} onClick={() => settings && p.onRun(settings)}>Refine</button>
            : <button className="btn-primary" onClick={p.onOpenSettings}>Set up your API key</button>}
        </div>
      </div>
    </div>
  );
}
```
Note the labels: the limit inputs' accessible names are `Max width` / `Max depth` / `Max height` (the tests use these).

`src/panels/Toolbar.tsx`: add `onOpenRefine: () => void;` to Props (with a one-line comment), destructure it, and render `<button onClick={onOpenRefine} title="Change the open prototype by instruction">Refine…</button>` immediately after the "Add joinery…" button.

`src/App.tsx`:
- Imports: `useRefine` from `./useRefine`; `RefineDialog` from `./panels/RefineDialog`; `refineEstimateUsd` from `./generate/run` (extend the existing import); `detailFor`, `refineRefusal` from `./generate/refine`.
- `dialog` state union gains `'refine'` (keep the comment; `modalOpen` already covers any non-null dialog).
- Next to `const joinery = useJoinery(…)`:
```ts
  // Refine likewise never adopts (invariant 36).
  const refine = useRefine({
    onCreated: (id) => setNewIds((s) => new Set(s).add(id)),
    onStorageVerdict: () => setAvailable(storage.available),
  });
  const refineInfo = useMemo(
    () => (dialog === 'refine' ? { refusal: refineRefusal(doc), detail: detailFor(doc) } : null),
    [dialog, doc],
  );
```
- Toolbar: `onOpenRefine={() => { opener.current = document.activeElement as HTMLElement | null; refine.reset(); setDialog('refine'); }}`.
- After the joinery dialog block:
```tsx
      {dialog === 'refine' && refineInfo && (
        <RefineDialog
          hasKey={llmSettings !== null}
          libraryAvailable={libraryAvailable}
          projectName={doc.name}
          refusal={refineInfo.refusal}
          initialDetail={refineInfo.detail}
          model={llmSettings?.model ?? null}
          estimate={(s) => (llmSettings ? refineEstimateUsd(new AnthropicClient(llmSettings.apiKey, llmSettings.model), doc, s) : null)}
          run={refine.run}
          live={refine.live}
          onRun={(s) => {
            if (!llmSettings) return;
            refine.start(new AnthropicClient(llmSettings.apiKey, llmSettings.model), useStore.getState().doc, s);
          }}
          onCancel={refine.cancel}
          // The ONE adopting path (invariant 36): the existing openProject.
          onOpenProject={(id) => { setDialog(null); void openProject(id); }}
          onOpenSettings={() => setDialog('settings')}
          onClose={() => setDialog(null)}
        />
      )}
```

- [ ] **Step 4: Run, expect PASS:** `npm test 2>&1 | grep -E "Tests |FAIL"; npm run build 2>&1 | tail -2`
- [ ] **Step 5: Mutate:** drop `{ activate: false }` → the hook's first test goes red; remove the `ctl.signal.aborted` check → the cancel test goes red; drop `settings.instruction !== ''` → review-focus-5 goes red. Restore.
- [ ] **Step 6: Commit** `feat(refine): the Refine dialog, its hook, and the toolbar button` (+ trailer).

---

### Task 6: Live check, docs, merge (controller; needs the user)

- [ ] **Step 1:** Full gate: `npm test` and `npm run build`; record the count.
- [ ] **Step 2: Live check** on the dev server (`npm run dev -- --port 5199 --strictPort`, Playwright MCP, the user watching). **Ask the user before each paid run.** Generate a small table (or ask which existing fresh prototype to use), then Refine it with "Make the legs 2in longer and add a lower shelf". Confirm by reading `localStorage`:
  - a new unopened project `<name> — refined`;
  - every part not mentioned is at exactly its original position;
  - the change list matches the stored difference;
  - links kept or broken as the sizes say;
  - a joined project (from Add joinery) is refused with the cuts message and no request is made (watch the network or the cost line).
  Record in `docs/browser-verification-refine.md`. Afterwards delete ONLY the projects the check created, through the app's project menu (the user's standing choice).
- [ ] **Step 3: Docs.** `docs/follow-ups.md`: close 179 (add a `**Status:** CLOSED 2026-10-09 by the refine round` line) and add new entries for anything left. `CLAUDE.md`: "Where things live" entries for `refineDesign.ts`, `designDiff.ts`, `generate/refine.ts`, `useRefine.ts`, `RefineDialog.tsx`; Commands test count; remove 179 from the Status line's open list. `docs/history.md`: the round entry. Status and the Rounds row wait for the deploy.
- [ ] **Step 4:** Commit docs; merge locally (`git checkout master && git merge --no-ff refine`), re-run tests and build on master, delete the branch.
- [ ] **Step 5:** Ask the user before deploying.
