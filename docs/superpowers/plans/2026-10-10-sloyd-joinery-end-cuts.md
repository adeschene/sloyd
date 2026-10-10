# Joinery and cuts at a part's end — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cut stored into the end a joint resizes is re-stored from another face it reaches, so it stays put and the part grows past it (or is trimmed through it) in every storage form; only a cut that reaches no other face still refuses. Pin follow-up 206's two-axis half-lap refusal.

**Architecture:** One helper, `refaceFromEnd(board, cut, d)`, in `src/generate/joints/recipes.ts`, used by BOTH `rebaseCuts` (the one place cuts follow a resize) and `cutIntoEnd` (the pre-check every resize caller asks first), so the check and the throw cannot disagree. No load-time step, no schema change.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-sloyd-joinery-end-cuts-design.md`

## Global Constraints

- No schema change; no load-time migration; `storedAsShape`, `pocketFor`, `cutShape`, cut-list/diagram code untouched.
- Re-facing guard tolerance: `1e-9` per axis on `cutRegion` (the tolerance `rebaseCuts` already uses).
- Face preference when several faces are reachable: the SHALLOWER span first; ties `thickness`, then `width`, then `length`. A full span (reaches both min and max) enters `from: 'min'`.
- The re-faced cut keeps its `id`; `d` (the resized dimension) becomes its POSITION axis; the third dimension is `across`.
- Invariants 40, 41, 44 hold (CLAUDE.md). Refusal reasons keep today's exact text.
- Expected values in new and rewritten tests are derived by hand in a comment, never read back from the code.
- Mutation-test every new or rewritten test; record each mutation and result in the task report.
- `npm test` does not typecheck: run `npm run build` too. Run vitest with `< /dev/null`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `joinery-end-cuts`; no merge, no push, no PR.

## Review Focus

1. A cut that RUNS along `d` to the moving end (a bookcase bottom's rabbet: `across === d`, stop 0) must keep running out on growth — it is not stored into the end, so the helper must never touch it. Pinned by the existing bookcase/rabbet tests staying green.
2. A trim (negative amount) through a re-faced cut clips it; a cut the trim removes entirely is dropped (today's rule) — not left as a zero-width cut.
3. Turned parts (90°, 180°): the helper works in part dimensions; `cutIntoEnd` maps the world end with `endFacing`. A turned shelf must behave as the unturned one carried by the turn.
4. Twin placements of one definition: joinery writes back by storage target, so both copies get the same re-faced cut (no cut-list row split). Covered by the existing shared-assembly joinery tests staying green.
5. A cut stored into the end that reaches another face only within `1e-9` (an off-grid or metric notch): the guard must still accept an exact re-store and refuse an inexact one.

---

### Task 1: `refaceFromEnd`

**Files:**
- Modify: `src/generate/joints/recipes.ts` (add the exported helper next to `cutIntoEnd`)
- Test: `src/generate/joints/recipes.test.ts` (new `describe('refaceFromEnd (fu 205)')`)

**Interfaces:**
- Produces: `export function refaceFromEnd(b: Board, c: Cut, d: Dimension): Cut | null` — `c` must be stored into `d` (`c.face === d`); returns the re-faced cut (same `id`) or `null`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('refaceFromEnd (fu 205)', () => {
  // A 20 x 11.25 x 0.75 shelf (length x width x thickness), unturned.
  const shelf = (): Board => ({ ...design({ name: 'S', at: [0, 0, 0], size: [20, 0.75, 11.25] }).boards[0]!, cuts: [] });
  it('a corner notch stored into the far end re-stores to enter from the width face it reaches, positioned along length', () => {
    const b = shelf();
    // Hand: box length [19.5, 20], width [0, 0.5], thickness [0, 0.75]. Faces reached besides length:
    // width (from min, span 0.5) and thickness (full, span 0.75) -> the shallower, width.
    const c: Cut = { id: 'n', face: 'length', from: 'max', across: 'thickness', offset: 0, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 };
    expect(cutRegion(b, c)).toEqual({ length: [19.5, 20], width: [0, 0.5], thickness: [0, 0.75] });
    expect(refaceFromEnd(b, c, 'length')).toEqual({ id: 'n', face: 'width', from: 'min', across: 'thickness', offset: 19.5, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 });
  });
  it('an end-grain mortise (interior on both other axes) cannot be re-faced', () => {
    const b = shelf();
    const c: Cut = { id: 'm', face: 'length', from: 'max', across: 'thickness', offset: 3, width: 1, depth: 1, stopMin: 0.25, stopMax: 0.25 };
    expect(refaceFromEnd(b, c, 'length')).toBeNull();
  });
  it('a groove along the back edge, stored into the width end, re-faces to enter from the length end (the only face it reaches)', () => {
    const b = shelf();
    // Hand: face width from min, across length, offset/width on thickness [0.25, 0.5], depth 0.25:
    // box width [0, 0.25], length [0, 20] (full), thickness [0.25, 0.5] (interior). Only length is reached
    // (full span -> from min, depth 20); across = thickness with stops 0.25 / 0.25; position = width.
    const c: Cut = { id: 'g', face: 'width', from: 'min', across: 'length', offset: 0.25, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(refaceFromEnd(b, c, 'width')).toEqual({ id: 'g', face: 'length', from: 'min', across: 'thickness', offset: 0, width: 0.25, depth: 20, stopMin: 0.25, stopMax: 0.25 });
  });
  it('the re-faced cut removes exactly the same box', () => {
    const b = shelf();
    const c: Cut = { id: 'n', face: 'length', from: 'max', across: 'thickness', offset: 0, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 };
    expect(cutRegion(b, refaceFromEnd(b, c, 'length')!)).toEqual(cutRegion(b, c));
  });
  it('a metric (non-dyadic) corner notch still re-faces exactly', () => {
    const b = { ...shelf(), length: 508 / 25.4 };
    const c: Cut = { id: 'n', face: 'length', from: 'max', across: 'thickness', offset: 0, width: 12 / 25.4, depth: 12 / 25.4, stopMin: 0, stopMax: 0 };
    const r = refaceFromEnd(b, c, 'length');
    expect(r).not.toBeNull();
    const a = cutRegion(b, r!); const e = cutRegion(b, c);
    for (const k of ['length', 'width', 'thickness'] as const) for (const i of [0, 1]) expect(Math.abs(a[k][i] - e[k][i])).toBeLessThanOrEqual(1e-9);
  });
});
```

Check the shelf's dimension mapping before trusting the hand values: `design()` turns `size: [x, y, z]` into a part; confirm with `boardExtents`/`axisDimensions` that `length` is x = 20, `thickness` is y = 0.75, `width` is z = 11.25. If not, fix the FIXTURE (sizes/positions) so the comments are true — not the expectations.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/generate/joints/recipes.test.ts -t "refaceFromEnd" < /dev/null` → FAIL (`refaceFromEnd` is not exported).

- [ ] **Step 3: Implement**

```ts
/**
 * Follow-up 205: a cut STORED into `d` from one end (`face === d`) re-stored to
 * enter from another face its box reaches, with `d` as its POSITION axis, so
 * rebaseCuts' rule keeps it in place while the part grows past it or a trim clips
 * it. A corner notch can be stored either way and storedAsShape keeps whichever
 * form it was given, so without this the answer depended on storage. Null when
 * the box reaches no other face (an end-grain mortise) or the re-store would not
 * remove exactly the same box (within 1e-9, rebaseCuts' tolerance).
 */
export function refaceFromEnd(b: Board, c: Cut, d: Dimension): Cut | null {
  const EPS = 1e-9;
  const r = cutRegion(b, c);
  const order: Dimension[] = ['thickness', 'width', 'length'];
  const options = order.filter((f) => f !== d).flatMap((f) => {
    const span = r[f][1] - r[f][0];
    if (r[f][0] <= EPS) return [{ f, from: 'min' as const, span }];
    if (r[f][1] >= b[f] - EPS) return [{ f, from: 'max' as const, span }];
    return [];
  }).sort((x, y) => x.span - y.span); // stable: ties keep thickness, width, length
  for (const { f, from, span } of options) {
    const g = order.find((x) => x !== d && x !== f)!;
    const candidate: Cut = {
      id: c.id, face: f, from, across: g,
      offset: r[d][0], width: r[d][1] - r[d][0], depth: span,
      stopMin: r[g][0], stopMax: b[g] - r[g][1],
    };
    const a = cutRegion(b, candidate);
    if (order.every((k) => Math.abs(a[k][0] - r[k][0]) <= EPS && Math.abs(a[k][1] - r[k][1]) <= EPS)) return candidate;
  }
  return null;
}
```

Import `cutRegion` from `'../../document/cuts'` (already imports `boardSolids` from there).

- [ ] **Step 4: Run to verify they pass**, then mutate: (a) sort descending → the corner-notch test fails; (b) drop the guard (return the first candidate) → show which test fails, or add one (a candidate whose region differs) until one does; (c) `from: 'max'` for a full span → the groove test fails. Record each.

- [ ] **Step 5: Commit** — `feat(joinery): refaceFromEnd re-stores an end cut from another face it reaches (fu 205)`.

---

### Task 2: Wire it into `rebaseCuts` and `cutIntoEnd`; behaviour tests

**Files:**
- Modify: `src/generate/joints/recipes.ts` (`cutIntoEnd` ~line 62 and its doc comment; `rebaseCuts` ~line 95 and its doc comment)
- Test: `src/generate/joints/recipes.test.ts`

**Interfaces:**
- Consumes: `refaceFromEnd(b, c, d)` from Task 1.

- [ ] **Step 1: Change `cutIntoEnd`**

```ts
const cutIntoEnd = (b: Board, k: number, end: 'min' | 'max') => {
  const local = endFacing(b, k, end === 'min' ? -1 : 1);
  const d = axisDimensions(b)[k];
  return b.cuts.some((c) => c.face === d && c.from === local && refaceFromEnd(b, c, d) === null);
};
```

Rewrite its doc comment: it asks rebaseCuts' question AFTER the same re-facing (fu 205), so a cut that can be re-faced is not "cut into the end".

- [ ] **Step 2: Change `rebaseCuts`** — after the `storedAsShape` map and before the filter:

```ts
  // Follow-up 205: a cut stored INTO the moving end is re-faced first when its box
  // reaches another face; it then stays put (positioned along d). Only a cut that
  // cannot be re-faced still reaches the throw below (cutIntoEnd refuses it first).
  b.cuts = b.cuts.map((c) => (c.face === d && c.from === end ? refaceFromEnd(before, c, d) ?? c : c));
```

Add one bullet to rebaseCuts' doc comment: "A cut INTO `d` from the moving end is re-faced from another face its box reaches (fu 205); only one that cannot be throws."

- [ ] **Step 3: Run the joinery suite and list what flips** — `npx vitest run src/generate/joints/ < /dev/null`. Expected flips (each now JOINS or CLIPS instead of skipping): the describe "a part already cut into the end a tenon or dado would grow is skipped (final review)" (the shelf notch and the rail notch), the rigid-turn fixture "a shelf already cut at the end a dado would grow (skip)", "refuses a shelf … already cut into its back edge" (both variants), "a panel already cut into its left/right end, which its rabbet line trims". Anything ELSE that fails is a regression: stop and report it.

- [ ] **Step 4: Rewrite each flipped test to the new rule, by hand.** For each: the joint is applied (name the kinds), the part is grown/trimmed by the hand-derived amount, the pre-existing cut's WORLD box is unchanged where it survives (or clipped to the hand-derived box on a trim, or gone if the trim removes it), `checkDesign` shows no overlap, and every OTHER part is unchanged. Rename the describe/its titles to say what they now pin. Keep one test per original scenario.

- [ ] **Step 5: Add the new behaviour tests**

```ts
describe('a cut at the end a joint resizes follows the part, in any storage form (fu 205)', () => {
  // The follow-up's probe: shelf between two sides, 1/2 x 1/2in full-thickness corner notch at its far end.
  // Hand: default dados 0.25 deep at each side -> shelf 20 + 0.25 + 0.25 = 20.5; the notch's world box stays
  // x [0.75 + 19.5, 0.75 + 20] = [20.25, 20.75], z [0, 0.5], y [12, 12.75].
  for (const form of ['length', 'width'] as const) {
    it(`stored on the ${form} face: both dados apply, the shelf is 20.5in, the notch stays where it was`, () => {
      // build with design(...) as the existing test does; push the notch in `form`'s storage
      // (length: face length/from max/across thickness/width 0.5/depth 0.5;
      //  width: face width/from min/across thickness/offset 19.5/width 0.5/depth 0.5);
      // apply defaultChoice for every site; assert applied kinds ['dado','dado'], skipped [],
      // shelf length 20.5, the notch's world box (cutRegion + position) as above, checkDesign clean.
    });
  }
  it('an end-grain mortise at the end a tenon would grow is still skipped with today\'s reason, NOTHING changed', () => { /* rail + leg; mortise face length/from min, interior on width and thickness */ });
  it('a trim through a re-faced notch clips it and keeps the rest of its box in place', () => { /* panel rabbet-line trim; hand-derived clipped box */ });
  for (const turn of [90, 180] as const) {
    it(`a turned shelf (${turn}°) behaves as the unturned one carried by the turn`, () => { /* notch on ONE side only (asymmetric, inv 44); compare to the unturned result through rotateQuarter as the rigid-turn tests do */ });
  }
});
```

Fill each body completely (the comments above are the contract, not placeholders to leave). Derive every expected number by hand in a comment.

- [ ] **Step 6: Mutate** — (a) remove the re-facing from `rebaseCuts` only → the probe tests throw/fail; (b) remove it from `cutIntoEnd` only → the length-form probe is skipped again (red); (c) make `cutIntoEnd` ignore `refaceFromEnd` but keep `rebaseCuts`' → show the end-grain test still holds and the probe fails; (d) the turned tests with `endFacing` replaced by the raw end → red. Record each.

- [ ] **Step 7: Full run and commit** — `npm test < /dev/null && npm run build < /dev/null`; commit `feat(joinery): a cut at the end a joint resizes follows the part in any storage form (fu 205)`.

---

### Task 3: Follow-up 206's two-axis refusal; docs

**Files:**
- Test: `src/generate/joints/recipes.test.ts`
- Modify: `docs/follow-ups.md` (205 and 206 status lines), `docs/history.md`, `CLAUDE.md` (Status pending-deploy line, rounds row, test count, "Where things live" generate line mention of `refaceFromEnd`)

- [ ] **Step 1: The 206 test.** Build a part E that is half-lapped on TWO axes, with its partners on the two axes in different planes on one of them, so `halfLap` refuses with `<E>'s half-lap partners do not lie in one plane` and NOTHING moves or is notched. Try `findSites` first (a part crossing one partner on one axis and another on a second axis). If no geometry yields two crossings on different axes for one entering part, drive `applyJoints` with hand-built `Site` objects and say so in the test comment. Mutate: restrict the coplanar filter to partners on the same axis → the test must go red (that is the behaviour being pinned as deliberate). The existing same-axis test (`half-lap: partners in different planes skip every site`) stays as it is.

- [ ] **Step 2: Docs.** 205: `**Status:** CLOSED 2026-10-10 by the joinery-end-cuts round: refaceFromEnd re-stores a cut stored into the resized end from another face its box reaches, in rebaseCuts and cutIntoEnd; the cause was two equally valid storage forms that storedAsShape keeps as given (spec docs/superpowers/specs/2026-10-10-sloyd-joinery-end-cuts-design.md). An end-grain mortise still refuses.` 206: `**Status:** CLOSED 2026-10-10 by decision (the user's): the refusal is pinned by a test; per-axis would also need the drop's collision sweep keyed by axis, for a path no real design reaches.` History paragraph (what changed, which skips became joins, test count delta). CLAUDE.md: pending-deploy status line, a rounds row `| joinery end cuts | 10-10 | — | A cut at a resized end follows the part in any storage form (fu 205); 206 pinned |`, the test count, and `refaceFromEnd` in the generate line of "Where things live".

- [ ] **Step 3: Full run and commit** — `npm test < /dev/null && npm run build < /dev/null`; commit `test(joinery): pin the two-axis half-lap refusal (fu 206); docs for fu 205/206`.
