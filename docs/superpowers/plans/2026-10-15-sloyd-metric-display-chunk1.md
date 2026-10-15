# Metric Display — Chunk 1 (core and text) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project can switch its lengths to whole millimetres: fields, typing, tape, guides, drag snap, cut list and every
bench line follow the project's `units`; imperial output stays byte-for-byte unchanged.

**Architecture:** `units/length.ts` gains a `Units` type and unit-aware `formatLength`/`parseLength` plus `formatMm`,
`formatLengthBare`, `formatSize`, `floorToTick`; the drag grid `snapStep` sits beside `SNAP_INCHES` in `document/geometry.ts`
(it produces no string, so it must not pull the store or Gizmo into `units` — the `→ units` edge rule). The document's `units.display` admits `'metric-mm'`; a store
action switches it as one edit. Every text-producing caller passes the document's own `units` (approach A, inv 52). During
the conversion `formatLength`/`parseLength` temporarily also accept a plain precision number / no units; Task 6 removes that
so the type checker proves every caller converted. Chunk-2 surfaces (drawings, buying) stay imperial in this chunk, by an
explicit `imperialAt(precision)` the chunk-2 plan replaces.

**Tech Stack:** TypeScript, React, Zustand, Vitest + Testing Library, three.js/r3f (Gizmo only).

**Spec:** `docs/superpowers/specs/2026-10-15-sloyd-metric-display-design.md` (rulings R1–R8). Read it first.

## Global Constraints

- Stored values are inches, always; display rounds; a units switch moves no number (spec §2).
- Metric display: whole mm with ` mm` suffix (`762 mm`, `-38 mm`, `0 mm`); half away from zero after the fraction path's
  relative-epsilon nudge; non-finite → `—` (spec §3).
- Hole diameter and pitch in metric: one decimal unless whole (`6.4 mm`, `32 mm`) (R7).
- Metric parse: a bare decimal is mm; `"`/`in`/`inch`/`inches`, fractions, mixed numbers, feet are inches; `mm` is mm in both
  modes (R4). `canBeginLength` unchanged.
- Free drags snap to 1 mm (`1 / 25.4` in) in metric, 1/16 in imperial (R5); exact moves never rounded (inv 25); Generate's
  and joinery's `SNAP_INCHES` untouched.
- No schema bump (R6): `CURRENT_VERSION` stays 16.
- Imperial output byte-for-byte unchanged: NO existing expectation changes (do not edit an expected value to make a task
  pass — if one fails, the conversion is wrong). Task 6 may change a test's CALL (`formatLength(x, 16)` → `imperialAt(16)`),
  never what it expects.
- `units` imports nothing (layer 1). The `→ units` edge rule stands.
- No pull requests: branch `metric-1`, merged locally with `--no-ff`. `npm run build` is the typecheck gate.

**Rulings in this plan, to confirm at plan review** (they narrow the spec's chunk-1 list):
- **P1 Materials dialog sheet sizes stay imperial.** The spec's §4 lists "Materials dialog sizes", but a material's sheet
  size is a trade dimension (4×8), which R3 keeps in trade units, and the material library is browser-level, not
  per-project. They keep `formatLength(v, 64)` via an explicit `imperialAt(64)`.
- **P2 Generate's size limits stay imperial-by-default.** Generate makes new (imperial) projects and its prompt stays in
  inches (spec non-goal); its limit field parses imperial (a typed `600mm` still works).

## Review Focus

1. **A metric user types `3/4` or `1-1/2"`:** stored as inches exactly, field then shows `19 mm` / `38 mm` → Task 4 test
   "a fraction typed in a metric field commits inches".
2. **A focused metric field blurred untouched after an external change** (inv 5): must not commit a rounded value → Task 4
   test "untouched blur commits nothing in metric".
3. **Switching in → mm → in:** no stored number changes, one undo entry per switch, undo restores the display → Task 2 test.
4. **A drag in a metric project** lands on whole mm, a typed position stays exact (inv 25) → Task 5 tests on `moveGroupTo`
   and the snap helper.
5. **The taper-advice limit in metric** is floored to whole mm (never rounded up, or the advice is refused again) → Task 3
   test.

---

## File structure

| File | Change |
|---|---|
| `src/units/length.ts` (+ `length.test.ts`) | `Units`, `LengthDisplay`, `IMPERIAL`, `imperialAt`, unit-aware `formatLength`/`parseLength`, `formatMm`, `formatLengthBare`, `formatSize`, `snapStep`, `floorToTick` |
| `src/document/types.ts`, `document.ts` | `units.display` union; validation keeps `'metric-mm'` |
| `src/store/store.ts` (+ new `store.units.test.ts`) | `setUnitsDisplay`; drag snap via `snapStep` |
| `src/document/cutlist.ts`, `angleText.ts`, `holeText.ts`, `angledRefusal.ts`, `designDiff.ts` | take/pass `Units` |
| `src/document/diagram.ts`, `dimensions.ts`, `nesting.ts`, `purchase.ts`, `src/units/nominal.ts` | explicit `imperialAt(precision)` until chunk 2 |
| `src/panels/DimensionField.tsx` and every user; `Holes.tsx`, `CopyInRow.tsx`, `GuidesList.tsx`, `Properties.tsx`, `JoineryDialog.tsx`, `TapeReadout.tsx`, `AngleField.tsx`, `CountField.tsx`, `GenerateDialog.tsx`, `MaterialsDialog.tsx`, `materialsDraft.ts` | units-aware |
| `src/viewport/TapeTool.tsx`, `Gizmo.tsx` | parse with units; snap step |
| Create `src/panels/UnitsSwitch.tsx` (+ test); modify `Toolbar.tsx` | the switch |

---

### Task 0: Branch

- [ ] `cd /home/alec/docker/sloyd && git checkout -b metric-1`

### Task 1: Units core (`units/length.ts`)

**Files:** Modify `src/units/length.ts`; Test `src/units/length.test.ts` (append).

**Interfaces — Produces:**
```ts
export type LengthDisplay = 'imperial-fractional' | 'metric-mm';
export interface Units { display: LengthDisplay; precision: number }
export const IMPERIAL: Units;                                  // { display: 'imperial-fractional', precision: 16 }
export function imperialAt(precision: number): Units;
export function formatLength(inches: number, units?: Units | number): string;   // number = imperial at that precision (TEMPORARY, removed in Task 6)
export function formatMm(inches: number, decimals: 0 | 1): string;              // '6.4 mm', '32 mm', '—'
export function formatLengthBare(inches: number, units: Units): string;         // metric '762', imperial === formatLength
export function formatSize(values: readonly number[], units: Units): string;    // imperial 'a × b' (each with ″); metric '762 × 140 mm'
export function parseLength(input: string, units?: Units): number | null;       // undefined = imperial (TEMPORARY until Task 6)
export function floorToTick(inches: number, units: Units): number;              // floor to the display grid (1/precision in, or 1 mm)
```

- [ ] **Step 1: Write the failing tests** (append to `length.test.ts`; import the new names)

```ts
import { formatLength, formatLengthBare, formatMm, formatSize, floorToTick, IMPERIAL, imperialAt, parseLength, type Units } from './length';

const MM: Units = { display: 'metric-mm', precision: 16 };
const inch = (mm: number) => mm / 25.4;

describe('formatLength — metric', () => {
  it.each([
    [inch(762), '762 mm'], [inch(19), '19 mm'], [inch(-38), '-38 mm'], [0, '0 mm'], [-0, '0 mm'],
    [inch(18.4999), '18 mm'], [inch(18.5), '19 mm'], [inch(-18.5), '-19 mm'], [inch(0.4), '0 mm'], [inch(-0.4), '0 mm'],
    [0.75, '19 mm'], [24, '610 mm'], [1.5, '38 mm'],
  ])('%s in → %s', (v, s) => expect(formatLength(v, MM)).toBe(s));
  it('non-finite → —', () => {
    expect(formatLength(NaN, MM)).toBe('—');
    expect(formatLength(Infinity, MM)).toBe('—');
  });
  it('ignores precision', () => expect(formatLength(0.75, { ...MM, precision: 64 })).toBe('19 mm'));
});

describe('formatLength — imperial is unchanged', () => {
  // Literal strings, not old-vs-new: Task 6 removes the number overload, and a self-comparison could not fail.
  it.each([[0.75, 16, '3/4"'], [1.5, 16, '1-1/2"'], [-2.0625, 16, '-2-1/16"'], [23.47, 64, '23-15/32"'], [0, 16, '0"'],
    [-0.001, 16, '-0"'], [NaN, 16, '—']] as const)('%s @%s → %s', (v, p, s) => {
    expect(formatLength(v, imperialAt(p))).toBe(s);
  });
  it('IMPERIAL is 1/16', () => expect(formatLength(0.6, IMPERIAL)).toBe('5/8"'));
});

describe('formatMm', () => {
  it.each([
    [0.25, 1, '6.4 mm'], [inch(32), 1, '32 mm'], [inch(35), 1, '35 mm'], [inch(5), 1, '5 mm'], [0.25, 0, '6 mm'],
    [inch(-6.35), 1, '-6.4 mm'], [0, 1, '0 mm'], [NaN, 1, '—'],
  ] as const)('%s, %s dp → %s', (v, d, s) => expect(formatMm(v, d)).toBe(s));
});

describe('formatLengthBare / formatSize', () => {
  it('metric bare is the number alone', () => expect(formatLengthBare(inch(762), MM)).toBe('762'));
  it('imperial bare keeps the mark', () => expect(formatLengthBare(0.75, IMPERIAL)).toBe('3/4"'));
  it('a metric size writes the unit once', () => expect(formatSize([30, 5.5, 0.75], MM)).toBe('762 × 140 × 19 mm'));
  it('an imperial size is the old join', () => expect(formatSize([30, 5.5], IMPERIAL)).toBe('30" × 5-1/2"'));
});

describe('parseLength — metric', () => {
  it.each([
    ['19', inch(19)], ['19.5', inch(19.5)], ['-38', inch(-38)], ['.5', inch(0.5)], ['19mm', inch(19)], ['19 mm', inch(19)],
    ['3/4', 0.75], ['1-1/2', 1.5], ['1 1/2', 1.5], ['19"', 19], ['19 in', 19], ['2\'', 24], ['2\'6"', 30], ['-3/4', -0.75],
  ])('%s', (t, v) => expect(parseLength(t, MM)).toBeCloseTo(v, 12));
  it.each(['', 'abc', '1/0', '19 cm', 'mm'])('junk %s → null', (t) => expect(parseLength(t, MM)).toBeNull());
  it('a bare number is still inches in imperial', () => expect(parseLength('19', IMPERIAL)).toBe(19));
  it('mm in imperial is mm', () => expect(parseLength('19mm', IMPERIAL)).toBeCloseTo(inch(19), 12));
  it('round trip within half a mm', () => {
    for (let mm = -500; mm <= 3000; mm += 7.3) {
      const back = parseLength(formatLength(inch(mm), MM).replace(' mm', ''), MM)!;
      expect(Math.abs(back * 25.4 - mm)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});

describe('floorToTick', () => {
  it('floors to the display grid, never up', () => {
    expect(floorToTick(23.47, IMPERIAL)).toBe(Math.floor(23.47 * 16 + 1e-9) / 16);
    expect(formatLength(floorToTick(inch(596.9), MM), MM)).toBe('596 mm');
    expect(floorToTick(inch(596), MM) * 25.4).toBeCloseTo(596, 9);   // exactly on a tick stays
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/units/length.test.ts` — FAIL (missing exports).

- [ ] **Step 3: Implement** in `src/units/length.ts`:

```ts
export type LengthDisplay = 'imperial-fractional' | 'metric-mm';
/** A document's length units (metric-display spec §2). `precision` is the imperial fraction denominator; a metric
 *  project keeps it (ignored for display) so switching back restores it. */
export interface Units { display: LengthDisplay; precision: number }
export const IMPERIAL: Units = Object.freeze({ display: 'imperial-fractional', precision: 16 }) as Units;
export const imperialAt = (precision: number): Units => ({ display: 'imperial-fractional', precision });
const isMetric = (u: Units) => u.display === 'metric-mm';
```

Rename today's `formatLength(inches, precision = 16)` body to a private `formatFraction(inches, precision)` (unchanged
text), then:

```ts
/** Decimal millimetres for `inches`, rounded half away from zero at `decimals` places after the same relative-epsilon
 *  nudge the fraction path uses; a zero result has no sign. */
function mmNumber(inches: number, decimals: 0 | 1): string {
  const mm = inches * MM_PER_INCH;
  const f = decimals === 1 ? 10 : 1;
  const ticks = Math.round(Math.abs(mm) * f * (1 + Number.EPSILON) + Number.EPSILON);
  if (ticks === 0) return '0';
  const sign = mm < 0 ? '-' : '';
  return decimals === 1 && ticks % 10 !== 0 ? `${sign}${(ticks / 10).toFixed(1)}` : `${sign}${decimals === 1 ? ticks / 10 : ticks}`;
}

/** Hole diameters and pitches in a metric project (spec R7): one decimal unless a whole mm. */
export function formatMm(inches: number, decimals: 0 | 1): string {
  return Number.isFinite(inches) ? `${mmNumber(inches, decimals)} mm` : '—';
}

/**
 * THE length formatter (inv 52). Imperial: shop fractions reduced at `units.precision` — byte-for-byte today's output.
 * Metric: whole millimetres. A plain number is TEMPORARY (imperial at that precision) until every caller passes Units.
 */
export function formatLength(inches: number, units: Units | number = 16): string {
  const u = typeof units === 'number' ? imperialAt(units) : units;
  return isMetric(u) ? formatMm(inches, 0) : formatFraction(inches, u.precision);
}

/** A drawing's dimension (spec R8): metric drops the unit (the sheet carries one note); imperial keeps its mark. */
export function formatLengthBare(inches: number, units: Units): string {
  if (!isMetric(units)) return formatFraction(inches, units.precision);
  return Number.isFinite(inches) ? mmNumber(inches, 0) : '—';
}

/** A size (`L × W [× T]`): imperial each with its mark, as the cut list wrote it; metric the unit once. */
export function formatSize(values: readonly number[], units: Units): string {
  if (!isMetric(units)) return values.map((v) => formatFraction(v, units.precision)).join(' × ');
  return `${values.map((v) => formatLengthBare(v, units)).join(' × ')} mm`;
}

/** Floor to the display grid — a LIMIT is floored, never rounded (fu 309's advice): 1/precision inch, or 1 mm. The 1e-9
 *  is float noise (inv 22). */
export function floorToTick(inches: number, units: Units): number {
  return isMetric(units)
    ? Math.floor(inches * MM_PER_INCH + 1e-9) / MM_PER_INCH
    : Math.floor(inches * units.precision + 1e-9) / units.precision;
}
```

`parseLength(input, units?)`: after the `MM_RE` check and before the sign strip, add:

```ts
  // A bare number in a metric project is millimetres (spec R4); marks, fractions and feet fall through to inches.
  if (units && isMetric(units) && BARE_RE.test(rest)) return Number(rest) / MM_PER_INCH;
```
with `const BARE_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;` beside the other patterns. Update `parseLength`'s doc comment: the grammar
is the same in both modes except a bare number's unit.

- [ ] **Step 4: Run** the file — PASS. Run `npx vitest run src/units` — all PASS (existing tests unchanged).
- [ ] **Step 5: Mutate.** Drop the `(1 + Number.EPSILON)` nudge in `mmNumber` → the `18.5 → 19 mm` case or the round-trip
  must fail (if neither does, add `[inch(2.5), '3 mm']` and re-run); remove the `BARE_RE` branch → the metric bare cases fail;
  swap `floorToTick`'s `Math.floor` for `Math.round` → the `596.9 → 596 mm` case fails. Revert each.
- [ ] **Step 6: Commit** — `git add src/units && git commit -m "feat(units): Units, metric format/parse, tick floor"`

### Task 2: Document model and the switch action

**Files:** Modify `src/document/types.ts:233`, `src/document/document.ts` (~line 753 and 807), `src/store/store.ts`;
Create `src/store/store.units.test.ts`; Test additions in `src/document/document.test.ts`.

**Interfaces:** Consumes `Units` (Task 1). Produces `SloydDocument.units: Units`; store `setUnitsDisplay(display: LengthDisplay): void`.

- [ ] **Step 1: Failing tests**

```ts
// src/store/store.units.test.ts
import { useStore } from './store';
import { createDocument, worldParts } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('units switch', () => {
  it('a new project is imperial at 1/16', () => {
    expect(s().doc.units).toEqual({ display: 'imperial-fractional', precision: 16 });
  });
  it('switches as one edit, moves no number, and undoes', () => {
    s().addBoard();
    const before = JSON.stringify(worldParts(s().doc));
    const past = s().past.length;
    s().setUnitsDisplay('metric-mm');
    expect(s().doc.units).toEqual({ display: 'metric-mm', precision: 16 });
    expect(s().past.length).toBe(past + 1);
    expect(JSON.stringify(worldParts(s().doc))).toBe(before);
    s().setUnitsDisplay('imperial-fractional');
    expect(JSON.stringify(worldParts(s().doc))).toBe(before);
    s().undo();
    expect(s().doc.units.display).toBe('metric-mm');
  });
  it('setting the current display pushes no undo entry', () => {
    const past = s().past.length;
    s().setUnitsDisplay('imperial-fractional');
    expect(s().past.length).toBe(past);
  });
  it('is refused while exploded (inv 47)', () => {
    s().addBoard();
    s().setExplode(0.5);
    s().setUnitsDisplay('metric-mm');
    expect(s().doc.units.display).toBe('imperial-fractional');
  });
});
```

And in `src/document/document.test.ts` (inside a new `describe('units on load')`):

```ts
it('keeps metric on load and falls back on an unknown display', () => {
  const base = createDocument('U');
  expect(migrateDocument({ ...base, units: { display: 'metric-mm', precision: 32 } }).units).toEqual({ display: 'metric-mm', precision: 32 });
  expect(migrateDocument({ ...base, units: { display: 'furlongs', precision: 16 } }).units).toEqual({ display: 'imperial-fractional', precision: 16 });
  expect(migrateDocument({ ...base, units: undefined }).units).toEqual({ display: 'imperial-fractional', precision: 16 });
});
```
(Use the module's existing load entry if `migrateDocument` takes `unknown` — read its signature; if it refuses a doc with
no `version`, keep `base`'s version as the spread does.)

- [ ] **Step 2: Run** both files — FAIL.
- [ ] **Step 3: Implement**
  - `types.ts:233`: `units: Units;` with `import type { Units } from '../units/length';` — check `document` importing a
    TYPE from `units` is allowed (it is layer 1); `createDocument` stays `{ display: 'imperial-fractional', precision: 16 }`.
  - `document.ts` validation (~753–807): compute `const display = units?.display === 'metric-mm' ? 'metric-mm' : 'imperial-fractional';`
    and write `units: { display, precision }`. Comment: "no schema step (spec R6): an older build reads metric as imperial".
  - `store.ts`: declare beside `setDocumentName`:
    ```ts
    /** The project's length display (metric-display spec §2, R1): one document edit, moves no number. A no-op when unchanged. */
    setUnitsDisplay: (display: LengthDisplay) => void;
    ```
    implement:
    ```ts
    setUnitsDisplay: (display) => {
      if (get().doc.units.display === display) return;
      edit((doc) => ({ ...doc, units: { ...doc.units, display } }));
    },
    ```
    (`edit` already refuses while exploded and pushes one undo entry — confirm by reading it.)
- [ ] **Step 4: Run** the two files and `npx vitest run src/store src/document` — PASS.
- [ ] **Step 5: Mutate.** Make validation always write imperial → the load test fails; drop the no-op guard → the "no undo
  entry" test fails. Revert.
- [ ] **Step 6: Commit** — `git commit -am "feat(units): metric-mm display on the document; setUnitsDisplay"` (add the new test file).

### Task 3: Document text modules

**Files:** Modify `src/document/cutlist.ts`, `angleText.ts`, `holeText.ts`, `angledRefusal.ts`, `designDiff.ts`; and the
chunk-2 holders `diagram.ts`, `dimensions.ts`, `nesting.ts`, `purchase.ts`, `src/units/nominal.ts`. Tests: the matching
`*.test.ts` (append).

**Interfaces:** Consumes Task 1's API and `doc.units: Units`. Produces:
- `angleLine(board, c, units: Units)`, `shortPointLine(board, units: Units)`, `holeLine(board, r, units: Units)` (the
  `precision: number` parameters become `units: Units`; all callers updated).
- `cutlist.ts` internals take `units`; `CutListRow.dims` = `formatSize([length, width], units)`; group label
  `${label} — ${formatLength(thickness, units)}`.

Rules for this task:
- Every `formatLength(n, precision)` in these five modules becomes `formatLength(n, units)` with `units` from the document
  (`doc.units` / `flat.units` / `after.units`).
- `holeText.ts`: in metric, diameter and pitch use `formatMm(v, 1)` and the ` (N mm)` aside is dropped (it says the same
  thing twice); every other length uses `formatLength(n, units)`. Imperial: exactly today's text (pitch at
  `Math.max(precision, 64)`, the aside kept).
- `angledRefusal.ts`: `const limit = floorToTick(nearest, flat.units)` replaces the `p` arithmetic; `formatLength(limit,
  flat.units)`. The "limit === 0" test is unchanged.
- **Chunk-2 holders stay imperial, explicitly:** in `diagram.ts`' own length labels (`f` at ~129), `dimensions.ts`,
  `nesting.ts`' `formatDims`, `purchase.ts`, and `nominal.ts`' `stockLengthText`, replace `formatLength(n, precision)` with
  `formatLength(n, imperialAt(precision))` and add once per file: `// Imperial until metric chunk 2 (drawings/buying, spec §4).`
  `diagram.ts`' calls to `angleLine`/`holeLine` (the bench NOTES) pass the document's real `units` — notes are text
  (chunk 1). Read how `buildDiagrams` receives precision; pass `units` alongside it.

- [ ] **Step 1: Failing tests** (append; use the existing fixtures in each test file — read the file's helpers first):

```ts
// cutlist.test.ts
it('a metric project: rows, label and lines in whole mm', () => {
  const doc = { ...createDocument('M'), units: { display: 'metric-mm' as const, precision: 16 },
    boards: [createBoard({ name: 'Side', length: 30, width: 11.25, thickness: 0.75 })] };
  const list = buildCutList(doc);
  expect(list.groups[0]!.label).toMatch(/— 19 mm$/);
  expect(list.groups[0]!.rows[0]!.dims).toBe('762 × 286 mm');
});
it('metric collapses at whole mm (inv 18): 24" and 24.01" share a row', () => {
  const doc = { ...createDocument('M'), units: { display: 'metric-mm' as const, precision: 16 },
    boards: [createBoard({ length: 24 }), createBoard({ length: 24.01 })] };
  expect(buildCutList(doc).groups[0]!.rows).toHaveLength(1);
});

// holeText.test.ts
const MM = { display: 'metric-mm' as const, precision: 16 };
it('metric: diameter and pitch to 0.1 mm, positions whole mm, no aside', () => {
  const b = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
  const r = { id: 'r', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
    alongFrom: 'min' as const, station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min' as const, inset: 1.5 };
  const line = holeLine(b, r, MM);
  expect(line).toContain('6.4 mm dia × 10 mm deep');
  expect(line).toContain('every 32 mm');
  expect(line).toContain('first 51 mm');
  expect(line).not.toContain('(32 mm)');
});

// angledRefusal.test.ts (or wherever taperJointRefusal is tested): reuse its fixture with units metric
it('metric advice is floored to whole mm', () => {
  // build the existing conflict fixture, set flat.units = MM, nearest = 596.9 mm / 25.4
  // expect the message to contain 'start it at 596 mm or less'
});
```

For the last test, the implementer copies the module's existing taper-refusal fixture (read the test file), sets
`units: { display: 'metric-mm', precision: 16 }` on the flat document and `nearest` to `596.9 / 25.4`, and asserts
`start it at 596 mm or less`. Also add one metric case each for `angleLine` (a taper: lengths in mm, angle in degrees
unchanged) and `diffDesigns` (a length change reads in mm), modelled on the nearest existing case in those test files.

- [ ] **Step 2: Run** the touched test files — the new cases FAIL.
- [ ] **Step 3: Implement** per the rules above. Update every caller of `angleLine`/`shortPointLine`/`holeLine` (grep them:
  `cutlist.ts`, `diagram.ts`, `Properties.tsx`/`Holes.tsx`/`AngleCuts.tsx` if they call them — pass the store's
  `doc.units`).
- [ ] **Step 4: Run** `npx vitest run src/document src/panels` — PASS with every pre-existing expectation untouched; `npm run build` clean.
- [ ] **Step 5: Mutate.** Pass `IMPERIAL` instead of `units` into `holeLineBase` → the metric hole test fails; use
  `Math.round` in `floorToTick`'s caller path (e.g. `Math.round(nearest*25.4)/25.4`) → the advice test fails. Revert.
- [ ] **Step 6: Commit** — `git commit -am "feat(units): cut list, bench lines, refusals and the change list in the project's units"`

### Task 4: Fields, tape, guides, dialogs

**Files:** Modify `src/panels/DimensionField.tsx` and its users (`Properties.tsx`, `AngleCuts.tsx`, `AngleField.tsx`,
`CountField.tsx`, `CopyInRow.tsx`, `Holes.tsx`, `ViewportControls.tsx`), `GuidesList.tsx`, `TapeReadout.tsx`,
`JoineryDialog.tsx`, `GenerateDialog.tsx`, `MaterialsDialog.tsx`, `materialsDraft.ts`, `src/viewport/TapeTool.tsx`.
Tests: `DimensionField.test.tsx`, `Properties.test.tsx`, `Holes.test.tsx`, `GuidesList.test.tsx` (append).

**Interfaces:** `DimensionField`'s `precision?: number` prop is REPLACED by `units: Units` (required). Default format
`formatLength(v, units)`, default parse `parseLength(t, units)`. Callers pass the store's `doc.units`
(`useStore((s) => s.doc.units)`).

Rules:
- `AngleField` and `CountField` supply their own `parse`/`format`; they pass `units={IMPERIAL}` with the comment
  `// unused: parse and format are supplied`.
- `Holes.tsx`: Diameter and Every (pitch) pass `format` = metric ? `(v) => formatMm(v, 1)` : imperial at `units.precision`
  (Diameter) / `Math.max(units.precision, 64)` (Every) — exactly today's imperial precisions. Parse is the default.
- `TapeReadout.tsx:142`, `TapeTool.tsx:326`: `parseLength(text, units)`; `TapeReadout.tsx:170`: `formatLength(measured, units)`.
- `GuidesList.tsx`, `CopyInRow.tsx`, `Properties.tsx:185` aria-label, `JoineryDialog.tsx:81,123`: `formatLength(n, units)`
  with the project's units (JoineryDialog: the store's `doc.units`).
- `ViewportControls.tsx`' Section Position field: `units={doc units}`.
- Ruling P1: `MaterialsDialog.tsx:48` and `materialsDraft.ts:20` use `formatLength(v, imperialAt(64))`; `materialsDraft.ts:57`
  `parseLength(t, IMPERIAL)`. Ruling P2: `GenerateDialog.tsx:25` `parseLength(text, IMPERIAL)`. Each with a one-line comment
  citing the ruling.

- [ ] **Step 1: Failing tests**

```tsx
// DimensionField.test.tsx
const MM = { display: 'metric-mm' as const, precision: 16 };
it('metric: shows mm and reads a bare number as mm', async () => {
  const onCommit = vi.fn();
  render(<DimensionField label="Length" value={30} units={MM} onCommit={onCommit} />);
  const f = screen.getByLabelText('Length') as HTMLInputElement;
  expect(f.value).toBe('762 mm');
  await userEvent.clear(f); await userEvent.type(f, '600{Enter}');
  expect(onCommit).toHaveBeenCalledWith(600 / 25.4);
});
it('a fraction typed in a metric field commits inches', async () => {
  const onCommit = vi.fn();
  render(<DimensionField label="T" value={1} units={MM} onCommit={onCommit} />);
  const f = screen.getByLabelText('T');
  await userEvent.clear(f); await userEvent.type(f, '3/4{Enter}');
  expect(onCommit).toHaveBeenCalledWith(0.75);
});
it('untouched blur commits nothing in metric', async () => {
  const onCommit = vi.fn();
  const { rerender } = render(<DimensionField label="W" value={5.5} units={MM} onCommit={onCommit} />);
  const f = screen.getByLabelText('W');
  f.focus();
  rerender(<DimensionField label="W" value={5.51} units={MM} onCommit={onCommit} />);
  f.blur();
  expect(onCommit).not.toHaveBeenCalled();
});
it('min/max messages read in mm', async () => {
  render(<DimensionField label="P" value={1} units={MM} max={2} onCommit={() => {}} />);
  const f = screen.getByLabelText('P');
  await userEvent.clear(f); await userEvent.type(f, '100{Enter}');
  expect(screen.getByRole('alert').textContent).toContain('51 mm');
});
```
(Read the existing refusal message format in `DimensionField.tsx` to confirm the max message prints the formatted max; adapt
the selector if the error is not `role="alert"`.)

Plus, in `Properties.test.tsx`: with the store's document switched to metric (`setUnitsDisplay('metric-mm')`) and one part
selected, the Length field shows `610 mm` for the default 24" board; in `Holes.test.tsx`: a metric shelf-pin row's Every
field shows `32 mm` and Diameter `6.4 mm`; in `GuidesList.test.tsx`: a guide at `[0, 0, 0.75]` lists `0 mm, 0 mm, 19 mm`.

- [ ] **Step 2: Run** the four files — FAIL (unknown prop / imperial text).
- [ ] **Step 3: Implement** per the rules; `npm run build` must be clean (the required `units` prop forces every caller).
- [ ] **Step 4: Run** `npx vitest run src/panels src/viewport` — PASS, pre-existing expectations untouched.
- [ ] **Step 5: Mutate.** Make DimensionField's default parse ignore `units` → the bare-mm test fails; in Holes pass the
  imperial format in metric → the hole field test fails. Revert.
- [ ] **Step 6: Commit** — `git commit -am "feat(units): fields, tape, guides and dialogs in the project's units"`

### Task 5: The Units switch and drag snap

**Files:** Create `src/panels/UnitsSwitch.tsx`, `src/panels/UnitsSwitch.test.tsx`; Modify `src/panels/Toolbar.tsx` (after
the ProjectMenu block, before the first `toolbar-divider`), `src/styles.css` (only if the segmented control needs spacing —
reuse `.segmented`), `src/viewport/Gizmo.tsx:11,387-389,411`, `src/store/store.ts:~1059`. Test: append to `store.units.test.ts`.

- [ ] **Step 1: Failing tests**

```tsx
// UnitsSwitch.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { UnitsSwitch } from './UnitsSwitch';

beforeEach(() => useStore.getState().replaceDocument(createDocument('T')));
it('shows the project units and switches them', async () => {
  render(<UnitsSwitch />);
  const group = screen.getByRole('group', { name: 'Units' });
  expect(screen.getByRole('button', { name: 'in' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'mm' }));
  expect(useStore.getState().doc.units.display).toBe('metric-mm');
  expect(screen.getByRole('button', { name: 'mm' })).toHaveAttribute('aria-pressed', 'true');
  expect(group).toBeInTheDocument();
});
it('is disabled while exploded', () => {
  useStore.getState().addBoard();
  useStore.getState().setExplode(0.5);
  render(<UnitsSwitch />);
  expect(screen.getByRole('button', { name: 'mm' })).toBeDisabled();
});
```

```ts
// store.units.test.ts (append)
it('a group move snaps the min corner to whole mm in metric, 1/16 in imperial', () => {
  s().addBoard(); s().addBoard();
  const ids = worldParts(s().doc).map((b) => b.id);
  s().setUnitsDisplay('metric-mm');
  s().moveGroupTo(ids, [10.3, 0, 0]);       // read moveGroupTo's real signature first; adapt the call
  const minX = Math.min(...worldParts(s().doc).map((b) => b.position[0]));
  expect(minX * 25.4).toBeCloseTo(Math.round(10.3 * 25.4), 9);
  s().setUnitsDisplay('imperial-fractional');
  s().moveGroupTo(ids, [10.3, 0, 0]);
  expect(Math.min(...worldParts(s().doc).map((b) => b.position[0]))).toBe(Math.round(10.3 * 16) / 16);
});
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**

```tsx
// src/panels/UnitsSwitch.tsx
import { useStore } from '../store/store';
import { EXPLODED_TITLE } from './ViewportControls';

/** The project's length units (metric-display spec R1): a document edit, so it undoes and is locked while exploded. */
export function UnitsSwitch() {
  const display = useStore((s) => s.doc.units.display);
  const exploded = useStore((s) => s.explode > 0);
  const set = useStore((s) => s.setUnitsDisplay);
  const title = exploded ? EXPLODED_TITLE : undefined;
  return (
    <div className="segmented" role="group" aria-label="Units" title={title ?? 'Show and type lengths in inches or millimetres'}>
      <button aria-pressed={display === 'imperial-fractional'} disabled={exploded} onClick={() => set('imperial-fractional')}>in</button>
      <button aria-pressed={display === 'metric-mm'} disabled={exploded} onClick={() => set('metric-mm')}>mm</button>
    </div>
  );
}
```
Mount `<UnitsSwitch />` in `Toolbar.tsx` right after the `{libraryAvailable && (<ProjectMenu …/>)}` block.
Drag snap — `snapStep` lives in `src/document/geometry.ts` beside `SNAP_INCHES` (type-only import of `Units`; the edge
rule counts a type-only import as no edge — say so in inv 52's record):
```ts
/** The FREE-drag grid (metric-display spec R5): 1/16" or 1 mm. Exact moves are never rounded to it (inv 25); Generate and
 *  joinery keep SNAP_INCHES. Here, not in units/, because it produces no string (the → units edge rule). */
export const snapStep = (units: Units): number => (units.display === 'metric-mm' ? 1 / 25.4 : SNAP_INCHES);
```
with a test in `geometry.test.ts`: `snapStep({display:'imperial-fractional',precision:16})` is `1/16` and the metric one `1/25.4`.
`store.ts` moveGroupTo — `const step = snapStep(get().doc.units); const snap = (v: number) => Math.round(v / step) * step;`.
`Gizmo.tsx`: read `const units = useStore((s) => s.doc.units)`; `translationSnap={snapStep(units)}`; replace the module-level
`snap` with one built from `snapStep(units)` inside the component (keep the comment about why the corner is snapped).
Note for the metric grid: the drag rounding `Math.round(v / (1/25.4)) * (1/25.4)` gives whole mm within float noise —
the test uses `toBeCloseTo` on mm for that reason; the imperial assertion stays exact.

- [ ] **Step 4: Run** `npx vitest run src/panels src/store` — PASS; `npm run build` clean.
- [ ] **Step 5: Mutate.** Use `SNAP_INCHES` in moveGroupTo again → the metric snap test fails. Revert.
- [ ] **Step 6: Commit** — `git commit -am "feat(units): the Units switch; free drags snap to 1 mm in metric"` (add new files).

### Task 6: Close the temporary overloads

**Files:** `src/units/length.ts` and any caller the compiler names.

- [ ] **Step 1:** Change `formatLength(inches: number, units: Units | number = 16)` to `formatLength(inches: number, units: Units)`
  and `parseLength(input: string, units?: Units)` to `parseLength(input: string, units: Units)`. Delete the number branch.
- [ ] **Step 2:** `npm run build`. Every error is a caller not yet converted: convert it with the project's units, or — only
  for a surface this plan names as imperial (chunk-2 holders, P1, P2) — `imperialAt(precision)`/`IMPERIAL`. Tests calling
  `formatLength(x)` / `formatLength(x, 16)` / `parseLength(t)` get `IMPERIAL` / `imperialAt(16)` (that changes the call,
  not the expectation).
- [ ] **Step 3:** `npm run build && npm test` — clean, all PASS.
- [ ] **Step 4:** `grep -rn "formatLength(\|parseLength(" src --include=*.ts --include=*.tsx | grep -v test | grep -v "units\|imperialAt\|IMPERIAL\|MM\b"`
  — read every remaining hit and confirm it passes a `Units`.
- [ ] **Step 5: Ad-hoc length text.** Inv 52 claims every person-facing length goes through `units/length.ts`; prove it.
  Run `grep -rnE '\$\{[^}]+\}("|in\b|″|mm\b)|toFixed\(' src --include=*.ts --include=*.tsx | grep -v '\.test\.'` and classify
  every hit in the report: model-facing (Generate/Refine prompts and design text — stays inches, spec non-goal),
  person-facing length (convert with the project's units in this task), or not a length (degrees, money, board feet,
  counts). List each person-facing exception you keep and why.
- [ ] **Step 6: Commit** — `git commit -am "refactor(units): every length formatter and parser takes Units (inv 52)"`

### Task 7: Live check, records, merge

- [ ] **Step 0:** Watch a gizmo drag of a 3/4" part in metric for hopping: TransformControls snaps the CENTRE to 1 mm and
  `commit` snaps the CORNER to 1 mm — the two grids sit 0.525 mm apart for a 19.05 mm part.
- [ ] **Step 1:** `npm run dev -- --port 5181 --strictPort`; Playwright, the user watching. Never `localStorage.clear()` on
  the dev origin; delete only what this check creates.
- [ ] **Step 2: Check** (record in `docs/browser-verification-metric-display.md`): a new test project; Units → mm; add a
  board: Properties shows `610 mm × 140 mm × 19 mm`; type `600` → 600 mm; type `3/4` in Thickness → `19 mm`; drag with the
  gizmo → Position reads whole mm; Tape: measure, type `250` → a guide 250 mm away; Guides footer lists mm; add a shelf-pin
  row → `6.4 mm` / `32 mm`; Cut list rows in mm, bench lines in mm (the part-diagram and nesting labels and the Plans sheet stay imperial until chunk 2 — see the deploy gate below); undo the
  switch → inches; reload → the project keeps mm. Delete the test project; confirm the profile's keys are as before.
- [ ] **Step 3: Records.** `CLAUDE.md`: invariant 52 (spec §5), inv 18/19/25 and the `→ units` rule restated to name
  `Units`, "Where things live" for `units/length.ts` and `UnitsSwitch.tsx`; `docs/follow-ups.md` (next free number after
  352): chunk 2 owed, P1/P2 rulings, residue; `docs/history.md` entry; `docs/feature-gaps.md` Metric display row
  ("chunk 1 …").
- [ ] **Step 4:** Final review, then on the user's word: `git checkout master && git merge --no-ff metric-1 && npm run build
  && npm test && git branch -d metric-1`. **Deploy gate:** chunk 1 is not deployed alone — a metric cut list would print mm rows beside imperial diagram labels on
  one sheet. It merges; it deploys with chunk 2 (the user's call at plan review; see the hand-off). No schema change.
