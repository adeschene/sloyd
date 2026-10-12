# Angle cuts, chunk 2 (Miter preset) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user can add and edit miters by hand — one end, or both ends in one action — in shop terms (end,
across width or thickness, angle, long-point side), from a "+ Add ▾" menu that also offers Taper.

**Architecture:** Chunk 1 already draws, edges, snaps, prints, mirrors and short-points any `AngleCut`; a miter is
`face: 'length'`. This chunk adds only authoring: field conversions in `angleCuts.ts`, an angle input (DimensionField
generalised by a parse/format pair, so the draft/refuse/commit rules — invariant 5 — are not duplicated), a Miter row in
`AngleCuts.tsx` and the "+ Add ▾" Popover. No schema change.

**Tech Stack:** TypeScript, React, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-sloyd-angle-cuts-design.md` §7 (Miter controls, both ends), §9 chunk 2,
with its *Amended* notes (the "+ Add ▾" menu arrives in chunk 2; the short point's corner-minimum formula, 2026-10-12).

## Global Constraints

- Work on a local branch `angle-cuts-2`; merge with `git merge --no-ff` into `master`; no pull requests.
- **No schema change.** `CURRENT_VERSION` stays 14.
- **45° is stored as depth = run, never via `Math.tan`.** Fields carry the stored slope RATIO (|Δdepth| / |Δstation|),
  not degrees, so an untouched angle is never re-derived through `atan`/`tan` (45 → ratio exactly 1). Degrees appear only
  in display and in what the user types; a typed 45 maps to ratio 1 exactly.
- Angles display to 0.1° (`toFixed(1)`) with a `°` sign (HTML text only, invariant 19).
- Fields REFUSE out-of-range input and never clamp (invariant 5, DimensionField rule): angle must be > 0 and < 90, and
  the miter's depth (`run × ratio`) must not exceed the part's length.
- Wording keeps the existing vocabulary: "Length min end", "Width — min side" etc. No posture words.
- `kind` never decides geometry; it picks the row's controls.
- Every edit goes through the existing store actions (`addAngleCuts` — several cuts are ONE undo entry —
  `updateAngleCut`, `removeAngleCut`); no new store action.
- `npm test` does not typecheck; run `npm run build` before claiming anything compiles. Mutate every plan-supplied test.

## Review Focus

1. **An untouched 45° miter edited only in its long-point side or end** must keep `depth === run` exactly (no `tan`
   round trip). Pinned in Task 1.
2. **Switching a miter from across-width to across-thickness on a short part** where the new depth would pass the
   length: refused with a note, nothing written. Pinned in Task 3.
3. **"Miter both ends" on a picture-frame rail** makes a trapezoid whose short point is length − 2 × width (not a
   parallelogram), as one undo entry. Pinned in Tasks 1 and 3.
4. **A hand-edited miter whose long point is on the alongFrom-far side** reads its long-point side correctly and rewrites
   canonically on edit. Pinned in Task 1.
5. **The angle field's untouched blur and Enter/Escape** behave exactly like DimensionField (no commit, no undo entry,
   refusal keeps focus). Pinned in Task 2.

---

### Task 1: Miter field conversions

**Files:**
- Modify: `src/document/angleCuts.ts` (beside `TaperFields`/`taperCut`/`taperFields`/`defaultTaper`)
- Modify: `src/document/document.ts` (barrel exports)
- Test: `src/document/angleCuts.test.ts` (append)

**Interfaces:**
- Produces: `interface MiterFields { end: CutFrom; across: 'width' | 'thickness'; longSide: CutFrom; ratio: number }`;
  `miterRatio(degrees: number): number` (45 → 1 exactly, else `Math.tan(degrees·π/180)`);
  `miterDegrees(ratio: number): number` (`atan(ratio)·180/π`);
  `miterCut(f: MiterFields, board: Pick<Board, Dimension>): Omit<AngleCut, 'id'>`;
  `miterFields(c: AngleCut, board: Pick<Board, Dimension>): MiterFields`;
  `defaultMiter(board): Omit<AngleCut, 'id'>`; `defaultMiterPair(board): Omit<AngleCut, 'id'>[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { boardBodies, bodyVerts } from './bodies';
import { shortPointLine } from './angleText';
import { defaultMiter, defaultMiterPair, miterCut, miterDegrees, miterFields, miterRatio } from './angleCuts';

describe('miter fields (spec §7)', () => {
  const rail = () => createBoard({ length: 24, width: 2.5, thickness: 0.75 });

  it('maps 45° to a ratio of exactly 1 and back to 45.0 for display', () => {
    expect(miterRatio(45)).toBe(1);
    expect(miterRatio(22.5)).toBeCloseTo(Math.tan(Math.PI / 8), 15);
    expect(miterDegrees(1).toFixed(1)).toBe('45.0');
  });

  it('builds a canonical miter: depth 0 at the long-point side, run × ratio at the other', () => {
    const c = miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail());
    expect(c).toEqual({ kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] });
  });

  it('round-trips exactly, and an edit of side or end keeps depth === run (Review Focus 1)', () => {
    const b = rail();
    const c = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    const f = miterFields(c, b);
    expect(f).toEqual({ end: 'max', across: 'width', longSide: 'min', ratio: 1 });
    const moved = miterCut({ ...f, longSide: 'max', end: 'min' }, b);
    expect(moved.points).toEqual([[0, 0], [2.5, 2.5]]);
    expect(moved.alongFrom).toBe('max');
    expect(moved.from).toBe('min');
  });

  it('reads the long-point side of a hand-edited miter stored the other way round (Review Focus 4)', () => {
    const b = rail();
    // Deep at station 0 from the width min side: the long point is on the width MAX side.
    const c = { id: 'h', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 2.5], [2.5, 0]] as [[number, number], [number, number]] };
    expect(miterFields(c, b)).toEqual({ end: 'max', across: 'width', longSide: 'max', ratio: 1 });
  });

  it('defaults to a 45° miter across the width at the length max end, long point on the min side', () => {
    expect(defaultMiter(rail())).toEqual(miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail()));
  });

  it('a default pair is a picture-frame trapezoid: short point = length − 2 × width (Review Focus 3)', () => {
    const b = { ...rail(), angleCuts: defaultMiterPair(rail()).map((c, i) => ({ ...c, id: `p${i}` })) };
    expect(b.angleCuts.map((c) => c.from).sort()).toEqual(['max', 'min']);
    expect(shortPointLine(b, 16)).toBe('Short point 19"');
    // Cross-check against the geometry: the width-max long edge spans 2.5 → 21.5, the width-min edge 0 → 24.
    const xs = boardBodies(b).flatMap(bodyVerts).filter((p) => Math.abs(p[1] - 2.5) < 1e-9).map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(2.5, 12);
    expect(Math.max(...xs)).toBeCloseTo(21.5, 12);
  });

  it('a 22.5° miter across the thickness stores run × tan', () => {
    const c = miterCut({ end: 'min', across: 'thickness', longSide: 'max', ratio: miterRatio(22.5) }, rail());
    expect(c.along).toBe('thickness');
    expect(c.points[1]![1]).toBe(0.75 * Math.tan(Math.PI / 8));
  });
});
```

Run: `npx vitest run src/document/angleCuts.test.ts -t "miter fields"` — Expected: FAIL (exports missing).

- [ ] **Step 2: Implement**

```ts
/** A miter as the shop reads it (spec §7). `ratio` is the stored slope (|Δdepth| / |Δstation|), NOT degrees, so an
 *  untouched angle never round-trips through atan/tan (45° is ratio 1, exactly — spec §2.3). */
export interface MiterFields { end: CutFrom; across: 'width' | 'thickness'; longSide: CutFrom; ratio: number }

/** Degrees → stored slope. 45 is exactly 1 (`Math.tan(π/4)` is 0.9999999999999999). */
export function miterRatio(degrees: number): number {
  return degrees === 45 ? 1 : Math.tan((degrees * Math.PI) / 180);
}

/** Stored slope → degrees, for display and the angle field. */
export function miterDegrees(ratio: number): number {
  return (Math.atan(ratio) * 180) / Math.PI;
}

/** Canonical: depth 0 at the long-point side, run × ratio across the part (exact when ratio is 1). */
export function miterCut(f: MiterFields, board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  const run = board[f.across];
  return { kind: 'miter', face: 'length', from: f.end, along: f.across, alongFrom: f.longSide, points: [[0, 0], [run, run * f.ratio]] };
}

/**
 * The shop numbers of a stored miter. The long point is the side where the line is shallower; the ratio is read
 * straight off the stored points (no trigonometry), so editing only the end or side keeps it exactly. A miter whose
 * `along` is somehow `length` (hand-edited) reads as across the width. Editing rewrites it canonically via `miterCut`.
 */
export function miterFields(c: AngleCut, board: Pick<Board, Dimension>): MiterFields {
  const across = c.along === 'thickness' ? 'thickness' : 'width';
  const [[s1, q1], [s2, q2]] = c.points;
  const ratio = Math.abs(q2 - q1) / Math.abs(s2 - s1);
  const longSide = depthAt(c, 0) <= depthAt(c, board[c.along]) ? c.alongFrom : flip(c.alongFrom);
  return { end: c.from, across, longSide, ratio };
}

/** 45° across the width at the length max end, long point on the width min side. */
export function defaultMiter(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, board);
}

/** The picture-frame pair: the default miter and its match at the min end, long points on the SAME side (a trapezoid). */
export function defaultMiterPair(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'>[] {
  return [defaultMiter(board), miterCut({ end: 'min', across: 'width', longSide: 'min', ratio: 1 }, board)];
}
```

(`flip` already exists in this file from chunk 1; reuse it. Export all seven through the `document.ts` barrel.)

- [ ] **Step 3: Run tests, `npm run build`, `npm test`.** Expected: PASS, clean.

- [ ] **Step 4: Mutate** — make `miterRatio` always use `Math.tan` → the 45° and round-trip tests fail; flip the
  `<=` in `miterFields`' long-side test → the hand-edited test fails; give the pair opposite long sides → the
  trapezoid test fails (21-1/2 vs 19 — a parallelogram's short point under the corner-minimum formula: L − w). Restore each.

- [ ] **Step 5: Commit** — `feat(angle cuts): miter field conversions (ratio, not degrees)`.

---

### Task 2: An angle field without a second copy of DimensionField

**Files:**
- Modify: `src/panels/DimensionField.tsx` (optional `parse` / `format` / `invalid` props)
- Create: `src/panels/AngleField.tsx`
- Test: `src/panels/AngleField.test.tsx` (create; follow `DimensionField.test.tsx`'s render and userEvent setup)

**Interfaces:**
- Produces: DimensionField accepts `parse?: (text: string) => number | null` (default `parseLength`),
  `format?: (v: number) => string` (default `formatLength(v, precision)`, used for the field text AND the min/max
  messages) and `invalid?: string` (default `'Enter a measurement, e.g. 3/4 or 1-1/2'`). Existing callers unchanged.
- Produces: `AngleField({ label, value, onCommit, max? })` — degrees in and out; refuses ≤ 0 (DimensionField's default
  rule), ≥ 90 (and anything above `max`); parses `45`, `45°`, `22.5`, ` 22.5 ° `; displays `45.0°`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('AngleField', () => {
  const setup = (value: number, onCommit = vi.fn(), max?: number) => {
    render(<AngleField label="Angle" value={value} onCommit={onCommit} max={max} />);
    return { input: screen.getByLabelText('Angle') as HTMLInputElement, onCommit };
  };
  it('shows degrees to 0.1°', () => {
    expect(setup(45).input.value).toBe('45.0°');
    cleanup();
    expect(setup(22.499999999999996).input.value).toBe('22.5°');
  });
  it('commits a typed angle, with or without the degree sign', async () => {
    const { input, onCommit } = setup(45);
    await userEvent.clear(input); await userEvent.type(input, '22.5{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(22.5);
    await userEvent.clear(input); await userEvent.type(input, '30°{Enter}');
    expect(onCommit).toHaveBeenLastCalledWith(30);
  });
  it('refuses 0, 90, past max, and junk — and keeps focus (Review Focus 5)', async () => {
    const { input, onCommit } = setup(45, vi.fn(), 80);
    for (const bad of ['0', '90', '85', 'abc']) {
      await userEvent.clear(input); await userEvent.type(input, `${bad}{Enter}`);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(document.activeElement).toBe(input);
    }
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('an untouched blur commits nothing', async () => {
    const { input, onCommit } = setup(22.499999999999996);
    input.focus(); input.blur();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
```

Also append to `DimensionField.test.tsx`: an existing-caller regression — a DimensionField with no new props still
shows `3/4"` for 0.75 and refuses `abc` with the old message.

Run — Expected: FAIL (AngleField missing).

- [ ] **Step 2: Generalise DimensionField** — add the three props; replace `parseLength(text)` with `(parse ?? parseLength)(text)`,
  every `formatLength(x, precision)` (display, `setText` after commit, min/max messages) with `fmt(x)` where
  `const fmt = format ?? ((v: number) => formatLength(v, precision));`, and the invalid message with `invalid ?? '…'`.
  Note in its doc comment: "parse/format generalise it to non-length values (AngleField); every rule above — the dirty
  guard, Enter/Escape, refusal never clamps — is shared, never copied (invariant 5)."

- [ ] **Step 3: Write `AngleField.tsx`**

```tsx
import { DimensionField } from './DimensionField';

const parseDegrees = (text: string): number | null => {
  const t = text.trim().replace(/°\s*$/, '').trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
const formatDegrees = (v: number) => `${v.toFixed(1)}°`;

/** Degrees, 0 < a < 90 and ≤ `max` (spec §7). DimensionField with a degree parse/format: one set of edit rules. */
export function AngleField({ label, value, onCommit, max }: { label: string; value: number; onCommit: (degrees: number) => void; max?: number }) {
  const limit = Math.min(max ?? Infinity, 89.9);
  return (
    <DimensionField label={label} value={value} onCommit={onCommit} max={limit}
      parse={parseDegrees} format={formatDegrees} invalid="Enter an angle in degrees, e.g. 45 or 22.5" />
  );
}
```

(`89.9` makes 90 refused with "Must be at most 89.9°", the field's own message form; DimensionField's default "> 0"
refuses 0.)

- [ ] **Step 4: Run the two test files, `npm run build`, `npm test`.** Expected: PASS.

- [ ] **Step 5: Mutate** — drop the `°` strip in `parseDegrees` → "with or without the degree sign" fails; make
  `format` affect only the text and not the messages → assert the max message reads `Must be at most 80.0°` (add that
  assertion) and see it fail. Restore.

- [ ] **Step 6: Commit** — `feat(angle cuts): AngleField — DimensionField with a degree parse/format`.

---

### Task 3: The Miter row and the "+ Add ▾" menu

**Files:**
- Modify: `src/panels/AngleCuts.tsx`
- Test: `src/panels/AngleCuts.test.tsx` (append; reuse its render-with-store setup)

**Interfaces:**
- Consumes: `miterFields`, `miterCut`, `miterDegrees`, `miterRatio`, `defaultMiter`, `defaultMiterPair` (Task 1);
  `AngleField` (Task 2); `Popover` (`src/panels/Popover.tsx`: `{ label, items: { label, detail?, run }[], title?, align?, className? }`).

- [ ] **Step 1: Write the failing tests**

```tsx
describe('miters in the Angles section (spec §7, chunk 2)', () => {
  // setup: a selected 24 × 2-1/2 × 3/4 rail, Properties rendered — copy the file's existing setup.
  it('adds a miter from + Add ▾', async () => {
    await user.click(screen.getByRole('button', { name: /\+ Add/ }));
    await user.click(screen.getByRole('button', { name: 'Miter' }));
    expect(screen.getByText('Miter 45.0° across the width at the length max end')).toBeInTheDocument();
  });
  it('adds a miter at both ends as one undo entry (Review Focus 3)', async () => {
    const before = useStore.getState().past.length;
    await user.click(screen.getByRole('button', { name: /\+ Add/ }));
    await user.click(screen.getByRole('button', { name: 'Miter both ends' }));
    expect((useStore.getState().doc.boards[0] as Board).angleCuts).toHaveLength(2);
    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect((useStore.getState().doc.boards[0] as Board).angleCuts).toHaveLength(0);
  });
  it('still adds a taper from the menu', async () => {
    await user.click(screen.getByRole('button', { name: /\+ Add/ }));
    await user.click(screen.getByRole('button', { name: 'Taper' }));
    expect(screen.getByText(/^Taper /)).toBeInTheDocument();
  });
  it('edits the angle exactly: 22.5 stores run × tan, 45 stores run', async () => {
    // add a miter, then:
    const angle = screen.getByLabelText('Angle');
    await user.clear(angle); await user.type(angle, '22.5{Enter}');
    expect((useStore.getState().doc.boards[0] as Board).angleCuts[0]!.points[1]).toEqual([2.5, 2.5 * Math.tan(Math.PI / 8)]);
    await user.clear(angle); await user.type(angle, '45{Enter}');
    expect((useStore.getState().doc.boards[0] as Board).angleCuts[0]!.points[1]).toEqual([2.5, 2.5]);
  });
  it('changing only the long-point side keeps depth === run (Review Focus 1)', async () => {
    // add a miter, then choose Long point "Width — max side":
    expect((useStore.getState().doc.boards[0] as Board).angleCuts[0]).toMatchObject({ alongFrom: 'max', points: [[0, 0], [2.5, 2.5]] });
  });
  it('refuses switching across to a side whose depth would pass the length (Review Focus 2)', () => {
    // a 2 × 2.5 × 0.75 block with a 45° miter across the thickness; choose Across "Width" (depth 2.5 > length 2):
    // the stored cut is unchanged and an alert reads "Removes more than the length — reduce the angle first."
  });
});
```

Write the last two tests fully in the file's style (select with `user.selectOptions(screen.getByLabelText('Long point'), 'max')`
and `…('Across'), 'width'`); the comments above say exactly what each asserts.

Run — Expected: FAIL.

- [ ] **Step 2: Implement the Miter branch in `AngleRow`** (after the taper branch; the hooks stay above every branch)

```tsx
  if (cut.kind === 'miter') {
    const m = miterFields(cut, board);
    const setM = (patch: Partial<MiterFields>) => {
      const next = { ...m, ...patch };
      // A miter deeper than the part is refused, never written (spec §7) — it would consume the part.
      if (board[next.across] * next.ratio > board.length) { setError('Removes more than the length — reduce the angle first.'); return; }
      setError(null);
      updateAngleCut(board.id, cut.id, miterCut(next, board));
    };
    const maxDegrees = miterDegrees(board.length / board[m.across]);
    return (
      <div className="cut">
        {head}
        <p className="field-note">{line}</p>
        {none}
        <div className="field-grid field-grid-2">
          <div className="field field-wide">
            <label htmlFor={`miter-end-${cut.id}`}>End</label>
            <select id={`miter-end-${cut.id}`} className="input" value={m.end} onChange={(e) => setM({ end: e.target.value as CutFrom })}>
              <option value="min">Length min end</option>
              <option value="max">Length max end</option>
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor={`miter-across-${cut.id}`}>Across</label>
            <select id={`miter-across-${cut.id}`} className="input" value={m.across} onChange={(e) => setM({ across: e.target.value as 'width' | 'thickness' })}>
              <option value="width">Width</option>
              <option value="thickness">Thickness</option>
            </select>
          </div>
          <div className="field field-wide">
            <label htmlFor={`miter-long-${cut.id}`}>Long point</label>
            <select id={`miter-long-${cut.id}`} className="input" value={m.longSide} onChange={(e) => setM({ longSide: e.target.value as CutFrom })}>
              <option value="min">{`${m.across === 'width' ? 'Width' : 'Thickness'} — min side`}</option>
              <option value="max">{`${m.across === 'width' ? 'Width' : 'Thickness'} — max side`}</option>
            </select>
          </div>
          <AngleField label="Angle" value={miterDegrees(m.ratio)} max={maxDegrees}
            onCommit={(deg) => setM({ ratio: miterRatio(deg) })} />
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    );
  }
```

Imports: `miterCut, miterDegrees, miterFields, miterRatio, defaultMiter, defaultMiterPair` and the `MiterFields` type
from the barrel; `AngleField`; `Popover`. Update `AngleRow`'s doc comment: "Tapers and miters are edited; bevels and
chamfers (chunk 3, or a hand-edited file) show their bench line and a remove button."

- [ ] **Step 3: Replace the "+ Add taper" button with the menu**

```tsx
      <Popover className="add-angle" label={<>+ Add<span aria-hidden="true"> ▾</span></>} title="Add an angle cut"
        items={[
          { label: 'Taper', detail: 'Slope one face along the length', run: () => addAngleCuts(board.id, [defaultTaper(board)]) },
          { label: 'Miter', detail: '45° across the width at one end', run: () => addAngleCuts(board.id, [defaultMiter(board)]) },
          { label: 'Miter both ends', detail: 'A picture-frame rail, in one step', run: () => addAngleCuts(board.id, defaultMiterPair(board)) },
        ]} />
```

Update the section's doc comment ("chunk 2: Taper and Miter"). Update the chunk-1 taper tests in this file that click
"+ Add taper" to go through the menu (`+ Add` then `Taper`) — the behaviour is unchanged, only the path.

- [ ] **Step 4: Run `AngleCuts.test.tsx`, `npm run build`, `npm test`.** Expected: PASS.

- [ ] **Step 5: Mutate** — remove the depth refusal in `setM` → Review Focus 2 test fails; make "Miter both ends" call
  `addAngleCuts` once per cut → the one-undo-entry test fails; route the angle through `Math.tan(45°)` → the exact-45
  test fails. Restore each.

- [ ] **Step 6: Commit** — `feat(angle cuts): Miter row and the + Add ▾ menu`.

---

### Task 4: Live check and record

**Files:**
- Modify: `docs/browser-verification-angle-cuts.md` (append "Chunk 2: miters"), screenshots `docs/img/angle-cuts-miter-*.png`
- Modify: the spec's Status line ("chunk 2 implemented"), `docs/follow-ups.md` (any new residue, next free number)

Rules: dev server only (`npm run dev -- --port 5182`), Playwright MCP only, absolute screenshot paths, never
`localStorage.clear()`, delete only the check's own project, no paid calls; shading/grain on the miter face is a
real-hardware item.

- [ ] **Step 1:** New project "miter check"; a 24 × 2-1/2 × 3/4 rail; **+ Add ▾ → Miter both ends**. Record the two
  lines and the short point (`Short point 19"`); one undo removes both. Screenshot the mitered rail (edges on the miter
  faces, no square-end edges).
- [ ] **Step 2:** Set one miter's angle to 22.5, its Long point to the max side, Across to Thickness; record the bench
  line after each. Try 90 and 85 on a short part: refused with the message, focus kept.
- [ ] **Step 3:** Four rails in a frame (position them by hand): Plans sheet shows the mitered corners with hidden lines;
  the cut list groups the four as one row (or two if their miters differ) and prints the short point.
- [ ] **Step 4:** Explode: the menu trigger and miter controls are disabled. Back to Select.
- [ ] **Step 5:** Delete the project; confirm via the library index; stop the server. Write the section; update the
  spec Status line and follow-ups; commit docs only.

---

## After the plan

Merge `angle-cuts-2` with `--no-ff` after the final whole-branch review; deploy only on the user's word (no schema
change, so rollback to `5cb0a4c` / `index-DLW02CPM.js` is free). After a deploy: CLAUDE.md Status and a Rounds row
("angle cuts chunk 2 — Miter preset, + Add ▾"), `docs/history.md`, `DEPLOYMENT.local.md`, `docs/feature-gaps.md`.
