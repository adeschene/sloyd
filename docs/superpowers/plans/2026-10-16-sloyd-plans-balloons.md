# Plans Sheet Part Balloons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Number every cut-list row, print the number on the cut list, and put one numbered balloon per row on the Plans sheet's exploded view, with a leader to a line drawn for that row's part.

**Architecture:** `buildCutList` assigns each row its display-order `number` and its parts' `boardIds` (one home for the number). A new pure module `panels/planBalloons.ts` picks each row's anchor on the exploded drawing's visible segments and lays the balloons out in left/right columns (`packRow`), returning the figure's layout; with no balloons it equals `layoutSingle`. `ExplodedFigure` draws the balloons and a notes line.

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library, SVG. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-sloyd-plans-balloons-design.md` (approved 2026-10-16). Read it first; this plan argues from it.

## Global Constraints

- One number per cut-list row (R2); one balloon per row (R4); the exploded view ONLY (R3) — no balloons on the Front/Side/Plan elevations.
- The number is assigned ONLY in `buildCutList`, after its existing sort; nothing else numbers rows.
- No schema change; nothing new is stored in the document.
- Invariant 19: the balloon's size is measured with `labelWidth`/`labelHeight` (`panels/diagramLabels.ts`); `LABEL_SIZE` stays the `<svg>` attribute; CSS never sets a font-size on SVG text.
- With no balloons, `layoutBalloons` returns exactly `layoutSingle`'s scale, width, height and placement, and the exploded `<svg>` is unchanged (no `fontSize` attribute added).
- Height caps: a column fits `ISO_MAX_HEIGHT` (640) first; the figure may grow to `TRIO_MAX_HEIGHT` (1250); rows past that are listed in the note, never dropped silently.
- Note text, exactly: `Not visible in this view: <list>.` and `Not ballooned (no room): <list>.` — `<list>` from `numberList` (runs of three or more as `a–b`, en dash).
- House rules (CLAUDE.md): test-first; mutate every new test that guards an ordering, a refusal or a "cannot exceed"; `npm run build` is the typecheck gate (`npm test` does not typecheck); commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; work on branch `plans-balloons`, merged with `--no-ff` at the end.

## Review Focus

1. **A one-row document** (a single board): one balloon, a column on ONE side only, the other side's width not reserved. Test in Task 3.
2. **Two rows whose anchors coincide** (stacked parts whose longest edges overlap): both balloons placed, no overlap, each leader ends on its own anchor. Test in Task 3.
3. **Ten or more rows**: two-digit numbers set the radius for EVERY balloon on the figure (one size). Test in Task 3.
4. **A zero-length visible segment** (a degenerate edge) is never chosen as the anchor, and does not count toward a part's visible length. Test in Task 3.
5. **Assembly copies and mirrored copies**: a row whose parts live in several copies still gets exactly one balloon, anchored on one of its parts, and its number matches the cut list. Test in Task 4 (`cabinetsDoc`, one copy mirrored).

---

## File Structure

- Modify `src/document/cutlist.ts` — `CutListRow.number`, `CutListRow.boardIds`; assigned in `buildCutList`.
- Modify `src/document/cutlist.test.ts` — numbering tests.
- Modify `src/panels/CutList.tsx` — the leading number column.
- Modify `src/panels/CutList.test.tsx` — the column renders.
- Create `src/panels/planBalloons.ts` — `anchorsFor`, `layoutBalloons`, `balloonRadius`, `numberList` (pure).
- Create `src/panels/planBalloons.test.ts`.
- Modify `src/panels/PlanFigure.tsx` — `ExplodedFigure` draws balloons and the note.
- Modify `src/panels/PlansSheet.test.tsx` — balloons on the sheet.
- Modify `src/styles.css` — `.cutlist-num`, the row grid, `.plans-balloon*`, `.plans-leader*`, print block.
- Docs at the end: `docs/follow-ups.md` (252), `CLAUDE.md`, `docs/history.md`.

---

### Task 1: Number the cut-list rows

**Files:**
- Modify: `src/document/cutlist.ts` (interface `CutListRow` ~line 32; the row literal ~line 328; the loop ~line 358; after `out.sort(...)` ~line 392)
- Test: `src/document/cutlist.test.ts` (append)

**Interfaces:**
- Produces: `CutListRow.number: number` (1-based, display order across all groups); `CutListRow.boardIds: string[]` (the row's boards' ids, document order — the `flatDocument` ids, which are `worldParts` ids).

- [ ] **Step 1: Write the failing tests** (append to `src/document/cutlist.test.ts`)

```ts
// Plans balloons spec §2: one number per row, in display order, assigned once by buildCutList.
describe('row numbers and board ids (plans balloons §2)', () => {
  const mixed = () => {
    const doc = createDocument('Numbers');
    const b = (o: Partial<Board>) => createBoard({ length: 24, width: 6, thickness: 0.75, ...o });
    doc.boards.push(
      b({ name: 'Oak short', material: 'oak', length: 12 }),
      b({ name: 'Pine long', material: 'pine', length: 30 }),
      b({ name: 'Oak long', material: 'oak', length: 30 }),
      b({ name: 'Pine long 2', material: 'pine', length: 30 }),
      b({ name: 'Panel', material: 'plywood', length: 30, width: 20 }),
    );
    return doc;
  };
  it('numbers rows 1..N in the order the cut list displays them, across groups', () => {
    const list = buildCutList(mixed());
    const rows = list.groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.number)).toEqual(rows.map((_, i) => i + 1));
    // Display order: groups by material label (Oak, Pine, Plywood), rows by length descending.
    expect(rows.map((r) => r.names.join('+'))).toEqual(['Oak long', 'Oak short', 'Pine long+Pine long 2', 'Panel']);
  });
  it('lists every board in exactly one row, by id, in document order', () => {
    const doc = mixed();
    const rows = buildCutList(doc).groups.flatMap((g) => g.rows);
    expect(rows.flatMap((r) => r.boardIds).sort()).toEqual(doc.boards.map((b) => b.id).sort());
    const pine = rows.find((r) => r.qty === 2)!;
    expect(pine.boardIds).toEqual([doc.boards[1].id, doc.boards[3].id]);
  });
  it('renumbers when an edit re-sorts the rows', () => {
    const doc = mixed();
    const before = buildCutList(doc).groups.flatMap((g) => g.rows).find((r) => r.names[0] === 'Oak short')!.number;
    doc.boards[0] = { ...doc.boards[0], length: 40 }; // Oak short becomes the longest oak row
    const after = buildCutList(doc).groups.flatMap((g) => g.rows).find((r) => r.names[0] === 'Oak short')!.number;
    expect([before, after]).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/cutlist.test.ts -t "plans balloons"`
Expected: FAIL — `number`/`boardIds` undefined (and a type error at build).

- [ ] **Step 3: Implement**

In `interface CutListRow`, after `qty: number;`:

```ts
  /** 1-based position in display order across every group (plans balloons spec §2): the ONE row number, printed on
   *  the cut list and on the Plans sheet's balloons. Assigned once, after the sort below; never stored. */
  number: number;
  /** The ids of the row's boards, in document order (`flatDocument` ids, which are `worldParts` ids). */
  boardIds: string[];
```

In the row literal (`row = { key, qty: 0, names: [], ...`), add `number: 0,` and `boardIds: [],` after `names: [],`.

After `row.names.push(board.name);` add:

```ts
    row.boardIds.push(board.id);
```

After the final `out.sort(...)` and before `return { groups: out };`:

```ts
  // The ONE numbering (plans balloons spec §2): display order, after both sorts.
  let n = 0;
  for (const group of out) for (const row of group.rows) row.number = ++n;
```

- [ ] **Step 4: Run to verify they pass, then build**

Run: `npx vitest run src/document` then `npm run build`
Expected: all pass; build clean (any other literal constructing a `CutListRow` will fail the build — fix by adding the two fields; `grep -rn "stockInches: 0" src` finds them).

- [ ] **Step 5: Mutate**

Move the numbering loop ABOVE `out.sort(...)`. Run the first test: it must FAIL (numbers no longer follow display order across groups). Restore by copying back the file you saved (`cp`), never `git checkout`.

- [ ] **Step 6: Commit**

```bash
git add src/document/cutlist.ts src/document/cutlist.test.ts
git commit -m "plans balloons: number cut-list rows in display order, with their board ids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The cut list prints the number (and the key-series decision)

**Files:**
- Modify: `src/panels/CutList.tsx` (the `<li className="cutlist-row">`, ~line 135)
- Modify: `src/styles.css` (`.cutlist-row` grid ~line 1074; `.cutlist-setup` and `.cutlist-diagram` `grid-column` ~lines 1128, 1138; the print block's colour list ~line 1396)
- Test: `src/panels/CutList.test.tsx` (append)

**Interfaces:**
- Consumes: `CutListRow.number` (Task 1).

- [ ] **Step 1: Write the failing test** (append)

```ts
// Plans balloons spec §2.1: each row leads with its number, the one a Plans sheet balloon cites.
describe('row numbers (plans balloons §2.1)', () => {
  it('leads each row with its number, in display order', () => {
    load({ name: 'Short', length: 12 }, { name: 'Long', length: 30 });
    const { container } = render(<CutList onClose={() => {}} />);
    const nums = [...container.querySelectorAll('.cutlist-row > .cutlist-num')].map((e) => e.textContent);
    expect(nums).toEqual(['1', '2']);
    expect(container.querySelector('.cutlist-row')!.firstElementChild).toHaveClass('cutlist-num');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/panels/CutList.test.tsx -t "plans balloons"`
Expected: FAIL (no `.cutlist-num`).

- [ ] **Step 3: Implement**

In `CutList.tsx`, first child of `<li className="cutlist-row" key={row.key}>`:

```tsx
                    <span className="cutlist-num">{row.number}</span>
```

In `styles.css`:

```css
.cutlist-row {
  display: grid;
  grid-template-columns: 2.5em 3.5em 11em 1fr 7.5em;
```

(only the `grid-template-columns` line changes). Change both `.cutlist-setup` and `.cutlist-diagram` from `grid-column: 2 / -1;` to `grid-column: 3 / -1;` (they stay aligned under the dimensions). Add after `.cutlist-qty { ... }`:

```css
/* Plans balloons spec §2.1: the row number a Plans sheet balloon cites. */
.cutlist-num {
  text-align: right;
  font-family: var(--font-num);
  color: var(--ink);
}
```

In the print block's colour list (the selector list containing `.cutlist-qty,`), add `.cutlist-num,` beside `.cutlist-qty,`.

- [ ] **Step 4: Run and build**

Run: `npx vitest run src/panels/CutList.test.tsx` and `npm run build`
Expected: pass; clean.

- [ ] **Step 5: The key-series decision (spec §2.1) — STOP for the user**

Start the dev server (`npx vite --port 5179 --strictPort`, in the background; kill it by its PID from `ss -ltnp`, never `pkill -f`). Record the dev origin's `localStorage` keys from `http://localhost:5179/package.json` first. Seed a project with two plywood panels and two 1×2 pine parts (so a sheet layout key and a board layout key both print), open the cut list, Layouts on, and screenshot the rows and a layout key together. Then ask the user to choose:

- **Keep both as numbers** (no change), or
- **Key as letters**: in `SheetLayout.tsx`, the index label and the key list read `A, B, C…` (`String.fromCharCode(64 + n)` for n ≤ 26, then `AA`… is not needed below 27 keyed parts per sheet; refuse to guess beyond — fall back to numbers past 26), or
- **A `#` heading**: a header row above each group's rows with `#` over the number column.

Apply the chosen option test-first (a `SheetLayout.test.tsx` assertion on the key's first entry for letters; a `CutList.test.tsx` assertion on the heading for `#`). Delete only the `localStorage` keys this step created, verified empty from `package.json`.

- [ ] **Step 6: Commit**

```bash
git add src/panels/CutList.tsx src/panels/CutList.test.tsx src/styles.css src/panels/SheetLayout.tsx src/panels/SheetLayout.test.tsx
git commit -m "plans balloons: the cut list leads each row with its number

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Balloon placement — `panels/planBalloons.ts`

**Files:**
- Create: `src/panels/planBalloons.ts`
- Test: `src/panels/planBalloons.test.ts`

**Interfaces:**
- Consumes: `Drawing`, `P2`, `Seg2` (`document/drawing.ts`); `labelWidth`, `labelHeight`, `packRow` (`panels/diagramLabels.ts`); `ISO_MARGIN`, `ISO_MAX_HEIGHT`, `MAX_PLAN_SCALE`, `PLAN_WIDTH`, `TRIO_MAX_HEIGHT`, `layoutSingle`, `Placement` (`panels/planLayout.ts`).
- Produces:
  - `interface BalloonRow { number: number; boardIds: readonly string[] }`
  - `type BalloonSide = 'left' | 'right'`
  - `interface Anchor { number: number; side: BalloonSide; at: P2 }` — `at` in DRAWING coordinates
  - `interface Anchors { anchors: Anchor[]; hidden: number[] }`
  - `function anchorsFor(d: Drawing, rows: readonly BalloonRow[]): Anchors`
  - `interface PlacedBalloon { number: number; side: BalloonSide; centre: P2; anchor: P2 }` — both in SVG coordinates
  - `interface BalloonLayout { scale: number; width: number; height: number; at: Placement; radius: number; placed: PlacedBalloon[]; unplaced: number[] }`
  - `function layoutBalloons(d: Drawing, plan: Anchors): BalloonLayout`
  - `function balloonRadius(anchors: readonly Anchor[]): number`
  - `function numberList(ns: readonly number[]): string`
  - constants `BALLOON_PAD = 4`, `BALLOON_GAP = 6`, `COLUMN_CLEAR = 24`

- [ ] **Step 1: Write the failing tests** (`src/panels/planBalloons.test.ts`)

```ts
import type { Drawing, Seg2 } from '../document/drawing';
import { labelHeight, labelWidth } from './diagramLabels';
import { ISO_MARGIN, ISO_MAX_HEIGHT, PLAN_WIDTH, TRIO_MAX_HEIGHT, layoutSingle } from './planLayout';
import { BALLOON_GAP, BALLOON_PAD, anchorsFor, balloonRadius, layoutBalloons, numberList } from './planBalloons';

const seg = (part: string, a: [number, number], b: [number, number]): Seg2 => ({ part, a, b });
const drawing = (visible: Seg2[]): Drawing => {
  const xs = visible.flatMap((s) => [s.a[0], s.b[0]]);
  const ys = visible.flatMap((s) => [s.a[1], s.b[1]]);
  return { visible, hidden: [], bounds: { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] } };
};
// A 40 x 20 drawing: part L on the left, part R on the right, part M in the middle-left.
const D = drawing([
  seg('L', [0, 0], [0, 20]), seg('L', [0, 20], [4, 20]),
  seg('R', [40, 0], [40, 10]), seg('R', [36, 10], [40, 10]),
  seg('M', [10, 5], [18, 5]),
]);

describe('anchorsFor', () => {
  it('anchors on the midpoint of the most visible part\'s longest segment, and sides by the drawing\'s centre', () => {
    const { anchors, hidden } = anchorsFor(D, [{ number: 1, boardIds: ['R', 'L'] }, { number: 2, boardIds: ['M'] }]);
    expect(hidden).toEqual([]);
    // L has 24" of visible line against R's 14": L wins although R is listed first; its longest segment is x = 0.
    expect(anchors[0]).toEqual({ number: 1, side: 'left', at: [0, 10] });
    expect(anchors[1]).toEqual({ number: 2, side: 'left', at: [14, 5] });
  });
  it('breaks a visible-length tie toward the first part listed', () => {
    const t = drawing([seg('A', [0, 0], [10, 0]), seg('B', [30, 0], [40, 0])]);
    expect(anchorsFor(t, [{ number: 1, boardIds: ['B', 'A'] }]).anchors[0].at).toEqual([35, 0]);
  });
  it('sends a row with no visible segment to `hidden`', () => {
    expect(anchorsFor(D, [{ number: 4, boardIds: ['gone'] }])).toEqual({ anchors: [], hidden: [4] });
  });
  it('never anchors on, or counts, a zero-length segment (Review Focus 4)', () => {
    const z = drawing([seg('A', [5, 5], [5, 5]), seg('A', [0, 0], [2, 0]), seg('B', [30, 0], [30, 1])]);
    const { anchors } = anchorsFor(z, [{ number: 1, boardIds: ['A'] }]);
    expect(anchors[0].at).toEqual([1, 0]);
    expect(anchorsFor(drawing([seg('A', [5, 5], [5, 5]), seg('B', [0, 0], [1, 0])]), [{ number: 2, boardIds: ['A'] }]).hidden).toEqual([2]);
  });
});

describe('layoutBalloons', () => {
  it('with no balloons is exactly layoutSingle', () => {
    const lay = layoutBalloons(D, { anchors: [], hidden: [] });
    const single = layoutSingle(D.bounds);
    expect({ scale: lay.scale, width: lay.width, height: lay.height, at: lay.at }).toEqual(single);
    expect(lay.placed).toEqual([]);
  });
  it('reserves a column only on a side that has balloons (Review Focus 1)', () => {
    const one = layoutBalloons(D, anchorsFor(D, [{ number: 1, boardIds: ['R'] }]));
    const r = one.radius;
    expect(one.placed).toHaveLength(1);
    expect(one.placed[0].side).toBe('right');
    expect(one.at.x).toBe(ISO_MARGIN);                                   // no left column
    expect(one.placed[0].centre[0]).toBeCloseTo(one.width - ISO_MARGIN - r, 9);
    expect(one.width).toBeLessThanOrEqual(PLAN_WIDTH + 1e-9);
  });
  it('sizes every balloon from the widest number, measured (inv 19; Review Focus 3)', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, boardIds: [i % 2 ? 'L' : 'R'] }));
    const plan = anchorsFor(D, rows);
    expect(balloonRadius(plan.anchors)).toBe(Math.max(labelWidth('12'), labelHeight()) / 2 + BALLOON_PAD);
    expect(layoutBalloons(D, plan).radius).toBe(balloonRadius(plan.anchors));
  });
  it('packs a column without overlap, each leader ending on its own anchor (fu 71; Review Focus 2)', () => {
    // Five rows anchored on the SAME point: the column must cascade them.
    const rows = Array.from({ length: 5 }, (_, i) => ({ number: i + 1, boardIds: ['L'] }));
    const plan = anchorsFor(D, rows);
    const lay = layoutBalloons(D, plan);
    const ys = lay.placed.map((p) => p.centre[1]);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(2 * lay.radius + BALLOON_GAP - 1e-9);
    const toSvg = (p: [number, number]) => [lay.at.x + (p[0] - D.bounds.min[0]) * lay.scale, lay.at.y + (D.bounds.max[1] - p[1]) * lay.scale];
    for (const p of lay.placed) expect(p.anchor).toEqual(toSvg(plan.anchors.find((a) => a.number === p.number)!.at));
  });
  it('orders a column by anchor height, top first', () => {
    const t = drawing([seg('Hi', [0, 18], [2, 18]), seg('Lo', [0, 2], [2, 2]), seg('X', [40, 0], [40, 20])]);
    const lay = layoutBalloons(t, anchorsFor(t, [{ number: 1, boardIds: ['Lo'] }, { number: 2, boardIds: ['Hi'] }]));
    const left = lay.placed.filter((p) => p.side === 'left');
    expect(left.map((p) => p.number)).toEqual([2, 1]);
    expect(left[0].centre[1]).toBeLessThan(left[1].centre[1]);
  });
  it('grows the figure for a tall column, up to TRIO_MAX_HEIGHT, and notes the rows past it', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ number: i + 1, boardIds: ['L'] }));
    const lay = layoutBalloons(D, anchorsFor(D, rows));
    expect(lay.height).toBeLessThanOrEqual(TRIO_MAX_HEIGHT + 1e-9);
    expect(lay.height).toBeGreaterThan(ISO_MAX_HEIGHT);
    expect(lay.placed.length + lay.unplaced.length).toBe(80);
    expect(lay.unplaced.length).toBeGreaterThan(0);
    const maxY = Math.max(...lay.placed.map((p) => p.centre[1] + lay.radius));
    expect(maxY).toBeLessThanOrEqual(lay.height - ISO_MARGIN + 1e-9);
  });
});

describe('numberList', () => {
  it('collapses runs of three or more with an en dash', () => {
    expect(numberList([9, 7])).toBe('7, 9');
    expect(numberList([33, 34, 35, 36, 40, 41])).toBe('33–36, 40, 41');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/panels/planBalloons.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (`src/panels/planBalloons.ts`)

```ts
import type { Drawing, P2, Seg2 } from '../document/drawing';
import { labelHeight, labelWidth, packRow } from './diagramLabels';
import { ISO_MARGIN, ISO_MAX_HEIGHT, MAX_PLAN_SCALE, PLAN_WIDTH, TRIO_MAX_HEIGHT, type Placement } from './planLayout';

/**
 * Part balloons on the Plans sheet's exploded view (plans balloons spec §3): one balloon per cut-list row, in a column
 * left or right of the figure, with a leader to a point on a line DRAWN for one of the row's parts. Pure arithmetic;
 * `ExplodedFigure` draws what this returns.
 */

/** Clearance between a balloon's number box and its circle. */
export const BALLOON_PAD = 4;
/** Between two balloons in a column. */
export const BALLOON_GAP = 6;
/** Between a column and the drawing: room for a leader to turn toward its anchor. */
export const COLUMN_CLEAR = 24;

export interface BalloonRow { number: number; boardIds: readonly string[] }
export type BalloonSide = 'left' | 'right';
/** A row's anchor, in DRAWING coordinates. */
export interface Anchor { number: number; side: BalloonSide; at: P2 }
export interface Anchors { anchors: Anchor[]; hidden: number[] }
/** A placed balloon, in SVG coordinates: its centre and the anchor its leader ends on. */
export interface PlacedBalloon { number: number; side: BalloonSide; centre: P2; anchor: P2 }
export interface BalloonLayout {
  scale: number; width: number; height: number; at: Placement;
  radius: number; placed: PlacedBalloon[]; unplaced: number[];
}

const length = (s: Seg2) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);

/**
 * Each row's anchor (§3.1): among its parts, the one with the most visible line (a tie: the first listed); the midpoint
 * of that part's longest visible segment (a tie: the first drawn). A row with no visible segment is `hidden`. A
 * zero-length segment is not a line and counts for nothing.
 */
export function anchorsFor(d: Drawing, rows: readonly BalloonRow[]): Anchors {
  const byPart = new Map<string, Seg2[]>();
  for (const s of d.visible) {
    if (length(s) <= 0) continue;
    const list = byPart.get(s.part);
    if (list) list.push(s);
    else byPart.set(s.part, [s]);
  }
  const midX = (d.bounds.min[0] + d.bounds.max[0]) / 2;
  const anchors: Anchor[] = [];
  const hidden: number[] = [];
  for (const row of rows) {
    let best: Seg2[] | null = null;
    let bestLength = 0;
    for (const id of row.boardIds) {
      const segs = byPart.get(id);
      if (!segs) continue;
      const total = segs.reduce((t, s) => t + length(s), 0);
      if (total > bestLength) { best = segs; bestLength = total; }
    }
    if (!best) { hidden.push(row.number); continue; }
    let longest = best[0]!;
    for (const s of best) if (length(s) > length(longest)) longest = s;
    const at: P2 = [(longest.a[0] + longest.b[0]) / 2, (longest.a[1] + longest.b[1]) / 2];
    anchors.push({ number: row.number, side: at[0] < midX ? 'left' : 'right', at });
  }
  return { anchors, hidden };
}

/** One radius for every balloon on a figure: the widest number's measured box, plus the pad (inv 19). */
export function balloonRadius(anchors: readonly Anchor[]): number {
  const widest = Math.max(0, ...anchors.map((a) => labelWidth(String(a.number))));
  return Math.max(widest, labelHeight()) / 2 + BALLOON_PAD;
}

/**
 * The exploded figure's layout with its balloon columns (§3.2–3.4). With no balloons this IS `layoutSingle` (same
 * scale, size and placement). A column exists only on a side with balloons; the drawing scales down to make room.
 * The figure grows past ISO_MAX_HEIGHT only for a column that needs it, up to TRIO_MAX_HEIGHT; rows past that are
 * `unplaced` (the lowest anchors in their column), listed in the figure's note.
 */
export function layoutBalloons(d: Drawing, plan: Anchors): BalloonLayout {
  const w = d.bounds.max[0] - d.bounds.min[0];
  const h = d.bounds.max[1] - d.bounds.min[1];
  const radius = balloonRadius(plan.anchors);
  const column = 2 * radius + COLUMN_CLEAR;
  const count = (side: BalloonSide) => plan.anchors.filter((a) => a.side === side).length;
  const left = count('left') > 0 ? column : 0;
  const right = count('right') > 0 ? column : 0;
  const byW = w > 0 ? (PLAN_WIDTH - 2 * ISO_MARGIN - left - right) / w : Infinity;
  const byH = h > 0 ? ISO_MAX_HEIGHT / h : Infinity;
  const scale = Math.min(byW, byH, MAX_PLAN_SCALE);
  const drawnH = h * scale;
  const pitch = 2 * radius + BALLOON_GAP;
  const need = (n: number) => (n > 0 ? n * pitch - BALLOON_GAP : 0);
  const contentH = Math.min(TRIO_MAX_HEIGHT - 2 * ISO_MARGIN, Math.max(drawnH, need(count('left')), need(count('right'))));
  const at: Placement = { x: ISO_MARGIN + left, y: ISO_MARGIN + (contentH - drawnH) / 2 };
  const width = 2 * ISO_MARGIN + left + w * scale + right;
  const height = 2 * ISO_MARGIN + contentH;
  const toSvg = (p: P2): P2 => [at.x + (p[0] - d.bounds.min[0]) * scale, at.y + (d.bounds.max[1] - p[1]) * scale];
  const fit = Math.max(0, Math.floor((contentH + BALLOON_GAP) / pitch));

  const placed: PlacedBalloon[] = [];
  const unplaced: number[] = [];
  for (const side of ['left', 'right'] as const) {
    const col = plan.anchors
      .filter((a) => a.side === side)
      .map((a) => ({ a, svg: toSvg(a.at) }))
      .sort((p, q) => p.svg[1] - q.svg[1] || p.a.number - q.a.number);
    const kept = col.slice(0, fit);
    for (const x of col.slice(fit)) unplaced.push(x.a.number);
    const ys = packRow(kept.map((x) => ({ centre: x.svg[1], width: 2 * radius })), ISO_MARGIN, ISO_MARGIN + contentH, BALLOON_GAP);
    const cx = side === 'left' ? ISO_MARGIN + radius : width - ISO_MARGIN - radius;
    kept.forEach((x, i) => placed.push({ number: x.a.number, side, centre: [cx, ys[i]!], anchor: x.svg }));
  }
  unplaced.sort((a, b) => a - b);
  return { scale, width, height, at, radius, placed, unplaced };
}

/** `7, 9` / `33–36, 40, 41`: runs of three or more collapse with an en dash. */
export function numberList(ns: readonly number[]): string {
  const sorted = [...new Set(ns)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j += 1;
    if (j - i >= 2) out.push(`${sorted[i]}–${sorted[j]}`);
    else for (let k = i; k <= j; k += 1) out.push(String(sorted[k]));
    i = j + 1;
  }
  return out.join(', ');
}
```

- [ ] **Step 4: Run to verify they pass, then build**

Run: `npx vitest run src/panels/planBalloons.test.ts` and `npm run build`
Expected: pass; clean. If the "no balloons" test fails, the layout differs from `layoutSingle` — fix the code, not the test (Global Constraints).

- [ ] **Step 5: Mutate (each must turn a test red; restore by `cp` from a saved copy)**

1. In `anchorsFor`, `if (total > bestLength)` → `if (total >= bestLength)` — the tie test fails.
2. Remove `if (length(s) <= 0) continue;` — the zero-length test fails.
3. In `layoutBalloons`, sort `col` by `q.svg[1] - p.svg[1]` (bottom first) — the ordering test fails.
4. Replace `anchor: x.svg` with `anchor: kept[kept.length - 1 - i]!.svg` — the leader test fails.
5. Make `left` always `column` — the one-side test fails.

- [ ] **Step 6: Commit**

```bash
git add src/panels/planBalloons.ts src/panels/planBalloons.test.ts
git commit -m "plans balloons: anchors and balloon columns (planBalloons.ts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Draw the balloons on the exploded view

**Files:**
- Modify: `src/panels/PlanFigure.tsx` (`ExplodedFigure`, ~line 143; imports at the top)
- Modify: `src/styles.css` (after `.plans-notes` ~line 1242; print block ~line 1391)
- Test: `src/panels/PlansSheet.test.tsx` (append)

**Interfaces:**
- Consumes: `buildCutList`, `flatDocument` (`document/document`); `anchorsFor`, `layoutBalloons`, `numberList`, `PlacedBalloon` (Task 3); `CutListRow.number`/`boardIds` (Task 1); `LABEL_ASCENT`, `LABEL_DESCENT`, `LABEL_SIZE` (`diagramLabels`).

- [ ] **Step 1: Write the failing tests** (append to `src/panels/PlansSheet.test.tsx`; add `buildCutList`, `flatDocument` to the `../document/document` import)

```ts
// Plans balloons spec §4: one balloon per cut-list row on the exploded view, none on the elevations.
describe('part balloons (plans balloons §4)', () => {
  const balloons = (fig: HTMLElement) => [...fig.querySelectorAll('.plans-balloon')].map((g) => Number(g.getAttribute('data-number')));
  it('one balloon per row, numbered as the cut list numbers it, only in the exploded view', () => {
    const doc = createDocument('Table');
    doc.boards.push(
      createBoard({ name: 'Top', length: 30, width: 18, thickness: 0.75, position: [0, 28, 0] }),
      createBoard({ name: 'Leg A', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 0, 0] }),
      createBoard({ name: 'Leg B', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [28.5, 0, 0] }),
    );
    act(() => useStore.getState().replaceDocument(doc));
    render(<PlansSheet onClose={() => {}} />);
    const rows = buildCutList(flatDocument(useStore.getState().doc)).groups.flatMap((g) => g.rows);
    const fig = screen.getByRole('img', { name: 'Exploded view' });
    expect(balloons(fig).sort()).toEqual(rows.map((r) => r.number).sort());
    for (const el of screen.getAllByRole('img').filter((e) => e !== fig)) expect(el.querySelector('.plans-balloon')).toBeNull();
  });
  it('a row hidden inside another part at explode 0 is named in the note, not ballooned', () => {
    const doc = createDocument('Box');
    doc.boards.push(
      createBoard({ name: 'Block', length: 10, width: 10, thickness: 10, position: [0, 0, 0] }),
      createBoard({ name: 'Inner', length: 2, width: 2, thickness: 2, position: [4, 4, 4] }),
    );
    act(() => useStore.getState().replaceDocument(doc));
    render(<PlansSheet onClose={() => {}} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Explode' }), { target: { value: '0' } });
    const inner = buildCutList(flatDocument(useStore.getState().doc)).groups.flatMap((g) => g.rows).find((r) => r.names[0] === 'Inner')!;
    expect(balloons(screen.getByRole('img', { name: 'Exploded view' }))).not.toContain(inner.number);
    expect(screen.getByText(`Not visible in this view: ${inner.number}.`)).toBeInTheDocument();
  });
  it('a row spread over assembly copies, one mirrored, still gets ONE balloon (Review Focus 5)', () => {
    const d = cabinetsDoc();
    d.instances = d.instances.map((i) => (i.id === 'c2' ? { ...i, mirrored: true } : i));
    act(() => useStore.getState().replaceDocument(d));
    render(<PlansSheet onClose={() => {}} />);
    const nums = balloons(screen.getByRole('img', { name: 'Exploded view' }));
    expect(new Set(nums).size).toBe(nums.length);
    const rows = buildCutList(flatDocument(useStore.getState().doc)).groups.flatMap((g) => g.rows);
    expect(nums.every((n) => rows.some((r) => r.number === n))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/panels/PlansSheet.test.tsx -t "plans balloons"`
Expected: FAIL (no `.plans-balloon`).

- [ ] **Step 3: Implement**

Imports in `PlanFigure.tsx`:

```ts
import { buildCutList, flatDocument } from '../document/document';
import { anchorsFor, layoutBalloons, numberList, type PlacedBalloon } from './planBalloons';
import { LABEL_ASCENT, LABEL_DESCENT, LABEL_SIZE } from './diagramLabels';
```

(replace the existing `import { LABEL_SIZE } from './diagramLabels';`; `layoutSingle` is no longer used by `ExplodedFigure` — remove it from the `planLayout` import if nothing else uses it.)

Above `ExplodedFigure`:

```tsx
/** The leader's end dot, in SVG units. */
const DOT_R = 2.5;

/** One balloon (spec §3.3): a leader from the circle's edge to the anchor, a dot on the anchor, the circle, the number. */
function Balloon({ b, r }: { b: PlacedBalloon; r: number }) {
  const dx = b.anchor[0] - b.centre[0];
  const dy = b.anchor[1] - b.centre[1];
  const len = Math.hypot(dx, dy) || 1;
  const sx = b.centre[0] + (dx / len) * r;
  const sy = b.centre[1] + (dy / len) * r;
  return (
    <g className="plans-balloon" data-number={b.number}>
      <line className="plans-leader" x1={sx} y1={sy} x2={b.anchor[0]} y2={b.anchor[1]} />
      <circle className="plans-leader-dot" cx={b.anchor[0]} cy={b.anchor[1]} r={DOT_R} />
      <circle className="plans-balloon-ring" cx={b.centre[0]} cy={b.centre[1]} r={r} />
      <text x={b.centre[0]} y={b.centre[1] + (LABEL_ASCENT - LABEL_DESCENT) / 2} textAnchor="middle">{b.number}</text>
    </g>
  );
}
```

Replace `ExplodedFigure`'s body:

```tsx
export const ExplodedFigure = memo(function ExplodedFigure({ doc, amount }: { doc: SloydDocument; amount: number }) {
  const d = useMemo(() => drawView(worldParts(doc), ISO, explodeOffsets(doc, amount), { hiddenLines: false }), [doc, amount]);
  // The cut list's own numbering (plans balloons spec §2): the sheet and the cut list cannot disagree.
  const rows = useMemo(() => buildCutList(flatDocument(doc)).groups.flatMap((g) => g.rows), [doc]);
  const plan = useMemo(() => anchorsFor(d, rows), [d, rows]);
  const lay = useMemo(() => layoutBalloons(d, plan), [d, plan]);
  const notes: string[] = [];
  if (plan.hidden.length > 0) notes.push(`Not visible in this view: ${numberList(plan.hidden)}.`);
  if (lay.unplaced.length > 0) notes.push(`Not ballooned (no room): ${numberList(lay.unplaced)}.`);
  return (
    <figure className="plans-figure-wrap">
      <svg className="plans-figure" viewBox={`0 0 ${lay.width} ${lay.height}`} style={pageWidth(lay.width)} role="img"
        aria-label="Exploded view" data-amount={amount} {...(lay.placed.length > 0 ? { fontSize: LABEL_SIZE } : {})}>
        <Lines d={d} map={mapper(d, lay.at, lay.scale)} hidden={false} />
        {lay.placed.map((b) => <Balloon key={b.number} b={b} r={lay.radius} />)}
      </svg>
      {notes.length > 0 && <ul className="plans-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </figure>
  );
});
```

In `styles.css`, after `.plans-notes { ... }`:

```css
/* Plans balloons spec §4.1: the number reads as text, the ring a step dimmer, the leader thin and dim (annotation,
   not a part edge). `.plans-figure line` sets the stroke at (0,1,1), so the leader's own rule is scoped to beat it. */
.plans-balloon text { fill: currentColor; stroke: none; font-family: var(--font-num); }
.plans-balloon-ring { fill: none; stroke: var(--ink-dim); stroke-width: 1.25; vector-effect: non-scaling-stroke; }
.plans-figure .plans-leader { stroke: var(--ink-dim); stroke-width: 0.75; }
.plans-leader-dot { fill: var(--ink-dim); stroke: none; }
```

In the print block, after `.plans-figure, .plans-notes { color: #000; }`:

```css
  .plans-balloon-ring, .plans-figure .plans-leader { stroke: #000; }
  .plans-leader-dot { fill: #000; }
```

- [ ] **Step 4: Run and build**

Run: `npx vitest run src/panels` and `npm run build`
Expected: pass; clean. If the Inner fixture is not hidden at explode 0 (the test's fixture claim), make `Inner` smaller or `Block` larger — never weaken the assertion.

- [ ] **Step 5: Mutate**

1. Render balloons for `rows` directly (ignore `plan.hidden`): the note test fails.
2. Drop the note: the note test fails.
3. Key balloons on `boardIds` (one per part, not per row) in the cabinets case: the one-per-row test fails.

- [ ] **Step 6: Commit**

```bash
git add src/panels/PlanFigure.tsx src/panels/PlansSheet.test.tsx src/styles.css
git commit -m "plans balloons: the exploded view draws one balloon per cut-list row, and notes the rest

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Live check, full verification, records

**Files:**
- Modify: `docs/follow-ups.md` (252's Status line; new residue entries if found), `CLAUDE.md` (Status, Rounds row, Where things live, test count), `docs/history.md`

- [ ] **Step 1: Full suite and build**

Run: `npm run build` then `npm test`
Expected: clean; all pass. Record the test count.

- [ ] **Step 2: Live on the dev server** (the user can watch; Playwright MCP)

Record the dev origin's keys from `http://localhost:5179/package.json`. Seed (via `import('/src/document/document.ts')` in the page, as previous rounds did) (a) a small table, about 6 rows, and (b) a bookcase, about 15 rows. Open Plans: screenshot the exploded view of each at the sheet's default amount and at 0. Open the cut list: screenshot the numbered rows. Emulate print (`browser_emulate_media` print) and screenshot the exploded figure's page fit. Show the screenshots to the user. Delete only the keys this step created; read back empty from `package.json`; stop the dev server by PID.

- [ ] **Step 3: Records**

- `docs/follow-ups.md`, entry 252: replace its `- **Status:** open.` with `- **Status:** closed <date> (plans balloons round): one balloon per cut-list row on the exploded view; the cut list prints the row number. Feature callouts stay 333, 279, 362.`
- `CLAUDE.md`: a Status bullet for the round (branch, merge hash, not deployed); one Rounds-table row (`plans balloons | <date> | — | One numbered balloon per cut-list row on the Plans sheet's exploded view; the cut list prints the number`); in "Where things live", add `planBalloons.ts` beside `planLayout / planDims` and `number`/`boardIds` beside `cutlist.ts`; the test count under Commands.
- `docs/history.md`: "What the plans balloons round did" with what was checked live.

- [ ] **Step 4: Merge**

```bash
git checkout master && git merge --no-ff plans-balloons -m "Merge branch 'plans-balloons': part balloons on the Plans sheet (fu 252)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run build && npm test
git branch -d plans-balloons
```

Deploy only on the user's word (CLAUDE.md, the deployment rule).
