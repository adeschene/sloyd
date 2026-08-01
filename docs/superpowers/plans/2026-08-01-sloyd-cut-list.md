# Sloyd Cut List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the document into a printable shop sheet — parts grouped by material and thickness, identical parts collapsed into quantity rows, each row's joinery printed beneath it.

**Architecture:** A pure derivation, `buildCutList(doc)`, in `src/document/cutlist.ts` — a leaf alongside `cuts.ts`, carrying all the logic and all the tests. `src/panels/CutList.tsx` is a dumb renderer over its output, opened as a modal from the toolbar. Printing is `@media print` CSS over the same DOM, not a second render path. No schema change, no `CURRENT_VERSION` bump, no new store state.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest + Testing Library (jsdom). No new dependencies.

Spec: `docs/superpowers/specs/2026-08-01-sloyd-cut-list-design.md`. Read it before starting — this plan implements it and does not restate its reasoning.

## Global Constraints

- **`npm test` does not typecheck.** Run `npm run build` before claiming anything compiles. Both must be green before every commit.
- **`src/document/cutlist.ts` must never import `./document`.** `document.ts` re-exports it; importing back is a cycle. Import `./types`, `./geometry`, `./cuts`, and `../units/length` only. (`cuts.ts` is the precedent.)
- **This feature adds a single new import edge to the architecture: `document → units`.** That is deliberate and specified (spec §2). It is the *only* layering change; nothing else moves.
- **Stored values are exact; display rounds.** Every number that reaches the user goes through `formatLength(n, doc.units.display.precision)`. The panel calls `formatLength` zero times. *[Editorial correction, added after implementation: `doc.units.display.precision` is wrong — the field is flat, `doc.units.precision`, `display` being the sibling format name. The implementation uses `doc.units.precision`. The error is left in place deliberately, as a record of a plan-supplied defect: this plan is history, not documentation, and joinery's lesson — seven defects in code the plan supplied verbatim — is only legible if the plans keep the defects they shipped with.]*
- **No new fields on `Board`, `Cut`, or `SloydDocument`.** If a task seems to need one, stop and escalate — it means derived state is leaking into the document.
- **Dimensions group at display precision; cut geometry must match exactly.** This asymmetry is the design, not an oversight (spec §3).
- **Part-local vocabulary only.** `length`/`width`/`thickness`, never world axes, in every user-visible string.
- **This plan's code is not more trustworthy than hand-written code.** Seven of joinery's defects were in code its plan supplied verbatim. If a test fails, **fix the code, not the expectation.** If you conclude an *expectation itself* is wrong, **stop and escalate** rather than editing it — that happened once during joinery, the implementer was right, and the plan is what changed.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/document/cutlist.ts` | **Create.** `buildCutList` and its types. All grouping, identity, ordering, and setup-line phrasing. Pure. |
| `src/document/cutlist.test.ts` | **Create.** The whole logic suite. |
| `src/document/document.ts` | **Modify.** Re-export `buildCutList` and its types, matching how `cuts.ts` is re-exported. |
| `src/panels/CutList.tsx` | **Create.** The modal renderer. Owns its own Escape handling. |
| `src/panels/CutList.test.tsx` | **Create.** Rendering, empty state, close. |
| `src/panels/Toolbar.tsx` | **Modify.** One button, one prop. |
| `src/App.tsx` | **Modify.** `open` state, render the modal, suppress board shortcuts while it is open. |
| `src/styles.css` | **Modify.** Modal styles and the `@media print` block. |
| `CLAUDE.md`, `docs/follow-ups.md` | **Modify.** Final task. |

---

## Task 1: `buildCutList` — grouping, identity, ordering

Cuts are deliberately **out of scope in this task**: every row comes out with `setup: []`, and boards that differ only in their cuts will (wrongly, for now) collapse. Task 2 closes that. Every test here uses cut-free boards, so nothing asserted here changes later.

**Files:**
- Create: `src/document/cutlist.ts`
- Create: `src/document/cutlist.test.ts`
- Modify: `src/document/document.ts` (re-exports, near line 11)

**Interfaces:**
- Consumes: `Board`, `Grain`, `SloydDocument`, `MATERIALS` from `./types`; `formatLength` from `../units/length`.
- Produces: `buildCutList(doc: SloydDocument): CutList`, and the exported types `CutList`, `CutListGroup`, `CutListRow` with exactly the fields shown below. Task 2 adds `setup` content; Task 3 renders these fields by name.

- [ ] **Step 1: Write the failing test**

Create `src/document/cutlist.test.ts`:

```ts
import { buildCutList, createBoard, createDocument } from './document';
import type { Board, SloydDocument } from './document';

/** A document containing exactly these boards, with unique default names. */
const docWith = (...boards: Partial<Board>[]): SloydDocument => ({
  ...createDocument('Test'),
  boards: boards.map((b, i) => createBoard({ name: `P${i}`, ...b })),
});

describe('buildCutList', () => {
  it('returns no groups for an empty document', () => {
    expect(buildCutList(createDocument('Test'))).toEqual({ groups: [] });
  });

  it('collapses two identical boards into one row of quantity 2', () => {
    const list = buildCutList(docWith({}, {}));
    expect(list.groups).toHaveLength(1);
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
    expect(list.groups[0].rows[0].names).toEqual(['P0', 'P1']);
  });

  it('labels a group with its material and thickness', () => {
    const list = buildCutList(docWith({ material: 'oak', thickness: 0.75 }));
    expect(list.groups[0].label).toBe('Oak — 3/4"');
  });

  it('formats a row as length by width', () => {
    const list = buildCutList(docWith({ length: 24, width: 3.5 }));
    expect(list.groups[0].rows[0].dims).toBe('24" × 3-1/2"');
  });

  it('collapses boards differing only in placement or name', () => {
    const list = buildCutList(docWith(
      { name: 'Leg A', posture: 'upright', position: [0, 0, 0] },
      { name: 'Leg B', posture: 'flat', rotation: 90, position: [10, 0, 4] },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
  });

  it.each([
    ['material', { material: 'oak' }],
    ['thickness', { thickness: 1.5 }],
    ['length', { length: 30 }],
    ['width', { width: 7.25 }],
    ['grain', { grain: 'width' as const }],
  ])('splits boards differing in %s', (_field, difference) => {
    const list = buildCutList(docWith({}, difference));
    const rows = list.groups.flatMap((g) => g.rows);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.qty === 1)).toBe(true);
  });

  it('collapses lengths closer together than the display precision', () => {
    // 0.02" apart: both print as 24" at 1/16", so they are one row.
    //
    // NOT 24.03125 (a clean 1/32"), which looks like the obvious choice and is
    // wrong: it is exactly half a tick at 1/16", `Math.round` takes .5 upward,
    // and it prints as 24-1/16". Verified with the real arithmetic rather than
    // assumed — `formatLength`'s tick count for 24, 24.02 and 24.03125 at
    // precision 16 is 384, 384 and 385.
    const list = buildCutList(docWith({ length: 24 }, { length: 24.02 }));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
  });

  it('splits those same lengths when the document asks for 1/32"', () => {
    const doc = docWith({ length: 24 }, { length: 24.02 });
    doc.units = { display: 'imperial-fractional', precision: 32 };
    expect(buildCutList(doc).groups[0].rows).toHaveLength(2);
  });

  it('orders groups by material label, then thickness descending', () => {
    const list = buildCutList(docWith(
      { material: 'pine', thickness: 0.75 },
      { material: 'oak', thickness: 0.75 },
      { material: 'oak', thickness: 1.5 },
    ));
    expect(list.groups.map((g) => g.label)).toEqual([
      'Oak — 1-1/2"', 'Oak — 3/4"', 'Pine — 3/4"',
    ]);
  });

  it('orders rows by length descending, then width descending', () => {
    const list = buildCutList(docWith(
      { length: 12, width: 6 },
      { length: 24, width: 3 },
      { length: 24, width: 6 },
    ));
    expect(list.groups[0].rows.map((r) => r.dims)).toEqual([
      '24" × 6"', '24" × 3"', '12" × 6"',
    ]);
  });

  it('leaves setup empty at this stage', () => {
    expect(buildCutList(docWith({})).groups[0].rows[0].setup).toEqual([]);
  });
});
```

That last test is a placeholder for Task 2, which replaces it with the real joinery cases. Everything above it is permanent.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- cutlist`
Expected: FAIL — `buildCutList` is not exported from `./document`.

- [ ] **Step 3: Write the implementation**

Create `src/document/cutlist.ts`:

```ts
import { MATERIALS } from './types';
import type { Board, Grain, SloydDocument } from './types';
import { formatLength } from '../units/length';

/**
 * One row of the cut list: every part that is cut from the same stock, in the
 * same way, collapsed together.
 *
 * The exact numbers are the FIRST such part's — two parts collapse when they
 * print identically, not when they are equal, so a row's exact values are a
 * representative rather than a shared truth. They exist for sorting and for
 * tests; `dims` is what the user sees, and it is derived from the same
 * representative, so screen and key can never disagree.
 */
export interface CutListRow {
  /** The identity string this row was grouped by. Stable, and the React key. */
  key: string;
  qty: number;
  /** Board names, in document order. Unique per invariant 8. */
  names: string[];
  length: number;
  width: number;
  thickness: number;
  grain: Grain;
  /** e.g. `24" × 3-1/2"`, already formatted. */
  dims: string;
  /** One line per cut, already formatted. Empty for a row with no joinery. */
  setup: string[];
}

export interface CutListGroup {
  /** MATERIALS key. */
  material: string;
  /** Exact inches. */
  thickness: number;
  /** e.g. `Pine — 3/4"` */
  label: string;
  rows: CutListRow[];
}

export interface CutList {
  groups: CutListGroup[];
}

/**
 * Total rather than assuming a validated document, for the same reason
 * `cutRegion` is: a Board built directly — a test, a future creation path —
 * can reach here without passing the validator.
 */
function materialLabel(material: string): string {
  return MATERIALS[material]?.label ?? material;
}

/**
 * What makes two parts one row.
 *
 * Every NUMBER goes through `formatLength` at the document's precision, and
 * every ENUM goes in verbatim; the fields are joined with `|`, a character
 * `formatLength` never emits (its output is digits, `-`, `/` and `"`) and no
 * enum contains. So the tolerance rule is not a comparison that could disagree
 * with the screen — two rows that print identically ARE one row, by
 * construction, and no float is ever compared for equality.
 *
 * `position`, `rotation` and `posture` are absent deliberately: they say where
 * a part sits in the model, not how it is cut from stock. `grain` IS present —
 * a part whose fibres run along its width is laid out on the board differently
 * from one running along its length, so collapsing those would produce a row
 * you cannot cut as a batch.
 */
function rowKey(board: Board, precision: number): string {
  const f = (n: number) => formatLength(n, precision);
  return [
    board.material,
    f(board.thickness),
    f(board.length),
    f(board.width),
    board.grain,
  ].join('|');
}

export function buildCutList(doc: SloydDocument): CutList {
  const precision = doc.units.display.precision; // [Editorial correction: wrong field —
  // the real one is flat, `doc.units.precision`. The shipped code uses that; this line
  // is left wrong on purpose as a record of a plan-supplied defect. See the same note
  // in §"Stored values are exact".]
  const groups = new Map<string, CutListGroup>();
  const rows = new Map<string, CutListRow>();

  for (const board of doc.boards) {
    const groupKey = `${board.material}|${formatLength(board.thickness, precision)}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        material: board.material,
        thickness: board.thickness,
        label: `${materialLabel(board.material)} — ${formatLength(board.thickness, precision)}`,
        rows: [],
      };
      groups.set(groupKey, group);
    }

    // rowKey starts with the group's own two fields, so a row key is unique
    // across the whole list and belongs to exactly one group.
    const key = rowKey(board, precision);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        qty: 0,
        names: [],
        length: board.length,
        width: board.width,
        thickness: board.thickness,
        grain: board.grain,
        dims: `${formatLength(board.length, precision)} × ${formatLength(board.width, precision)}`,
        setup: [],
      };
      rows.set(key, row);
      group.rows.push(row);
    }
    row.qty += 1;
    row.names.push(board.name);
  }

  const out = [...groups.values()];
  for (const group of out) {
    // `key` as the final tiebreak so the order is total: tests assert on it
    // and React keys off it, the same reason `mergeAlong` sorts.
    group.rows.sort(
      (a, b) => b.length - a.length || b.width - a.width || a.key.localeCompare(b.key),
    );
  }
  out.sort(
    (a, b) =>
      materialLabel(a.material).localeCompare(materialLabel(b.material)) ||
      b.thickness - a.thickness,
  );
  return { groups: out };
}
```

- [ ] **Step 4: Add the re-exports**

In `src/document/document.ts`, immediately after the existing `cuts` re-export (line 11-12):

```ts
export { buildCutList } from './cutlist';
export type { CutList, CutListGroup, CutListRow } from './cutlist';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- cutlist`
Expected: PASS, all cases.

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npm test && npm run build`
Expected: both green. `npm run build` is the only thing that typechecks.

- [ ] **Step 7: Commit**

```bash
git add src/document/cutlist.ts src/document/cutlist.test.ts src/document/document.ts
git commit -m "feat: derive a cut list from the document

Parts grouped by material and thickness, identical parts collapsed into
quantity rows. Identity is the formatted key itself, so two rows that print
identically are one row by construction and no float is compared for
equality. Joinery lands next."
```

---

## Task 2: The joinery signature and the setup lines

**Files:**
- Modify: `src/document/cutlist.ts`
- Modify: `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: Task 1's `buildCutList` and `rowKey`; `cutLabel` from `./cuts`; `positionAxisOf` from `./geometry`.
- Produces: rows whose `setup` holds one formatted line per cut, and a `key` that additionally distinguishes joinery. No signature changes.

- [ ] **Step 1: Write the failing tests**

Replace the `leaves setup empty at this stage` test in `src/document/cutlist.test.ts` with the following, and add the new `import type { Cut }` to the file's imports:

```ts
  const dado = (over: Partial<Cut> = {}): Cut => ({
    id: 'c1', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, ...over,
  });

  it('has no setup lines for a board with no cuts', () => {
    expect(buildCutList(docWith({})).groups[0].rows[0].setup).toEqual([]);
  });

  it('phrases a dado part-locally', () => {
    const list = buildCutList(docWith({ cuts: [dado()] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" dado, 1/4" deep — into the thickness face (min side), ' +
      '6" from the length min end, running across the width',
    ]);
  });

  it('phrases a cut flush with an end as a rabbet', () => {
    const list = buildCutList(docWith({ cuts: [dado({ offset: 0 })] }));
    expect(list.groups[0].rows[0].setup[0]).toContain('3/4" rabbet');
    expect(list.groups[0].rows[0].setup[0]).toContain('0" from the length min end');
  });

  it('names the position axis from face and across, not from a stored field', () => {
    // face=length, across=thickness leaves width as the position axis. The
    // offset drops to 2" because the position axis is now the board's 5-1/2"
    // width — the default 6" would be off the end of it, and a test that
    // encoded an out-of-range cut as ordinary is one a future reader copies.
    const list = buildCutList(docWith({
      cuts: [dado({ face: 'length', across: 'thickness', from: 'max', offset: 2, depth: 0.5 })],
    }));
    expect(list.groups[0].rows[0].setup[0]).toBe(
      '3/4" dado, 1/2" deep — into the length face (max side), ' +
      '2" from the width min end, running across the thickness',
    );
  });

  it('collapses boards carrying the same cuts added in opposite orders', () => {
    const a = dado();
    const b = dado({ id: 'c2', offset: 12 });
    const list = buildCutList(docWith(
      { cuts: [a, b] },
      { cuts: [{ ...b, id: 'c3' }, { ...a, id: 'c4' }] },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
    expect(list.groups[0].rows[0].setup).toHaveLength(2);
  });

  it('never collapses a cut-bearing board with a cut-free one', () => {
    const list = buildCutList(docWith({ cuts: [dado()] }, { cuts: [] }));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it.each([
    ['depth', { depth: 0.5 }],
    // `face: 'length'` rather than `'width'`: `across` is already 'width', and
    // a cut naming the same dimension twice is degenerate — legal input to
    // `cutRegion`, which is total about it, but not something to assert on here.
    ['face', { face: 'length' as const }],
    ['from', { from: 'max' as const }],
    ['across', { across: 'length' as const }],
  ])('splits boards whose cuts differ in %s', (_field, difference) => {
    const list = buildCutList(docWith({ cuts: [dado()] }, { cuts: [dado(difference)] }));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it('groups dimensions at display precision but cuts exactly', () => {
    // The asymmetry IS the design: a stock dimension rounded to the precision
    // you cut to costs nothing, a dado location rounded the same way costs the
    // joint. Both halves in one test so neither can be relaxed alone.
    // The SAME 0.02" delta on both halves, which is what makes this a contrast
    // rather than two unrelated assertions.
    const loose = buildCutList(docWith({ length: 24 }, { length: 24.02 }));
    expect(loose.groups[0].rows).toHaveLength(1);

    const strict = buildCutList(docWith(
      { cuts: [dado({ offset: 6 })] },
      { cuts: [dado({ offset: 6.02 })] },
    ));
    expect(strict.groups[0].rows).toHaveLength(2);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- cutlist`
Expected: FAIL — setup lines are empty and cut-bearing boards collapse with cut-free ones.

- [ ] **Step 3: Add the signature and the phrasing**

In `src/document/cutlist.ts`, add to the imports:

```ts
import type { Board, Cut, Grain, SloydDocument } from './types';
import { positionAxisOf } from './geometry';
import { cutLabel } from './cuts';
```

Add these two functions above `rowKey`:

```ts
/**
 * The joinery half of a row's identity — EXACT, deliberately unlike the
 * dimensions.
 *
 * A stock dimension rounded to the precision you cut to costs you nothing; you
 * were going to cut to that precision anyway. A dado LOCATION rounded the same
 * way costs you the joint: two dados 1/32" apart are two different setups, and
 * a merged row would print one offset and be quietly wrong about the other
 * part. Being too strict splits a row, which is visible and harmless; being too
 * loose prints a wrong measurement, which is neither.
 *
 * This is not the float-equality hazard that made `cutLabel` wrong 2.8% of the
 * time — that compared a SUBTRACTION RESULT against a bound. These are stored
 * values compared to stored values, and two cuts entered as the same number are
 * the same number.
 *
 * Sorting is what makes it order-independent: the same two dados added in
 * either order produce the same signature. `id` is excluded — it is identity,
 * not geometry.
 */
function cutSignature(cuts: Cut[]): string {
  return cuts
    .map((c) =>
      [c.face, c.from, c.across, String(c.offset), String(c.width), String(c.depth)].join(':'),
    )
    .sort()
    .join(';');
}

/**
 * One cut as a line you can read at the bench.
 *
 * Takes the board, not just the cut, because `cutLabel` needs it — dado versus
 * rabbet depends on where the cut sits in the board's dimensions. That is why
 * setup lines are built during grouping, while the board is in hand, rather
 * than reconstructed later from a CutListRow, which carries no board.
 */
function setupLine(board: Board, cut: Cut, precision: number): string {
  const f = (n: number) => formatLength(n, precision);
  const pos = positionAxisOf(cut.face, cut.across);
  return (
    `${f(cut.width)} ${cutLabel(board, cut)}, ${f(cut.depth)} deep — ` +
    `into the ${cut.face} face (${cut.from} side), ` +
    `${f(cut.offset)} from the ${pos} min end, running across the ${cut.across}`
  );
}
```

Add the signature to the key, as a final field in `rowKey`:

```ts
    board.grain,
    cutSignature(board.cuts),
  ].join('|');
```

And populate `setup` where the row is created, replacing `setup: []`:

```ts
        setup: board.cuts.map((cut) => setupLine(board, cut, precision)),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- cutlist`
Expected: PASS, all cases.

If the `phrases a dado part-locally` expectation fails only on spacing, punctuation, or the em dash, **fix the code to match the expectation** — the exact string is the spec's (§4) and the test is the contract. If you believe the expectation itself is wrong, stop and escalate.

- [ ] **Step 5: Run the full suite and the typecheck**

Run: `npm test && npm run build`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/document/cutlist.ts src/document/cutlist.test.ts
git commit -m "feat: put joinery on the cut list

Each row carries a bench-readable line per cut, and cuts join the row's
identity — exactly, unlike the dimensions. A rounded stock dimension costs
nothing; a rounded dado location costs the joint."
```

---

## Task 3: The `CutList` panel

**Files:**
- Create: `src/panels/CutList.tsx`
- Create: `src/panels/CutList.test.tsx`

**Interfaces:**
- Consumes: `buildCutList` from `../document/document`; `useStore` from `../store/store`.
- Produces: `export function CutList({ onClose }: { onClose: () => void })`. Task 4 renders it and supplies `onClose`.

The component owns its own Escape handling so `App` stays thin. It renders as a direct child of `.app` — Task 4's print CSS depends on that.

- [ ] **Step 1: Write the failing test**

Create `src/panels/CutList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board } from '../document/document';
import { CutList } from './CutList';

const load = (...boards: Partial<Board>[]) =>
  useStore.getState().replaceDocument({
    ...createDocument('Test'),
    boards: boards.map((b, i) => createBoard({ name: `P${i}`, ...b })),
  });

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('CutList', () => {
  it('says so when there are no parts', () => {
    render(<CutList onClose={() => {}} />);
    expect(screen.getByText('No parts yet.')).toBeInTheDocument();
  });

  it('renders a group header, a quantity and the part names', () => {
    load({ material: 'oak', thickness: 0.75, length: 24, width: 3.5 },
         { material: 'oak', thickness: 0.75, length: 24, width: 3.5 });
    render(<CutList onClose={() => {}} />);

    expect(screen.getByText('Oak — 3/4"')).toBeInTheDocument();
    expect(screen.getByText('2 ×')).toBeInTheDocument();
    expect(screen.getByText('24" × 3-1/2"')).toBeInTheDocument();
    expect(screen.getByText('P0, P1')).toBeInTheDocument();
  });

  it('renders a setup line under a row that has joinery', () => {
    load({ cuts: [{ id: 'c1', face: 'thickness', from: 'min', across: 'width',
                    offset: 6, width: 0.75, depth: 0.25 }] });
    render(<CutList onClose={() => {}} />);
    expect(screen.getByText(/3\/4" dado, 1\/4" deep/)).toBeInTheDocument();
  });

  it('closes on the close button', async () => {
    let closed = false;
    render(<CutList onClose={() => { closed = true; }} />);
    await userEvent.click(screen.getByLabelText('Close cut list'));
    expect(closed).toBe(true);
  });

  it('closes on Escape', async () => {
    let closed = false;
    render(<CutList onClose={() => { closed = true; }} />);
    await userEvent.keyboard('{Escape}');
    expect(closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CutList`
Expected: FAIL — `./CutList` cannot be resolved.

- [ ] **Step 3: Write the component**

Create `src/panels/CutList.tsx`:

```tsx
import { useEffect } from 'react';
import { useStore } from '../store/store';
import { buildCutList } from '../document/document';

/**
 * The cut list as a printable sheet.
 *
 * Derived from the store's document on every render — there is no cached copy,
 * so it cannot go stale — and it formats nothing itself: every string arrives
 * ready from `buildCutList`, which is what keeps display rounding in one place.
 *
 * Rendered as a direct child of `.app`, which the print stylesheet depends on:
 * it hides `.app > *` other than this overlay.
 */
export function CutList({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const list = buildCutList(doc);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cutlist-overlay" role="dialog" aria-modal="true" aria-label="Cut list">
      <div className="cutlist-sheet">
        <header className="cutlist-head">
          <h2>Cut list — {doc.name}</h2>
          <div className="cutlist-actions">
            <button onClick={() => window.print()}>Print</button>
            <button onClick={onClose} aria-label="Close cut list">✕</button>
          </div>
        </header>

        {list.groups.length === 0 ? (
          <p className="cutlist-empty">No parts yet.</p>
        ) : (
          list.groups.map((group) => (
            <section className="cutlist-group" key={group.label}>
              <h3>{group.label}</h3>
              <ul className="cutlist-rows">
                {group.rows.map((row) => (
                  <li className="cutlist-row" key={row.key}>
                    <span className="cutlist-qty">{row.qty} ×</span>
                    <span className="cutlist-dims">{row.dims}</span>
                    <span className="cutlist-names">{row.names.join(', ')}</span>
                    {row.setup.length > 0 && (
                      <ul className="cutlist-setup">
                        {row.setup.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
```

`key={group.label}` is safe because a label is its material label plus its formatted thickness, which is exactly what groups are keyed by. `key={line}` is safe because two identical setup lines on one row would mean two identical cuts, which remove the same stock and are indistinguishable anyway.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- CutList`
Expected: PASS. `window.print` exists in jsdom as a no-op; the tests never click Print.

- [ ] **Step 5: Run the full suite and the typecheck**

Run: `npm test && npm run build`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/panels/CutList.tsx src/panels/CutList.test.tsx
git commit -m "feat: render the cut list as a sheet

A dumb renderer over buildCutList — it formats nothing itself, and derives
from the store every render so it cannot go stale."
```

---

## Task 4: Wire it up — toolbar, modal state, styles, print

**Files:**
- Modify: `src/panels/Toolbar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css` (append; the `prefers-reduced-motion` block stays last)
- Modify: `src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: Task 3's `CutList` component.
- Produces: `Toolbar` gains one required prop, `onOpenCutList: () => void`. Every existing `<Toolbar>` render — in `App.tsx` and in `Toolbar.test.tsx` — must pass it or the typecheck fails.

- [ ] **Step 1: Write the failing test**

`src/panels/Toolbar.test.tsx` already has a `renderToolbar(overrides)` helper that supplies every prop and spreads overrides — that pattern exists precisely so a new prop touches one line. Add `onOpenCutList={noop}` to the helper's prop list, then add this test inside the existing `describe`:

```tsx
  it('opens the cut list', async () => {
    let opened = false;
    renderToolbar({ onOpenCutList: () => { opened = true; } });
    await userEvent.click(screen.getByText('Cut list'));
    expect(opened).toBe(true);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Toolbar`
Expected: FAIL — no element with the text `Cut list`.

- [ ] **Step 3: Add the button**

In `src/panels/Toolbar.tsx`, add to the `Props` interface:

```ts
  /** Opens the cut list sheet. */
  onOpenCutList: () => void;
```

Add `onOpenCutList` to the destructured parameters, and add the button immediately after the `+ Add board` button, before the `toolbar-divider` that follows it:

```tsx
        <button onClick={onOpenCutList} title="Cut list — parts, quantities and joinery">
          Cut list
        </button>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- Toolbar`
Expected: PASS. The full suite will still fail to typecheck until Step 5 — that is expected.

- [ ] **Step 5: Hold the modal state in `App`**

In `src/App.tsx`:

Add the import alongside the other panel imports:

```tsx
import { CutList } from './panels/CutList';
```

Add the state beside `showAxes`:

```tsx
  // Also view state, and also deliberately outside the document and the undo
  // stack: the cut list is a way of looking at a project, not part of one.
  const [cutListOpen, setCutListOpen] = useState(false);
```

In the keyboard effect, immediately after the `isTextEntry` guard, add:

```tsx
      // The cut list covers the app, so board shortcuts must not fire behind
      // it — Delete/Backspace especially, which would silently delete the
      // selected board while the user is reading a sheet that never shows a
      // selection. Escape is handled by CutList itself.
      if (cutListOpen) return;
```

Add `cutListOpen` to that effect's dependency array: `}, [undo, redo, deleteBoard, cutListOpen]);`

Pass the prop to `<Toolbar>`:

```tsx
        onOpenCutList={() => setCutListOpen(true)}
```

Render the modal as the **last direct child of `.app`**, after `</main>`:

```tsx
      {cutListOpen && <CutList onClose={() => setCutListOpen(false)} />}
```

- [ ] **Step 6: Add the styles**

Append to `src/styles.css`, **before** the closing `@media (prefers-reduced-motion: reduce)` block so that block stays last:

```css
/* ---- Cut list ------------------------------------------------------------
 * A sheet laid over the instrument. On paper it stops being a modal: the
 * print block below hides everything else in `.app` and strips the overlay
 * back to ink on white. Same DOM either way — there is no second render path
 * that could drift from what was on screen.
 */

.cutlist-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  padding: 32px 16px;
  overflow: auto;
  background: rgba(12, 14, 16, 0.72);
}

.cutlist-sheet {
  width: min(760px, 100%);
  height: max-content;
  padding: 24px 28px 32px;
  background: var(--graphite-900);
  border: 1px solid var(--rule);
  border-radius: 4px;
}

.cutlist-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.cutlist-actions {
  display: flex;
  gap: 8px;
}

.cutlist-group {
  margin-top: 28px;
}

.cutlist-group h3 {
  margin: 0 0 8px;
  color: var(--brass);
}

.cutlist-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.cutlist-row {
  display: grid;
  grid-template-columns: 3.5em 11em 1fr;
  gap: 4px 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--rule-soft);
  font-variant-numeric: tabular-nums;
}

.cutlist-qty {
  text-align: right;
  color: var(--ink-dim);
}

.cutlist-names {
  color: var(--ink-dim);
}

.cutlist-setup {
  grid-column: 2 / -1;
  margin: 4px 0 0;
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--brass-dim);
  list-style: none;
  color: var(--ink-dim);
  font-size: 0.9em;
}

.cutlist-empty {
  margin-top: 24px;
  color: var(--ink-faint);
}

@media print {
  /* The overlay is a direct child of `.app` — see CutList.tsx. */
  .app > *:not(.cutlist-overlay) { display: none !important; }

  .cutlist-overlay {
    position: static;
    overflow: visible;
    padding: 0;
    background: #fff;
  }

  .cutlist-sheet {
    width: 100%;
    padding: 0;
    background: #fff;
    border: 0;
  }

  .cutlist-actions { display: none; }

  .cutlist-overlay,
  .cutlist-sheet,
  .cutlist-group h3,
  .cutlist-qty,
  .cutlist-names,
  .cutlist-setup { color: #000; }

  .cutlist-row {
    border-bottom: 1px solid #ccc;
    break-inside: avoid;
  }

  .cutlist-setup { border-left-color: #999; }
}
```

- [ ] **Step 7: Run the full suite and the typecheck**

Run: `npm test && npm run build`
Expected: both green. If `App.test.tsx` fails, read it before changing it — it may render `<Toolbar>` indirectly through `<App />`, in which case nothing there needs touching.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/styles.css
git commit -m "feat: open the cut list from the toolbar, and print it

Board shortcuts are suppressed while the sheet is open — Delete especially,
which would otherwise silently delete the selected board behind a view that
never shows a selection. Printing is CSS over the same DOM."
```

---

## Task 5: Browser verification and documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/follow-ups.md`

- [ ] **Step 1: Verify in a real browser**

Run `npm run dev -- --port 5199`, then drive it with the Playwright MCP (the only browser tooling that works on this host — see the memory note and follow-up 26a).

Check, with a screenshot for each:

1. Add three boards; give two of them identical dimensions and material, and the third a different thickness. Open the cut list: two groups, one row of quantity 2, one row of quantity 1.
2. Add a dado to one board via the Properties panel. Reopen the sheet: that part splits onto its own row with a setup line beneath it.
3. Press Escape — the sheet closes. Reopen it, select a part first, then press Delete while the sheet is open — the part must **not** disappear.
4. Emulate print media and screenshot: the toolbar, viewport and panels are gone; the sheet is dark-on-white with no buttons.

The cut list touches no shader, so a software-GL screenshot is trustworthy here — unlike anything in the viewport. Say so in the report.

- [ ] **Step 2: Update `CLAUDE.md`**

Four edits, all of which must reflect what was actually built:

1. **Architecture, module dependency order.** Item 1 currently says `units` and `document` are "both leaves of the dependency graph; each imports nothing from the rest of the app". That is no longer true. Rewrite it: `units` is the bottom layer and imports nothing; `document` sits above it and imports `formatLength` for the cut list's grouping key, because identity is defined as "prints identically" and so must be produced by the same function that prints. Note that the edge creates no cycle and that injecting the formatter was rejected — it would move the definition of part identity to the call site.
2. **Where things live.** Add `document/cutlist.ts` (buildCutList: group, collapse, phrase; pure) and `panels/CutList.tsx` (the printable sheet).
3. **Status.** The cut list has shipped; state what it is (grouped stock rows plus per-part setup lines, printable) and what is next. Update the test count from the actual `npm test` output — do not carry `397` forward without checking.
4. **A new invariant 18.** Dimensions collapse at display precision, cuts must match exactly. Give the reason — a rounded stock dimension costs nothing, a rounded dado location costs the joint — and note that this is not the float-`===` hazard `cutLabel` had, because these are stored values compared to stored values rather than a subtraction result compared to a bound.

- [ ] **Step 3: Update `docs/follow-ups.md`**

Add a cut-list section. Record anything found and deferred during implementation. If nothing was, say so explicitly — an empty section stating "nothing deferred" is a real record; silence is not.

Note also that 48 and 49 remain open and remain unaffected: the cut list reports stock dimensions, which a board whose cuts remove everything still has.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/follow-ups.md
git commit -m "docs: record the cut list

Notes the one layering amendment it brought (document -> units) and adds
invariant 18 for the asymmetric tolerance rule."
```

---

## Self-review notes

Spec coverage checked section by section: §1 (no schema change) is a global constraint and Task 5's docs; §2 (module, layering, output shape) is Task 1 plus Task 5's CLAUDE.md edit; §3 (identity, tolerance, signature, ordering) is Tasks 1 and 2; §4 (setup lines) is Task 2; §5 (panel, entry point, print) is Tasks 3 and 4; §6 (testing) is distributed across every task, with the browser check in Task 5; §7 (non-goals) is implemented by absence and recorded in Task 5.

Two things the spec did not anticipate, both added here with their reasoning: **Task 4's suppression of board shortcuts while the sheet is open** (Delete would otherwise delete the selected board behind a full-screen view that shows no selection), and **`Toolbar`'s new prop being required**, which makes the typecheck rather than a runtime error catch any missed call site.
