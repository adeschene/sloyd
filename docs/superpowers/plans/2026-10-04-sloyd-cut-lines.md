# Cut Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write every part of a cut's setup line, and every number on its drawing, from the cut's shape rather than its stored fields, and call a with-grain channel a `groove`.

**Architecture:** One new pure function in `cuts.ts`, `cutShape(board, cut, solids)`, describes a cut by its clipped opening as numbers: its word, which way it runs, where it sits, and its stops at closed ends. `cutLabel` becomes `cutShape(...).word`. The two printers, `setupLine` in `cutlist.ts` and `buildDiagrams` in `diagram.ts`, format from that one description, so the word, the line and the drawing cannot disagree.

**Tech Stack:** TypeScript, Vitest. `npm test` runs the tests. `npm run build` (`tsc -b && vite build`) is the type-check gate; `npm test` does NOT type-check.

**Spec:** `docs/superpowers/specs/2026-10-04-sloyd-cut-lines-design.md`. Read §2 and §3 before any task.

## Global Constraints

- No schema change, no change to `Cut`, no change to cut-list row grouping (`rowKey`, `cutSignature` untouched).
- No change to `findTenons` or the tenon line.
- `cuts.ts` must NOT import `../units` (the `→ units` rule in CLAUDE.md): `cutShape` returns numbers; formatting stays in `cutlist.ts` and `diagram.ts`.
- Every label string on a drawing is assembled in `diagram.ts`, never in a panel (invariant 19).
- A cut that removes nothing keeps the old table (`fieldLabel`) for its word and never says `groove`.
- `FLUSH_EPSILON` (1e-9) is the only tolerance; the run-axis tie (spec §2.1 rule 3) is an EXACT comparison.
- `buildCutList` on the joined workbench must stay within 1.5× of 14.0 ms (spec §2.1).
- Any existing test expectation that changes must be listed with its reason in the task report. One that changes for a reason not in the spec: stop and ask.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A cut hanging past the board's end or with a negative offset** prints its clipped position and width, never a negative distance (Task 3).
2. **A square opening** (equal extents, closed all round) gives the same run axis every time, the stored `across` (Task 1).
3. **A groove in a rail's EDGE for a panel** (cut into the width face, running along the length) says `groove`. It is the classic groove and it is not on the broad face (Task 2).
4. **A housing whose end is opened by another cut, with the two cuts listed in either order**, prints the same line (Task 3).
5. **A cut that removes nothing** still gets its old word in Properties, and `cutShape` does not throw on it (Task 1).

---

### Task 1: `cutShape` — one description of a cut

**Files:**
- Modify: `src/document/cuts.ts` (the `cutLabel` block at the end of the file, currently lines ~442–511)
- Modify: `src/document/document.ts:13-14` (re-export `cutShape` and `CutShape`)
- Test: `src/document/cuts.test.ts`

**Interfaces:**
- Consumes: `cutRegion`, `openSides`, `cutRemovesNothing`, `boardSolids`, `fieldLabel` (private), `FLUSH_EPSILON`, `DIMENSION_ORDER`, all already in or imported by `cuts.ts`.
- Produces:
  ```ts
  export interface CutShape {
    word: CutKind; run: Dimension; pos: Dimension;
    at: Span; along: Span;
    stopMin: number | null; stopMax: number | null;
  }
  export function cutShape(board: Board, cut: Cut, solids?: Region[]): CutShape;
  export function cutLabel(board: Board, cut: Cut, solids?: Region[]): CutKind; // = cutShape(...).word
  ```

- [ ] **Step 1: Write the failing tests**

Add `cutShape` to the import from `./cuts` at the top of `src/document/cuts.test.ts`, and append:

```ts
describe('cutShape: one description, whichever way the cut is stored (cut-lines spec §2.1)', () => {
  // The default board is 24 (length) x 5-1/2 (width) x 3/4 (thickness), grain along the length.
  const b = (cuts: Cut[] = []) => withCuts(cuts);
  const cut = (c: Partial<Cut>): Cut => ({ ...DADO, ...c });
  const same = (c1: Cut, c2: Cut) => expect(cutShape(b([c1]), c1)).toEqual(cutShape(b([c2]), c2));

  it('a dado: runs along the axis it passes through, either storage', () => {
    const s = cutShape(b([DADO]), DADO);
    expect(s).toEqual({ word: 'dado', run: 'width', pos: 'length', at: [6, 6.75], along: [0, 5.5], stopMin: null, stopMax: null });
    same(DADO, cut({ across: 'length', offset: 0, width: 5.5, stopMin: 6, stopMax: 17.25 }));
  });

  it('a rabbet: either storage', () => {
    const r = cut({ offset: 0 });
    expect(cutShape(b([r]), r)).toMatchObject({ word: 'rabbet', run: 'width', pos: 'length', at: [0, 0.75] });
    same(r, cut({ across: 'length', offset: 0, width: 5.5, stopMin: 0, stopMax: 23.25 }));
  });

  it('a stopped dado runs toward its open edge and stops at the closed one', () => {
    const s = cut({ stopMax: 1 });
    expect(cutShape(b([s]), s)).toEqual({ word: 'stopped dado', run: 'width', pos: 'length', at: [6, 6.75], along: [0, 4.5], stopMin: null, stopMax: 1 });
    same(s, cut({ across: 'length', offset: 0, width: 4.5, stopMin: 6, stopMax: 17.25 }));
  });

  it('a mortise runs along its long side, with both stops', () => {
    const m = cut({ across: 'length', offset: 2, width: 0.5, depth: 0.625, stopMin: 6, stopMax: 15 });
    expect(cutShape(b([m]), m)).toEqual({ word: 'mortise', run: 'length', pos: 'width', at: [2, 2.5], along: [6, 9], stopMin: 6, stopMax: 15 });
    same(m, cut({ across: 'width', offset: 6, width: 3, depth: 0.625, stopMin: 2, stopMax: 3 }));
  });

  it('a square closed opening runs along the stored across (rule 3), so it is stable', () => {
    const sq = cut({ offset: 6, width: 1, stopMin: 2, stopMax: 2.5 });
    expect(cutShape(b([sq]), sq).run).toBe('width');
    const sq2 = cut({ across: 'length', offset: 2, width: 1, stopMin: 6, stopMax: 17 });
    expect(cutShape(b([sq2]), sq2).run).toBe('length');
  });

  it('an end opened by another cut is open: no stop there', () => {
    const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const side = createBoard({ length: 72, width: 11.25, thickness: 0.75, cuts: [backRabbet, housing] });
    expect(cutShape(side, housing)).toEqual({
      word: 'stopped dado', run: 'width', pos: 'length', at: [24, 24.75], along: [0.25, 10.5], stopMin: null, stopMax: 0.75,
    });
  });

  it('a cut that removes nothing keeps its old word and does not throw', () => {
    const gone = cut({ offset: 30 });
    expect(() => cutShape(b([gone]), gone)).not.toThrow();
    expect(cutLabel(b([gone]), gone)).toBe(cutShape(b([gone]), gone).word);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: FAIL. `cutShape` is not exported.

- [ ] **Step 3: Implement `cutShape`, and make `cutLabel` read it**

In `src/document/cuts.ts`, replace the whole `export function cutLabel(...) { ... }` at the end of the file with the code below. `CutKind` and `fieldLabel` stay where they are. `tableWord` is the old `cutLabel` body moved, unchanged except that it takes the opening instead of computing it.

```ts
/**
 * A cut described by its OPENING (cut-lines spec §2.1): the one source for its
 * word, which way it runs, where it sits and its stops. The setup line and the
 * drawing both format from this, so neither can disagree with the other or with
 * the word, whichever way the cut happens to be stored.
 *
 * Numbers, never strings: this module takes no `→ units` edge.
 *
 * Meaningful only for a cut that removes stock. For one that removes nothing,
 * `word` is the old table and the other fields are not read by anything (the
 * cut list and the drawings skip such cuts; Properties reads only the word).
 */
export interface CutShape {
  word: CutKind;
  /** The dimension the cut runs along (spec §2.1). */
  run: Dimension;
  /** The other in-plane dimension: where the cut sits. */
  pos: Dimension;
  /** The opening along `pos`, clipped to the board. */
  at: Span;
  /** The opening along `run`, clipped to the board. */
  along: Span;
  /** Gap from the run's min end to the board's edge, or null where that end is open. */
  stopMin: number | null;
  /** Gap from the run's max end to the board's edge, or null where that end is open. */
  stopMax: number | null;
}

type Opening = ReturnType<typeof openSides>;

/**
 * Which way a cut runs (spec §2.1). The axis open at both ends when exactly one
 * is; otherwise the opening's longer extent; on an EXACT tie (a square
 * opening, where either is true) the stored `across`, so the answer is stable.
 */
function runAxis(cut: Cut, ext: (d: Dimension) => number, open: Opening): Dimension {
  const [a, b] = DIMENSION_ORDER.filter((d) => d !== cut.face);
  const through = (d: Dimension) => open[d].min && open[d].max;
  if (through(a) !== through(b)) return through(a) ? a : b;
  if (ext(a) !== ext(b)) return ext(a) > ext(b) ? a : b;
  return cut.across === b ? b : a;
}

/** The cut-words table (cut-words spec §2.2–2.6), read off the opening. */
function tableWord(board: Board, cut: Cut, span: (d: Dimension) => Span, ext: (d: Dimension) => number, open: Opening): CutKind {
  const [a, b] = DIMENSION_ORDER.filter((d) => d !== cut.face);
  const ends = (d: Dimension) =>
    (span(d)[0] <= FLUSH_EPSILON ? 1 : 0) + (span(d)[1] >= board[d] - FLUSH_EPSILON ? 1 : 0);
  // Spec §2.5: a full-thickness cut at a corner of the broad face.
  if (ends('thickness') === 2 && ends('length') === 1 && ends('width') === 1) return 'notch';
  const na = (open[a].min ? 1 : 0) + (open[a].max ? 1 : 0);
  const nb = (open[b].min ? 1 : 0) + (open[b].max ? 1 : 0);
  if (na + nb >= 3) return 'rabbet';
  if (na + nb === 2) return na === 2 || nb === 2 ? 'dado' : 'stopped rabbet';
  if (na + nb === 1) {
    const openAxis = na === 1 ? a : b;
    const other = na === 1 ? b : a;
    const reach = ext(openAxis);
    const run = ext(other);
    if (reach > run) return 'stopped dado';
    return run > 4 * reach ? 'stopped rabbet' : 'notch';
  }
  if (cut.depth >= board[cut.face]) return 'through mortise';
  // Spec §2.6: a mortise is deeper than it is wide and no longer than 8x its depth.
  const narrow = Math.min(ext(a), ext(b));
  const long = Math.max(ext(a), ext(b));
  return cut.depth > narrow && long <= 8 * cut.depth ? 'mortise' : 'blind dado';
}

export function cutShape(board: Board, cut: Cut, solids: Region[] = boardSolids(board)): CutShape {
  const r = cutRegion(board, cut);
  const span = (d: Dimension): Span => [Math.max(0, r[d][0]), Math.min(board[d], r[d][1])];
  const ext = (d: Dimension) => span(d)[1] - span(d)[0];
  const open = openSides(board, cut, solids);
  const run = runAxis(cut, ext, open);
  const pos = DIMENSION_ORDER.find((d) => d !== cut.face && d !== run)!;
  const along = span(run);
  return {
    word: cutRemovesNothing(board, cut) ? fieldLabel(board, cut) : tableWord(board, cut, span, ext, open),
    run,
    pos,
    at: span(pos),
    along,
    stopMin: open[run].min ? null : along[0],
    stopMax: open[run].max ? null : board[run] - along[1],
  };
}

/** A cut's word: `cutShape(...).word`. Kept as its own export for the readers that want only the word. */
export function cutLabel(board: Board, cut: Cut, solids: Region[] = boardSolids(board)): CutKind {
  return cutShape(board, cut, solids).word;
}
```

Keep the doc comment that currently sits above `cutLabel` (if any) above `cutShape` instead, adjusted to say it now lives there.

In `src/document/document.ts`, add `cutShape` to the `export { ... } from './cuts'` list on line 13, and `CutShape` to the `export type { ... } from './cuts'` list on line 14.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: PASS, including every existing `cutLabel` test unchanged (this step is a pure refactor for the word).

Then `npm test` (all files) and `npm run build`. Expected: all pass, build clean.

- [ ] **Step 5: Mutate**

Each mutation must turn at least one test red; revert after each. Record the results in the report.
1. Delete rule 1 (`if (through(a) !== through(b)) ...`).
2. Delete rule 2 (`if (ext(a) !== ext(b)) ...`).
3. Flip the tie: `return cut.across === b ? a : b;`.
4. `stopMin: along[0]` (drop the open test).
5. `stopMax: open[run].max ? null : along[1]` (wrong gap).

If one survives, add the test that kills it.

- [ ] **Step 6: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts src/document/document.ts
git commit -m "feat(cuts): cutShape — a cut described by its opening; cutLabel reads it (spec §2.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `groove` with the grain (193)

**Files:**
- Modify: `src/document/cuts.ts` (`CutKind`, `cutShape`, a new private `hasGrain` and `GROOVE` table; import `MATERIALS` from `./types`)
- Test: `src/document/cuts.test.ts`

**Interfaces:**
- Consumes: `cutShape` and `tableWord` from Task 1; `MATERIALS` from `./types` (`MATERIALS[m].sheet?.rotate` is `'grain' | 'free'`).
- Produces: `CutKind` gains `'groove' | 'stopped groove' | 'blind groove'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/cuts.test.ts`:

```ts
describe('groove: a channel running with the grain (cut-lines spec §3)', () => {
  // The default board's grain runs along its length. A channel on the broad
  // face running along the length: face thickness, across length.
  const along = (c: Partial<Cut> = {}): Cut => ({ ...DADO, across: 'length', offset: 2, width: 0.75, ...c });
  const word = (board: Partial<Board>, c: Cut) => cutLabel(createBoard({ ...board, cuts: [c] }), c);

  it('with the grain on pine is a groove; across it is a dado', () => {
    expect(word({}, along())).toBe('groove');
    expect(word({}, DADO)).toBe('dado');
  });

  it('turning the board\'s grain turns the word', () => {
    expect(word({ grain: 'width' }, along())).toBe('dado');
    expect(word({ grain: 'width' }, DADO)).toBe('groove');
  });

  it('plywood has grain; MDF does not', () => {
    expect(word({ material: 'plywood' }, along())).toBe('groove');
    expect(word({ material: 'mdf' }, along())).toBe('dado');
  });

  it('stopped and blind versions', () => {
    expect(word({}, along({ stopMax: 1 }))).toBe('stopped groove');
    expect(word({}, along({ stopMin: 1, stopMax: 1 }))).toBe('blind groove');
  });

  it('a panel groove in a rail\'s EDGE is a groove', () => {
    const edge: Cut = { id: 'g', face: 'width', from: 'max', across: 'length', offset: 0.25, width: 0.25, depth: 0.375, stopMin: 0, stopMax: 0 };
    expect(word({}, edge)).toBe('groove');
  });

  it('a rabbet and a mortise with the grain keep their words', () => {
    expect(word({}, along({ offset: 0 }))).toBe('rabbet');
    expect(word({}, along({ width: 0.5, depth: 0.625, stopMin: 6, stopMax: 15 }))).toBe('mortise');
  });

  it('a cut that removes nothing stays on the old table', () => {
    expect(word({}, along({ offset: 30 }))).not.toMatch(/groove/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: FAIL. `groove` is returned nowhere; the first test gets `dado`.

- [ ] **Step 3: Implement**

In `src/document/cuts.ts`:

1. Change the first import line to also import `MATERIALS`:
   ```ts
   import { MATERIALS, type Board, type Cut, type Dimension, type Region, type Span } from './types';
   ```
2. Extend `CutKind`:
   ```ts
   export type CutKind =
     | 'dado' | 'rabbet'
     | 'stopped dado' | 'stopped rabbet'
     | 'mortise' | 'through mortise'
     | 'notch' | 'blind dado'
     | 'groove' | 'stopped groove' | 'blind groove';
   ```
3. Above `cutShape`, add:
   ```ts
   /** Spec §3: the with-grain name of each channel word. Every other word has none. */
   const GROOVE: Partial<Record<CutKind, CutKind>> = {
     dado: 'groove', 'stopped dado': 'stopped groove', 'blind dado': 'blind groove',
   };

   /**
    * Whether a material has a grain direction for `groove` to follow. Read off the
    * material table, not a list of names: a sheet whose stock rotates freely
    * (MDF) has none, so a new grainless sheet good follows by declaring that.
    */
   function hasGrain(material: string): boolean {
     return MATERIALS[material]?.sheet?.rotate !== 'free';
   }
   ```
4. In `cutShape`, replace the `word:` line with a computed `word`:
   ```ts
   const table = cutRemovesNothing(board, cut) ? null : tableWord(board, cut, span, ext, open);
   const word = table === null
     ? fieldLabel(board, cut)
     : run === board.grain && hasGrain(board.material) ? GROOVE[table] ?? table : table;
   ```
   and return `word,` in the object.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/document/cuts.test.ts`, then `npm test` and `npm run build`.
Expected: PASS and a clean build. If any existing test elsewhere now gets `groove`, list it in the report with the board's grain and the cut, and change the expectation only if the cut really runs with the grain. A `Record<CutKind, …>` anywhere that `tsc` now rejects must be extended, and the change listed.

- [ ] **Step 5: Mutate**

Each must turn a test red; revert after each:
1. Drop `hasGrain(board.material) &&`.
2. `run !== board.grain` in place of `run === board.grain`.
3. `rotate === 'grain'` in place of `rotate !== 'free'` (a solid wood board has no `sheet`, so this must fail on pine).
4. Apply `GROOVE` to the `fieldLabel` branch too.

- [ ] **Step 6: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts
git commit -m "feat(cuts): groove — a channel running with the grain (fu 193, spec §3)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The setup line and the drawing, written from the shape (192)

**Files:**
- Modify: `src/document/cutlist.ts` (`stopClause`, `setupLine`, imports)
- Modify: `src/document/diagram.ts` (the `view.cuts.push({...})` block, the `DiagramCut` doc comments, imports)
- Modify: `src/panels/PartDiagram.tsx` (comments only: the stops measure along the cut's RUN axis, not `across`)
- Create: `src/generate/joints/cutlines.recipe.test.ts`
- Test: `src/document/cutlist.test.ts`, `src/document/diagram.test.ts`

**Interfaces:**
- Consumes: `cutShape(board, cut, solids): CutShape` from Task 1 (`word`, `run`, `pos`, `at`, `along`, `stopMin`, `stopMax`).
- Produces: nothing new; the setup line and `DiagramCut` change content only.

- [ ] **Step 1: Write the live-design tests (characterisation plus 192's case)**

Create `src/generate/joints/cutlines.recipe.test.ts`:

```ts
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { migrateDocument } from '../../document/document';
import { designToDocument } from '../../document/generated';
import { buildCutList } from '../../document/cutlist';
import { buildDiagrams } from '../../document/diagram';
import type { SloydDocument } from '../../document/types';
import { findSites } from './sites';
import { applyJoints, type JointChoice } from './recipes';
import { defaultChoice } from './choose';

const joined = (doc: SloydDocument) => {
  const sites = findSites(doc);
  return applyJoints(doc, sites, sites.map((s) => defaultChoice(s, doc, sites))).doc;
};
const setupOf = (doc: SloydDocument, name: string) =>
  buildCutList(doc).groups.flatMap((g) => g.rows).find((r) => r.names.includes(name))!.setup;

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...ps: P[]) => designToDocument({ name: 'B', parts: ps.map((p) => ({
  name: p.name, material: 'pine',
  at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] },
})) }).doc;
const bookcase = () => design(
  { name: 'Back', at: [0, 0, -0.25], size: [31.5, 72, 0.25] },
  { name: 'Left side', at: [0, 0, 0], size: [0.75, 72, 11.25] },
  { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 72, 11.25] },
  { name: 'Bottom', at: [0.75, 0, 0], size: [30, 0.75, 11.25] },
  { name: 'Top', at: [0.75, 71.25, 0], size: [30, 0.75, 11.25] },
  { name: 'Shelf 1', at: [0.75, 24, 0], size: [30, 0.75, 11.25] },
  { name: 'Shelf 2', at: [0.75, 48, 0], size: [30, 0.75, 11.25] },
);

const SIDE_TOP = [
  '3/8" rabbet, 1/4" deep — into the width face (min side), 3/8" from the thickness min end, running across the length',
  '3/4" rabbet, 1/4" deep — into the thickness face (max side), 0" from the length min end, running across the width',
  '3/4" rabbet, 1/4" deep — into the thickness face (max side), 71-1/4" from the length min end, running across the width',
];

describe('the live designs (cut-lines spec §2.2)', () => {
  it('the joined workbench\'s leg prints exactly as before', () => {
    const doc = joined(migrateDocument(JSON.parse(workbenchRaw)));
    expect(setupOf(doc, 'Front left leg')).toEqual([
      '1/2" mortise, 1-1/4" deep — into the width face (max side), 1/2" from the thickness min end, running across the length, stopped 28-1/4" short of the min end and 1/2" short of the max end',
      '1/2" mortise, 1-1/4" deep — into the thickness face (max side), 1/2" from the width min end, running across the length, stopped 28-1/4" short of the min end and 1/2" short of the max end',
      '1/2" mortise, 1-1/4" deep — into the width face (max side), 1/2" from the thickness min end, running across the length, stopped 6-1/2" short of the min end and 24-1/4" short of the max end',
      '1/2" mortise, 1-1/4" deep — into the thickness face (max side), 1/2" from the width min end, running across the length, stopped 6-1/2" short of the min end and 24-1/4" short of the max end',
    ]);
  });

  it('the joined bookcase\'s side prints exactly as before', () => {
    expect(setupOf(joined(bookcase()), 'Left side')).toEqual([
      ...SIDE_TOP,
      '3/4" dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width',
      '3/4" dado, 1/4" deep — into the thickness face (max side), 48" from the length min end, running across the width',
    ]);
  });

  // Each shelf housing stopped 3/4" short of the front, as in the live check.
  const stoppedShelves = () => {
    const doc = bookcase();
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.map((s): JointChoice => {
      const d = defaultChoice(s, doc, sites);
      if (!doc.boards[s.enter].name.startsWith('Shelf') || d.joint !== 'dado') return d;
      const at = s.stopEnds.find((e) => e.axis === 2 && e.end === 'max') ?? s.stopEnds[0];
      return { site: s.id, joint: 'stopped-dado', depth: d.depth, stopAt: at, inset: 0.75 };
    })).doc;
  };

  it('a stopped shelf housing prints its height as the position and its front stop as the only stop (fu 192)', () => {
    expect(setupOf(stoppedShelves(), 'Left side')).toEqual([
      ...SIDE_TOP,
      '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width, stopped 3/4" short of the max end',
      '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 48" from the length min end, running across the width, stopped 3/4" short of the max end',
    ]);
  });

  it('and its drawing carries the same numbers (spec §2.4)', () => {
    const side = stoppedShelves().boards.find((b) => b.name === 'Left side')!;
    const view = buildDiagrams(side, 16).find((v) => v.key === 'thickness|max')!;
    const housing = view.cuts.find((c) => c.offsetLabel === '24"')!;
    expect(housing).toMatchObject({
      axis: 'h', offsetLabel: '24"', widthLabel: '3/4"', kind: 'stopped dado',
      stopMaxLabel: '3/4"', lengthLabel: '10-1/4"',
    });
    expect(housing.stopMinLabel).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them BEFORE changing code**

Run: `npx vitest run src/generate/joints/cutlines.recipe.test.ts`
Expected: the workbench and joined-bookcase tests PASS (they pin today's lines, which must not change); the two stopped-shelf tests FAIL (the old line reads `10-1/4" stopped dado … running across the length …`, and the drawing has no `24"` offset label). If either characterisation test fails here, stop: the fixture is not what the spec measured.

- [ ] **Step 3: Write the cut-list unit tests**

Append to `src/document/cutlist.test.ts` (it already has `docWith` and `dado(...)`, a 3/4" × 1/4" dado at offset 6 across the width, face thickness, from min, on the default 24 × 5-1/2 × 3/4 board):

```ts
describe('the setup line is written from the shape (cut-lines spec §2.2)', () => {
  const line = (c: Cut) => buildCutList(docWith({ cuts: [c] })).groups[0].rows[0].setup[0];
  const both = (a: Cut, b: Cut, expected: string) => { expect(line(a)).toBe(expected); expect(line(b)).toBe(expected); };

  it('a dado prints one line whichever way it is stored', () => {
    both(dado(), dado({ across: 'length', offset: 0, width: 5.5, stopMin: 6, stopMax: 17.25 }),
      '3/4" dado, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width');
  });

  it('a rabbet, either storage', () => {
    both(dado({ offset: 0 }), dado({ across: 'length', offset: 0, width: 5.5, stopMin: 0, stopMax: 23.25 }),
      '3/4" rabbet, 1/4" deep — into the thickness face (min side), 0" from the length min end, running across the width');
  });

  it('a stopped dado, either storage', () => {
    both(dado({ stopMax: 1 }), dado({ across: 'length', offset: 0, width: 4.5, stopMin: 6, stopMax: 17.25 }),
      '3/4" stopped dado, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width, stopped 1" short of the max end');
  });

  it('a mortise, either storage', () => {
    both(dado({ across: 'length', offset: 2, width: 0.5, depth: 0.625, stopMin: 6, stopMax: 15 }),
      dado({ across: 'width', offset: 6, width: 3, depth: 0.625, stopMin: 2, stopMax: 3 }),
      '1/2" mortise, 5/8" deep — into the thickness face (min side), 2" from the width min end, running across the length, stopped 6" short of the min end and 15" short of the max end');
  });

  it('a cut hanging past the end prints where it really is, never a negative distance', () => {
    expect(line(dado({ offset: -0.25, width: 1 }))).toBe(
      '3/4" rabbet, 1/4" deep — into the thickness face (min side), 0" from the length min end, running across the width');
  });

  it('a housing opened by another cut prints the same line with the cuts in either order', () => {
    const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const setup = (cuts: Cut[]) => buildCutList(docWith({ length: 72, width: 11.25, thickness: 0.75, cuts })).groups[0].rows[0].setup;
    const expected = '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width, stopped 3/4" short of the max end';
    expect(setup([backRabbet, housing])[1]).toBe(expected);
    expect(setup([housing, backRabbet])[0]).toBe(expected);
  });

  it('never prints a stop after a through word (seeded search)', () => {
    let seed = 192; // mulberry32, deterministic
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const DIMS = ['length', 'width', 'thickness'] as const;
    const size = { length: 24, width: 5.5, thickness: 0.75 };
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    const sixteenths = (max: number) => Math.max(1, Math.round(rnd() * max * 16)) / 16;
    let through = 0;
    for (let i = 0; i < 2000; i++) {
      const face = pick(DIMS);
      const across = pick(DIMS.filter((d) => d !== face));
      const pos = DIMS.find((d) => d !== face && d !== across)!;
      const c: Cut = {
        id: 'c', face, from: pick(['min', 'max'] as const), across,
        offset: sixteenths(size[pos]) - 1 / 16, width: sixteenths(size[pos]), depth: sixteenths(size[face]),
        stopMin: rnd() < 0.5 ? 0 : sixteenths(size[across] / 2), stopMax: rnd() < 0.5 ? 0 : sixteenths(size[across] / 2),
      };
      const setup = buildCutList(docWith({ cuts: [c] })).groups[0].rows[0].setup;
      if (setup.length === 0) continue;
      if (/^\S+ (dado|groove|rabbet),/.test(setup[0])) {
        through++;
        expect(setup[0]).not.toContain('stopped');
      }
    }
    expect(through).toBeGreaterThan(100);
  });
});
```

Also extend the existing test `'agrees with the setup line it is printed beside'` with a second cut stored the other way. Add this `it` beside it:

```ts
  it('agrees with the setup line for a cut stored across the other axis (spec §2.4)', () => {
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'length',
                       offset: 0, width: 4.5, depth: 0.25, stopMin: 6, stopMax: 17.25 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    const line = row.setup[0];
    const drawn = row.diagrams[0].cuts[0];
    expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
    expect(line).toContain(`${drawn.offsetLabel} from the`);
    expect(line).toContain(`stopped ${drawn.stopMaxLabel} short of the max end`);
    expect(drawn.stopMinLabel).toBeUndefined();
  });
```

Run: `npx vitest run src/document/cutlist.test.ts`
Expected: the new "either storage" tests, the overhang test, the order test and the new agreement test FAIL; the seeded search may pass or fail (old code printed a stop after a through word in a few cases).

- [ ] **Step 4: Measure the cost before the change**

Create a scratch file (do NOT commit it) `src/__cost.test.ts`:

```ts
import workbenchRaw from './document/fixtures/simple-workbench.sloyd?raw';
import { migrateDocument } from './document/document';
import { buildCutList } from './document/cutlist';
import { findSites } from './generate/joints/sites';
import { applyJoints } from './generate/joints/recipes';
import { defaultChoice } from './generate/joints/choose';
it('cost', () => {
  const doc = migrateDocument(JSON.parse(workbenchRaw));
  const s = findSites(doc);
  const j = applyJoints(doc, s, s.map((x) => defaultChoice(x, doc, s))).doc;
  for (let i = 0; i < 5; i++) buildCutList(j);
  const t = performance.now();
  for (let i = 0; i < 50; i++) buildCutList(j);
  console.log(`COST ${((performance.now() - t) / 50).toFixed(1)} ms`);
});
```

Run: `npx vitest run src/__cost.test.ts --silent=false 2>&1 | grep COST` and record the number.

- [ ] **Step 5: Rewrite `setupLine` and `stopClause` in `src/document/cutlist.ts`**

Replace both functions with:

```ts
/**
 * The setup line's tail: one stop for each CLOSED end of the cut's run axis,
 * or '' (cut-lines spec §2.2). An end with no stock in the gap — the board's
 * edge, or another cut's opening — is open and prints nothing, so a dado,
 * groove or rabbet, which runs through, can never carry a stop.
 */
function stopClause(s: CutShape, f: (n: number) => string): string {
  if (s.stopMin !== null && s.stopMax !== null) {
    return `, stopped ${f(s.stopMin)} short of the min end and ${f(s.stopMax)} short of the max end`;
  }
  if (s.stopMin !== null) return `, stopped ${f(s.stopMin)} short of the min end`;
  if (s.stopMax !== null) return `, stopped ${f(s.stopMax)} short of the max end`;
  return '';
}

/**
 * One cut as a line you can read at the bench, written from its SHAPE
 * (`cutShape`), never its stored fields: one pocket can be stored two ways,
 * and the line must not depend on which (follow-up 192). The drawing beside it
 * formats the same `CutShape` (diagram.ts), which is what keeps the two in
 * agreement.
 *
 * Takes the board, not just the cut, because the shape depends on the board's
 * dimensions and its other cuts. That is why setup lines are built during
 * grouping, while the board is in hand.
 */
function setupLine(board: Board, cut: Cut, precision: number, solids: Region[]): string {
  const f = (n: number) => formatLength(n, precision);
  const s = cutShape(board, cut, solids);
  return (
    `${f(s.at[1] - s.at[0])} ${s.word}, ${f(cut.depth)} deep — ` +
    `into the ${cut.face} face (${cut.from} side), ` +
    `${f(s.at[0])} from the ${s.pos} min end, running across the ${s.run}` +
    stopClause(s, f)
  );
}
```

Fix the imports: `cutShape` and `type CutShape` from `./cuts`; drop `cutLabel`, `openSides` and `positionAxisOf` if nothing else in the file uses them (`noUnusedLocals` is on, so `npm run build` will say).

- [ ] **Step 6: Rewrite the drawing's labels in `src/document/diagram.ts`**

Replace the `view.cuts.push({...})` call (and the `const pos = positionAxisOf(...)` line above it) with:

```ts
    const s = cutShape(board, cut, solids);
    view.cuts.push({
      id: cut.id,
      h: region[view.horizontal],
      v: region[view.vertical],
      // Every label from the same CutShape the setup line formats (cut-lines
      // spec §2.4), so the drawing and the prose cannot disagree.
      axis: s.pos === view.horizontal ? 'h' : 'v',
      depthLabel: `${f(cut.depth)} deep`,
      offsetLabel: f(s.at[0]),
      widthLabel: f(s.at[1] - s.at[0]),
      kind: s.word,
      // Assembled here, never in the panel: the measured string and the drawn
      // string must be the same string (invariant 19).
      ...(s.stopMin !== null ? { stopMinLabel: f(s.stopMin) } : {}),
      ...(s.stopMax !== null ? { stopMaxLabel: f(s.stopMax) } : {}),
      ...(s.stopMin !== null || s.stopMax !== null
        ? { lengthLabel: f(s.along[1] - s.along[0]) }
        : {}),
    });
```

Update the `DiagramCut` doc comments: `axis` is "which axis the cut's position is measured along (`CutShape.pos`)"; `offsetLabel`/`widthLabel` are the opening's position and extent; `stopMinLabel`/`stopMaxLabel` are "how far short of the RUN axis's min/max end; present only where that end is closed"; `lengthLabel` is "the opening's extent along its run axis; present exactly when a stop is". Fix imports: `cutShape` from `./cuts`; drop `cutLabel` and `positionAxisOf` if unused.

In `src/panels/PartDiagram.tsx`, change the two comments that say the stops run/measure along `across` to say they run along the cut's run axis. No code change there.

- [ ] **Step 7: Run everything**

Run: `npx vitest run src/generate/joints/cutlines.recipe.test.ts src/document/cutlist.test.ts src/document/diagram.test.ts src/panels/PartDiagram.test.tsx`, then `npm test` and `npm run build`.
Expected: all pass, build clean. List every existing expectation you changed, with its reason (expected: none, or a drawing's stop label that previously labelled an end another cut had opened, spec §2.4).

- [ ] **Step 8: Measure the cost after, then delete the scratch file**

Run the Step 4 command again. The new number must be ≤ 1.5 × the Step 4 number AND ≤ 21 ms. Record both in the report. Then `rm src/__cost.test.ts`.

- [ ] **Step 9: Mutate**

Each must turn a test red; revert after each:
1. In `setupLine`, print `cut.width` in place of `s.at[1] - s.at[0]`.
2. In `setupLine`, print `cut.across` in place of `s.run`.
3. In `diagram.ts`, `offsetLabel: f(cut.offset)`.
4. In `diagram.ts`, `axis: positionAxisOf(cut.face, cut.across) === view.horizontal ? 'h' : 'v'` (restore the import for the mutation only).
5. In `diagram.ts`, `lengthLabel` from `region[cut.across]`.
6. In `stopClause`, swap the min and max labels.

- [ ] **Step 10: Commit**

```bash
git add src/document/cutlist.ts src/document/diagram.ts src/panels/PartDiagram.tsx src/document/cutlist.test.ts src/document/diagram.test.ts src/generate/joints/cutlines.recipe.test.ts
git commit -m "feat(cutlist): setup line and drawing written from the cut's shape (fu 192, spec §2.2, §2.4)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/follow-ups.md` (entries 192, 193, 194 at the end of the file)
- Modify: `CLAUDE.md` (the `cuts.ts` and `cutlist.ts`/`diagram.ts` entries in "Where things live"; the `171` bullet under Open follow-ups that lists 180–194)

**Interfaces:** none.

- [ ] **Step 1: Close the three follow-ups**

In `docs/follow-ups.md`, replace each entry's `- **Status:** …` line:

- **192:** `- **Status:** CLOSED 2026-10-04 by the cut lines round. \`cutShape\` describes a cut by its opening (run axis, position, stops at closed ends); the setup line and the drawing both format from it, so one shape prints one line whichever way it is stored, and a through word can no longer carry a stop. The drawing was found to print the same stored numbers while planning and was changed with the line (spec §2.4).`
- **193:** `- **Status:** CLOSED 2026-10-04 by the cut lines round, the user's ruling: a channel whose run axis is the board's grain says \`groove\` / \`stopped groove\` / \`blind groove\`, on solid wood and plywood; MDF (a sheet with free rotation) has no grain and keeps \`dado\`.`
- **194:** `- **Status:** CLOSED 2026-10-04 by decision, the user's ruling, with no code: follow-up 55a's ruling covers it (a row is decided at display precision and its first board's lines represent it).`

- [ ] **Step 2: Update CLAUDE.md's index**

In the `cuts.ts` entry of "Where things live", after the sentence about `openSides`, add: `\`cutShape\` is the ONE description of a cut (word, run axis, position, stops at closed ends, as numbers); \`cutLabel\` is its word, and the setup line AND the drawing format from it, never from stored fields (fu 192). \`groove\` when the run axis is the grain on a material with grain (fu 193).` Keep the entry's existing line wrapping style.

In the `171` bullet under "Open follow-ups", change `(180, 181 and 189 are closed by the cut words round; …)` so it also says `192–194 are closed by the cut lines round`.

The rounds-table row, the Status paragraph and the test counts are added at merge time, not here.

- [ ] **Step 3: Commit**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: cut lines — close 192, 193, 194 by decision; cutShape in the index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
