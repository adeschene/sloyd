# Edge banding, chunk 1 (schema 19: data and the cut list) Implementation Plan

**Status (2026-10-20):** EXECUTED, merged to master as `b7f700b` (final review's fixes `9f36387`), DEPLOYED as `index-Df8FpxEW.js`
(schema 19). P1–P5 and the *Amended (implementation, chunk 1)* items approved by the user. Record: `docs/history.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A part's four broad-face sides can carry a named band type (iron-on tape by default, solid edging optionally);
the cut list prints CUT (core) sizes, band lines and solid edging strip rows, sheet nesting lays out cores, and Buying
counts strips with their species and prices tape by the foot.

**Architecture:**
- Stored: `doc.bandTypes` (per project, the built-in `band-iron-on` always present) and, per part and Shape, `bands`
  (side → band type id) and `cornerRule`. Shared in `LINK_FIELDS`, flag-flipped through mirrors like profiles.
- ONE pure module, `src/document/banding.ts`, computes every band number: the core size, solid strips, tape runs and
  band faults. The cut list, nesting, Buying, Properties and the Materials dialog read it; nothing else computes them.
- Bodies, drawings, the viewport, snap points and every geometry reader are UNTOUCHED (spec §7; chunk 2 paints).

**Tech Stack:** TypeScript, React, Zustand, Vitest. `npm test` (Vitest) does NOT typecheck; `npm run build`
(`tsc -b && vite build`) is the typecheck gate.

**Spec:** `docs/superpowers/specs/2026-10-19-sloyd-edge-banding-design.md` (approved by the user 2026-10-19). Chunk 1 only
(spec §8). Read §2–§6 and §10 before any task.

## Amended (planning)

Recorded here and copied into the spec's §2.2/§5.2 as *Amended (planning)* blocks in Task 10, for the user's review:

- **P1 — `cornerRule` is always present in memory and stored (`'long' | 'ends' | 'mitre'`, default `'long'`).** The spec
  stored only `'ends'`/`'mitre'` so that absent and `'long'` could never read as different. A required field reaches the
  same end more simply: `links.ts`' `_sharedPrimitives` tsc check (inv 45) rejects an optional shared field
  (`undefined` is not a string), and fu 231 warns against classifying optional shared fields. The loader still reads an
  absent or unknown value as `'long'`.
- **P2 — a solid band type's thickness must be > 0** (a zero-thickness strip is not a strip). Tape keeps `>= 0`.
- **P3 — a new band type's kind is chosen from `+ Add band type ▾` and is never a select**, even on an unsaved row (the
  spec allowed a select on an unsaved row; the menu choice is enough and removes a re-default path).
- **P4 — a solid band type's material is a built-in solid or a custom solid already in this project** (`doc.materials`);
  a custom material created in the same dialog Save is not offered until saved (one Save would otherwise have to order a
  material upsert before a band type that names it).
- **P5 — wording that differs from the spec's examples**, each for the user's review:
  - Buying's tape line uses Buying's own line style with its verb: `Iron-on veneer, 7/8" wide: buy 15′ · $4.50` (the
    spec: `…: 34′ — $10.20`). Metric: `Iron-on veneer, 7/8" (22 mm) wide: 2.2 m, buy 8′ · no price` (the spec:
    `10.4 m (35′) — $10.50`).
  - Strip rows are named per strip, `Shelf edging (width min side)`, and collapse by cut size as any row does (its names
    list the strips); the spec's `Shelf edging (width min, width max)` was one combined name.
  - The corner words (`long edges run through`, …) print only where two ADJACENT bands with thickness meet and one is
    solid — the rule that decides when the corner rule matters (§3.2). The spec's §4.1 example printed them for two
    OPPOSITE sides, where no corner exists; under this rule that example reads `Band: the width min side and the width max
    side — Maple edging 1/4"; finished 24" × 11-1/4"`.

## Global Constraints

- `CURRENT_VERSION` becomes **19**. A v18 build refuses a v19 document (the existing newer-version gate).
- **Byte for byte:** a document with no bands gives exactly today's cut list (rows, keys, dims, setup, numbers, nesting),
  Buying, drawings, meshes and diagrams. Every new branch is gated on a part having bands or the document having band
  types beyond the built-in.
- **One module:** `banding.ts` imports only `document` modules (`types`, `profilePath`, `holeText`'s `endWord`) — no
  `units` (inv 52's edge rule: it produces numbers; `cutlist.ts` and `purchase.ts` format). Its results are memoised per
  (part object, `bandTypes` array object) and deep-frozen; never mutate them.
- **Sides** are profiles' `ProfileSide` (`{ across: 'length' | 'width', from: 'min' | 'max' }`); canonical order
  width-min, width-max, length-min, length-max (`BAND_SIDES`). `across: 'width'` is a LONG edge; `across: 'length'` an END.
  Words: `edgeName({ dim: side.across, side: side.from })` → `the width min side`, `the length max end`.
- **Faults** (`bandFaults`): `needs-straight`, `no-side`, `too-thick`, `tape-narrow`; words `needs a straight edge`,
  `no such edge`, `leaves no core`, `narrower than the part` (one home: `bandFaultText`). A faulted band contributes
  no core reduction, no strip and no tape length. Authoring refuses an ADDED (side, kind) fault; a caused one is kept.
- **Refuse, do not drop:** an unknown band type `kind` STRING refuses the document:
  `This project has an edge band this version of Sloyd can't use (kind "<k>") — it was saved by a newer version of Sloyd.`
- **Ids:** band type ids per document (`takeId`, one `seen` set), the built-in's id fixed. Bands carry no id (keyed by side).
- Invariants touched: 33 (band type id scope), 40 (`BAND_FIELDS`), 44 (`mirrorBand`: a flag flip), 45 (`bands`,
  `cornerRule` shared), 46 (write-back lowering), 47 (every new store action refuses while exploded), 49 (amended:
  `pruneMaterials` keeps a material a band type uses), 52 (metric words in `cutlist.ts`/`purchase.ts` only).
- Commit after each task, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch
  `edge-banding-1` (create it in Task 1 Step 0). Merge locally with `--no-ff` at the end; no pull request.

## Review Focus

1. **A band on a mirrored copy of a Shape.** Editing a band through the mirrored occurrence must store the un-mirrored
   side (`width min` ↔ `width max` when width is the mirrored dimension), and an untouched band list must keep its stored
   array. Task 3 pins both.
2. **A band type edit after rows were built.** Changing *Maple edging*'s thickness must re-size every core and strip and
   regroup rows; a memo keyed on the part alone would serve stale numbers. Task 4 pins the memo key; Task 5 the regroup.
3. **A rounded corner between two taped sides.** The arc must be bought once (half to each side), on its TRUE arc length,
   not its chords. Task 4 pins it against `π·r/2`.
4. **A v19 file from a later build** (an unknown band kind) must refuse; a band naming a band type the file lacks must be
   dropped, never kept dangling. Task 2 pins both.
5. **Strip rows on the Plans sheet and in board layouts.** A strip row (no `boardIds`) must not be reported as a hidden
   balloon, and a by-the-piece board layout must label a strip with its row number. Task 5 pins the balloon skip and the
   `stripIds` label map; Task 6 the layout.

---

### Task 1: The stored model (`BandType`, `Band`) and its pure helpers

**Files:**
- Modify: `src/document/types.ts` (band types; `Board.bands`, `Board.cornerRule`; `SloydDocument.bandTypes`)
- Create: `src/document/bandModel.ts` (the model: constants, compare, copy, mirror, canonical order, `withBands`). It
  imports ONLY `ids`, `names` and `types`: `links.ts`, `shapes.ts`, `frames.ts`, `treeEdit.ts` and `document.ts` import it,
  and Task 4's `banding.ts` (which imports the outline code, `profilePath.ts` → `profiles.ts` → `sweep.ts` …) must never be
  reachable from them — a cycle there reads `BUILT_IN_BAND` as undefined at module load, not as a clean failure.
- Modify: `src/document/links.ts` (`LINK_FIELDS.bands`/`cornerRule: 'shared'`, `_sharedPrimitives`, `sharedOf`,
  `sharedPatch`, `sameShared`)
- Modify: `src/document/shapes.ts:35` (`resolveBoard` copies `bands`)
- Modify: `src/document/document.ts` (`createBoard` defaults `bands: []`, `cornerRule: 'long'`; `createDocument`
  `bandTypes: [BUILT_IN_BAND]`; re-export the banding model)
- Modify: `src/document/generated.ts:294,305,317` (board literals get `bands: [], cornerRule: 'long'`)
- Test: create `src/document/banding.test.ts`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type CornerRule = 'long' | 'ends' | 'mitre';
  interface BandTypeBase { id: string; name: string; thickness: number; lengthAllowance: number }
  export interface TapeBand extends BandTypeBase { kind: 'tape'; tapeWidth: number; pricePerFoot: number | null }
  export interface SolidBand extends BandTypeBase { kind: 'solid'; material: string; widthAllowance: number }
  export type BandType = TapeBand | SolidBand;
  export interface Band { side: ProfileSide; type: string }
  // Board gains: bands: Band[]; cornerRule: CornerRule;
  // SloydDocument gains: bandTypes: BandType[];
  ```
- Produces (bandModel.ts; `banding.ts` re-exports all of it from Task 4 on): `BUILT_IN_BAND_ID = 'band-iron-on'`, `BUILT_IN_BAND: TapeBand`, `BAND_KINDS`,
  `BAND_SIDES: readonly ProfileSide[]`, `CORNER_RULES: readonly CornerRule[]`, `BAND_FIELDS`, `sideIndex(s): number`,
  `sameSide(a, b): boolean`, `bandValues(b): string`, `sameBands(a, b): boolean`, `copyBand(b): Band`,
  `canonicalBands(bands): Band[]`, `mirrorBands(bands, d): Band[]`, `withBands(bands, sides, type): Band[]`,
  `bandOn(bands, side): Band | undefined`, `sameBandType(a, b): boolean`, `newBandType(kind, taken): BandType`.

- [ ] **Step 0: Branch.** `git checkout -b edge-banding-1`.

- [ ] **Step 1: Write the failing tests.** Create `src/document/banding.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  BAND_SIDES, BUILT_IN_BAND, BUILT_IN_BAND_ID, bandOn, canonicalBands, copyBand, mirrorBands, newBandType, sameBands,
  sameBandType, withBands,
} from './bandModel';
import { createBoard, createDocument } from './document';
import { sameShared } from './links';
import type { Band, ProfileSide } from './types';

const W0: ProfileSide = { across: 'width', from: 'min' };
const W1: ProfileSide = { across: 'width', from: 'max' };
const L0: ProfileSide = { across: 'length', from: 'min' };
const L1: ProfileSide = { across: 'length', from: 'max' };

describe('the band model (edge banding spec §2)', () => {
  it('a new document carries exactly the built-in band type; a new part has no bands and the default corner rule', () => {
    expect(createDocument('T').bandTypes).toEqual([BUILT_IN_BAND]);
    expect(BUILT_IN_BAND).toEqual({ id: BUILT_IN_BAND_ID, name: 'Iron-on veneer', kind: 'tape', thickness: 0,
      lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null });
    const b = createBoard({});
    expect(b.bands).toEqual([]);
    expect(b.cornerRule).toBe('long');
  });
  it('canonical order is width min, width max, length min, length max; one band per side, the first wins', () => {
    expect(BAND_SIDES).toEqual([W0, W1, L0, L1]);
    const out = canonicalBands([{ side: L1, type: 'a' }, { side: W0, type: 'b' }, { side: L1, type: 'c' }]);
    expect(out).toEqual([{ side: W0, type: 'b' }, { side: L1, type: 'a' }]);
  });
  it('withBands sets, replaces and clears sides, in canonical order', () => {
    const one = withBands([], [L1, W0], 'x');
    expect(one).toEqual([{ side: W0, type: 'x' }, { side: L1, type: 'x' }]);
    expect(withBands(one, [W0], 'y')).toEqual([{ side: W0, type: 'y' }, { side: L1, type: 'x' }]);
    expect(withBands(one, [L1], null)).toEqual([{ side: W0, type: 'x' }]);
    expect(bandOn(one, L1)).toEqual({ side: L1, type: 'x' });
    expect(bandOn(one, W1)).toBeUndefined();
  });
  it('a mirror flips from on the sides across the mirrored dimension only, and re-sorts', () => {
    const bands: Band[] = [{ side: W0, type: 'a' }, { side: L1, type: 'b' }];
    expect(mirrorBands(bands, 'width')).toEqual([{ side: W1, type: 'a' }, { side: L1, type: 'b' }]);
    expect(mirrorBands(bands, 'length')).toEqual([{ side: W0, type: 'a' }, { side: L0, type: 'b' }]);
    expect(mirrorBands(bands, 'thickness')).toEqual(bands);
    expect(mirrorBands(mirrorBands(bands, 'width'), 'width')).toEqual(bands);
  });
  it('copies share no side object', () => {
    const b: Band = { side: W0, type: 'a' };
    const c = copyBand(b);
    expect(c).toEqual(b);
    expect(c.side).not.toBe(b.side);
  });
  it('sameBands compares in order, every field exactly', () => {
    const a: Band[] = [{ side: W0, type: 'a' }];
    expect(sameBands(a, [{ side: { ...W0 }, type: 'a' }])).toBe(true);
    expect(sameBands(a, [{ side: W1, type: 'a' }])).toBe(false);
    expect(sameBands(a, [{ side: W0, type: 'b' }])).toBe(false);
    expect(sameBands(a, [])).toBe(false);
  });
  it('Link compares bands and the corner rule (both shared, inv 45)', () => {
    const a = { ...createBoard({ id: 'a' }), bands: [{ side: W0, type: 'x' }] };
    expect(sameShared(a, { ...a, bands: [{ side: { ...W0 }, type: 'x' }] })).toBe(true);
    expect(sameShared(a, { ...a, bands: [{ side: W1, type: 'x' }] })).toBe(false);
    expect(sameShared(a, { ...a, cornerRule: 'mitre' })).toBe(false);
  });
  it('newBandType: tape and solid defaults, a unique name', () => {
    const t = newBandType('tape', [BUILT_IN_BAND]);
    expect(t).toMatchObject({ kind: 'tape', name: 'Tape', thickness: 0, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null });
    const s = newBandType('solid', [BUILT_IN_BAND]);
    expect(s).toMatchObject({ kind: 'solid', name: 'Solid edging', thickness: 0.25, lengthAllowance: 0.5, widthAllowance: 0.0625, material: 'maple' });
    expect(newBandType('solid', [BUILT_IN_BAND, s]).name).toBe('Solid edging 2');
    expect(t.id).not.toBe(s.id);
    expect(sameBandType(s, { ...s })).toBe(true);
    expect(sameBandType(s, { ...s, thickness: 0.5 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run.** `npx vitest run src/document/banding.test.ts`. Expected: FAIL (module `./banding` not found).

- [ ] **Step 3: Implement.**
  - `types.ts`: add the types from **Interfaces** beside `ProfileSide` (after line 178). Add to `Board`, after `profiles`:

```ts
  /** Edge bands on the broad face's four sides (edge banding spec §2.2), canonical order, at most one per side. Empty for
   *  most parts. Numbers come only from `banding.ts`. */
  bands: Band[];
  /** Where two banded sides with thickness meet (spec §3.2; Amended (planning) P1: always present, default 'long'). */
  cornerRule: CornerRule;
```

    Add to `SloydDocument`, after `materials`:

```ts
  /** This project's band types (edge banding spec §2.1); the built-in `band-iron-on` always present, first. Kept when unused. */
  bandTypes: BandType[];
```

  - `bandModel.ts`:

```ts
import { nextId } from './ids';
import { uniqueName } from './names';
import type { Band, BandType, CornerRule, Dimension, ProfileSide, SolidBand, TapeBand } from './types';

/** The built-in band type (edge banding spec §2.1): always present, editable, never deleted. */
export const BUILT_IN_BAND_ID = 'band-iron-on';
export const BUILT_IN_BAND: TapeBand = Object.freeze({
  id: BUILT_IN_BAND_ID, name: 'Iron-on veneer', kind: 'tape', thickness: 0, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null,
}) as TapeBand;
export const BAND_KINDS = ['tape', 'solid'] as const;
export const CORNER_RULES: readonly CornerRule[] = ['long', 'ends', 'mitre'];

/** The four sides of the broad face in canonical order (spec §2.2): the long edges, then the ends. */
export const BAND_SIDES: readonly ProfileSide[] = Object.freeze([
  { across: 'width', from: 'min' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' }, { across: 'length', from: 'max' },
] as ProfileSide[]);

/** Invariant 40's table for bands: every field, exact. */
export const BAND_FIELDS = { side: true, type: true } as const satisfies Record<keyof Band, true>;

export const sideIndex = (s: ProfileSide) => (s.across === 'width' ? 0 : 2) + (s.from === 'min' ? 0 : 1);
export const sameSide = (a: ProfileSide, b: ProfileSide) => a.across === b.across && a.from === b.from;
export const bandValues = (b: Band) => `${b.side.across}:${b.side.from}:${b.type}`;
export const copyBand = (b: Band): Band => ({ side: { across: b.side.across, from: b.side.from }, type: b.type });
export const bandOn = (bands: readonly Band[], side: ProfileSide) => bands.find((b) => sameSide(b.side, side));

export function sameBands(a: readonly Band[], b: readonly Band[]): boolean {
  return a.length === b.length && a.every((x, i) => bandValues(x) === bandValues(b[i]!));
}

/** One band per side (the first wins), in canonical order. */
export function canonicalBands(bands: readonly Band[]): Band[] {
  const seen = new Set<number>();
  const kept = bands.filter((b) => { const i = sideIndex(b.side); if (seen.has(i)) return false; seen.add(i); return true; });
  return kept.sort((p, q) => sideIndex(p.side) - sideIndex(q.side));
}

/** A mirror along `d` (inv 44): a flag flip on every side across `d`, never arithmetic; re-sorted. Its own inverse. */
export function mirrorBands(bands: readonly Band[], d: Dimension): Band[] {
  return canonicalBands(bands.map((b) => (b.side.across === d
    ? { side: { across: b.side.across, from: b.side.from === 'min' ? 'max' : 'min' }, type: b.type } : copyBand(b))));
}

/** `sides` set to `type` (null clears them), the rest kept; canonical order. */
export function withBands(bands: readonly Band[], sides: readonly ProfileSide[], type: string | null): Band[] {
  const rest = bands.filter((b) => !sides.some((s) => sameSide(s, b.side))).map(copyBand);
  const added = type === null ? [] : sides.map((s) => ({ side: { across: s.across, from: s.from }, type }));
  return canonicalBands([...rest, ...added]);
}

export function sameBandType(a: BandType, b: BandType): boolean {
  if (a.id !== b.id || a.name !== b.name || a.kind !== b.kind || a.thickness !== b.thickness || a.lengthAllowance !== b.lengthAllowance) return false;
  return a.kind === 'tape'
    ? a.tapeWidth === (b as TapeBand).tapeWidth && a.pricePerFoot === (b as TapeBand).pricePerFoot
    : a.material === (b as SolidBand).material && a.widthAllowance === (b as SolidBand).widthAllowance;
}

/** A new band type with the spec §2.1 defaults and a name unique among `taken`. */
export function newBandType(kind: BandType['kind'], taken: readonly BandType[]): BandType {
  const names = taken.map((t) => ({ name: t.name }));
  if (kind === 'tape') {
    return { id: nextId(), name: uniqueName('Tape', names), kind, thickness: 0, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null };
  }
  return { id: nextId(), name: uniqueName('Solid edging', names), kind, thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
}
```

    Check `uniqueName`'s real signature in `names.ts` (it takes the sibling list); fix the CALL, never the expected
    `Solid edging 2`.
  - `links.ts`: add `bands: 'shared', cornerRule: 'shared'` to `LINK_FIELDS`; add `'bands'` to `_sharedPrimitives`'
    exclusion (and to its doc comment's list); `sharedOf` gains `bands: b.bands.map(copyBand), cornerRule: b.cornerRule`;
    `sharedPatch` gains `if (patch.bands) out.bands = patch.bands.map(copyBand);`; `sameShared` gains a `bands` branch:
    `} else if (k === 'bands') { if (!sameBands(a.bands, b.bands)) return false; }`.
  - `shapes.ts:35`: add `: k === 'bands' ? s.bands.map(copyBand)` before `: s[k]`.
  - `document.ts`: `createBoard` default `bands: [], cornerRule: 'long',` after `profiles: []`; `createDocument` adds
    `bandTypes: [BUILT_IN_BAND],`. Re-export from `./bandModel`: `BUILT_IN_BAND, BUILT_IN_BAND_ID, BAND_SIDES, withBands,
    bandOn, sameBands, copyBand, mirrorBands, canonicalBands, newBandType, sameBandType`; types `Band, BandType,
    TapeBand, SolidBand, CornerRule` from `./types`.
  - `generated.ts:294,305,317`: add `bands: [], cornerRule: 'long'` beside `profiles: []`. (Generate's DESIGN_SCHEMA is
    untouched: these are board literals only.)

- [ ] **Step 4: Run.** `npx vitest run src/document/banding.test.ts` → PASS.

- [ ] **Step 5: Typecheck.** `npm run build 2>&1 | grep -c "error TS"`. Every literal `Board`, `Shape` or `SloydDocument`
  in `src/` (tests and fixtures included) that tsc now rejects for missing `bands`/`cornerRule`/`bandTypes` gets
  `bands: [], cornerRule: 'long'` or `bandTypes: [BUILT_IN_BAND]` added — or, where the literal spreads a document or
  `createBoard`, nothing. Never cast the error away. Re-run until 0.

- [ ] **Step 6: Mutate.** Each must turn a test red; restore after each.
  1. `mirrorBands` flips every side regardless of `d`. The mirror test fails.
  2. `canonicalBands` keeps the LAST band on a repeated side. The canonical test fails.
  3. `sameShared` skips `bands`. The Link test fails.

- [ ] **Step 7: Full suite, commit.** `npm test 2>&1 | tail -4` (expect the existing count plus this file's 8, all green).

```bash
git add src && git commit -m "banding: the stored model — band types, bands, corner rule, shared and mirrored (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Loading schema 19 (band types, bands, the refusal, materials kept)

**Files:**
- Modify: `src/document/document.ts` (`CURRENT_VERSION`, the v19 note, `validateBandTypes`, `validateBands`, threading
  the band type ids through `validateSharedFields` / `validateBoard` / `validateShapes` / `validateDefinitions` /
  `migrateDocument`)
- Modify: `src/document/materials.ts:132` (`materialUses` also counts band types' materials)
- Test: create `src/document/bandingLoad.test.ts`

**Interfaces:**
- Consumes: `BUILT_IN_BAND`, `BAND_KINDS`, `canonicalBands`, `CORNER_RULES` (Task 1, from `./bandModel`).
- Produces: `CURRENT_VERSION = 19`; loaded documents carry validated `bandTypes` (the built-in first) and parts/shapes
  carry validated `bands` and `cornerRule`. `materialUses(doc)` includes every solid band type's material.

- [ ] **Step 1: Write the failing tests.** Create `src/document/bandingLoad.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, DocumentError, createBoard, createDocument, migrateDocument } from './document';
import { BUILT_IN_BAND } from './bandModel';
import type { Board } from './types';

const raw = (over: object) => JSON.parse(JSON.stringify({ ...createDocument('T'), version: 19, ...over }));
const part = (over: object = {}) => ({ ...createBoard({ id: 'b1', name: 'Shelf', length: 30, width: 11, thickness: 0.75, material: 'plywood' }), ...over });
const maple = { id: 'e1', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const board0 = (d: ReturnType<typeof migrateDocument>) => d.boards[0] as Board;
const W0 = { across: 'width', from: 'min' } as const;
const L1 = { across: 'length', from: 'max' } as const;

describe('loading schema 19 (edge banding spec §2.3)', () => {
  it('this build writes 19', () => expect(CURRENT_VERSION).toBe(19));
  it('a v18 file loads with the built-in band type and no bands', () => {
    const d = migrateDocument({ ...raw({ boards: [part()] }), version: 18, bandTypes: undefined });
    expect(d.bandTypes).toEqual([BUILT_IN_BAND]);
    expect(board0(d).bands).toEqual([]);
    expect(board0(d).cornerRule).toBe('long');
  });
  it('band types round-trip; the built-in is re-added FIRST when absent', () => {
    const d = migrateDocument(raw({ bandTypes: [maple], boards: [part()] }));
    expect(d.bandTypes).toEqual([BUILT_IN_BAND, maple]);
  });
  it('an edited built-in keeps its edits', () => {
    const edited = { ...BUILT_IN_BAND, pricePerFoot: 0.3, tapeWidth: 15 / 16 };
    expect(migrateDocument(raw({ bandTypes: [edited] })).bandTypes).toEqual([edited]);
  });
  it('malformed band types are dropped', () => {
    const bad = [
      { ...maple, id: 'a', thickness: -1 }, { ...maple, id: 'b', thickness: Number.NaN }, { ...maple, id: 'c', thickness: 0 },
      { ...maple, id: 'd', lengthAllowance: -0.1 }, { ...BUILT_IN_BAND, id: 'e', tapeWidth: 0 },
      { ...BUILT_IN_BAND, id: 'f', pricePerFoot: -2 }, { ...maple, id: 'g', name: '' }, { ...maple, id: 'h', widthAllowance: 'x' },
    ];
    expect(migrateDocument(raw({ bandTypes: [...bad, maple] })).bandTypes.map((t) => t.id)).toEqual(['band-iron-on', 'e1']);
  });
  it('an unknown kind string refuses the document', () => {
    const r = raw({ bandTypes: [{ ...maple, kind: 'pvc' }] });
    expect(() => migrateDocument(r)).toThrow(DocumentError);
    expect(() => migrateDocument(r)).toThrow('This project has an edge band this version of Sloyd can\'t use (kind "pvc") — it was saved by a newer version of Sloyd.');
  });
  it('a solid band type naming no solid material falls back to pine; a sheet material is not solid', () => {
    const d = migrateDocument(raw({ bandTypes: [{ ...maple, id: 'x', material: 'unobtainium' }, { ...maple, id: 'y', material: 'plywood' }] }));
    expect(d.bandTypes.map((t) => (t.kind === 'solid' ? t.material : null))).toEqual([null, 'pine', 'pine']);
  });
  it('duplicate ids: the first keeps its id, the later is re-minted; duplicate names are deduped', () => {
    const d = migrateDocument(raw({ bandTypes: [maple, { ...maple }] }));
    expect(d.bandTypes[1]!.id).toBe('e1');
    expect(d.bandTypes[2]!.id).not.toBe('e1');
    expect(d.bandTypes[2]!.name).not.toBe('Maple edging');
  });
  it('bands load in canonical order; malformed, dangling and repeated-side bands are dropped', () => {
    const bands = [
      { side: L1, type: 'e1' }, { side: W0, type: 'band-iron-on' },
      { side: { across: 'thickness', from: 'min' }, type: 'e1' }, { side: W0, type: 'e1' },
      { side: { across: 'width', from: 'max' }, type: 'missing' }, { side: L1 }, 'junk',
    ];
    const d = migrateDocument(raw({ bandTypes: [maple], boards: [part({ bands, cornerRule: 'mitre' })] }));
    expect(board0(d).bands).toEqual([{ side: W0, type: 'band-iron-on' }, { side: L1, type: 'e1' }]);
    expect(board0(d).cornerRule).toBe('mitre');
  });
  it('an unknown corner rule reads as long', () => {
    expect(board0(migrateDocument(raw({ boards: [part({ cornerRule: 'sideways' })] }))).cornerRule).toBe('long');
  });
  it('a shape carries bands too', () => {
    const shape = { id: 's1', length: 30, width: 11, thickness: 0.75, material: 'plywood', grain: 'length', posture: 'flat', cuts: [], angleCuts: [],
      holes: [], curves: [], profiles: [], bands: [{ side: W0, type: 'band-iron-on' }], cornerRule: 'long' };
    const d = migrateDocument(raw({ shapes: [shape], boards: [
      { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b', name: 'B', position: [0, 0, 20], rotation: 0, shape: 's1' }] }));
    expect(d.shapes[0]!.bands).toEqual([{ side: W0, type: 'band-iron-on' }]);
  });
  it('a custom material used only by a band type is kept (inv 49, amended)', () => {
    const wenge = { id: 'm-s-wenge', kind: 'solid', label: 'Wenge', color: '#3a2a20' };
    const d = migrateDocument(raw({ materials: [wenge], bandTypes: [{ ...maple, material: 'm-s-wenge' }], boards: [part()] }));
    expect(d.materials.map((m) => m.id)).toEqual(['m-s-wenge']);
    expect(d.bandTypes[1]).toMatchObject({ material: 'm-s-wenge' });
  });
  it('a v20 file is refused by the version gate', () => {
    expect(() => migrateDocument({ ...raw({}), version: 20 })).toThrow(/newer version/);
  });
});
```

  Check `validateCustomMaterial`'s required fields for `wenge` in `materials.ts` (e.g. a `sheet` absent for a solid); fix the
  FIXTURE to be a valid custom solid, never the expectation.

- [ ] **Step 2: Run.** `npx vitest run src/document/bandingLoad.test.ts`. Expected: FAIL (version 18; no `bandTypes`).

- [ ] **Step 3: Implement** in `src/document/document.ts`.
  - `CURRENT_VERSION = 19`; below the v18 note add:

```ts
 * v19 (edge banding spec §2.3): `bandTypes` (document) and `Board.bands`/`cornerRule` (and the Shape's), document-level, no
 * step — absent fields default ([BUILT_IN_BAND], [], 'long'). Harm a v18 build would do: silent loss — it drops every band
 * and band type and autosaves, and a banded panel's cut list prints its FINISHED size as the cut size. From v19 on, a band
 * type `kind` this build does not know refuses the document, so a later kind needs no bump.
```

  - After the profiles validators add (import `BUILT_IN_BAND, BUILT_IN_BAND_ID, BAND_KINDS, CORNER_RULES, canonicalBands`
    from `./bandModel`; `isSheetGood` is already imported from `./types`):

```ts
/** A band type this build cannot use (spec §2.3): the whole document is refused, as a newer version is. */
function refuseBand(why: string): never {
  throw new DocumentError(`This project has an edge band this version of Sloyd can't use (${why}) — it was saved by a newer version of Sloyd.`);
}

/**
 * Band types (edge banding spec §2.1, §2.3), validated after materials (`known`) and before parts. Dropped, never clamped: a
 * non-string or empty name; a non-finite or negative thickness or allowance; a solid thickness of 0 (Amended (planning)
 * P2); a tape width <= 0; a price that is neither null nor a finite number >= 0. A solid type whose material is not a
 * known SOLID material reads pine (inv 49's fallback). REFUSED (the document): an unknown kind string. Ids per document
 * (inv 33, first wins); names deduped (`uniqueName`). The built-in is re-added FIRST when absent.
 */
function validateBandTypes(raw: unknown, known: ReadonlySet<string>): BandType[] {
  const out: BandType[] = [];
  const seen = new Set<string>();
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const nonNeg = (v: unknown): v is number => finite(v) && v >= 0;
  for (const item of Array.isArray(raw) ? raw : []) {
    if (typeof item !== 'object' || item === null) continue;
    const t = item as Record<string, unknown>;
    if (typeof t.kind === 'string' && !(BAND_KINDS as readonly string[]).includes(t.kind)) refuseBand(`kind "${t.kind}"`);
    if (typeof t.name !== 'string' || t.name.trim() === '' || !nonNeg(t.thickness) || !nonNeg(t.lengthAllowance)) continue;
    const base = { id: '', name: cleanName(t.name), thickness: t.thickness, lengthAllowance: t.lengthAllowance };
    if (t.kind === 'tape') {
      if (!finite(t.tapeWidth) || t.tapeWidth <= 0) continue;
      if (t.pricePerFoot !== null && !nonNeg(t.pricePerFoot)) continue;
      out.push({ ...base, id: takeId(t.id, seen), kind: 'tape', tapeWidth: t.tapeWidth, pricePerFoot: t.pricePerFoot as number | null });
    } else if (t.kind === 'solid') {
      if (t.thickness === 0 || !nonNeg(t.widthAllowance)) continue;
      const material = typeof t.material === 'string' && known.has(t.material) && !isSheetGood(t.material) ? t.material : DEFAULT_MATERIAL;
      out.push({ ...base, id: takeId(t.id, seen), kind: 'solid', material, widthAllowance: t.widthAllowance });
    }
  }
  const named = dedupeNames(out);
  return named.some((t) => t.id === BUILT_IN_BAND_ID) ? named : [{ ...BUILT_IN_BAND }, ...named];
}

/** A part's bands (spec §2.2): a band whose side is not one of the four, or whose type names no band type, is dropped;
 *  one per side (the first wins), canonical order. */
function validateBands(raw: unknown, typeIds: ReadonlySet<string>): Band[] {
  if (!Array.isArray(raw)) return [];
  const out: Band[] = [];
  for (const item of raw) {
    const b = item as Record<string, unknown> | null;
    const s = b?.side as Record<string, unknown> | undefined;
    if (!b || !s || (s.across !== 'length' && s.across !== 'width') || !VALID_FROMS.includes(s.from as CutFrom)) continue;
    if (typeof b.type !== 'string' || !typeIds.has(b.type)) continue;
    out.push({ side: { across: s.across, from: s.from as CutFrom }, type: b.type });
  }
  return canonicalBands(out);
}
```

    `cleanName` and `dedupeNames` are the existing name helpers (`names.ts`; inv 8 — `cleanName` turns `›` into `>` where
    a name is written; check whether the load path may call it: inv 8 PROHIBITS `›`-cleaning ON LOAD for PART names, which
    band type names are not — if the existing helpers' contracts say otherwise, use a band-type-local trim and dedupe and
    note it in the report). `dedupeNames`' real signature takes `{ name }` objects; adapt the call.
  - Thread a `bandIds: ReadonlySet<string>` parameter after `known` through `validateSharedFields`, `validateBoard`,
    `validateShapes` (default `new Set([BUILT_IN_BAND_ID])`, so existing direct callers keep working) and
    `validateDefinitions`. In `validateSharedFields`' return add
    `bands: validateBands(b.bands, bandIds), cornerRule: CORNER_RULES.includes(b.cornerRule as CornerRule) ? (b.cornerRule as CornerRule) : 'long'`.
  - In `migrateDocument`, after `const known = …`:
    `const bandTypes = validateBandTypes(d.bandTypes, known); const bandIds = new Set(bandTypes.map((t) => t.id));`
    pass `bandIds` to every validator call, and add `bandTypes` to the `doc` literal after `materials`.
  - `materials.ts` `materialUses`: widen the parameter to
    `Pick<SloydDocument, 'boards' | 'definitions' | 'shapes'> & { bandTypes?: readonly BandType[] }` and add
    `for (const t of doc.bandTypes ?? []) if (t.kind === 'solid') out.add(t.material);`. Update its doc comment and
    `pruneMaterials`' (`… parts, shapes and band types use`).

- [ ] **Step 4: Run.** `npx vitest run src/document/bandingLoad.test.ts src/document/document.test.ts src/document/materials.test.ts`
  → PASS. Fix any existing assertion that pinned `CURRENT_VERSION` 18, a loaded document's keys or a new document's shape,
  so it pins 19 and the new fields. Never weaken one; name each in the report.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. Drop the `refuseBand` line. The unknown-kind test fails.
  2. Accept a band whose type is not in `bandIds`. The dangling test fails.
  3. Add the built-in LAST. The re-added test fails.
  4. Drop the band-type branch from `materialUses`. The wenge test fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "document: schema 19 — band types and bands loaded, unknown kinds refused, band materials kept (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Write-back, copies, mirroring and the store actions

**Files:**
- Modify: `src/document/frames.ts:79` (`mirrorPart`: `bands: mirrorBands(b.bands, d)`)
- Modify: `src/document/treeEdit.ts`: `lowerBands` beside `lowerProfiles` (`:121`), used in `lower` (`:173`); the
  `changedKeys` branch and `valueOf` (`:335-341`); `groupSignature` (`:494`): `k === 'bands' ? b.bands.map(bandValues).join(';')`;
  `copyDefinition` (`:535`): `bands: b.bands.map(copyBand)`
- Modify: `src/document/treeOps.ts:205,331` (`bands: placed.bands.map(copyBand)` / `b.bands.map(copyBand)`)
- Modify: `src/store/store.ts`: `copyBoard` (`:848`) copies `bands`; new `setBands`; `updateBoards`' optional 4th
  parameter and `applyMaterials`' 3rd (`bandTypes`)
- Test: append to `src/document/treeEdit.mirror.test.ts` and `src/store/store.test.ts`

**Interfaces:**
- Consumes: `mirrorBands`, `copyBand`, `sameBands`, `bandValues`, `withBands`, `sameBandType` (Task 1).
- Produces (store):
  ```ts
  /** Sets `sides` to band type `type` (null clears) on every named part, one edit, one undo entry; refused while exploded. */
  setBands: (ids: string[], sides: readonly ProfileSide[], type: string | null) => void;
  updateBoards: (ids: string[], patch: Partial<Board>, adopt?: CustomMaterial[], bandTypes?: BandType[]) => void;
  applyMaterials: (upserts: CustomMaterial[], assign?: { ids: string[]; material: string }, bandTypes?: BandType[]) => void;
  ```
  `cornerRule` is written through `updateBoards(ids, { cornerRule })` (a shared primitive; no new action).
- Produces (document, exported from `bandModel.ts`): `withBandTypes<T extends { bandTypes: BandType[] }>(doc: T, next: readonly BandType[] | undefined): T`
  — the SAME object when `next` is undefined or equal type by type (`sameBandType`), else `{ ...doc, bandTypes: [...next] }`.

- [ ] **Step 1: Write the failing tests.**
  - Append to `src/document/treeEdit.mirror.test.ts` (reuse its `doc`, `occ`, `stored` helpers and `chiralPart`; import
    `sameShared` from `./links` if not already):

```ts
describe('bands through a mirror (edge banding 1, Review Focus 1)', () => {
  const W0 = { across: 'width', from: 'min' } as const;
  const L1 = { across: 'length', from: 'max' } as const;
  const banded = (b: Board): Board => ({ ...b, bands: [{ side: W0, type: 'band-iron-on' }, { side: L1, type: 'band-iron-on' }] });
  it('the world bands are the stored ones flipped across the mirrored dimension', () => {
    const d0 = doc(banded(chiralPart('flat')), { mirrored: true });
    const world = occ(d0);
    const dMirror = mirrorDim(stored(d0) as Board);   // the dimension the frame reflects; import mirrorDim from ./frames
    expect(world.bands).toEqual(mirrorBands(stored(d0).bands, dMirror));
  });
  it('an edit elsewhere and a resize keep the stored bands (the same array)', () => {
    const d0 = doc(banded(chiralPart('flat')), { mirrored: true });
    const before = occ(d0);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, name: 'Renamed' } }])).bands).toBe(stored(d0).bands);
    expect(stored(applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }])).bands).toBe(stored(d0).bands);
  });
  it('a band set on the mirrored occurrence is stored un-mirrored; placing again shows the edit', () => {
    const d0 = doc(banded(chiralPart('upright')), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const want = withBands(before.bands, [{ across: 'width', from: 'max' }], 'band-iron-on');
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, bands: want } }]);
    expect(occ(d1).bands).toEqual(want);
    expect(stored(d1).bands).toEqual(mirrorBands(want, mirrorDim(stored(d0) as Board)));
  });
});
```

    Check `mirrorDim`'s home and export (`frames.ts`); if it is not exported, export it (it is a pure helper) rather than
    re-deriving the dimension in the test. Import `mirrorBands, withBands` from `./bandModel`.
  - Append to `src/store/store.test.ts` (after the profile actions block; import `BUILT_IN_BAND`, `newBandType` from
    `../document/bandModel`; `ProfileSide`, `Shape` as types):

```ts
describe('band actions (edge banding 1)', () => {
  const W0: ProfileSide = { across: 'width', from: 'min' };
  const L1: ProfileSide = { across: 'length', from: 'max' };
  const shelf = (id: string, z = 0) => createBoard({ id, name: id, length: 30, width: 11, thickness: 0.75, material: 'plywood', position: [0, 0, z] });
  const setup = (doc = { ...createDocument('T'), boards: [shelf('a'), shelf('b', 20)] }) => {
    useStore.setState({ doc, selectedIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, explode: 0 });
  };
  const s = () => useStore.getState();
  const bands = (i: number) => (s().doc.boards[i] as Board).bands;
  it('sets sides on every named part in one undo entry, keeping each part\'s other bands', () => {
    setup();
    s().setBands(['a'], [L1], 'band-iron-on');
    s().setBands(['a', 'b'], [W0], 'band-iron-on');
    expect(bands(0)).toEqual([{ side: W0, type: 'band-iron-on' }, { side: L1, type: 'band-iron-on' }]);
    expect(bands(1)).toEqual([{ side: W0, type: 'band-iron-on' }]);
    expect(s().past.length).toBe(2);
    s().setBands(['a', 'b'], [W0, L1], null);
    expect(bands(0)).toEqual([]);
    expect(bands(1)).toEqual([]);
  });
  it('a no-op pushes no undo entry (inv 4); refused while exploded (inv 47)', () => {
    setup();
    s().setBands(['a'], [W0], null);
    expect(s().past.length).toBe(0);
    s().setExplode(0.5);
    s().setBands(['a'], [W0], 'band-iron-on');
    expect(bands(0)).toEqual([]);
  });
  it('the corner rule goes through updateBoards', () => {
    setup();
    s().updateBoards(['a', 'b'], { cornerRule: 'mitre' });
    expect((s().doc.boards[1] as Board).cornerRule).toBe('mitre');
  });
  it('an edit through one user of a shape reaches every user (shared, inv 45)', () => {
    const shape: Shape = { id: 's1', length: 30, width: 11, thickness: 0.75, material: 'plywood', grain: 'length', posture: 'flat', cuts: [], angleCuts: [],
      holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' };
    setup({ ...createDocument('T'), shapes: [shape], boards: [
      { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b', name: 'B', position: [0, 0, 30], rotation: 0, shape: 's1' }] });
    s().setBands(['a'], [W0], 'band-iron-on');
    expect(s().doc.shapes[0]!.bands).toEqual([{ side: W0, type: 'band-iron-on' }]);
    expect(worldParts(s().doc).find((p) => p.id === 'b')!.bands).toEqual([{ side: W0, type: 'band-iron-on' }]);
  });
  it('a duplicate copies bands and shares no side object', () => {
    setup();
    s().setBands(['a'], [W0], 'band-iron-on');
    s().duplicateBoards(['a']);
    const copy = s().doc.boards[2] as Board;
    expect(copy.bands).toEqual(bands(0));
    expect(copy.bands[0]!.side).not.toBe(bands(0)[0]!.side);
  });
  it('applyMaterials writes band types in the same single edit; unchanged band types push nothing', () => {
    setup();
    const maple = newBandType('solid', [BUILT_IN_BAND]);
    s().applyMaterials([], undefined, [BUILT_IN_BAND, maple]);
    expect(s().doc.bandTypes).toEqual([BUILT_IN_BAND, maple]);
    expect(s().past.length).toBe(1);
    s().applyMaterials([], undefined, [BUILT_IN_BAND, { ...maple }]);
    expect(s().past.length).toBe(1);
  });
});
```

    Check `duplicateBoards`' real signature and whether `createBoard` takes `position`; fix the CALL, never the expectation.

- [ ] **Step 2: Run.** `npx vitest run src/document/treeEdit.mirror.test.ts src/store/store.test.ts`. Expected: FAIL (bands
  dropped by the mirror and the lowering; the store actions do not exist).

- [ ] **Step 3: Implement.**
  - `lowerBands`, exactly `lowerProfiles`' shape:

```ts
/** A part's bands lowered back through ONE mirror (edge banding spec §2.2): a flag flip, its own inverse; equal to the
 *  stored bands: the stored array. */
function lowerBands(storedBefore: Board, draft: Board): Band[] {
  const back = mirrorBands(draft.bands, mirrorDim(draft));
  return sameBands(back, storedBefore.bands) ? storedBefore.bands : back;
}
```

    Add `bands: lowerBands(lowerBefore, draft),` beside `profiles: lowerProfiles(…)`. In `changedKeys` add a `bands` branch
    exactly like `profiles`' (`… cur.bands !== after.bands && cur.bands !== resolved.bands`), and `: k === 'bands' ? cur.bands`
    in `valueOf`. `cornerRule` needs no branch (a primitive).
  - `store.ts`: `copyBoard` copies `bands: source.bands.map(copyBand)` where it copies `profiles` (a ShapedBoard has none:
    follow the existing profiles line's guard). `setBands`, declared beside the profile actions and implemented after
    `removeProfile`:

```ts
    setBands: (ids, sides, type) => {
      if (readOnly()) return;
      const world = worldParts(get().doc);
      const t = oneEditPerTarget(get().doc, ids.filter((id) => world.some((b) => b.id === id)));
      if (t.size === 0) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) => {
        if (!t.has(b.id)) return b;
        const next = withBands(b.bands, sides, type);
        return sameBands(next, b.bands) ? b : { ...b, bands: next };
      })));
      judgeHeld();
    },
```

    Check `oneEditPerTarget`'s real signature (`treeEdit.ts:215`) and how `updateBoards` builds `t`; match it.
  - `withBandTypes` in `bandModel.ts` (see Interfaces). Every Task 3 import of the model in `src/document/` is from
    `./bandModel`, never `./banding`. `updateBoards` gains `bandTypes?: BandType[]` and wraps its base
    document: `mapWorld(withBandTypes(adopt ? upsertMaterials(doc, adopt) : doc, bandTypes), …)`. `applyMaterials` gains
    `bandTypes?: BandType[]`: pass it to `updateBoards` on the assign path; on the plain path
    `edit((doc) => withBandTypes(kept.length > 0 ? upsertMaterials(doc, kept) : doc, bandTypes))` — guarded so an unchanged
    call reaches `edit` with the SAME object (edit()'s no-op test, inv 4). Update both actions' doc comments.

- [ ] **Step 4: Run.** The Step 2 command → PASS.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. `lowerBands` returns `draft.bands`. The write-back test fails.
  2. `mirrorPart` leaves `bands` unmirrored. The world-bands test fails.
  3. `setBands` drops its `sameBands` guard. The no-op test fails.
  4. `withBandTypes` returns a new object when equal. The unchanged applyMaterials test fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "banding: write-back through mirrors, copies, groups and store actions (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The arithmetic — core, strips, tape runs, faults

**Files:**
- Create: `src/document/banding.ts` (the arithmetic; first line `export * from './bandModel';`, so higher layers —
  `cutlist.ts`, `purchase.ts`, panels — import everything band-related from `./banding`)
- Test: append to `src/document/banding.test.ts`

**Interfaces:**
- Consumes: `faceOutline`, `sideStretch` (`profilePath.ts`), `endWord` (`holeText.ts`), the Task 1 model.
- Produces:
  ```ts
  export type BandFaultKind = 'needs-straight' | 'no-side' | 'too-thick' | 'tape-narrow';
  export interface BandFault { side: ProfileSide; kind: BandFaultKind }
  export const bandFaultText: (k: BandFaultKind) => string;
  export function bandFaults(part: Board, types: readonly BandType[]): readonly BandFault[];
  export function coreSize(part: Board, types: readonly BandType[]): { length: number; width: number; thickness: number };
  export interface StripEnd { mitre: number | null }      // radians from square, or square
  export interface Strip {
    part: string; partName: string; side: ProfileSide; type: SolidBand;
    finished: number;       // finished length along the side (the long point)
    length: number;         // cut length: finished + lengthAllowance
    width: number;          // the band's thickness (the rip)
    thickness: number;      // part thickness + widthAllowance (the stock thickness it is ripped from)
    ends: [StripEnd, StripEnd];   // [min end, max end] of the side's run dimension
  }
  export function strips(part: Board, types: readonly BandType[]): readonly Strip[];
  export interface TapeRun { side: ProfileSide; type: TapeBand; length: number }   // includes lengthAllowance
  export function tapeRuns(part: Board, types: readonly BandType[]): readonly TapeRun[];
  export function stripBoard(s: Strip): Board;   // the strip as a plain part for grouping, packing and diagrams
  export function stripId(s: Pick<Strip, 'part' | 'side'>): string;   // `${part}#band:${across}-${from}`
  export function bandSignature(part: Board): string;   // sides, type ids and the corner rule, exact; '' with no bands
  export function cutStock(doc: Pick<FlatDocument, 'boards' | 'bandTypes'>): Board[];   // every part at core size + every strip
  ```

- [ ] **Step 1: Write the failing tests.** Append to `src/document/banding.test.ts` (add imports
  `bandFaults, bandFaultText, coreSize, strips, tapeRuns, bandSignature, cutStock, stripBoard` from `./banding`;
  `cornerCurve, archCurve` from `./curves`; `BandType` type):

```ts
describe('the arithmetic (edge banding spec §3)', () => {
  const maple = (t = 0.25): BandType => ({ id: 'm', name: 'Maple edging', kind: 'solid', thickness: t, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 });
  const walnut = (t = 0.5): BandType => ({ id: 'w', name: 'Walnut edging', kind: 'solid', thickness: t, lengthAllowance: 0.5, material: 'walnut', widthAllowance: 0.0625 });
  const types = (...extra: BandType[]): BandType[] => [BUILT_IN_BAND, ...extra];
  const shelf = (bands: Band[], cornerRule: 'long' | 'ends' | 'mitre' = 'long', over: object = {}) =>
    ({ ...createBoard({ id: 'p', name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands, cornerRule, ...over });
  const all = (type: string) => BAND_SIDES.map((side) => ({ side, type }));

  it('a part with no bands: core is its own size, no strips, no tape, no signature', () => {
    const p = shelf([]);
    expect(coreSize(p, types())).toEqual({ length: 30, width: 12, thickness: 0.75 });
    expect(strips(p, types())).toEqual([]);
    expect(tapeRuns(p, types())).toEqual([]);
    expect(bandSignature(p)).toBe('');
  });
  it('core subtracts each banded side\'s thickness, whatever the corner rule', () => {
    for (const rule of ['long', 'ends', 'mitre'] as const) {
      expect(coreSize(shelf(all('m'), rule), types(maple())), rule).toEqual({ length: 29.5, width: 11.5, thickness: 0.75 });
    }
    expect(coreSize(shelf([{ side: W0, type: 'm' }, { side: L1, type: 'w' }]), types(maple(), walnut()))).toEqual({ length: 29.5, width: 11.75, thickness: 0.75 });
    expect(coreSize(shelf(all(BUILT_IN_BAND_ID)), types())).toEqual({ length: 30, width: 12, thickness: 0.75 });
  });
  it('long edges run through: long strips are the full length, ends lose the long bands\' thickness', () => {
    const s = strips(shelf(all('m'), 'long'), types(maple()));
    const by = (side: ProfileSide) => s.find((x) => x.side.across === side.across && x.side.from === side.from)!;
    expect(by(W0).finished).toBe(30);
    expect(by(L0).finished).toBe(11.5);
    expect(by(W0).length).toBe(30.5);
    expect(by(W0).width).toBe(0.25);
    expect(by(W0).thickness).toBe(0.8125);
    expect(by(W0).ends).toEqual([{ mitre: null }, { mitre: null }]);
  });
  it('ends run through: the mirror image', () => {
    const s = strips(shelf(all('m'), 'ends'), types(maple()));
    expect(s.find((x) => x.side.across === 'width')!.finished).toBe(29.5);
    expect(s.find((x) => x.side.across === 'length')!.finished).toBe(12);
  });
  it('mitred: full side lengths, a mitre only where the neighbour has thickness, atan(n / t) from square', () => {
    const s = strips(shelf([{ side: W0, type: 'm' }, { side: L1, type: 'w' }], 'mitre'), types(maple(0.25), walnut(0.5)));
    const long = s.find((x) => sameSide(x.side, W0))!;
    const end = s.find((x) => sameSide(x.side, L1))!;
    expect(long.finished).toBe(30);
    expect(long.ends[0]).toEqual({ mitre: null });                    // the length-min end has no band
    expect(long.ends[1]!.mitre).toBeCloseTo(Math.atan(0.5 / 0.25), 12);
    expect(end.finished).toBe(12);
    expect(end.ends[0]!.mitre).toBeCloseTo(Math.atan(0.25 / 0.5), 12);   // width-min neighbour
    expect(end.ends[1]).toEqual({ mitre: null });
  });
  it('a zero-thickness neighbour never shortens a strip or makes a mitre', () => {
    const s = strips(shelf([{ side: W0, type: 'm' }, { side: L0, type: BUILT_IN_BAND_ID }], 'ends'), types(maple()));
    expect(s).toHaveLength(1);
    expect(s[0]!.finished).toBe(30);
  });
  it('tape: a straight side is its dimension plus the allowance; no strips', () => {
    const p = shelf([{ side: W0, type: BUILT_IN_BAND_ID }, { side: L1, type: BUILT_IN_BAND_ID }]);
    expect(tapeRuns(p, types()).map((r) => r.length)).toEqual([30.5, 12.5]);
    expect(strips(p, types())).toEqual([]);
  });
  it('tape round an arch: the side\'s TRUE outline length (Review Focus 3)', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 2 }) };
    const p = shelf([{ side: W0, type: BUILT_IN_BAND_ID }], 'long', { curves: [arch] });
    const r = 12 ** 2 / (2 * 2) + 2 / 2;               // chord 24, rise 2: r = (c/2)²/(2h) + h/2
    const half = Math.asin(12 / r);
    const expected = 3 + 2 * r * half + 3;              // the straight ends and the true arc
    expect(tapeRuns(p, types())[0]!.length).toBeCloseTo(expected + 0.5, 9);
  });
  it('a rounded corner between two taped sides is bought once: half each (Review Focus 3)', () => {
    const corner = { id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 2 }) };
    const both = shelf([{ side: W1, type: BUILT_IN_BAND_ID }, { side: L1, type: BUILT_IN_BAND_ID }], 'long', { curves: [corner] });
    const runs = tapeRuns(both, types());
    const total = runs.reduce((n, r) => n + r.length, 0);
    expect(total).toBeCloseTo((30 - 2) + (12 - 2) + (Math.PI * 2) / 2 + 2 * 0.5, 9);
    const one = tapeRuns(shelf([{ side: W1, type: BUILT_IN_BAND_ID }], 'long', { curves: [corner] }), types());
    expect(one[0]!.length).toBeCloseTo((30 - 2) + (Math.PI * 2) / 2 + 0.5, 9);
  });
  it('faults: needs-straight, too-thick, tape-narrow; a faulted band adds nothing', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 2 }) };
    const onArch = shelf([{ side: W0, type: 'm' }], 'long', { curves: [arch] });
    expect(bandFaults(onArch, types(maple()))).toEqual([{ side: W0, kind: 'needs-straight' }]);
    expect(coreSize(onArch, types(maple())).width).toBe(12);
    expect(strips(onArch, types(maple()))).toEqual([]);
    const thick = shelf([{ side: W0, type: 'm' }, { side: W1, type: 'm' }], 'long', { width: 0.5 });
    expect(bandFaults(thick, types(maple()))).toEqual([{ side: W0, kind: 'too-thick' }, { side: W1, kind: 'too-thick' }]);
    const narrow = shelf([{ side: W0, type: BUILT_IN_BAND_ID }], 'long', { thickness: 1 });
    expect(bandFaults(narrow, types()).map((f) => f.kind)).toEqual(['tape-narrow']);
    expect(tapeRuns(narrow, types())).toEqual([]);
    expect(bandFaultText('needs-straight')).toBe('needs a straight edge');
  });
  it('the memo is keyed on the band types too (Review Focus 2): a thickness edit re-sizes the core', () => {
    const p = shelf(all('m'));
    expect(coreSize(p, types(maple(0.25))).width).toBe(11.5);
    expect(coreSize(p, types(maple(0.5))).width).toBe(11);
  });
  it('cutStock: parts at core size, then each strip as a plain solid part', () => {
    const p = shelf(all('m'));
    const out = cutStock({ boards: [p], bandTypes: types(maple()) });
    expect(out[0]).toMatchObject({ id: 'p', length: 29.5, width: 11.5 });
    expect(out.slice(1).map((b) => [b.material, b.length, b.width, b.thickness, b.grain])).toEqual([
      ['maple', 30.5, 0.25, 0.8125, 'length'], ['maple', 30.5, 0.25, 0.8125, 'length'],
      ['maple', 12, 0.25, 0.8125, 'length'], ['maple', 12, 0.25, 0.8125, 'length'],
    ]);
    expect(stripBoard(strips(p, types(maple()))[0]!).name).toBe('Shelf edging (width min side)');
  });
  it('bandSignature: sides, type ids and the corner rule, exact', () => {
    expect(bandSignature(shelf([{ side: W0, type: 'm' }]))).not.toBe(bandSignature(shelf([{ side: W0, type: 'm' }], 'mitre')));
    expect(bandSignature(shelf([{ side: W0, type: 'm' }]))).not.toBe(bandSignature(shelf([{ side: W1, type: 'm' }])));
  });
});
```

  The arch and corner fixtures name `archCurve`/`cornerCurve`'s real field names; check `curves.ts` and fix the FIXTURE
  call, never the expected lengths (they are computed independently, from the arc's chord and rise).

- [ ] **Step 2: Run.** `npx vitest run src/document/banding.test.ts`. Expected: FAIL (the arithmetic does not exist).

- [ ] **Step 3: Implement** (in `banding.ts`; import `faceOutline, sideStretch` from `./profilePath`, `endWord` from
  `./holeText`, `deepFreeze` from wherever `profilePath.ts` imports it, and the `Board`, `FlatDocument`, `SolidBand`,
  `TapeBand` types):

```ts
export type BandFaultKind = 'needs-straight' | 'no-side' | 'too-thick' | 'tape-narrow';
export interface BandFault { side: ProfileSide; kind: BandFaultKind }
const FAULT_TEXT: Record<BandFaultKind, string> = {
  'needs-straight': 'needs a straight edge', 'no-side': 'no such edge', 'too-thick': 'leaves no core', 'tape-narrow': 'narrower than the part',
};
/** THE band fault words (spec §3.4). */
export const bandFaultText = (k: BandFaultKind) => FAULT_TEXT[k];

const EPS = 1e-9;
/** The side's dimension (its length along the outline when straight): a long edge runs along the length. */
const sideLength = (b: Pick<Board, 'length' | 'width'>, s: ProfileSide) => (s.across === 'width' ? b.length : b.width);
const typeOf = (types: readonly BandType[], id: string) => types.find((t) => t.id === id);
const chordLength = (c: { a: [number, number]; b: [number, number]; arc?: { c: [number, number]; r: number } }) => {
  if (!c.arc) return Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
  const [cx, cy] = c.arc.c;
  const t = Math.abs(Math.atan2((c.a[0] - cx) * (c.b[1] - cy) - (c.a[1] - cy) * (c.b[0] - cx), (c.a[0] - cx) * (c.b[0] - cx) + (c.a[1] - cy) * (c.b[1] - cy)));
  return c.arc.r * t;                                   // a model chord of an arc: r × its own (minor) angle
};
/** Chord indices of a stretch, in order (it may wrap). */
const stretchIndices = (from: number, to: number, n: number) => {
  const out: number[] = [];
  for (let i = from; ; i = (i + 1) % n) { out.push(i); if (i === to) break; }
  return out;
};

interface Judged { faults: BandFault[]; t: Map<number, number>; chords: Map<number, number[]> | null; outline: ReturnType<typeof faceOutline> }

const memo = new WeakMap<Board, WeakMap<readonly BandType[], Judged>>();
/** THE judgement of a part's bands against the project's band types, memoised per (part, band types array). */
function judge(part: Board, types: readonly BandType[]): Judged {
  let m = memo.get(part);
  if (!m) { m = new WeakMap(); memo.set(part, m); }
  const hit = m.get(types);
  if (hit) return hit;
  const faults: BandFault[] = [];
  const t = new Map<number, number>();
  const outline = part.bands.length === 0 ? null : faceOutline(part);
  const chords = outline ? new Map<number, number[]>() : null;
  for (const band of part.bands) {
    const type = typeOf(types, band.type)!;
    const i = sideIndex(band.side);
    const st = outline ? sideStretch(part, outline, band.side) : null;
    if (!st) { faults.push({ side: band.side, kind: 'no-side' }); continue; }
    const idx = stretchIndices(st.from, st.to, outline!.chords.length);
    chords!.set(i, idx);
    const only = outline!.chords[idx[0]!]!;
    const straight = idx.length === 1 && !only.arc && only.curve === undefined && Math.abs(chordLength(only) - sideLength(part, band.side)) <= EPS;
    if (type.thickness > 0 && !straight) { faults.push({ side: band.side, kind: 'needs-straight' }); continue; }
    if (type.kind === 'tape' && type.tapeWidth < part.thickness - EPS) { faults.push({ side: band.side, kind: 'tape-narrow' }); continue; }
    t.set(i, type.thickness);
  }
  // too-thick: an opposite pair whose (unfaulted) thicknesses leave no core; both bands of the pair carry it.
  for (const [a, b, dim] of [[0, 1, 'width'], [2, 3, 'length']] as const) {
    if ((t.get(a) ?? 0) + (t.get(b) ?? 0) >= part[dim] - EPS && (t.get(a) ?? 0) + (t.get(b) ?? 0) > 0) {
      for (const k of [a, b]) if (t.has(k)) { faults.push({ side: BAND_SIDES[k]!, kind: 'too-thick' }); t.delete(k); }
    }
  }
  faults.sort((p, q) => sideIndex(p.side) - sideIndex(q.side));
  const out = deepFreeze({ faults, t, chords, outline }) as Judged;
  m.set(types, out);
  return out;
}

export const bandFaults = (part: Board, types: readonly BandType[]): readonly BandFault[] => judge(part, types).faults;
const thick = (j: Judged, i: number) => j.t.get(i) ?? 0;

export function coreSize(part: Board, types: readonly BandType[]) {
  if (part.bands.length === 0) return { length: part.length, width: part.width, thickness: part.thickness };
  const j = judge(part, types);
  return { length: part.length - thick(j, 2) - thick(j, 3), width: part.width - thick(j, 0) - thick(j, 1), thickness: part.thickness };
}
```

    Then `strips` (spec §3.2), from the judged thicknesses — for a side `i` with an unfaulted SOLID band:
    - its run dimension's two neighbours are `[2, 3]` for a long edge (i ∈ {0, 1}) and `[0, 1]` for an end;
    - `finished` = the side's dimension, less each neighbour's thickness when the rule makes THIS side give way (`'long'`
      and `i` is an end, or `'ends'` and `i` is a long edge); `'mitre'` never shortens;
    - `ends[k]` = `{ mitre: Math.atan(n / own) }` when the rule is `'mitre'` and neighbour k's thickness `n` > 0, else
      `{ mitre: null }`;
    - `length = finished + type.lengthAllowance`, `width = type.thickness`, `thickness = part.thickness + type.widthAllowance`.

    `tapeRuns`: for each side with an unfaulted TAPE band: the sum over its stretch chords of `chordLength`, a chord ALSO in
    an adjacent side's stretch (a shared corner arc: `j.chords` of the two sides `i` is adjacent to — for a long edge the
    ends, for an end the long edges) weighted ½ when that adjacent side carries an unfaulted tape band, else 1; then
    `+ type.lengthAllowance`. Return in canonical side order. Each memoised in its OWN `WeakMap<Board, WeakMap<readonly BandType[], …>>` pair (the judged record is deep-frozen:
    never add a property to it — a frozen object throws on assignment in an ES module); results deep-frozen; never
    recompute per call.

```ts
export const stripId = (s: Pick<Strip, 'part' | 'side'>) => `${s.part}#band:${s.side.across}-${s.side.from}`;
/** A strip as a plain solid part (spec §4.2, §4.4): ripped off a board's edge — its stock thickness is the strip's width
 *  across the panel's edge, its width the band's thickness — grain along its length. Never stored. */
export function stripBoard(s: Strip): Board {
  return {
    id: stripId(s), name: `${s.partName} edging (${s.side.across} ${s.side.from} ${endWord(s.side.across)})`,
    length: s.length, width: s.width, thickness: s.thickness, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
    material: s.type.material, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long',
  };
}
export const bandSignature = (part: Board) => (part.bands.length === 0 ? '' : `${part.bands.map(bandValues).join(';')}/${part.cornerRule}`);
/** What is cut from stock (spec §4.3, §4.4): every part at its CORE size (the same object when it has no bands), then
 *  every solid strip as a part. THE input for nesting and by-the-piece packing. */
export function cutStock(doc: Pick<FlatDocument, 'boards' | 'bandTypes'>): Board[] {
  const parts = doc.boards.map((b) => {
    if (b.bands.length === 0) return b;
    const c = coreSize(b, doc.bandTypes);
    return c.length === b.length && c.width === b.width ? b : { ...b, length: c.length, width: c.width };
  });
  return [...parts, ...doc.boards.flatMap((b) => strips(b, doc.bandTypes).map(stripBoard))];
}
```

    Note `endWord(dim)` gives `end` for `length` and `side` for `width`; `edgeName` in `holeText.ts` composes the same words.
    `Strip.partName` is the part's (flat display) `name`.

- [ ] **Step 4: Run.** `npx vitest run src/document/banding.test.ts` → PASS.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. Swap the `'long'`/`'ends'` give-way conditions. Both rule tests fail.
  2. Use `Math.atan(own / n)` for the mitre. The mitre test fails.
  3. Count a shared corner chord in full on both sides. The corner test fails.
  4. Measure an arc chord by its straight length. The arch test fails.
  5. Key the memo on the part only. The memo test fails.
  6. Let a faulted band subtract its thickness. The needs-straight core assertion fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "banding: core size, strips, tape runs and band faults — the one arithmetic (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The cut list — core sizes, band lines, strip rows; nesting; the balloon skip

**Files:**
- Modify: `src/document/cutlist.ts` (`CutListRow.stripIds`, `CutList.notes`, core dims and `bandSignature` in the key, the
  band line, strip rows, stock and nesting from `cutStock`)
- Modify: `src/panels/planBalloons.ts:52` (skip a row with no `boardIds`)
- Modify: `src/panels/CutList.tsx:50` (`rowNumbers` also maps `stripIds`; render `list.notes` under the header)
- Test: create `src/document/cutlistBands.test.ts`; append to `src/panels/planBalloons.test.ts` (create if absent)

**Interfaces:**
- Consumes: `coreSize`, `strips`, `stripBoard`, `stripId`, `bandFaults`, `bandFaultText`, `bandSignature`, `cutStock` (Task 4).
- Produces: `CutListRow.stripIds: string[]` (empty on a part row; the strip ids on a strip row); `CutList.notes: string[]`
  (empty when nothing is banded).

- [ ] **Step 0: Pin today's bytes (Global Constraints' byte-for-byte promise; the `sweptIdentity` pattern).** BEFORE any
  code change in this task, create `src/document/bandFreeIdentity.test.ts`: for `shakerTableFixture` (`shakerTableFixture.ts`)
  and two or three existing cut-list fixtures (a sheet-goods project with nesting, a by-the-piece priced project — reuse
  `cutlist.test.ts`' and `purchase.test.ts`' own documents), hash
  `JSON.stringify(buildCutList(d), strip)` and `JSON.stringify(buildPurchase(d, buildCutList(d), shop), strip)` with a
  replacer `strip` that drops the keys `stripIds`, `notes` and `banding`; assert each hash against a LITERAL captured on the
  untouched tree (run once, paste the printed hashes, commit). It must pass now and after Tasks 5 and 6 unchanged; never
  re-capture a literal to make it pass. Use the hash helper `sweptIdentity.test.ts` uses.

- [ ] **Step 1: Write the failing tests.** Create `src/document/cutlistBands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCutList } from './cutlist';
import { createBoard, createDocument } from './document';
import { BAND_SIDES, BUILT_IN_BAND } from './banding';
import type { Band, BandType, FlatDocument } from './types';

const maple: BandType = { id: 'm', name: 'Maple edging 1/4"', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const W0 = BAND_SIDES[0]!, W1 = BAND_SIDES[1]!, L0 = BAND_SIDES[2]!, L1 = BAND_SIDES[3]!;
const shelf = (id: string, bands: Band[], over: object = {}) =>
  ({ ...createBoard({ id, name: id, length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands, ...over });
const flat = (boards: object[], bandTypes: BandType[] = [BUILT_IN_BAND, maple], units?: object): FlatDocument =>
  ({ ...createDocument('T'), boards, bandTypes, ...(units ? { units } : {}) } as FlatDocument);
const rowsOf = (d: FlatDocument) => buildCutList(d).groups.flatMap((g) => g.rows.map((r) => ({ g: g.label, ...r })));

describe('the cut list with bands (edge banding spec §4.1, §4.2)', () => {
  it('a document with no bands is unchanged: no notes, no stripIds on any row', () => {
    const d = flat([shelf('a', [])]);
    const list = buildCutList(d);
    expect(list.notes).toEqual([]);
    expect(list.groups[0]!.rows[0]!.stripIds).toEqual([]);
    expect(list.groups[0]!.rows[0]!.dims).toBe('30" × 12"');
  });
  it('a banded part prints its core size, a band line and the header note', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: W1, type: 'm' }])]);
    const part = rowsOf(d).find((r) => r.names.includes('a'))!;
    expect(part.dims).toBe('30" × 11-1/2"');
    expect(part.setup).toContain('Band: the width min side and the width max side — Maple edging 1/4"; finished 30" × 12"');
    expect(buildCutList(d).notes).toEqual(['Cut sizes are before banding; band before machining — every cut, hole and curve is measured on the banded part.']);
  });
  it('tape at zero thickness: no finished clause, no corner words', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'band-iron-on' }])]);
    expect(rowsOf(d)[0]!.setup).toContain('Band: the width min side — Iron-on veneer');
    expect(rowsOf(d)[0]!.dims).toBe('30" × 12"');
  });
  it('the corner words appear when two adjacent bands with thickness meet and one is solid', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: L1, type: 'm' }], { cornerRule: 'mitre' })]);
    expect(rowsOf(d)[0]!.setup.find((l) => l.startsWith('Band:'))).toBe(
      'Band: the width min side and the length max end — Maple edging 1/4", mitred corners; finished 30" × 12"');
  });
  it('differently banded parts are different rows; alike ones collapse', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }]), shelf('b', [{ side: W0, type: 'm' }]), shelf('c', [{ side: W1, type: 'm' }])]);
    const parts = rowsOf(d).filter((r) => r.g.startsWith('Plywood'));
    expect(parts.map((r) => r.qty).sort()).toEqual([1, 2]);
  });
  it('strip rows: in the edging material\'s group, collapsed, numbered in the one series, no boardIds', () => {
    const d = flat([shelf('a', BAND_SIDES.map((side) => ({ side, type: 'm' }))), shelf('b', BAND_SIDES.map((side) => ({ side, type: 'm' })))]);
    const list = buildCutList(d);
    const mapleGroup = list.groups.find((g) => g.material === 'maple')!;
    expect(mapleGroup.label).toBe('Maple — 13/16"');
    expect(mapleGroup.rows.map((r) => [r.qty, r.dims, r.boardIds.length, r.stripIds.length])).toEqual([[4, '30-1/2" × 1/4"', 0, 4], [4, '12" × 1/4"', 0, 4]]);
    expect(mapleGroup.rows[0]!.setup).toEqual(['Trim flush']);
    const numbers = list.groups.flatMap((g) => g.rows.map((r) => r.number));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  });
  it('a mitred strip says so, each end\'s own angle', () => {
    const wide: BandType = { ...maple, id: 'w', name: 'Wide', thickness: 0.5 };
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: L1, type: 'w' }], { cornerRule: 'mitre' })], [BUILT_IN_BAND, maple, wide]);
    const strips = rowsOf(d).filter((r) => r.stripIds.length > 0);
    expect(strips.map((r) => r.setup[0]).sort()).toEqual(['Trim flush; mitre one end 26.6°', 'Trim flush; mitre one end 63.4°']);
  });
  it('a faulted band prints its check and changes no size', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }, { side: W1, type: 'm' }], { width: 0.5 })]);
    const r = rowsOf(d)[0]!;
    expect(r.dims).toBe('30" × 1/2"');
    expect(r.setup.find((l) => l.startsWith('Band:'))).toBe('Band: the width min side and the width max side — Maple edging 1/4" — check: leaves no core');
  });
  it('a band type edit regroups (Review Focus 2)', () => {
    const boards = [shelf('a', [{ side: W0, type: 'm' }])];
    const before = rowsOf(flat(boards))[0]!.dims;
    const after = rowsOf(flat(boards, [BUILT_IN_BAND, { ...maple, thickness: 0.5 }]))[0]!.dims;
    expect([before, after]).toEqual(['30" × 11-3/4"', '30" × 11-1/2"']);
  });
  it('sheet nesting lays out cores', () => {
    const d = flat([shelf('a', BAND_SIDES.map((side) => ({ side, type: 'm' })))]);
    const ply = buildCutList(d).groups.find((g) => g.material === 'plywood')!;
    const placed = ply.nesting!.sheets[0]!.parts[0]!;
    expect([placed.w, placed.h].sort((x, y) => x - y)).toEqual([11.5, 29.5]);
  });
  it('metric: the band line reads mm', () => {
    const d = flat([shelf('a', [{ side: W0, type: 'm' }])], [BUILT_IN_BAND, maple], { display: 'metric-mm', precision: 16 });
    expect(rowsOf(d).find((r) => r.g.startsWith('Plywood'))!.setup.find((l) => l.startsWith('Band:'))).toBe(
      'Band: the width min side — Maple edging 1/4"; finished 762 mm × 305 mm');
  });
});
```

  Check `PlacedPart`'s real field names for a nested part's footprint (`nesting.ts`) and `formatSize`'s metric output; fix
  the ACCESSOR or the expected format STRING to the existing formatter's output (`formatSize`'s own tests show it), never
  the numbers.

  Append to `src/panels/planBalloons.test.ts`:

```ts
it('a row with no parts (a strip row) is neither anchored nor hidden (edge banding 1, Review Focus 5)', () => {
  const d = { visible: [], hidden: [], bounds: { min: [0, 0], max: [10, 10] } } as unknown as Drawing;
  expect(anchorsFor(d, [{ number: 7, boardIds: [] }])).toEqual({ anchors: [], hidden: [] });
});
```

  (Use the file's existing `Drawing` fixture helper if it has one.)

- [ ] **Step 2: Run.** `npx vitest run src/document/cutlistBands.test.ts src/panels/planBalloons.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** in `cutlist.ts`.
  - `CutListRow` gains, after `boardIds`:
    `/** A strip row's strip ids (edge banding spec §4.2), so a board layout labels a strip with its number; [] on a part row. */ stripIds: string[];`
    `CutList` gains `/** Sheet notes (edge banding spec §4.1); [] when nothing is banded. */ notes: string[];`
  - The band line (spec §4.1), built here (→ units):

```ts
const sideWords = (s: ProfileSide) => edgeName({ dim: s.across, side: s.from });
const CORNER_WORDS: Record<CornerRule, string> = { long: 'long edges run through', ends: 'ends run through', mitre: 'mitred corners' };
/** THE band line: one clause per band type (sides in canonical order), faulted sides their own clause with its check;
 *  the corner words when two adjacent bands with thickness meet and one is solid; `finished` when the core differs. */
function bandLine(board: Board, types: readonly BandType[], units: Units): string | null {
  if (board.bands.length === 0) return null;
  const faults = bandFaults(board, types);
  const faultOf = (s: ProfileSide) => faults.find((f) => sameSide(f.side, s));
  const clauses: string[] = [];
  const groups = new Map<string, ProfileSide[]>();
  for (const b of board.bands) {
    const f = faultOf(b.side);
    const key = f ? `${b.type}|${f.kind}` : b.type;
    groups.set(key, [...(groups.get(key) ?? []), b.side]);
  }
  for (const [key, sides] of groups) {
    const [typeId, fault] = key.split('|') as [string, BandFaultKind | undefined];
    const name = types.find((t) => t.id === typeId)!.name;
    clauses.push(`${sides.map(sideWords).join(' and ')} — ${name}${fault ? ` — check: ${bandFaultText(fault)}` : ''}`);
  }
  const t = (s: ProfileSide) => { const b = bandOn(board.bands, s); const ty = b && types.find((x) => x.id === b.type); return !b || faultOf(s) || !ty ? null : ty; };
  const meets = [[0, 2], [0, 3], [1, 2], [1, 3]].some(([a, c]) => {
    const p = t(BAND_SIDES[a!]!), q = t(BAND_SIDES[c!]!);
    return p && q && p.thickness > 0 && q.thickness > 0 && (p.kind === 'solid' || q.kind === 'solid');
  });
  const core = coreSize(board, types);
  const finished = core.length !== board.length || core.width !== board.width ? `; finished ${formatSize([board.length, board.width], units)}` : '';
  return `Band: ${clauses.join('; ')}${meets ? `, ${CORNER_WORDS[board.cornerRule]}` : ''}${finished}`;
}
```

    Push it as the LAST setup line (after the curve lines) in `setupLines`, whose signature gains `types`.
  - `rowKey(board, units, types)`: replace `f(board.length), f(board.width)` with the CORE's (`coreSize`), and append
    `bandSignature(board)` (exact). A band-free board's key is byte-identical (core = its own size; the signature is '' —
    append it ONLY when non-empty, so no trailing `|` changes a band-free key).
  - In the part loop: `dims`, `length`, `width` from the core; `stockInches` from the core (`stockInchesOf({ ...board, ...core })`);
    `stripIds: []`; nesting reads `cutStock` instead of `groupBoards`' raw boards — build `groupBoards` from
    `cutStock(doc)`'s parts (same index as `doc.boards`), not the stored boards.
  - Strip rows: after the part loop, for each part, for each `strips(part, doc.bandTypes)`, take `sb = stripBoard(s)`; its
    group via `groupFields(sb)`; its row key `rowKey(sb, units, types) + '|strip|' + endsKey(s)` where `endsKey` is
    `s.ends.map((e) => e.mitre === null ? 'sq' : String(e.mitre)).join(',')`; a new row's `setup` is
    `[stripSetup(s)]`, `diagrams` `buildDiagrams(sb, units)`, `names` gain `sb.name`, `stripIds` gain `sb.id`, no
    `boardIds`; `stockInches` from `sb`.

```ts
const deg = (r: number) => `${Number(((r * 180) / Math.PI).toFixed(1))}°`;
/** A strip's bench line (spec §4.2): trim flush, then its mitred ends, each its own angle. */
function stripSetup(s: Strip): string {
  const m = s.ends.filter((e) => e.mitre !== null).map((e) => e.mitre!);
  if (m.length === 0) return 'Trim flush';
  if (m.length === 1) return `Trim flush; mitre one end ${deg(m[0]!)}`;
  return Math.abs(m[0]! - m[1]!) <= 1e-12 ? `Trim flush; mitre both ends ${deg(m[0]!)}` : `Trim flush; mitre ends ${deg(m[0]!)} and ${deg(m[1]!)}`;
}
```

  - `notes`: `doc.boards.some((b) => b.bands.length > 0) ? ['Cut sizes are before banding; band before machining — every cut, hole and curve is measured on the banded part.'] : []`.
  - `planBalloons.ts` `anchorsFor`: first line of the row loop: `if (row.boardIds.length === 0) continue; // a strip row draws no part (edge banding §4.2)`.
  - `CutList.tsx`: `rowNumbers` maps `[...r.boardIds, ...r.stripIds]`; render `list.notes` as
    `<p className="cutlist-note" key={i}>{n}</p>` directly under the sheet header (reuse an existing note class if the
    sheet has one; no new CSS otherwise).

- [ ] **Step 4: Run.** The Step 2 command → PASS; then `npx vitest run src/document/bandFreeIdentity.test.ts src/document/cutlist.test.ts src/panels/CutList.test.tsx`
  → PASS unchanged (byte for byte on band-free documents; any `CutListRow` literal in a test gains `stripIds: []`).

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. Key rows on the finished size. The core-dims and regroup tests fail.
  2. Drop the `finished` clause condition (always print it). The tape test fails.
  3. Push strip ids into `boardIds`. The strip-row test fails.
  4. Remove the `planBalloons` skip. Its test fails.
  5. Nest the stored boards. The nesting test fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "cut list: core sizes, band lines, edging strip rows, cores nested (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Buying — strips with their species, the Edge banding block

**Files:**
- Modify: `src/document/purchase.ts` (`byThePiece` from `cutStock`; `Purchase.banding`; the total and unpriced count)
- Modify: `src/panels/CutList.tsx:182-193` (render the Edge banding block)
- Test: create `src/document/purchaseBands.test.ts`

**Interfaces:**
- Consumes: `cutStock`, `tapeRuns` (Task 4); `buildCutList` with strip rows (Task 5).
- Produces: `Purchase.banding: { lines: string[]; cost: number | null } | null` — null when no part is taped.

- [ ] **Step 1: Write the failing tests.** Create `src/document/purchaseBands.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildCutList } from './cutlist';
import { buildPurchase, defaultShop } from './purchase';
import { createBoard, createDocument } from './document';
import { BAND_SIDES, BUILT_IN_BAND } from './banding';
import type { BandType, FlatDocument } from './types';

const maple: BandType = { id: 'm', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const shelf = (id: string, type: string) =>
  ({ ...createBoard({ id, name: id, length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands: BAND_SIDES.map((side) => ({ side, type })) });
const flat = (boards: object[], bandTypes: BandType[], units?: object): FlatDocument =>
  ({ ...createDocument('T'), boards, bandTypes, ...(units ? { units } : {}) } as FlatDocument);
const buy = (d: FlatDocument, shop = defaultShop()) => buildPurchase(d, buildCutList(d), shop);

describe('Buying with bands (edge banding spec §4.4)', () => {
  it('no tape, no block', () => expect(buy(flat([shelf('a', 'm')], [BUILT_IN_BAND, maple])).banding).toBeNull());
  it('tape: one line per type, whole feet rounded up, unpriced shows feet only and joins the unpriced count', () => {
    const p = buy(flat([shelf('a', BUILT_IN_BAND.id), shelf('b', BUILT_IN_BAND.id)], [BUILT_IN_BAND]));
    // per shelf: 30.5 + 30.5 + 12.5 + 12.5 = 86"; two shelves 172" = 14.33 ft → 15′
    expect(p.banding!.lines).toEqual(['Iron-on veneer, 7/8" wide: buy 15′ · no price']);
    expect(p.banding!.cost).toBeNull();
    expect(p.totalLabel).toMatch(/no price/);
  });
  it('priced tape joins the total', () => {
    const priced = { ...BUILT_IN_BAND, pricePerFoot: 0.3 };
    const p = buy(flat([shelf('a', priced.id)], [priced]));
    expect(p.banding!.lines).toEqual(['Iron-on veneer, 7/8" wide: buy 8′ · $2.40']);   // 86" = 7.17 ft → 8′
    expect(p.banding!.cost).toBeCloseTo(2.4, 9);
  });
  it('metric: metres with the bought feet in brackets; the trade width imperial with mm', () => {
    const p = buy(flat([shelf('a', BUILT_IN_BAND.id)], [BUILT_IN_BAND], { display: 'metric-mm', precision: 16 }));
    expect(p.banding!.lines).toEqual(['Iron-on veneer, 7/8" (22 mm) wide: 2.2 m, buy 8′ · no price']);
  });
  it('solid strips join their material\'s board feet', () => {
    const d = flat([shelf('a', 'm')], [BUILT_IN_BAND, maple]);
    const entry = buy(d).entries.find((e) => e.material === 'maple')!;
    expect(entry.mode).toBe('board-foot');
    // 2 × 30.5 + 2 × 12 = 85" of 1/4 × 13/16
    const net = (85 * 0.25 * 0.8125) / 144;
    expect(entry.lines[0]).toContain(`(${net.toFixed(2)} bd ft net`);
  });
  it('by the piece: strips are ripped from stock at least as thick as the strip is wide (Review Focus 5)', () => {
    const d = flat([shelf('a', 'm')], [BUILT_IN_BAND, maple]);
    const shop = defaultShop();
    shop.materials.maple = { mode: 'piece', stock: [{ id: 'k', thickness: 1, width: 6, length: 96, price: null }] };
    const entry = buy(d, shop).entries.find((e) => e.material === 'maple')!;
    expect(entry.unplaceable).toBe(0);
    expect(entry.notes.some((n) => n.includes('plane 1" stock to 13/16"'))).toBe(true);
    const labels = entry.layouts[0]!.nesting.sheets[0]!.parts.map((p) => p.boardId);
    expect(labels.every((id) => id.includes('#band:'))).toBe(true);
  });
});
```

  Check `ShopSettings.materials`' piece-mode shape, `formatBoardFeet`'s output and `PlacedPart.boardId`; fix the FIXTURE
  or ACCESSOR, never the numbers.

  Append to `src/panels/CutList.test.tsx`, in its style (Review Focus 5): with maple set to by-the-piece in the `shop`
  prop, the maple board layout labels each strip with its strip row's NUMBER (the label text equals the row's
  `.cutlist-num`), proving `rowNumbers` maps `stripIds`.

- [ ] **Step 2: Run.** `npx vitest run src/document/purchaseBands.test.ts`. Expected: FAIL (`banding` absent; by-the-piece
  reads the stored boards).

- [ ] **Step 3: Implement** in `purchase.ts`.
  - `byThePiece(…)` is called with `cutStock(doc).filter((b) => b.material === m)` instead of `doc.boards.filter(…)`.
    (Board-foot and sheet modes read the cut list's groups, which Task 5 already built from cores and strips.)
  - The block:

```ts
export interface Purchase { entries: PurchaseEntry[]; banding: { lines: string[]; cost: number | null } | null; total: number; totalLabel: string }

/** Tape to buy (edge banding spec §4.4): per tape type, the runs' total rounded UP to whole feet (what is bought is rounded,
 *  inv 18); priced by the foot; metric reads metres to 0.1 with the bought feet beside. Null when nothing is taped. */
function tapeToBuy(doc: FlatDocument): Purchase['banding'] {
  const inches = new Map<string, number>();
  for (const b of doc.boards) for (const r of tapeRuns(b, doc.bandTypes)) inches.set(r.type.id, (inches.get(r.type.id) ?? 0) + r.length);
  if (inches.size === 0) return null;
  let cost = 0;
  let unpriced = false;
  const lines = doc.bandTypes.filter((t): t is TapeBand => t.kind === 'tape' && inches.has(t.id)).map((t) => {
    const total = inches.get(t.id)!;
    const feet = Math.ceil(total / 12 - EPS);
    const c = t.pricePerFoot === null ? null : feet * t.pricePerFoot;
    if (c === null) unpriced = true; else cost += c;
    const amount = isMetric(doc.units) ? `${(total * 0.0254).toFixed(1)} m, buy ${feet}′` : `buy ${feet}′`;
    return `${t.name}, ${tradeLength(t.tapeWidth, doc.units)} wide: ${amount} · ${priceText(c)}`;
  });
  return { lines, cost: unpriced && cost === 0 ? null : cost };
}
```

    Keep `cost` null only when NO line is priced; a mix reports the priced sum (as entries do) and each unpriced line
    counts toward the tail's unpriced number. `total` adds `banding?.cost ?? 0`; `unpriced` adds the number of unpriced
    tape lines; `amount` shows a figure when any entry OR tape line is priced.
  - `CutList.tsx`, inside the Buying section after the entries:

```tsx
{purchase.banding && (
  <div className="cutlist-buying-entry">
    <h4>Edge banding</h4>
    {purchase.banding.lines.map((line, i) => <p className="cutlist-buying-line" key={`t${i}`}>{line}</p>)}
  </div>
)}
```

    Match the entries' own heading element (read lines 182–193); render the Buying section when `entries.length > 0 ||
    purchase.banding`.

- [ ] **Step 4: Run.** `npx vitest run src/document/purchaseBands.test.ts src/document/purchase.test.ts src/document/bandFreeIdentity.test.ts src/panels/CutList.test.tsx` → PASS
  (`purchase.test.ts` unchanged except a `banding: null` where a test compares a whole `Purchase`).

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. `Math.round` instead of `Math.ceil`. The tape tests fail.
  2. `byThePiece` reads `doc.boards`. The by-the-piece test fails.
  3. Leave tape out of `total`. The priced test's total fails (add `expect(p.total).toBeCloseTo(2.4, 9)` there first if the
     file's default shop prices nothing else).

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "buying: edging strips with their species, the Edge banding tape block (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Refusals — joinery, Refine and Repair; a curve edit that breaks a band

**Files:**
- Create: `src/document/bandedRefusal.ts`
- Modify: `src/generate/joints/tapers.ts:132` (`joineryRefusal`), `src/generate/refine.ts:66`, `src/document/refineDesign.ts:78`
  (`RefusalReason` gains `'bands'`), `src/generate/joints/repair.ts:105`
- Modify: `src/panels/curveRefusal.ts` (`bandCurveRefusal`), `src/panels/Curves.tsx` (call it wherever it calls
  `curveEditRefusal`)
- Test: create `src/document/bandedRefusal.test.ts`; append to `src/panels/Curves.test.tsx`

**Interfaces:**
- Produces: `bandedParts(flat): string[]`, `bandedRefusal(flat, action: 'joinery' | 'refine'): string | null`;
  `bandCurveRefusal(before: Board, after: Board, types: readonly BandType[]): string | null`.

- [ ] **Step 1: Write the failing tests.** Create `src/document/bandedRefusal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bandedParts, bandedRefusal } from './bandedRefusal';
import { createBoard, createDocument } from './document';
import { joineryRefusal } from '../generate/joints/tapers';
import type { FlatDocument } from './types';

const flat = (bands: object[]): FlatDocument => ({ ...createDocument('T'),
  boards: [{ ...createBoard({ id: 'a', name: 'Shelf' }), bands }, createBoard({ id: 'b', name: 'Side' })] } as FlatDocument);
const tape = [{ side: { across: 'width', from: 'min' }, type: 'band-iron-on' }];

describe('banded projects (edge banding spec §6)', () => {
  it('names the banded parts', () => expect(bandedParts(flat(tape))).toEqual(['Shelf']));
  it('joinery and Refine refuse, in their words; nothing banded, nothing refused', () => {
    expect(bandedRefusal(flat(tape), 'joinery')).toBe("Add joinery doesn't handle banded parts yet (Shelf). Add joinery before banding, or remove the bands first.");
    expect(bandedRefusal(flat(tape), 'refine')).toBe("Refine doesn't handle banded parts yet (Shelf). Refine before banding, or remove the bands first.");
    expect(bandedRefusal(flat([]), 'joinery')).toBeNull();
  });
  it('joineryRefusal carries it', () => {
    const d = flat(tape);
    expect(joineryRefusal(d, d)).toMatch(/banded parts/);
  });
});
```

  Append to `src/panels/Curves.test.tsx` a test in the file's own style: a 30 × 12 plywood part with a solid 1/4" band on
  its width min side; adding an Arch on that side is refused with
  `Edging on the width min side needs a straight edge — remove the band first.` and the part's curves stay `[]`. (Read the
  file's existing "refuses an edit that adds a profile fault" test and mirror its setup; put `bandTypes` with the solid type
  on the store document.)

- [ ] **Step 2: Run.** `npx vitest run src/document/bandedRefusal.test.ts src/panels/Curves.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `bandedRefusal.ts`, `curvedRefusal.ts`' shape exactly:

```ts
import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any band. */
export function bandedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.bands.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with bands (edge banding spec §6), or null. Decided at entry, before any mutation or paid
 * call: Refine would drop the bands silently; joinery could put a tenon through edging.
 */
export function bandedRefusal(flat: FlatDocument, action: 'joinery' | 'refine'): string | null {
  const names = bandedParts(flat);
  if (names.length === 0) return null;
  return action === 'joinery'
    ? `Add joinery doesn't handle banded parts yet (${list(names)}). Add joinery before banding, or remove the bands first.`
    : `Refine doesn't handle banded parts yet (${list(names)}). Refine before banding, or remove the bands first.`;
}
```

  - Call it right after each `curvedRefusal` call (joinery: `joineryRefusal`; Refine: `refine.ts` and `refineDesign.ts`
    with reason `'bands'`); Repair: `if (bandedParts(flat).length > 0) return null; // withheld (edge banding §6)` after
    the curves line.
  - `curveRefusal.ts`:

```ts
/** A curve edit that ADDS a band fault (edge banding spec §3.4), named by its side; the first added, or null. */
export function bandCurveRefusal(before: Board, after: Board, types: readonly BandType[]): string | null {
  if (after.bands.length === 0) return null;
  const had = new Set(bandFaults(before, types).map((f) => `${sideIndex(f.side)}:${f.kind}`));
  const added = bandFaults(after, types).find((f) => !had.has(`${sideIndex(f.side)}:${f.kind}`));
  if (!added) return null;
  const side = edgeName({ dim: added.side.across, side: added.side.from }).replace(/^the /, '');
  return `Edging on the ${side} ${bandFaultText(added.kind)} — remove the band first.`;
}
```

    In `Curves.tsx`, wherever an edit's refusal is decided from the before/after part (`curveEditRefusal(…)`), also
    evaluate `bandCurveRefusal(before, after, bandTypes)` (read `bandTypes` with `useStore((s) => s.doc.bandTypes)`); the
    first non-null refusal wins, profiles' first.

- [ ] **Step 4: Run.** The Step 2 command → PASS.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. `joineryRefusal` skips `bandedRefusal`. The carry test fails.
  2. `bandCurveRefusal` compares by kind only (not side). Add a second test first if needed: a band already `needs-straight`
     on W0 must not license a new fault on W1. Then the mutation fails it.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "banding: joinery, Refine and Repair refuse banded projects; Curves refuses breaking a band (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Properties — the Banding section

**Files:**
- Create: `src/panels/Banding.tsx`
- Modify: `src/panels/Properties.tsx` (mount `<Banding boards={[board]} />` after `<Profiles board={board} />`, and
  `<Banding boards={boards} />` in `GroupProperties` inside its `EditLock`)
- Create: `src/panels/bandingRefusal.ts` (pure: `bandEditRefusal`, `bandsShownCorner`)
- Test: create `src/panels/Banding.test.tsx` and `src/panels/bandingRefusal.test.ts`

**Interfaces:**
- Consumes: `setBands`, `updateBoards` (Task 3); `bandFaults`, `bandFaultText`, `withBands`, `bandOn`, `BAND_SIDES` (Tasks 1, 4).
- Produces:
  ```ts
  /** The reason an edit would ADD a band fault to any of `parts` (capitalised, `Needs a straight edge`), or null. */
  export function bandEditRefusal(parts: readonly Board[], types: readonly BandType[], sides: readonly ProfileSide[], type: string | null): string | null;
  /** Whether the Corners select shows: some part has two adjacent sides banded with thickness, one of them solid. */
  export function bandsShownCorner(parts: readonly Board[], types: readonly BandType[]): boolean;
  ```

- [ ] **Step 1: Write the failing tests.**
  - `src/panels/bandingRefusal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bandEditRefusal, bandsShownCorner } from './bandingRefusal';
import { createBoard } from '../document/document';
import { archCurve } from '../document/curves';
import { BAND_SIDES, BUILT_IN_BAND } from '../document/banding';
import type { BandType } from '../document/types';

const maple: BandType = { id: 'm', name: 'Maple', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const types = [BUILT_IN_BAND, maple];
const W0 = BAND_SIDES[0]!, L0 = BAND_SIDES[2]!;
const plain = createBoard({ id: 'a', length: 30, width: 12, thickness: 0.75, material: 'plywood' });
const arched = { ...plain, id: 'b', curves: [{ id: 'c', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 2 }) }] };

describe('band edit refusals (edge banding spec §5.1)', () => {
  it('solid on an arched side is refused with its reason; tape is not', () => {
    expect(bandEditRefusal([plain, arched], types, [W0], 'm')).toBe('Needs a straight edge');
    expect(bandEditRefusal([plain, arched], types, [W0], BUILT_IN_BAND.id)).toBeNull();
    expect(bandEditRefusal([plain], types, [W0], 'm')).toBeNull();
  });
  it('clearing is never refused; a fault the part already has does not refuse', () => {
    const faulted = { ...arched, bands: [{ side: W0, type: 'm' }] };
    expect(bandEditRefusal([faulted], types, [W0], null)).toBeNull();
    expect(bandEditRefusal([faulted], types, [L0], BUILT_IN_BAND.id)).toBeNull();
  });
  it('the Corners select shows only for adjacent bands with thickness, one solid', () => {
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 'm' }, { side: L0, type: 'm' }] }], types)).toBe(true);
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 'm' }, { side: BAND_SIDES[1]!, type: 'm' }] }], types)).toBe(false);
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 'm' }, { side: L0, type: BUILT_IN_BAND.id }] }], types)).toBe(false);
  });
});
```

  - `src/panels/Banding.test.tsx` (testing-library, in `Profiles.test.tsx`'s / `Curves.test.tsx`'s style — reuse their store
    setup helper): four selects labelled `Width min side`, `Width max side`, `Length min end`, `Length max end`, each
    offering `None`, `Iron-on veneer`, and the document's other band types; choosing `Iron-on veneer` on `Width min side`
    stores the band (one undo entry); with two parts selected that disagree the select reads `Mixed` and a choice writes
    both; the `Band ▾` menu's `Iron-on veneer: all edges` sets four sides in ONE undo entry and `Remove all bands` clears
    them; on focus, `Maple` on the arched part's `Width min side` is a disabled option whose text ends with
    `— Needs a straight edge`; the `Corners` select appears only once two adjacent maple bands exist and writes
    `cornerRule`; every control is disabled while exploded.

- [ ] **Step 2: Run.** `npx vitest run src/panels/bandingRefusal.test.ts src/panels/Banding.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `bandingRefusal.ts`: `bandEditRefusal` — for each part, `before = bandFaults(part, types)`, `after = bandFaults({ ...part,
    bands: withBands(part.bands, sides, type) }, types)`; the first `(side, kind)` in `after` and not in `before` → its
    `bandFaultText` capitalised; `type === null` returns null at once. `bandsShownCorner` — per Task 5's `meets` rule
    (adjacent pairs `[0,2],[0,3],[1,2],[1,3]`, both thickness > 0 and unfaulted, one solid).
  - `Banding.tsx`:
    - Reads `bandTypes` (`useStore((s) => s.doc.bandTypes)`), `setBands`, `updateBoards`, `explode`.
    - `<h3>Banding</h3>`; per side in `BAND_SIDES`, a `<label>` + `<select>` labelled `cap(sideText)` (Profiles' words:
      `Width min side`), value = the common type id, `''` for none, `MIXED` when parts differ (a disabled
      `<option value={MIXED}>Mixed</option>` shown only then; an untouched mixed select writes nothing, inv 5). Options:
      `None`, then every band type by name; an option judged refused gets `disabled` and ` — <reason>` appended.
    - Refusal reasons are computed ONLY on focus (fu 388's rule: an `onFocus` sets a `judged` map keyed by the boards
      array and band types identity; never per render).
    - `Band ▾`: a `Popover` (Profiles' `+ Add profile ▾` usage) with, for each band type, `<name>: all edges`,
      `<name>: long edges`, `<name>: ends`, then `Remove all bands`; each runs ONE `setBands(ids, sides, type)`; an item
      `bandEditRefusal` refuses is disabled with its reason as `title`.
    - `Corners` select (`Long edges run through` / `Ends run through` / `Mitred`) only when `bandsShownCorner`; writes
      `updateBoards(ids, { cornerRule })`; mixed like the side selects.
    - Under the selects, a faulted band's note per part: `<p className="field-note">{side words}: {bandFaultText}</p>`
      (the `— check:` words of the cut list, for the part in hand).
    - Wrapped by the caller's `EditLock` (single-part `Properties` already wraps its sections; check, and wrap here if not).
  - `Properties.tsx`: mount it in both places.

- [ ] **Step 4: Run.** The Step 2 command → PASS.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. Judge options on every render (drop the focus gate) — the fu 388 test in `Banding.test.tsx` asserts no judgement
     before focus (spy on `bandFaults` through `vi.spyOn` of the module, or count option `disabled` before focus); it fails.
  2. Write a mixed select's value on blur. The mixed test fails.
  3. `bandsShownCorner` ignores the solid condition. Its tape test fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "properties: the Banding section — sides, Band menu, corners, refusals on focus (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Materials & prices — the Edge banding section

**Files:**
- Create: `src/panels/bandTypesDraft.ts` (pure rows, parse, refusals, `planBandTypes`)
- Modify: `src/panels/MaterialsDialog.tsx` (props `bandTypes`, `parts`, `projectMaterials`; the section; `SavePlan.bandTypes`)
- Modify: `src/panels/materialsDraft.ts:18` (`SavePlan` gains `bandTypes: BandType[] | null`)
- Modify: `src/App.tsx:1029-1055` (pass the props; `applyMaterials(plan.project, plan.assign ?? undefined, plan.bandTypes ?? undefined)`;
  run it when `plan.bandTypes` is non-null too)
- Test: create `src/panels/bandTypesDraft.test.ts`; append to `src/panels/MaterialsDialog.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface BandRow { id: string; kind: 'tape' | 'solid'; original: BandType | null; draft: Record<string, string>; deleted: boolean }
  export function initialBandRows(types: readonly BandType[]): BandRow[];
  export function newBandRow(kind: 'tape' | 'solid', rows: readonly BandRow[]): BandRow;
  export function bandRowRefusal(r: BandRow, rows: readonly BandRow[], ctx: { parts: readonly Board[]; solids: ReadonlySet<string> }): string | null;
  export function planBandTypes(rows: readonly BandRow[], original: readonly BandType[], ctx: …): BandType[] | null | { refused: string };
  ```
  `draft` keys: `name`, `thickness`, `lengthAllowance`, and `tapeWidth`/`price` or `material`/`widthAllowance`. Lengths
  parse with `parseLength(…, imperialAt(64))` (ruling P1 of metric display: the dialog's sizes stay imperial).

- [ ] **Step 1: Write the failing tests.** `src/panels/bandTypesDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { bandRowRefusal, initialBandRows, newBandRow, planBandTypes } from './bandTypesDraft';
import { BUILT_IN_BAND } from '../document/banding';
import { createBoard } from '../document/document';
import type { BandType } from '../document/types';

const maple: BandType = { id: 'm', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const shelf = { ...createBoard({ id: 'a', name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands: [{ side: { across: 'width', from: 'min' } as const, type: 'm' }] };
const ctx = { parts: [shelf], solids: new Set(['pine', 'oak', 'maple', 'walnut', 'cherry']) };
const original = [BUILT_IN_BAND, maple];

describe('the Edge banding section (edge banding spec §5.2)', () => {
  it('unchanged rows plan nothing', () => expect(planBandTypes(initialBandRows(original), original, ctx)).toBeNull());
  it('an edit plans the whole list, values parsed', () => {
    const rows = initialBandRows(original).map((r) => (r.id === 'm' ? { ...r, draft: { ...r.draft, thickness: '3/8' } } : r));
    expect(planBandTypes(rows, original, ctx)).toEqual([BUILT_IN_BAND, { ...maple, thickness: 0.375 }]);
  });
  it('a new row takes the defaults and a unique name', () => {
    const rows = initialBandRows(original);
    const added = newBandRow('solid', rows);
    expect(added.draft.name).toBe('Solid edging');
    const plan = planBandTypes([...rows, added], original, ctx) as BandType[];
    expect(plan[2]).toMatchObject({ kind: 'solid', thickness: 0.25, material: 'maple' });
  });
  it('refusals: an empty or repeated name, a bad number, a zero solid thickness, a sheet material', () => {
    const rows = initialBandRows(original);
    const m = rows[1]!;
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, name: ' ' } }, rows, ctx)).toBe('Give the band type a name.');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, name: 'Iron-on veneer' } }, rows, ctx)).toBe('Another band type is called "Iron-on veneer".');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, thickness: 'abc' } }, rows, ctx)).toBe('Thickness must be a length.');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, thickness: '0' } }, rows, ctx)).toBe('Solid edging needs a thickness.');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, material: 'plywood' } }, rows, ctx)).toBe('Edging comes from solid wood.');
  });
  it('a deletion is refused while used; the built-in has none', () => {
    const rows = initialBandRows(original);
    expect(bandRowRefusal({ ...rows[1]!, deleted: true }, rows, ctx)).toBe('Used by 1 part — change its bands first.');
  });
  it('an edit that adds a fault to a part is refused, naming it', () => {
    const rows = initialBandRows(original);
    const m = rows[1]!;
    // one 12" band on the 12"-wide shelf's width min side leaves no core
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, thickness: '12' } }, rows, ctx)).toBe('Shelf: leaves no core.');
  });
});
```

  Append to `MaterialsDialog.test.tsx`, in its style: the Edge banding section lists `Iron-on veneer` and a project's
  `Maple edging`; `+ Add band type ▾` → `Solid` adds a row; editing Maple's thickness and Save calls `onSave` with
  `plan.bandTypes` equal to the edited list; Save is disabled with the refusal shown for a zero solid thickness; the
  built-in row has no delete; every band control is disabled when `locked`.

- [ ] **Step 2: Run.** `npx vitest run src/panels/bandTypesDraft.test.ts src/panels/MaterialsDialog.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `bandTypesDraft.ts`: drafts are text (as `materialsDraft.ts`); `fromDraft(row)` parses or returns null;
    `bandRowRefusal` in this order — name empty, name repeated (case-insensitive, among live rows), each number field
    (`Thickness`, `Length allowance`, `Tape width`, `Width allowance` — `must be a length`; `Price` — `Price must be dollars
    or empty`), solid thickness 0, solid material not in `ctx.solids`, a deleted row in use (`Used by N part(s) — change
    its bands first.` counting `ctx.parts` whose bands name it), then the fault rule: replace this row's type in the
    planned list and, for each part, compare `bandFaults` before/after; the first added → `${part.name}: ${bandFaultText}.`.
    `planBandTypes` returns `{ refused }` for the first refusal, null when every live row equals its original and none is
    new or deleted, else the full list in row order (deleted rows out).
  - `MaterialsDialog.tsx`: props `bandTypes: BandType[]`, `parts: Board[]` (the project's world parts), `solids: string[]`
    (built-in solid ids plus `doc.materials`' solid customs, Amended (planning) P4). A `<fieldset>` section after the
    material rows: `<h3>Edge banding</h3>`, one row per band type (name, then `Tape`/`Solid` as text, thickness, length
    allowance, then tape width and price per foot, or a material `<select>` and width allowance); a delete button on every
    row but the built-in; `+ Add band type ▾` (`Popover`: `Tape`, `Solid`). All disabled while `locked`. The dialog's
    existing `valid`/`result` gates include `planBandTypes` (a refusal disables Save and shows the message, the same element
    as the materials' refusal). `save()` puts `bandTypes` on the `SavePlan`.
  - The dialog's footer note becomes: `Your materials and prices are stored in this browser; each project also keeps a copy
    of the materials it uses, and its own band types and tape prices. Undo reverts the project's copies and band types, not
    your library or material prices.` (tape prices live in the document, spec §2.1, so the old sentence would be false).
  - `App.tsx`: pass `bandTypes={doc.bandTypes}`, `parts={worldParts(doc)}`, `solids={…}`; in `onSave` call
    `applyMaterials(plan.project, plan.assign ?? undefined, plan.bandTypes ?? undefined)` when
    `plan.project.length > 0 || plan.assign || plan.bandTypes`, and count `plan.bandTypes !== null` in `projectChanged`.

- [ ] **Step 4: Run.** The Step 2 command → PASS; `npx vitest run src/App.test.tsx` (if present) → PASS.

- [ ] **Step 5: Mutate.** Each must turn a test red; restore after each.
  1. `planBandTypes` returns the list even when unchanged. The unchanged test fails.
  2. Drop the in-use deletion refusal. Its test fails.
  3. Skip the fault rule. The `leaves no core` test fails.

- [ ] **Step 6: Full suite, build, commit.**

```bash
git add src && git commit -m "materials dialog: the Edge banding section, saved in the one project edit (edge banding 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Live pass and the round's docs

**Files:**
- Create: `docs/browser-verification-edge-banding-1.md`
- Modify: `CLAUDE.md`, `docs/follow-ups.md`, `docs/history.md`, the spec (`*Amended (planning)*` P1–P5 in §2.2 and §5.2)

- [ ] **Step 1: Live pass on the dev server** (Playwright MCP; the deployment rule: never production; leave test projects
  in place). `npm run dev -- --port 5180 --host 127.0.0.1`, new project:
  1. Four 30 × 12 × 3/4 plywood shelves; select all; `Band ▾ → Iron-on veneer: long edges`. The cut list: one row of 4,
     `30" × 12"`, the band line, the header note; Buying's Edge banding line reads
     `Iron-on veneer, 7/8" wide: buy 21′ · no price` (8 long edges × 30.5" = 244" = 20.33 ft → 21′).
  2. Materials & prices → `+ Add band type ▾ → Solid`, name `Maple edging 1/4"`, Save. Undo reverts it; redo restores.
  3. A 36 × 20 tabletop: maple on all four sides, Corners `Mitred`. The cut list: core `35-1/2" × 19-1/2"`, four strip rows
     under `Maple — 13/16"` with `Trim flush; mitre both ends 45°`; Buying adds maple board feet.
  4. An arched apron: Curves → Arch on the width min side; then try maple on that side — greyed `— Needs a straight edge`;
     tape is accepted; the tape line grows by the arc's extra length.
  5. Print: Chromium `page.pdf()` via `browser_run_code_unsafe`; the band lines and strip rows print; the Plans sheet shows
     no balloon for strip rows (read the DOM: `[data-number]` values against the cut list's part rows).
  6. Reload: the project reopens with every band (schema 19 round trip).
  Record each step's DOM readout in the verification doc; a screenshot only where a finding is spatial.

- [ ] **Step 2: Docs.**
  - `CLAUDE.md`: Status (edge banding chunk 1 merged, SCHEMA 19, rollback below 19 refuses — export first); a Rounds
    shipped row; Versioning row `18→19`; `CURRENT_VERSION` **19**; a new **invariant 54** (condensed: `banding.ts` is the
    ONE place band numbers are computed; the model is the FINISHED size, the cut list the CORE; a faulted band adds
    nothing; bands are flag-flipped through mirrors; Joinery/Refine/Repair refuse banded projects); invariant 49 amended
    (`pruneMaterials` keeps a band type's material); the file index gains `bandModel.ts` (the model; imports only ids, names, types), `banding.ts`, `bandedRefusal.ts`, `Banding.tsx`,
    `bandingRefusal.ts`, `bandTypesDraft.ts`; Commands' test count.
  - `docs/follow-ups.md`: 267's banding half — chunk 1 done, chunk 2 next; the hardware half stays open. New entries:
    bodies split into core and band (spec §7, open by decision), bands through joinery/Refine/Repair, a browser library of
    band types, corner rules per corner, and any residue the live pass finds.
  - `docs/history.md`: the round's narrative and the live pass's findings.
  - The spec: P1–P5 as *Amended (planning)* blocks where they apply.

- [ ] **Step 3: Full suite and build, commit.** `npm test 2>&1 | tail -4`, `npm run build 2>&1 | tail -3`.

```bash
git add -A docs CLAUDE.md && git commit -m "docs: edge banding chunk 1 — live pass, CLAUDE.md (schema 19, inv 54), follow-ups, history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Merge** (after the final whole-branch review): `git checkout master && git merge --no-ff edge-banding-1`,
  run the full suite and build on the merged tree, delete the branch. Deployment is the user's call (schema 19: a
  rollback below it refuses newer projects).
