# Glue-ups from Narrow Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When no listed by-the-piece stock is wide enough for a part, Buying plans it as a glue-up of N equal strips, packs the strips like any other part, and says so in one note.

**Architecture:** One pure planner, `gluePlan`, in `document/purchase.ts`. `byThePiece` calls it ONLY where its existing reason would be `too wide`, and adds the resulting strips to the thickness group the planner chose; the pack, the price-plan search and the swap-down are untouched. `CutList.tsx` maps each glue strip's id to its part's row number for the layouts. There is no schema change, and the cut list, nesting, banding, storage and shop settings are untouched.

**Tech Stack:** TypeScript, Vitest, React (`@testing-library/react`).

**Spec:** `docs/superpowers/specs/2026-10-29-sloyd-glue-ups-design.md` (option A, approved 2026-10-29). Read it, and CLAUDE.md, before starting.

## Global Constraints

- Work on a branch `glue-ups` off `master`; merge with `git merge --no-ff`, verify the merged tree, delete the branch. No pull requests.
- **A glue-up runs ONLY where today's reason is `too wide`** (spec §3). Every part that gets a board today gets exactly the same board.
- Not glued: edging strips (`stripBoard` output, the `cutStock` entries after `doc.boards.length`); end-grain parts (`grain === 'thickness'`, refused earlier as today); `too thick` and `too long` parts.
- Constants, in inches: `GLUE_WIDTH_ALLOWANCE = 1/8` (added to each strip's width) and `GLUE_LENGTH_ALLOWANCE = 1` (added to each strip's length).
- Strip id: `${part.id}#glue:${k}`, k = 1…N. Strip name: `${part.name} strip ${k} of ${N}`.
- Glue note copy, verbatim shape: `${name} (${partDims}): glue up from ${N} strips, ${stripDims} — no ${material} stock is ${W} wide`.
- Refusal copy: `${name} (${partDims}) fits no ${material} stock — too wide, and too long to glue up (strips need ${formatLength(GLUE_LENGTH_ALLOWANCE)} to trim)`.
- Every string is built in `purchase.ts` (inv 19). Strips are exact; nothing is rounded before packing (inv 18).
- Expected values in tests are hand-derived (the derivations are given below); every new or rewritten test is mutated once and must fail (CLAUDE.md working agreement).
- `npm test` does not typecheck: run `npm run build` before claiming anything compiles.

## Review Focus

1. **A part whose grain runs across its width** (`grain: 'width'`). The footprint swaps, so the strip's length must come from `f.w` and its width from `f.h`, never from `length`/`width`. Pinned in Task 1.
2. **Two identical glued parts** (copies of one top). Each needs its own strips with distinct ids, or the packer's `byId` map collapses them and a board goes missing. Pinned in Task 2.
3. **A very wide part from very narrow stock** (48" from 1×2s, N = 35). The N loop must terminate and stay exact. Pinned in Task 1.
4. **A glued part inside an assembly** (a flat id with a path). The layout must still find its row number, which `glueStripPart` must parse from the LAST `#glue:`. Pinned in Task 3.
5. **Metric projects.** The strip-width fit must go through `fitsStock` (whole mm), not a raw `<=`, or a strip that reads the same mm as the stock is refused. Pinned in Task 2.

---

### Task 1: `gluePlan`, the pure planner

**Files:**
- Modify: `src/document/purchase.ts`
- Test: `src/document/purchase.test.ts` (a new `describe('gluePlan (glue-ups spec §4)')`)

**Interfaces:**
- Produces, all exported from `purchase.ts`:
  - `GLUE_WIDTH_ALLOWANCE: number` (= 0.125) and `GLUE_LENGTH_ALLOWANCE: number` (= 1).
  - `interface GluePlan { thickness: number; across: number; strips: Board[] }`. `thickness` is the stock thickness chosen; `across` is `W`; `strips` are the N strip boards.
  - `gluePlan(part: Board, stock: readonly StockBoard[], units: Units): GluePlan | null`. It returns null when no qualifying thickness has a size long enough (spec §4 step 6). It assumes the caller has already established that the part is a candidate (§3).
  - `glueStripPart(id: string): string | null`, the part id before the LAST `#glue:`, or null for any other id.

- [ ] **Step 1: Write the failing tests.** Use the file's existing `size`, `pine` and `A` helpers, and `defaultBuying('pine').stock` for the default list. Assertions:

```ts
// Spec §4 worked example: default pine (widest 3/4" × 11-1/4", 72 and 96 long). 22/2 + 1/8 = 11.125 ≤ 11.25.
const g = gluePlan(pine('Top', 40, 22), pineStock, IMPERIAL)!;
expect(g.thickness).toBe(0.75);
expect(g.across).toBe(22);
expect(g.strips.map((s) => [s.id, s.name, s.length, s.width, s.thickness, s.grain]))
  .toEqual([['Top#glue:1', 'Top strip 1 of 2', 41, 11.125, 0.75, 'length'], ['Top#glue:2', 'Top strip 2 of 2', 41, 11.125, 0.75, 'length']]);
// Boundaries: 22-1/4" is still 2 (11.125 + 0.125 = 11.25, exact fit); 22-1/2" is 3 (11.375 > 11.25; 7.625 fits).
expect(gluePlan(pine('T', 40, 22.25), pineStock, IMPERIAL)!.strips).toHaveLength(2);
expect(gluePlan(pine('T', 40, 22.5), pineStock, IMPERIAL)!.strips.map((s) => s.width)).toEqual([7.625, 7.625, 7.625]);
// Grain across the width (Review Focus 1): length 8, width 30, grain 'width' → along 30, across 8 → with A: 2 strips 4.125 × 31.
const gw = gluePlan(createBoard({ id: 'w', name: 'w', material: 'pine', length: 8, width: 30, thickness: 0.75, grain: 'width' }), [A], IMPERIAL)!;
expect(gw.across).toBe(8);
expect(gw.strips.map((s) => [s.length, s.width, s.grain])).toEqual([[31, 4.125, 'length'], [31, 4.125, 'length']]);
// Many strips (Review Focus 3): 48" from 3/4" × 1-1/2" × 96" only. 48/N + 1/8 ≤ 1.5 → N ≥ 34.9 → 35.
expect(gluePlan(pine('B', 40, 48), [size('X', 0.75, 1.5, 96, null)], IMPERIAL)!.strips).toHaveLength(35);
// Thickness: 3/4" list too short for Ls = 81 (C is 72 long), 1" list long enough → glued at 1".
const F = size('F', 1, 5.5, 96, 20);
expect(gluePlan(pine('wide', 80, 8), [C, F], IMPERIAL)!.thickness).toBe(1);
// No thickness long enough: Ls = 96.5 > 96 → null.
expect(gluePlan(pine('p', 95.5, 20), [size('G', 0.75, 11.25, 96, null)], IMPERIAL)).toBeNull();
// The metric fit is whole mm: 300 mm across from D (38 × 89 mm), N = 4 (78 mm), not 3 (103 mm).
expect(gluePlan(pine('m', 600 / 25.4, 300 / 25.4, 1.5), [D], { display: 'metric-mm', precision: 16 })!.strips).toHaveLength(4);
// The id parser takes the LAST tag.
expect(glueStripPart('a/b#glue:3')).toBe('a/b');
expect(glueStripPart('x#glue:1#glue:2')).toBe('x#glue:1');
expect(glueStripPart('Shelf#band:length-min')).toBeNull();
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run src/document/purchase.test.ts -t gluePlan`. Expected: FAIL (`gluePlan` is not exported).

- [ ] **Step 3: Implement the constants, `GluePlan`, `gluePlan` and `glueStripPart` in `purchase.ts`,** beside `byThePiece`, with a doc comment citing the spec §4. Follow §4 steps 1–4 exactly:
  - `f = grainFootprint(part)`; `L = f.w`, `W = f.h`, `Ls = L + GLUE_LENGTH_ALLOWANCE`.
  - Thicknesses ascending, filtered by the existing `thickEnough`. A size qualifies when it is at that thickness (`|s.thickness − t| ≤ EPS`), `fitsStock(Ls, s.length, units)` holds, and `s.width > GLUE_WIDTH_ALLOWANCE`.
  - The first thickness with a qualifying size wins. `Wmax` is the widest qualifying size's width.
  - N = 2, 3, … until `fitsStock(W / N + GLUE_WIDTH_ALLOWANCE, Wmax, units)`.
  - Build each strip as a literal `Board`, the way `banding.ts` `stripBoard` does: `position [0,0,0]`, `rotation 0`, `posture 'flat'`, `grain 'length'`, the part's material, every feature list empty, `cornerRule 'long'`, `hardware: []`.
  - Do not round anything.

- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run src/document/purchase.test.ts -t gluePlan`. Expected: PASS.

- [ ] **Step 5: Mutate.** Mutate each of these once, see the named assertion fail, and revert:
  - drop `GLUE_WIDTH_ALLOWANCE` from the fit (22½" gives 2);
  - drop `GLUE_LENGTH_ALLOWANCE` (95½" no longer null);
  - use `part.length`/`part.width` instead of the footprint (the grain-`width` case fails);
  - use a raw `<=` instead of `fitsStock` (the metric case fails, or say in the commit message why it does not, and tighten the case until it does).

- [ ] **Step 6: Commit.**

```bash
git add src/document/purchase.ts src/document/purchase.test.ts
git commit -m "feat(buying): gluePlan — equal strips for a part no stock is wide enough for (glue-ups spec §4)"
```

### Task 2: `byThePiece` glues up too-wide parts

**Files:**
- Modify: `src/document/purchase.ts` (`byThePiece`, `buildPurchase`)
- Test: `src/document/purchase.test.ts`

**Interfaces:**
- Consumes: `gluePlan`, `GLUE_LENGTH_ALLOWANCE` (Task 1).
- Produces: no new exports. `byThePiece` gains a parameter `edging: ReadonlySet<string>` (the ids of `cutStock(doc)` entries at index ≥ `doc.boards.length`), passed by `buildPurchase`.

- [ ] **Step 1: Write the byte-for-byte guard first, and see it PASS on the unchanged code.** It is the existing `lists a part no stock holds` case without `wide`:

```ts
it('a project with no too-wide part buys exactly what it did (glue-ups spec §1, anti-goal)', () => {
  const p = purchase([pine('long', 100, 3), pine('fat', 30, 3, 2), pine('ok', 30, 3)], shopWith({ pine: { mode: 'piece', stock: [A] } }));
  expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1×6 × 8′ · $12.00']);
  expect(p.entries[0]!.notes).toEqual(['long (3/4" × 3" × 100") fits no pine stock — too long', 'fat (2" × 3" × 30") fits no pine stock — too thick']);
  expect(p.entries[0]!.unplaceable).toBe(2);
  expect(p.entries[0]!.layouts.flatMap((l) => l.nesting.sheets.flatMap((s) => s.parts.map((q) => q.boardId)))).toEqual(['ok']);
  expect(p.totalLabel).toBe('Estimated materials: $12.00 (2 parts not placed)');
});
```

Run: `npx vitest run src/document/purchase.test.ts`. Expected: everything PASSES. This is the baseline.

- [ ] **Step 2: Rewrite the four too-wide tests, and add the new ones; see them fail.** The hand derivations:
  - **`lists a part no stock holds`** (stock `[A]`): `wide` 3/4 × 8 × 30 → 2 strips 4.125 × 31. Packed with `ok` (h 3) on ONE A: the shelf is 4.125 high, `31 + ⅛ + 31 + ⅛ + 30 = 92.25 ≤ 96`.
    - notes: `['wide (3/4" × 8" × 30"): glue up from 2 strips, 3/4" × 4-1/8" × 31" — no pine stock is 8" wide', <long's note>, <fat's note>]`
    - unplaceable 2; lines `['Buy 1 × 1×6 × 8′ · $12.00']`; total `'Estimated materials: $12.00 (2 parts not placed)'`.
  - **Metric note** (stock `[D]`): `stud` plus `wide` 38 × 300 × 600 mm → N = 4, strips 38 × 78 × 625 mm.
    - Board 1: stud 24 and two strips (`24 + ⅛ + 24.622 + ⅛ + 24.622 = 73.49`, and a third makes 98.24 > 96). Board 2: two strips.
    - lines `['Buy 2 × 2×4 × 8′ (38 × 89 × 2438 mm) · $16.00']`
    - notes `['wide (38 × 300 × 600 mm): glue up from 4 strips, 38 × 78 × 625 mm — no pine stock is 300 mm wide']`.
  - **`a 286 mm shelf is bought as 1×12; 287 mm is too wide`** → rename to `…; 287 mm is glued up from two`. 287 has unplaceable 0, and its note contains `glue up from 2 strips` (143.5 + 3.2 = 147 mm ≤ 286). 286 has no glue note.
  - **`… 89.5 reads 90 and is too wide`** → `… is glued up from two`: unplaceable 0, and the note contains `glue up from 2 strips`.
  - **New, worked example** (default pine shop, `defaultShop()`): `Top` 3/4 × 22 × 40.
    - lines `['Buy 1 × 1×12 × 8′ · no price']`
    - notes `['Top (3/4" × 22" × 40"): glue up from 2 strips, 3/4" × 11-1/8" × 41" — no pine stock is 22" wide']`; unplaceable 0.
    - Check the `1×12 × 8′` wording against how `sizeDims` names default pine's 11¼ × 96 before trusting it. If the name differs, the derivation is wrong, not the code: say so and stop.
  - **New, thickness** (stock `[C, F]`, F = 1 × 5½ × 96 $20): `wide` 3/4 × 8 × 80 → glued at 1".
    - Two strips 4.125 × 81; `81 + ⅛ + 81 > 96`, and a second shelf `4.125 + ⅛ + 4.125 > 5.5`, so 2 F.
    - lines `['Buy 2 × 1" × 5-1/2" × 96" · $40.00']`
    - notes `['wide (3/4" × 8" × 80"): glue up from 2 strips, 3/4" × 4-1/8" × 81" — no pine stock is 8" wide', 'wide: plane 1" stock to 3/4"']`.
  - **New, refusal kept** (stock `[G]` = 3/4 × 11¼ × 96 only): `p` 3/4 × 20 × 95½.
    - notes `['p (3/4" × 20" × 95-1/2") fits no pine stock — too wide, and too long to glue up (strips need 1" to trim)']`; unplaceable 1.
  - **New, swap-down** (stock `[A, B, I]`, I = 3/4 × 9¼ × 96 $30): `t` 3/4 × 10 × 40 → `Wmax 9.25`, 2 strips 5.125 × 41.
    - Largest-first opens I, and both strips fit one shelf (82.125). The swap-down picks the cheapest holder, A ($12) — 5.5 ≥ 5.125.
    - lines `['Buy 1 × 1×6 × 8′ · $12.00']`.
  - **New, two identical tops** (Review Focus 2; stock `[A]`): two `pine('t1'|'t2', 30, 8)` → 4 strips, ids `t1#glue:1, t1#glue:2, t2#glue:1, t2#glue:2`, all placed.
    - The first A's one shelf holds three strips (`3 × 31 + 2 × ⅛ = 93.25 ≤ 96`). The fourth needs a second shelf
      (`4.125 + ⅛ + 4.125 = 8.375 > 5.5`), so it takes a second A: `Buy 2 × 1×6 × 8′ · $24.00`.
    - Two notes, one per part.
  - **New, not candidates:** an end-grain 3/4 × 8 × 20 part with `[A]` keeps exactly its end-grain note. A banded pine top's strips use its CORE width: build it like `CutList.test.tsx`'s maple-edging fixture, but on a pine part. Hand-derive the core from the band's thickness and side, and assert the strip width `core/N + 1/8` in the note. Assert the edging strips still appear in their own material's entry and are never glued.

Run: `npx vitest run src/document/purchase.test.ts`. Expected: the rewritten and new tests FAIL; the guard still PASSES.

- [ ] **Step 3: Implement in `byThePiece`.** At the existing `t === undefined` branch, compute `reason` as today. When `reason === 'too wide'` and `!edging.has(part.id)`:
  - Call `gluePlan(part, stock, units)`.
  - **Non-null:** push the glue note. Push the planing note under the existing rule, comparing the plan's `thickness` to `part.thickness`. Add the plan's strips to `groups` at the plan's thickness. Do NOT count the part as unplaceable, and `continue`.
  - **Null:** push the refusal copy (Global Constraints), count it unplaceable, and `continue`.
  - Everything else is unchanged.
  - In `buildPurchase`, build `edging` from `cutStock(doc).slice(doc.boards.length)` and pass it through.

- [ ] **Step 4: Run the tests to verify they pass.** Run: `npx vitest run src/document/purchase.test.ts`. Expected: PASS, guard included.

- [ ] **Step 5: Mutate.** Mutate each once, see a test fail, and revert:
  - glue `too long` parts too (the guard fails);
  - skip the `edging` check (the banded test fails — if it does not, make the fixture's edging strip too wide for its stock so it would have been a candidate);
  - count a glued part as unplaceable (the totals fail);
  - put the planing note before the glue note (the thickness test fails).

- [ ] **Step 6: Commit.**

```bash
git add src/document/purchase.ts src/document/purchase.test.ts
git commit -m "feat(buying): glue up a part no stock is wide enough for, only where today says too wide (fu 268)"
```

### Task 3: layouts number a glue strip with its part's row

**Files:**
- Modify: `src/panels/CutList.tsx:53-56` (the `rowNumbers` map, after `purchase` is built)
- Test: `src/panels/CutList.test.tsx` (in `describe('row numbers (plans balloons §2.1)')`)

**Interfaces:**
- Consumes: `glueStripPart` (Task 1); `Purchase.entries[].layouts[].nesting.sheets[].parts[].boardId`.

- [ ] **Step 1: Write the failing test** `'a glue strip in a board layout carries its part's row number (glue-ups spec §5)'`:
  - Put two plywood rows first, so the glued part's number is > 2, as the edging test does.
  - Put the glued part inside an assembly (Review Focus 4), so its flat id has a path: use the store's Group action, or build an assembly document the way existing `CutList.test.tsx` cases do.
  - The glued part is pine 3/4 × 4 × 10, with `s.materials.pine = { mode: 'piece', stock: [{ id: 'x', thickness: 0.75, width: 1.5, length: 96, price: null }] }`. That gives N = 3 strips of 1.458 × 11, thin enough for the index tier.
  - Read the glued part's `.cutlist-num`. Assert that the Buying layout's key lists `${n}. <part path> strip 1 of 3 — …` (or, if the strips land in the callout rather than the key, that `getAllByText(n)` within the Buying `svg` has length ≥ 3).
  - Mutate: remove the new mapping. The layout must fall back to its own counter (1, 2, 3) and the test must fail.

- [ ] **Step 2: Run it to verify it fails.** Run: `npx vitest run src/panels/CutList.test.tsx -t "glue strip"`. Expected: FAIL.

- [ ] **Step 3: Implement.** After `purchase` is built, extend the numbers map passed to `SheetLayout`. For every placed part in every `purchase.entries[].layouts`, where `glueStripPart(boardId)` is non-null and its part has a row number, map `boardId` → that number. Keep `rowNumbers` itself unchanged for the group layouts.

- [ ] **Step 4: Run the whole suite and the typecheck.** Run: `npm test` then `npm run build`. Expected: all tests pass; the build succeeds. Timing guards can fail under load: re-run quiet before calling one a regression.

- [ ] **Step 5: Commit.**

```bash
git add src/panels/CutList.tsx src/panels/CutList.test.tsx
git commit -m "feat(cutlist): a glue strip in a Buying layout carries its part's row number"
```

### Task 4: browser check, docs, merge

**Files:**
- Create: `docs/browser-verification-glue-ups.md`
- Modify: `docs/module-map.md` (the `purchase.ts` entry, line ~477: add `gluePlan`/`glueStripPart`, the two constants, "glued only where too wide"), `docs/follow-ups.md`, `docs/feature-gaps.md`, `docs/rounds.md`, `docs/history.md`, `CLAUDE.md`

- [ ] **Step 1: Browser check** on the dev server, in the user's Chrome over their tunnel (`localhost:5199`), Claude driving through claude-in-chrome (the browser memory has the setup).
  - Make a pine project with a 3/4 × 22 × 40 top and a few legs, using the default shop.
  - Open the cut list and read Buying as a DOM readout: the buy line, the glue note, the 1×12 layout's two strips named `Top strip 1 of 2` and `2 of 2`, and the total with no `not placed`.
  - Leave the project in place (the user's ruling); never clear the dev profile.
  - Write the readouts into `docs/browser-verification-glue-ups.md`, including which items the user still owes by eye.

- [ ] **Step 2: Docs.**
  - `docs/follow-ups.md`: fu 268's new last status line, `**Status:** closed — glue-ups round (option A), <merge sha>`. Then add follow-ups 556 onward, one per spec §9 item (option B first, marked "ask first"), each with its status.
  - `docs/feature-gaps.md`: a row or a note under §3 for the round.
  - `docs/rounds.md`: a table row and a Status-log entry (no schema change; rollback free).
  - `docs/history.md`: the narrative.
  - `CLAUDE.md`: add the new numbers to "Open follow-ups"; update the test count in Commands; mention `gluePlan` in the "cut list, nesting, Buying" row. The Status block changes only at deploy. Keep the file under ~60KB.

- [ ] **Step 3: Merge.** Run `git status`; check no other session has committed to `master` since the branch started (`git log master --oneline -3`). Then `git checkout master && git merge --no-ff glue-ups`. Run `npm test && npm run build` on the merged tree, then `git branch -d glue-ups`.

- [ ] **Step 4: Deploy only with the user's go-ahead,** per `DEPLOYMENT.local.md`.
  - Confirm the bundle hash at the edge and in-network, and the CSP header.
  - Production is verified by loading the page only.
  - Then update CLAUDE.md's Status block (production line; rollback line: no schema change), `docs/rounds.md`'s row and the roadmap memory, and commit.
