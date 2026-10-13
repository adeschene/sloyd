# AI angles, chunk 1 — the checks, joinery and Repair accept miters, bevels and chamfers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add joinery and Repair stop refusing mitered, beveled and chamfered projects: contact trusts only flat wood for
every kind, an angle cut reaching into a joint refuses the run (with the tenon-clearance exception), and joinery keeps
every angle cut where it is on the wood when it grows or trims a part (closing fu 307).

**Architecture:** Two pure helpers in `angleCuts.ts` (`touchedRegion`, `splitRegion`) give every angle cut a board-local
box holding all the wood it can remove and split a box around it. `designCheck.ts`' `contactSolids` gains a
`contactRegions` core that applies today's taper rule unchanged, then splits by every other kind. `tapers.ts` gains
`angleConflicts` beside `taperConflicts`; one message builder in `angledRefusal.ts` joins both; `joineryRefusal` returns
it. `recipes.ts`' `resize` re-anchors angle cuts measured from the moving end.

**Tech Stack:** TypeScript, Vitest. No React or viewport change.

**Spec:** `docs/superpowers/specs/2026-10-13-sloyd-ai-angles-design.md` (§2–§4.1 are this chunk; read §1's rulings).

## Global Constraints

- **No document schema change**: `CURRENT_VERSION` stays 14; nothing writes a new stored field.
- **Tapers byte for byte**: a taper-only part's `contactSolids`, conflicts, refusal text and joined result are unchanged.
  The existing taper tests stay green WITHOUT modification (except the one decider test Task 3 rewrites, whose miter case
  is this chunk's subject).
- **Untapered, unangled parts byte for byte**: `contactSolids(b)` is `worldSolids(b)` for a part with no angle cuts.
- **Invariant 44**: every part↔world crossing goes through `worldBox` / `axisFrame` / `endFacing` / `toWorldOffset`;
  never `board[dim] - u` to cross into world space.
- **Invariant 41**: every joinery refusal is decided before any call or mutation, by the ONE decider `joineryRefusal`.
- **Invariant 22**: a computed coordinate compared with a typed one gets a 1e-9 float-noise tolerance, nothing more;
  `TOUCH` (1/32in) is used only where box contacts already use it (the in-plane patch overlap).
- **The `→ units` edge rule**: person-facing strings are built in `document/angledRefusal.ts`, never in `generate/`.
- **The user's rulings** (spec §1, §3): a sloped face is never a contact; no new joint kinds; a miter/bevel/chamfer
  reaching into a joint refuses; a cut running straight through an entering part's joined end that clears the tenon's
  section does not.
- Refine is NOT touched in this chunk: `angledRefusal(doc, 'refine')` keeps its text and behaviour.
- Every plan-supplied test is mutated once (CLAUDE.md: "Mutate the test, don't just run it"); the mutation is named in
  its step.

## Review Focus

1. **A part carrying a taper AND a chamfer** (a tapered leg with chamfered corners): contact must apply the taper rule
   first and then the split, never trust removed wood, and never double-count a face. Pinned in Task 2.
2. **A turned or on-edge entering part** (rotation 180, `posture: 'on-edge'`): the conflict test crosses the touched
   box through `worldBox`, so a chamfer on a turned rail must conflict exactly where the same world rail would. Pinned in
   Task 3.
3. **A cut that removes nothing** (a line at or below depth 0 across the part, kept in the document per angle-cuts spec
   §2.3): it must neither split contact nor conflict with a joint. Pinned in Tasks 1 and 3.
4. **A chamfer or miter deeper than its dimension** (the part was shortened below it, fu 296's class): `touchedRegion`
   clamps to the dimension and contact returns whatever wood is trusted — possibly none — without throwing. Pinned in
   Task 1 and Task 2.
5. **A shared (Shape) rail rebased by joinery**: two identical rails linked as one component, both tenoned at one
   end, with a chamfer near the free end stored deep-end-last (measured from the tenoned end): after `writeBackFlat` they are still one component and the chamfer is where it
   was in world space. Pinned in Task 5.

---

### Task 1: `touchedRegion` and `splitRegion` (pure, `angleCuts.ts`)

**Files:**
- Modify: `src/document/angleCuts.ts` (after `angleCutsThatRemoveStock`, ~line 101)
- Modify: `src/document/document.ts:29` (add both names to the `./angleCuts` re-export)
- Test: `src/document/angleCuts.test.ts` (new `describe` at the end)

**Interfaces:**
- Produces: `touchedRegion(board: Pick<Board, Dimension>, c: AngleCut): Region | null` and
  `splitRegion(cell: Region, t: Region, c: Pick<AngleCut, 'face' | 'from' | 'along'>): Region[]`, both exported from
  `angleCuts.ts` and re-exported from `document.ts`. `Region`/`Span` come from `./types`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/angleCuts.test.ts` (add `touchedRegion, splitRegion, keptHalfSpace, chamferCut, miterCut,
taperCut` to its import from `./angleCuts` as needed, `createBoard` from `./document`, and `Region` from `./types`):

```ts
describe('touchedRegion / splitRegion (AI-angles spec §2.1, §2.2)', () => {
  const rail = () => createBoard({ name: 'Rail', length: 18, width: 3, thickness: 0.75 });
  const chamfer = (legFace: number, legAlong: number) =>
    ({ id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace, legAlong }, rail()) });
  const whole = (b: { length: number; width: number; thickness: number }): Region =>
    ({ length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] });
  const vol = (r: Region) => (r.length[1] - r.length[0]) * (r.width[1] - r.width[0]) * (r.thickness[1] - r.thickness[0]);
  const meet = (p: Region, q: Region): Region => ({
    length: [Math.max(p.length[0], q.length[0]), Math.min(p.length[1], q.length[1])],
    width: [Math.max(p.width[0], q.width[0]), Math.min(p.width[1], q.width[1])],
    thickness: [Math.max(p.thickness[0], q.thickness[0]), Math.min(p.thickness[1], q.thickness[1])],
  });
  const disjoint = (rs: Region[]) => rs.every((p, i) => rs.every((q, j) => {
    if (i === j) return true;
    const m = meet(p, q);
    return m.length[1] <= m.length[0] || m.width[1] <= m.width[0] || m.thickness[1] <= m.thickness[0];
  }));
  // Every sampled point of every piece is on the KEPT side of the cut (never trusts removed wood).
  const kept = (b: Parameters<typeof keptHalfSpace>[0], c: Parameters<typeof keptHalfSpace>[1], rs: Region[]) => {
    const h = keptHalfSpace(b, c)!;
    return rs.every((r) => [0, 0.5, 1].every((u) => [0, 0.5, 1].every((v) => [0, 0.5, 1].every((w) => {
      const p = [r.length[0] + u * (r.length[1] - r.length[0]), r.width[0] + v * (r.width[1] - r.width[0]), r.thickness[0] + w * (r.thickness[1] - r.thickness[0])];
      return h.n[0] * p[0]! + h.n[1] * p[1]! + h.n[2] * p[2]! + h.d >= -1e-9;
    }))));
  };

  it('a chamfer: its two legs from its edge, all of the length', () => {
    expect(touchedRegion(rail(), chamfer(0.125, 0.25))).toEqual({ length: [0, 18], width: [2.875, 3], thickness: [0.5, 0.75] });
  });
  it('a miter: all of its across dimension, its run × ratio into the end', () => {
    const b = rail();
    const c = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    expect(touchedRegion(b, c)).toEqual({ length: [15, 18], width: [0, 3], thickness: [0, 0.75] });
  });
  it('a taper read from its thin end: stations up to its start', () => {
    const b = rail();
    const c = { id: 't', ...taperCut({ face: 'width', from: 'min', end: 'max', start: 6, amount: 0.5 }) };
    expect(touchedRegion(b, c)).toEqual({ length: [12, 18], width: [0, 0.5], thickness: [0, 0.75] });
  });
  it('null for a cut that removes nothing (Review Focus 3)', () => {
    const b = rail();
    expect(touchedRegion(b, { ...chamfer(0.125, 0.25), points: [[0, -1], [1, -2]] })).toBeNull();
  });
  it('clamps a leg longer than its dimension (Review Focus 4)', () => {
    expect(touchedRegion(rail(), chamfer(5, 0.25))).toEqual({ length: [0, 18], width: [0, 3], thickness: [0.5, 0.75] });
  });
  it('splits a cell into disjoint pieces that never hold removed wood, and keep everything else', () => {
    const b = rail();
    for (const c of [chamfer(0.125, 0.25), { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) }]) {
      const t = touchedRegion(b, c)!;
      const pieces = splitRegion(whole(b), t, c);
      expect(disjoint(pieces)).toBe(true);
      expect(kept(b, c, pieces)).toBe(true);
      // Exactly the cell minus the touched box.
      expect(pieces.reduce((s, r) => s + vol(r), 0)).toBeCloseTo(vol(whole(b)) - vol(t), 12);
    }
  });
  it('the mitered end trusts nothing past its short point', () => {
    const b = rail();
    const c = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    expect(splitRegion(whole(b), touchedRegion(b, c)!, c)).toEqual([{ length: [0, 15], width: [0, 3], thickness: [0, 0.75] }]);
  });
  it('a cell the touched box does not reach comes back alone, unchanged', () => {
    const b = rail();
    const cell: Region = { length: [0, 18], width: [0, 2], thickness: [0, 0.75] };
    const out = splitRegion(cell, touchedRegion(b, chamfer(0.125, 0.25))!, chamfer(0.125, 0.25));
    expect(out).toEqual([cell]);
  });
  it("a zero-length end slab (a taper's) inside the touched box is split only by depth, never duplicated", () => {
    const b = rail();
    const c = { id: 'm', ...miterCut({ end: 'max', across: 'thickness', longSide: 'min', ratio: 1 }, b) };
    const slab: Region = { length: [18, 18], width: [0, 3], thickness: [0, 0.75] };
    // The slab sits ON the mitered end: a miter's face is the length, so nothing of the end is trusted.
    expect(splitRegion(slab, touchedRegion(b, c)!, c)).toEqual([]);
    const far: Region = { length: [0, 0], width: [0, 3], thickness: [0, 0.75] };
    expect(splitRegion(far, touchedRegion(b, c)!, c)).toEqual([far]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/angleCuts.test.ts`
Expected: FAIL — `touchedRegion is not a function` (or a TS import error reported by Vitest).

- [ ] **Step 3: Implement**

In `src/document/angleCuts.ts`, extend the type import to `import type { AngleCut, AngleKind, Board, CutFrom, Dimension, Region, Span } from './types';`
and add after `angleCutsThatRemoveStock`:

```ts
/**
 * The smallest board-local box holding every point the cut can remove (AI-angles spec §2.1): along `along`, the
 * stations where the line is deeper than 0; into `face`, from the `from` face to the line's greatest depth there
 * (clamped to the dimension); all of `throughOf(c)`. Depth is linear in station, so the greatest depth is at an end.
 * Null for a cut that removes nothing. Board-local: a caller crosses it to world space through `worldBox` (invariant 44).
 */
export function touchedRegion(board: Pick<Board, Dimension>, c: AngleCut): Region | null {
  if (angleCutRemovesNothing(board, c)) return null;
  const A = board[c.along];
  const F = board[c.face];
  const d0 = depthAt(c, 0);
  const d1 = depthAt(c, A);
  const z = Math.min(A, Math.max(0, zeroStation(c)));
  // Stations from `alongFrom` where the line is deeper than 0: up to (or from) its zero, or all of `along`.
  const lo = d0 > 0 ? 0 : z;
  const hi = d1 > 0 ? A : z;
  const deep = Math.min(F, Math.max(d0, d1));
  const r: Region = { length: [0, board.length], width: [0, board.width], thickness: [0, board.thickness] };
  r[c.along] = c.alongFrom === 'min' ? [lo, hi] : [A - hi, A - lo];
  r[c.face] = c.from === 'min' ? [0, deep] : [F - deep, F];
  return r;
}

/**
 * `cell` minus a cut's touched box `t` (AI-angles spec §2.2), as boxes that do not overlap: the stations along
 * `c.along` outside `t`, at full size, and the stations inside `t`, kept only past `t`'s greatest depth into `c.face`.
 * A cell `t` does not reach comes back alone, unchanged. A cell already of zero size along `along` (a taper's end slab)
 * inside `t`'s stations is split by depth only, so it is never duplicated. Pieces the split leaves empty are dropped.
 */
export function splitRegion(cell: Region, t: Region, c: Pick<AngleCut, 'face' | 'from' | 'along'>): Region[] {
  const meets = DIMENSION_ORDER.every((d) => {
    const [a, b] = cell[d];
    const [p, q] = t[d];
    return a === b ? a >= p && a <= q : Math.min(b, q) - Math.max(a, p) > 0;
  });
  if (!meets) return [cell];
  const out: Region[] = [];
  const [a, b] = cell[c.along];
  const [p, q] = t[c.along];
  const zero = a === b;
  if (!zero && Math.min(b, p) > a) out.push({ ...cell, [c.along]: [a, Math.min(b, p)] });
  if (!zero && b > Math.max(a, q)) out.push({ ...cell, [c.along]: [Math.max(a, q), b] });
  const s: Span = zero ? [a, b] : [Math.max(a, p), Math.min(b, q)];
  const [f0, f1] = cell[c.face];
  const f: Span = c.from === 'min' ? [Math.max(f0, t[c.face][1]), f1] : [f0, Math.min(f1, t[c.face][0])];
  if (f[1] > f[0] || (f0 === f1 && f[0] === f[1])) out.push({ ...cell, [c.along]: s, [c.face]: f });
  return out;
}
```

In `src/document/document.ts:29`, add `splitRegion, touchedRegion` to the `./angleCuts` re-export list.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/document/angleCuts.test.ts`
Expected: PASS (all, including the file's existing tests).

- [ ] **Step 5: Mutate**

Change `return a === b ? a >= p && a <= q : Math.min(b, q) - Math.max(a, p) > 0;` to `... >= 0;` — the "does not
reach" test must fail (a cell touching `t` only on a face gets split). Change `c.from === 'min' ? [Math.max(f0, t[c.face][1]), f1]`
to `[f0, f1]` — the "never hold removed wood" test must fail. Restore both; re-run: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/document/angleCuts.ts src/document/angleCuts.test.ts src/document/document.ts
git commit -m "feat(document): touchedRegion and splitRegion — the box an angle cut can remove, and a cell split around it (AI-angles §2)"
```

---

### Task 2: Contact trusts flat wood for every kind (`designCheck.ts`)

**Files:**
- Modify: `src/document/designCheck.ts:270-335` (`isTapered` → `isAngled`, `contactSolids` → `contactRegions` core) and
  the four `isTapered` uses at ~370, ~433, ~452; the doc comments at lines 26-28, 272-277, 283, 284-294, 341
- Modify: `src/document/contactSolids.test.ts` (rename import; the "throws on any other kind" test becomes Task 2's)
- Test: `src/document/contactSolids.test.ts`, `src/document/taperChecks.test.ts` (new `describe` at the end)

**Interfaces:**
- Consumes: `touchedRegion`, `splitRegion` (Task 1).
- Produces: `export const isAngled = (b: Board): boolean => b.angleCuts.length > 0;` (replaces `isTapered`; no alias);
  `export function contactRegions(b: Board): Region[]` (board-local); `contactSolids(b)` unchanged signature.

- [ ] **Step 1: Write the failing tests**

In `src/document/contactSolids.test.ts`: change the import to `import { contactRegions, contactSolids, isAngled, worldSolids } from './designCheck';`,
rename `isTapered` → `isAngled` in the two existing assertions, add `chamferCut, miterCut` to the `./angleCuts` import,
and REPLACE the test `'throws on any other angle-cut kind (refused upstream)'` with:

```ts
  it('a chamfered leg: the corner strip is never trusted, the rest is (spec §2.2)', () => {
    const b = leg();
    // The +X/+Z vertical edge of the upright leg: width (X) max and thickness (Z) max, 1/4in legs, all of the length.
    const c: AngleCut = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, b) };
    expect(sorted(contactSolids({ ...b, angleCuts: [c] }))).toEqual([
      [[0, 0, 0], [1.5, 28, 1.25]],    // thickness stations outside the strip, full width
      [[0, 0, 1.25], [1.25, 28, 1.5]], // inside it, only past the width leg
    ].sort((p, q) => p[0][1]! - q[0][1]! || p[0][0]! - q[0][0]!));
  });

  it('a mitered end trusts nothing past its short point', () => {
    const b = leg();
    const c: AngleCut = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    expect(sorted(contactSolids({ ...b, angleCuts: [c] }))).toEqual([[[0, 0, 0], [1.5, 26.5, 1.5]]]);
  });

  it('taper first, then the chamfer: never trusts removed wood, never overlaps (Review Focus 1)', () => {
    const b = leg();
    const t = taper(b, 0, 1, 20, 0.5);
    const c: AngleCut = { id: 'c', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.25 }, b) };
    const both = { ...b, angleCuts: [t, c] };
    const rs = contactRegions(both);
    // Each region is inside what the taper alone trusts AND outside the chamfer's strip.
    const taperOnly = contactRegions({ ...b, angleCuts: [t] });
    const within = (r: (typeof rs)[number], s: (typeof rs)[number]) =>
      (['length', 'width', 'thickness'] as const).every((d) => r[d][0] >= s[d][0] - 1e-12 && r[d][1] <= s[d][1] + 1e-12);
    expect(rs.every((r) => taperOnly.some((s) => within(r, s)))).toBe(true);
    expect(rs.every((r) => r.width[0] >= 0.25 - 1e-12 || r.thickness[0] >= 0.25 - 1e-12)).toBe(true);
    // Pairwise disjoint (positive volume on no pair).
    const vol = (p: (typeof rs)[number], q: (typeof rs)[number]) => (['length', 'width', 'thickness'] as const)
      .map((d) => Math.min(p[d][1], q[d][1]) - Math.max(p[d][0], q[d][0])).every((v) => v > 0);
    expect(rs.some((p, i) => rs.some((q, j) => i !== j && vol(p, q)))).toBe(false);
  });

  it('a chamfer deeper than the part trusts nothing in its strip, and does not throw (Review Focus 4)', () => {
    const b = leg();
    const c: AngleCut = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 5, legAlong: 0.25 }, b) };
    expect(sorted(contactSolids({ ...b, angleCuts: [c] }))).toEqual([[[0, 0, 0], [1.5, 28, 1.25]]]);
  });
```

Append to `src/document/taperChecks.test.ts` (its imports already include `checkDesign`, `createBoard`, `createDocument`,
`flatDocument`; add `chamferCut, miterCut` from `./angleCuts` and `axisFrame, endFacing` from `./geometry` if missing):

```ts
describe('the checks on mitered and chamfered parts (AI-angles spec §2)', () => {
  const lim = { width: null, depth: null, height: null, maxParts: 20 };
  const doc = (boards: ReturnType<typeof createBoard>[]) => flatDocument({ ...createDocument('T'), boards });
  const kindsOf = (boards: ReturnType<typeof createBoard>[]) => checkDesign(doc(boards), lim).map((v) => `${v.kind}:${v.parts.join(',')}`);

  it('a top chamfered on its upper edges still rests on its posts', () => {
    const posts = [[0, 0], [16, 0], [0, 16], [16, 16]].map(([x, z], i) =>
      createBoard({ name: `Post ${i + 1}`, posture: 'upright', position: [x!, 0, z!], length: 10, width: 2, thickness: 2 }));
    const top = createBoard({ name: 'Top', position: [0, 10, 0], length: 18, width: 18, thickness: 1 });
    // Flat: length X, width Z, thickness Y. Chamfer the +Y edges along both long sides.
    const up = { face: 'width' as const, along: 'thickness' as const, alongFrom: endFacing(top, 1, 1), legFace: 0.25, legAlong: 0.25 };
    const chamfered = { ...top, angleCuts: [
      { id: 'c1', ...chamferCut({ ...up, from: endFacing(top, 2, -1) }, top) },
      { id: 'c2', ...chamferCut({ ...up, from: endFacing(top, 2, 1) }, top) },
    ] };
    expect(axisFrame(top)[1]!.dim).toBe('thickness');
    expect(kindsOf([...posts, top])).toEqual([]);
    expect(kindsOf([...posts, chamfered])).toEqual([]);
  });

  it('the top rail of an upright mitered frame, held only by its miters, is reported (the user\'s ruling)', () => {
    // A frame in the X-Y plane, 3/4 thick in Z, 1.5 wide members, 12 x 12 outside, standing on the floor.
    const stile = (name: string, x: number, outer: -1 | 1) => {
      const b = createBoard({ name, posture: 'upright', position: [x, 0, 0], length: 12, width: 1.5, thickness: 0.75 });
      // Mitered at the top across the width (X), long point on the outer side.
      return { ...b, angleCuts: [{ id: 'm', ...miterCut({ end: endFacing(b, 1, 1), across: 'width', longSide: endFacing(b, 0, outer), ratio: 1 }, b) }] };
    };
    const rail = (() => {
      const b = createBoard({ name: 'Top rail', posture: 'on-edge', position: [0, 10.5, 0], length: 12, width: 1.5, thickness: 0.75 });
      expect(axisFrame(b)[0]!.dim).toBe('length');
      expect(axisFrame(b)[1]!.dim).toBe('width');
      // Mitered at both ends across the width (Y), long points on the top.
      return { ...b, angleCuts: [-1, 1].map((s, i) => ({ id: `m${i}`, ...miterCut({ end: endFacing(b, 0, s as -1 | 1), across: 'width', longSide: endFacing(b, 1, 1), ratio: 1 }, b) })) };
    })();
    const out = kindsOf([stile('Left', 0, -1), stile('Right', 10.5, 1), rail]);
    expect(out.some((k) => k.startsWith('overlap'))).toBe(false);          // real bodies meet only on the diagonals
    expect(out).toContain('unsupported:Top rail');                           // a sloped face is never a contact
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/contactSolids.test.ts src/document/taperChecks.test.ts`
Expected: FAIL — `isAngled`/`contactRegions` not exported; the chamfer/miter tests throw `contactSolids: Leg carries a chamfer`.

If the frame test's posture assertions fail (the on-edge axis mapping differs from the comment), fix the FIXTURE's
`posture`/`rotation` so a 12in length lies on X and 1.5in width on Y, keep the assertions, and ledger a Ruling — do not
weaken the `unsupported:Top rail` assertion.

- [ ] **Step 3: Implement**

In `src/document/designCheck.ts`:

1. Import `splitRegion, touchedRegion` from `./angleCuts` (beside the existing `taperFields` import) and `Region` from `./types`.
2. Replace `isTapered` with:

```ts
/** A part carrying any angle cut: the checks read its real bodies (overlap, weight) and its flat wood (contact). */
export const isAngled = (b: Board): boolean => b.angleCuts.length > 0;
```

3. Replace `contactSolids` with `contactRegions` + `contactSolids`:

```ts
/**
 * A part's solids AS FAR AS CONTACT CAN TRUST THEM (AI-tapers spec §3.2; AI-angles spec §2), board-local regions.
 * No angle cut: exactly `pocketCells`. Tapers first, unchanged: every pocket cell clipped, along the length, to the
 * stations no taper removes, plus, at each end a taper runs toward, a zero-thickness slab per cell reaching it, shrunk by
 * each such taper's amount (read through `taperFields`, so a line stored deep-end-last reads as the same taper). Then
 * every miter, bevel and chamfer splits what is left around its touched box (`splitRegion`): a sloped face is never a
 * contact, and nothing a cut removes is ever trusted. The second reader of angle cuts besides `boardBodies`
 * (invariant 48), box-valued, never over-claiming wood.
 */
export function contactRegions(b: Board): Region[] {
  const cells = pocketCells(b);
  if (!isAngled(b)) return cells;
  const tapers = b.angleCuts.filter((c) => c.kind === 'taper').map((c) => taperFields(c, b)).filter((t) => t.amount > 0);
  const L = b.length;
  let lo = 0;
  let hi = L;
  for (const t of tapers) {
    if (t.end === 'min') lo = Math.max(lo, t.start);
    else hi = Math.min(hi, L - t.start);
  }
  let out: Region[] = [];
  for (const r of cells) {
    const l0 = Math.max(r.length[0], lo);
    const l1 = Math.min(r.length[1], hi);
    if (l0 <= l1) out.push({ ...r, length: [l0, l1] });
  }
  for (const end of ['min', 'max'] as const) {
    const here = tapers.filter((t) => t.end === end);
    if (here.length === 0) continue;
    const at = end === 'min' ? 0 : L;
    for (const r of cells) {
      if (r.length[0] > at || r.length[1] < at) continue;
      const slab: Region = { ...r, length: [at, at] };
      for (const t of here) {
        const [a, z] = slab[t.face];
        slab[t.face] = t.from === 'min' ? [Math.max(a, t.amount), z] : [a, Math.min(z, b[t.face] - t.amount)];
      }
      if (slab.width[0] < slab.width[1] && slab.thickness[0] < slab.thickness[1]) out.push(slab);
    }
  }
  for (const c of b.angleCuts) {
    if (c.kind === 'taper') continue;
    const t = touchedRegion(b, c);
    if (t) out = out.flatMap((r) => splitRegion(r, t, c));
  }
  return out;
}

/** `contactRegions` in world space; exactly `worldSolids` for a part with no angle cut. */
export function contactSolids(b: Board): Box[] {
  if (!isAngled(b)) return worldSolids(b);
  return contactRegions(b).map((s) => worldBox(b, s));
}
```

(The taper half is today's body, moved verbatim except: it filters `kind === 'taper'` instead of throwing, and `out` is
`let`.)

4. Rename every other `isTapered` use to `isAngled` (`partMass`, the overlap loop, `const tapered = doc.boards.map(isAngled)`
— keep the local variable name `tapered` or rename it `angled` consistently within `checkDesign`). Update the comments at
lines 26-28, 272-277 (`worldSolids`' doc: "held/hangs contacts, grounding and the tip footprint read `contactSolids` when a
part is angled … Joinery refuses an angle cut running into a joint (`generate/joints/tapers.ts`)"), and 341 ("The checks
read it only for an angled part").

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/document/contactSolids.test.ts src/document/taperChecks.test.ts src/document/designCheck.test.ts`
Expected: PASS. Then `npx tsc -b` (or `npm run build`) — no remaining `isTapered` reference.

- [ ] **Step 5: Mutate**

Delete the `for (const c of b.angleCuts) { if (c.kind === 'taper') continue; … }` loop: the chamfer, miter and frame
tests must fail (the frame's top rail then rests on the stiles' boxes). Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/document/designCheck.ts src/document/contactSolids.test.ts src/document/taperChecks.test.ts
git commit -m "feat(checks): contact trusts flat wood for miters, bevels and chamfers; isTapered → isAngled (AI-angles §2)"
```

---

### Task 3: The joint rule widens (`tapers.ts`, `angledRefusal.ts`)

**Files:**
- Modify: `src/document/angledRefusal.ts` (add `AngleConflict`, `jointRefusal`; narrow `angledRefusal` to `'refine'`)
- Modify: `src/document/document.ts` (re-export `AngleConflict`, `jointRefusal` beside `TaperConflict`, `taperJointRefusal`)
- Modify: `src/generate/joints/tapers.ts` (add `angleConflicts`, `clearsTenon`; `joineryRefusal` uses `jointRefusal`)
- Modify: `src/generate/run.test.ts:760-777` (the angled-document test), `src/document/angledRefusal.test.ts:27-36`
- Test: `src/generate/joints/tapers.test.ts`

**Interfaces:**
- Consumes: `touchedRegion` (Task 1), `throughOf` (`angleCuts.ts`), `worldBox`, `TOUCH` (`designCheck.ts`),
  `tenonSection(thickness, width): { tenon, cheek, shoulder }` (`recipes.ts`, already exported), `axisDimensions`.
- Produces:
  - `export interface AngleConflict { part: number; other: number; kind: 'miter' | 'bevel' | 'chamfer' }` (angledRefusal.ts)
  - `export function jointRefusal(flat: FlatDocument, tapers: readonly TaperConflict[], angles: readonly AngleConflict[]): string | null` (angledRefusal.ts)
  - `export function angleConflicts(flat: FlatDocument, sites: readonly Site[]): AngleConflict[]` (tapers.ts)
  - `joineryRefusal(doc, flat?, sites?)` — same signature, widened result.
  - `angledRefusal(doc: SloydDocument, action: 'refine'): string | null` — the `'joinery'` branch removed.

- [ ] **Step 1: Write the failing tests**

In `src/generate/joints/tapers.test.ts`, add to the imports `angleConflicts` (from `./tapers`), `chamferCut, miterCut`
(from `../../document/document`), `axisDimensions` (from `../../document/geometry`), and append:

```ts
describe('angleConflicts — a miter, bevel or chamfer reaching into a joint (AI-angles spec §3)', () => {
  const at = (doc: FlatDocument, name: string) => doc.boards.findIndex((b) => b.name === name);
  const withPart = (doc: FlatDocument, name: string, cuts: (b: Board) => AngleCut[], patch: Partial<Board> = {}): FlatDocument =>
    ({ ...doc, boards: doc.boards.map((b) => (b.name === name ? { ...b, ...patch, angleCuts: cuts({ ...b, ...patch }) } : b)) });
  /** A chamfer on the edge where world faces (a) and (c) meet, equal legs. */
  const chamfer = (b: Board, a: [0 | 1 | 2, -1 | 1], c: [0 | 1 | 2, -1 | 1], legA: number, legC = legA): AngleCut => {
    const p = { dim: axisFrame(b)[a[0]]!.dim, from: endFacing(b, a[0], a[1]), leg: legA };
    const q = { dim: axisFrame(b)[c[0]]!.dim, from: endFacing(b, c[0], c[1]), leg: legC };
    const order = ['length', 'width', 'thickness'];
    const [f, g] = order.indexOf(p.dim) < order.indexOf(q.dim) ? [p, q] : [q, p];
    return { id: `c${a}${c}`, ...chamferCut({ face: f.dim, from: f.from, along: g.dim, alongFrom: g.from, legFace: f.leg, legAlong: g.leg }, b) };
  };
  const ends = (doc: FlatDocument) => angleConflicts(doc, findSites(doc));
  const railMiter = (side: -1 | 1) => (b: Board) => [{ id: 'm', ...miterCut({ end: endFacing(b, 0, side), across: 'thickness', longSide: endFacing(b, 2, -1), ratio: 1 }, b) }];

  it('none for the plain corner', () => {
    expect(ends(CORNER)).toEqual([]);
  });
  it('a rail mitered at the end that meets the leg conflicts; mitered at its free end does not', () => {
    expect(ends(withPart(CORNER, 'Rail X', railMiter(-1)))).toEqual([{ part: at(CORNER, 'Rail X'), other: at(CORNER, 'Leg'), kind: 'miter' }]);
    expect(ends(withPart(CORNER, 'Rail X', railMiter(1)))).toEqual([]);
  });
  it('a leg chamfered on its outside corner: fine with the apron set back, refused with it flush', () => {
    const corner = (b: Board) => [chamfer(b, [0, 1], [2, 1], 0.125)];
    expect(ends(withPart(CORNER, 'Leg', corner))).toEqual([]);   // Rail X spans z 0.5..1.25; the strip is z 1.625..1.75
    const flush = atZ(CORNER, 'Rail X', 1);                        // Rail X now spans z 1..1.75
    expect(ends(withPart(flush, 'Leg', corner))).toEqual([{ part: at(flush, 'Leg'), other: at(flush, 'Rail X'), kind: 'chamfer' }]);
  });
  it('touching the patch edge does not conflict; past it by more than TOUCH does', () => {
    // The leg's +X/-Z edge: its strip spans z 0..leg. Rail X's patch starts at z 0.5.
    expect(ends(withPart(CORNER, 'Leg', (b) => [chamfer(b, [0, 1], [2, -1], 0.5)]))).toEqual([]);
    expect(ends(withPart(CORNER, 'Leg', (b) => [chamfer(b, [0, 1], [2, -1], 0.5 + 1 / 16)]))).toHaveLength(1);
  });
  it('the tenon-clearance exception: a 1/8in chamfer along a tenoned rail passes, 5/8in does not, the 1/2in shoulder exactly passes', () => {
    const rail = CORNER.boards[at(CORNER, 'Rail X')]!;
    expect(axisDimensions(rail)[0]).toBe('length');
    // Rail X: 3 wide on Y, 3/4 thick on Z — tenon cheek 1/4, shoulder 1/2. Its bottom (-Y) / back (-Z) edge.
    const bottom = (w: number, t: number) => (b: Board) => [chamfer(b, [1, -1], [2, -1], w, t)];
    expect(ends(withPart(CORNER, 'Rail X', bottom(0.125, 0.125)))).toEqual([]);
    expect(ends(withPart(CORNER, 'Rail X', bottom(0.625, 0.625)))).toHaveLength(1);
    expect(ends(withPart(CORNER, 'Rail X', bottom(0.5, 0.625)))).toEqual([]);   // width leg = shoulder: touching
  });
  it('a cut that removes nothing never conflicts (Review Focus 3)', () => {
    expect(ends(withPart(CORNER, 'Rail X', (b) => [{ ...railMiter(-1)(b)[0]!, points: [[0, -1], [1, -2]] }]))).toEqual([]);
  });
  it('a turned rail conflicts exactly where the same world rail does (Review Focus 2)', () => {
    const turned = withPart(CORNER, 'Rail X', railMiter(-1), { rotation: 180 });
    expect(axisFrame(turned.boards[at(turned, 'Rail X')]!)[0]!.reversed).toBe(true);
    expect(ends(turned)).toHaveLength(1);
    expect(ends(withPart(CORNER, 'Rail X', railMiter(1), { rotation: 180 }))).toEqual([]);
  });
  it('a mitered corner pair is no site and no overlap (spec §3)', () => {
    const pair = design(
      { name: 'A', at: [0, 0, 0], size: [18, 1.5, 0.75] },
      { name: 'B', at: [0, 0, 0], size: [0.75, 1.5, 18] },
    );
    const m = (axisLen: 0 | 2, axisAcross: 0 | 2) => (b: Board) =>
      [{ id: 'm', ...miterCut({ end: endFacing(b, axisLen, -1), across: axisFrame(b)[axisAcross]!.dim as 'width' | 'thickness', longSide: endFacing(b, axisAcross, -1), ratio: 1 }, b) }];
    const mitered = withPart(withPart(pair, 'A', m(0, 2)), 'B', m(2, 0));
    expect(findSites(mitered)).toEqual([]);
    expect(checkDesign(mitered, { width: null, depth: null, height: null, maxParts: 10 }).filter((v) => v.kind === 'overlap')).toEqual([]);
  });
});
```

and add, beside `atY` near the top of the file:

```ts
const atZ = (doc: FlatDocument, name: string, z: number): FlatDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.name === name ? { ...b, position: [b.position[0], b.position[1], z] as Board['position'] } : b)) });
```

REPLACE the test `'the decider: angled kinds first, then tapers, else null'` with:

```ts
  it('the decider: one sentence per part, a taper conflict wins on its part, else null', () => {
    expect(joineryRefusal(CORNER)).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(22)))).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(24)))).toContain('taper runs into its joint');
    const mitered: FlatDocument = { ...CORNER, boards: CORNER.boards.map((b) => (b.name === 'Rail X'
      ? { ...b, angleCuts: [{ id: 'm', ...miterCut({ end: endFacing(b, 0, -1), across: 'thickness', longSide: endFacing(b, 2, -1), ratio: 1 }, b) }] } : b)) };
    expect(joineryRefusal(mitered)).toBe("Rail X's miter runs into its joint with Leg — add joinery before cutting it, or remove it.");
    // A miter elsewhere on the part is fine.
    expect(joineryRefusal(withLeg(CORNER, (b) => [{ ...face(b, 2, -1, 24), kind: 'miter', points: [[0, -1], [1, -2]] }]))).toBeNull();
    // Both a taper (on the leg) and a miter (on the rail): two sentences, in part order.
    const both: FlatDocument = { ...mitered, boards: mitered.boards.map((b) => (b.name === 'Leg' ? { ...b, angleCuts: inside(24)(b) } : b)) };
    const text = joineryRefusal(both)!;
    expect(text.indexOf("Leg's taper")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Rail X's miter")).toBeGreaterThan(text.indexOf("Leg's taper"));
  });
```

In `src/document/angledRefusal.test.ts`, REPLACE the `describe('angledRefusal — tapers are joinable …')` block's two
joinery tests (`'joinery ignores tapers'`, `'joinery still refuses any other kind, naming the parts'`) by deleting them
(the joinery branch no longer exists; its replacement is tested above), and change any `angledRefusal(…, 'joinery')`
call in the file's first `describe` to assert nothing — delete those lines. Keep the `'refine'` tests unchanged.

In `src/generate/run.test.ts`, REPLACE `angledDoc` and its test with:

```ts
const angledDoc = (): SloydDocument => {
  const made = designToDocument({ name: 'T', parts: [
    { name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
    { name: 'Rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 } },
  ] } as never, { centre: false }).doc;
  return { ...made, boards: made.boards.map((b) => (b.name === 'Rail' && !('shape' in b)
    ? { ...b, angleCuts: [{ id: 'm', ...miterCut({ end: endFacing(b, 0, -1), across: 'thickness', longSide: endFacing(b, 2, -1), ratio: 1 }, b) }] } : b)) };
};

describe('runJoinery — a miter running into a joint (AI-angles spec §3)', () => {
  it('refuses before any call, names the part, and leaves the document alone', async () => {
    const { client } = fakeClient([GOOD]);
    const doc = angledDoc();
    const before = JSON.stringify(doc);
    const out = await runJoinery(client, doc, new AbortController().signal, () => {});
    expect('refused' in out && out.refused).toContain("Rail's miter runs into its joint with Leg");
    expect(client.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(doc)).toBe(before);
  });
});
```

(Add `designToDocument`, `miterCut`, `endFacing` to run.test.ts's imports if absent. If `out.refused` is an object rather
than a string in this file's `runJoinery` result type, assert on its `message` field instead — read the type first.)

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/generate/joints/tapers.test.ts src/document/angledRefusal.test.ts src/generate/run.test.ts`
Expected: FAIL — `angleConflicts` is not exported; the decider still returns the "doesn't handle mitered" text.

- [ ] **Step 3: Implement**

In `src/document/angledRefusal.ts`:

```ts
/**
 * Why Refine will not run on this document, or null (angle-cuts spec §6; AI-tapers spec §4.3). Refine's checks and
 * joints are box-based (invariants 38, 41): it accepts tapers it can describe exactly and refuses every other kind
 * (AI-angles chunk 2 lifts that). Joinery no longer reads this: its refusal is `jointRefusal` (AI-angles spec §3).
 */
export function angledRefusal(doc: SloydDocument, _action: 'refine'): string | null {
  const names = angledParts(doc, ['taper']);
  if (names.length === 0) return null;
  return `Refine doesn't handle mitered, beveled or chamfered parts yet (${shown(names)}). Refine before cutting those angles, or remove them.`;
}

/** One miter, bevel or chamfer reaching into a joint (AI-angles spec §3). Indices are flat-document board indices. */
export interface AngleConflict {
  part: number;
  other: number;
  kind: 'miter' | 'bevel' | 'chamfer';
}

/**
 * THE person-facing joint refusal (AI-angles spec §3): one sentence per part, in part order — a taper conflict's sentence
 * (`taperJointRefusal`, unchanged) when the part has one, else its angle conflict's. Null when there is neither.
 */
export function jointRefusal(flat: FlatDocument, tapers: readonly TaperConflict[], angles: readonly AngleConflict[]): string | null {
  const text = new Map<number, string>();
  for (const c of tapers) text.set(c.part, taperJointRefusal(flat, [c])!);
  for (const c of angles) {
    if (text.has(c.part)) continue;
    text.set(c.part, `${flat.boards[c.part]!.name}'s ${c.kind} runs into its joint with ${flat.boards[c.other]!.name} — add joinery before cutting it, or remove it.`);
  }
  if (text.size === 0) return null;
  return [...text.keys()].sort((a, b) => a - b).map((p) => text.get(p)!).join(' ');
}
```

Callers of `angledRefusal(doc, 'refine')` (`refine.ts:54`, `refineDesign.ts:69`) are unchanged.

In `src/document/document.ts`, add `jointRefusal` and the type `AngleConflict` to the `./angledRefusal` re-exports
(find the line exporting `taperJointRefusal`/`TaperConflict`).

In `src/generate/joints/tapers.ts`:

```ts
import type { AngleConflict, FlatDocument, Region, SloydDocument, TaperConflict } from '../../document/document';
import { flatDocument, jointRefusal } from '../../document/document';
import { taperFields, throughOf, touchedRegion } from '../../document/angleCuts';
import { axisDimensions, endFacing, spanFromWorldOffset } from '../../document/geometry';
import { TOUCH, taperJointViolations, worldBox } from '../../document/designCheck';
import type { Violation } from '../../document/designCheck';
import type { AngleCut, Board } from '../../document/types';
import { boxOf } from './pocket';
import { tenonSection } from './recipes';
// (findSites / Site imports unchanged)

/**
 * Spec §3's tenon-clearance exception: a cut running straight through the entering part's joined end (its `through` is
 * the part's dimension along the site's axis) whose touched box's cross-section is disjoint from the tenon's — thickness
 * [cheek, thickness − cheek] × width [shoulder, width − shoulder] — touching allowed (cheek is computed: float noise only,
 * invariant 22). The tenon is the narrowest joint joinery can choose at that site, so every joint kind stays whole.
 */
function clearsTenon(b: Board, c: AngleCut, t: Region, axis: number): boolean {
  if (throughOf(c) !== axisDimensions(b)[axis]) return false;
  const { cheek, shoulder } = tenonSection(b.thickness, b.width);
  const section = { thickness: [cheek, b.thickness - cheek], width: [shoulder, b.width - shoulder] } as const;
  return (['width', 'thickness'] as const).some((d) => t[d][1] <= section[d][0] + 1e-9 || t[d][0] >= section[d][1] - 1e-9);
}

/**
 * The angle-at-joint rule for miters, bevels and chamfers (AI-angles spec §3): a cut conflicts with a site when its
 * touched box (in world space through `worldBox`) reaches the contact plane and overlaps the site's box-contact patch with
 * positive area (both in-plane spans above TOUCH, the box contacts' own tolerance). Tapers are `taperConflicts`' job and
 * skipped here; so is a cut on the ENTERING part of an end-into-face site that clears the tenon (`clearsTenon`). One
 * conflict per part (its first site in site order), sorted by part. Pure.
 */
export function angleConflicts(flat: FlatDocument, sites: readonly Site[]): AngleConflict[] {
  const found = new Map<number, AngleConflict>();
  for (const s of sites) {
    const e = boxOf(flat.boards[s.enter]!);
    const r = boxOf(flat.boards[s.receive]!);
    const plane = s.side === 1 ? e.max[s.axis]! : e.min[s.axis]!;
    const inPlane = [0, 1, 2].filter((k) => k !== s.axis);
    for (const part of [s.enter, s.receive]) {
      if (found.has(part)) continue;
      const b = flat.boards[part]!;
      for (const c of b.angleCuts) {
        if (c.kind === 'taper') continue;
        const t = touchedRegion(b, c);
        if (!t) continue;
        if (part === s.enter && s.kind === 'end-into-face' && clearsTenon(b, c, t, s.axis)) continue;
        const w = worldBox(b, t);
        const reaches = plane >= w.min[s.axis]! - 1e-9 && plane <= w.max[s.axis]! + 1e-9;
        const overlaps = inPlane.every((k) =>
          Math.min(e.max[k]!, r.max[k]!, w.max[k]!) - Math.max(e.min[k]!, r.min[k]!, w.min[k]!) > TOUCH);
        if (reaches && overlaps) {
          found.set(part, { part, other: part === s.enter ? s.receive : s.enter, kind: c.kind });
          break;
        }
      }
    }
  }
  return [...found.values()].sort((x, y) => x.part - y.part);
}

/**
 * THE joinery refusal (AI-tapers spec §4.2; AI-angles spec §3): every taper or other angle cut running into a joint, one
 * sentence per part, else null. `runJoinery`, the dialog and a joined Refine all call it, so they refuse in the same
 * words. Decided before any call or mutation.
 */
export function joineryRefusal(doc: SloydDocument, flat: FlatDocument = flatDocument(doc), sites: readonly Site[] = findSites(flat)): string | null {
  return jointRefusal(flat, taperConflicts(flat, sites), angleConflicts(flat, sites));
}
```

(`doc` stays in `joineryRefusal`'s signature for its callers even though only `flat` is read now; name it `_doc` only if
lint requires. Keep `taperConflicts` and `taperFaults` unchanged. Check `recipes.ts` does not import `tapers.ts` — if it
did, the import of `tenonSection` would be a cycle; it does not today.)

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/generate/joints/tapers.test.ts src/document/angledRefusal.test.ts src/generate/run.test.ts src/generate/refine.test.ts`
Expected: PASS. Then `npm run build` — PASS (no stale `'joinery'` caller).

- [ ] **Step 5: Mutate**

(a) Delete the `clearsTenon` line: the ⅛″ rail chamfer test must fail. (b) Change `> TOUCH` to `>= 0`: the
"touching the patch edge" test (leg exactly 0.5, overlap 0) must fail. (c) Temporarily add a case with the leg at
0.5 + 1/64 (overlap below TOUCH): it passes under `> TOUCH` and conflicts under `> 0` — confirm, then delete the case.
(d) Change `t[d][1] <= section[d][0] + 1e-9` to `<`: the "½in shoulder exactly passes" test must fail. Restore all; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/document/angledRefusal.ts src/document/angledRefusal.test.ts src/document/document.ts src/generate/joints/tapers.ts src/generate/joints/tapers.test.ts src/generate/run.test.ts
git commit -m "feat(joinery): a miter, bevel or chamfer reaching into a joint refuses, with the tenon-clearance exception (AI-angles §3)"
```

---

### Task 4: Repair is offered on any angled project

**Files:**
- Modify: `src/generate/joints/repair.ts:101` (drop the guard; drop `angledParts` from the import if now unused)
- Test: `src/generate/joints/repair.test.ts:247-275`

**Interfaces:**
- Consumes: nothing new. Produces: `repairDocument` offers on any angled document.

- [ ] **Step 1: Write the failing test**

In `src/generate/joints/repair.test.ts`, replace `MITER` and `withAngle`'s parameter type, and REPLACE the test
`'offers nothing when any non-taper angle cut is present'` with:

```ts
const CHAMFER: AngleCut = { id: 'a1', kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', points: [[0, 0.125], [0.125, 0]] };
const withAngle = (doc: SloydDocument, cut: AngleCut): SloydDocument =>
  ({ ...doc, definitions: doc.definitions.map((d, i) => (i === 0 ? { ...d, boards: d.boards.map((b, j) => (j === 0 ? { ...b, angleCuts: [cut] } : b)) } : d)) });
```

```ts
  it('repairs a chamfered document as it would the plain one, keeping the chamfer (AI-angles spec §4)', () => {
    const fx = load(f1);
    const r0 = repairDocument(fx.damaged);
    if (r0 === null || 'refused' in r0) throw new Error('expected a repair');
    const input = withAngle(fx.damaged, CHAMFER);
    const r = repairDocument(input);
    if (r === null || 'refused' in r) throw new Error(`expected a repair, got ${JSON.stringify(r)}`);
    expect(r.dropped).toBe(r0.dropped);
    const angled = (d: SloydDocument) => flatDocument(d).boards.filter((b) => b.angleCuts.length > 0).map((b) => [b.name, b.angleCuts]);
    expect(angled(r.doc)).toEqual(angled(input));
    expect(angled(r.doc).length).toBeGreaterThan(0);
  });
```

(Import `AngleCut` from `../../document/document`. The taper test keeps using `TAPER`, whose type is compatible with
`AngleCut`.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/generate/joints/repair.test.ts`
Expected: FAIL — `expected a repair, got null`.

- [ ] **Step 3: Implement**

Delete `src/generate/joints/repair.ts:101` (`if (angledParts(doc, ['taper']).length > 0) return null; …`) and remove
`angledParts` from line 1's import if nothing else uses it.

- [ ] **Step 4: Run to see it pass**

Run: `npx vitest run src/generate/joints/repair.test.ts && npm run build`
Expected: PASS.

- [ ] **Step 5: Mutate**

Restore the guard with `['taper']` → the new test fails; remove it again. (One-line change; the RED in Step 2 is the
mutation.)

- [ ] **Step 6: Commit**

```bash
git add src/generate/joints/repair.ts src/generate/joints/repair.test.ts
git commit -m "feat(repair): Repair joints is offered on mitered, beveled and chamfered projects (AI-angles §4)"
```

---

### Task 5: Joinery keeps angle cuts where they are on the wood (fu 307)

**Files:**
- Modify: `src/generate/joints/recipes.ts` (`resize`, ~line 38; new exported `rebaseAngleCuts` after `rebaseCuts`)
- Test: `src/generate/joints/tapers.test.ts` (new `describe`)

**Interfaces:**
- Consumes: `applyJoints`, `findSites`, `defaultChoice` (existing).
- Produces: `export function rebaseAngleCuts(b: Board, d: Dimension, end: CutFrom, amount: number): void` (recipes.ts).

- [ ] **Step 1: Write the failing tests**

Append to `src/generate/joints/tapers.test.ts` (import `rebaseAngleCuts` from `./recipes`, `depthAt, zeroStation,
taperCut, linkByRole`-free — only what is used; `toWorldOffset` from `../../document/geometry`):

```ts
describe('joinery keeps angle cuts where they are on the wood (AI-angles spec §4, fu 307)', () => {
  /** World coordinate, along the cut's `along` axis, of station `s` measured from `alongFrom`. */
  const worldAt = (b: Board, c: AngleCut, s: number) => {
    const ax = axisDimensions(b).indexOf(c.along);
    const u = c.alongFrom === 'min' ? s : b[c.along] - s;   // cut-local station → part-local coordinate (not a world crossing)
    return b.position[ax]! + toWorldOffset(b, ax, u);
  };
  const tenonAll = (doc: FlatDocument) => {
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.map((s) => (doc.boards[s.enter]!.name.startsWith('Rail')
      ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.75 } : defaultChoice(s, doc, sites))));
  };
  const railName = 'Rail X';
  const withRail = (doc: FlatDocument, cuts: (b: Board) => AngleCut[]): FlatDocument =>
    ({ ...doc, boards: doc.boards.map((b) => (b.name === railName ? { ...b, angleCuts: cuts(b) } : b)) });
  // A taper thin at Rail X's FREE end (+X), square from 10in in, stored deep-end-last: measured from the JOINT end.
  const deepEndLast = (b: Board): AngleCut => {
    const joint = endFacing(b, 0, -1);
    return { id: 'd', kind: 'taper', face: axisFrame(b)[2]!.dim, from: endFacing(b, 2, 1), along: 'length', alongFrom: joint,
      points: [[b.length - 10, 0], [b.length, 0.25]] };
  };

  it('a deep-end-last taper on a tenoned rail stays put in world space (fu 307: RED before the fix)', () => {
    const doc = withRail(CORNER, (b) => [deepEndLast(b)]);
    const before = doc.boards.find((b) => b.name === railName)!;
    const joined = tenonAll(doc);
    const after = joined.doc.boards.find((b) => b.name === railName)!;
    expect(after.length).toBe(before.length + 0.75);                       // the tenon grew it at the joint end
    const c0 = before.angleCuts[0]!;
    const c1 = after.angleCuts[0]!;
    expect(worldAt(after, c1, zeroStation(c1))).toBeCloseTo(worldAt(before, c0, zeroStation(c0)), 12);
    expect(depthAt(c1, after.length)).toBeCloseTo(depthAt(c0, before.length), 12);
  });
  it('a canonical taper anchored at the free end is byte for byte unchanged', () => {
    const doc = withRail(CORNER, (b) => [{ id: 't', ...taperCut({ face: axisFrame(b)[2]!.dim as 'thickness', from: endFacing(b, 2, 1), end: endFacing(b, 0, 1), start: 10, amount: 0.25 }) }]);
    const before = doc.boards.find((b) => b.name === railName)!.angleCuts;
    expect(tenonAll(doc).doc.boards.find((b) => b.name === railName)!.angleCuts).toEqual(before);
  });
  it('a trim (negative amount) shifts stations and depths measured from the moving end back by the same amount', () => {
    const b = { ...CORNER.boards.find((x) => x.name === railName)! };
    b.angleCuts = [
      { id: 's', kind: 'chamfer', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[16, 0], [18, 0.25]] },
      { id: 'q', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0], [3, 3]] },
      { id: 'n', kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', points: [[0, 0.125], [0.125, 0]] },
    ];
    rebaseAngleCuts(b, 'length', 'min', -0.5);
    expect(b.angleCuts.map((c) => c.points)).toEqual([[[15.5, 0], [17.5, 0.25]], [[0, -0.5], [3, 2.5]], [[0, 0.125], [0.125, 0]]]);
  });
  it('two linked rails rebased by joinery are still one component, chamfer in place (Review Focus 5)', () => {
    const made = designToDocument({ name: 'F', parts: [
      { name: 'Leg A', role: 'leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, tapers: [] },
      { name: 'Rail 1', role: 'rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 }, tapers: [] },
      { name: 'Rail 2', role: 'rail', material: 'oak', at: { x: 1.75, y: 10, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 }, tapers: [] },
    ], assemblies: [] } as never, { centre: false }).doc;
    const railShape = (d: SloydDocument) => new Set(d.boards.filter((b) => b.name.startsWith('Rail')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(railShape(made).size).toBe(1);
    const shapeId = [...railShape(made)][0]!;
    expect(shapeId).toBeDefined();
    // A chamfer at the rails' free +X end, stored deep-end-last (measured from the tenoned -X end), written on the Shape.
    // An angle cut's line runs on past the part, so such a cut always reaches the far end: the rails are joined only at
    // -X (Leg A), or the far joint would rightly refuse it.
    const flat0 = flatDocument(made);
    const r0 = flat0.boards.find((b) => b.name === 'Rail 1')!;
    const cut: AngleCut = { id: 'k', kind: 'chamfer', face: axisFrame(r0)[1]!.dim, from: endFacing(r0, 1, -1), along: 'length', alongFrom: endFacing(r0, 0, -1),
      points: [[r0.length - 2, 0], [r0.length, 0.25]] };
    const doc: SloydDocument = { ...made, shapes: made.shapes.map((s) => (s.id === shapeId ? { ...s, angleCuts: [cut] } : s)) };
    const flat = flatDocument(doc);
    const joined = tenonAll(flat);
    const tree = migrateDocument(writeBackFlat(doc, flat.boards, worldParts(joined.doc)));
    expect(railShape(tree).size).toBe(1);
    expect([...railShape(tree)][0]).toBeDefined();
    for (const name of ['Rail 1', 'Rail 2']) {
      const b0 = flat.boards.find((b) => b.name === name)!;
      const b1 = flatDocument(tree).boards.find((b) => b.name === name)!;
      expect(worldAt(b1, b1.angleCuts[0]!, zeroStation(b1.angleCuts[0]!))).toBeCloseTo(worldAt(b0, b0.angleCuts[0]!, zeroStation(b0.angleCuts[0]!)), 12);
    }
  });
});
```

(Import `designToDocument` — already imported — `SloydDocument`, `depthAt`, `zeroStation` from `../../document/document`,
`rebaseAngleCuts` from `./recipes`, `toWorldOffset` from `../../document/geometry`. If `designToDocument`'s part type
requires fields this fixture omits, add them as `[]`; if `linkByRole` does not link the rails, read why — e.g. a `role`
key spelled differently — and fix the FIXTURE, not the assertion.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run src/generate/joints/tapers.test.ts -t "on the wood"`
Expected: FAIL — `rebaseAngleCuts` not exported; the fu 307 test's zero station is off by 0.75.

- [ ] **Step 3: Implement**

In `src/generate/joints/recipes.ts`, import `CutFrom` as a type from `../../document/document`, add after `rebaseCuts`:

```ts
/**
 * AI-angles spec §4 (fu 307): `b` grew (or, negative, was trimmed) by `amount` at `end` of dimension `d`, so every
 * angle-cut number MEASURED FROM that end — a station when `along` is `d`, a depth when `face` is `d` — shifts by
 * `amount`, and the cut's wood stays exactly where it was. One addition per number, no trigonometry; a cut measured
 * from the other end, or across another dimension, is the same object. A cut that reached the moving end was refused
 * before any mutation (`joineryRefusal`).
 */
export function rebaseAngleCuts(b: Board, d: Dimension, end: CutFrom, amount: number): void {
  b.angleCuts = b.angleCuts.map((c) => {
    const s = c.along === d && c.alongFrom === end ? amount : 0;
    const q = c.face === d && c.from === end ? amount : 0;
    if (s === 0 && q === 0) return c;
    return { ...c, points: [[c.points[0][0] + s, c.points[0][1] + q], [c.points[1][0] + s, c.points[1][1] + q]] };
  });
}
```

and in `resize`, after `rebaseCuts(b, d, endFacing(b, k, side), amount, was);`:

```ts
  rebaseAngleCuts(b, d, endFacing(b, k, side), amount);
```

- [ ] **Step 4: Run to see them pass**

Run: `npx vitest run src/generate/joints/ && npm run build`
Expected: PASS — including every existing taper, Shaker-table and `runJoinery` test.

- [ ] **Step 5: Mutate**

Swap `c.alongFrom === end` for `c.alongFrom !== end`: the fu 307 test and the canonical-taper test must both fail.
Restore; PASS.

- [ ] **Step 6: Commit**

```bash
git add src/generate/joints/recipes.ts src/generate/joints/tapers.test.ts
git commit -m "fix(joinery): angle cuts measured from a moving end keep their wood when joinery grows or trims a part (AI-angles §4; fu 307)"
```

---

### Task 6: Records, live check, the full gate

**Files:**
- Modify: `CLAUDE.md` (invariants 38, 41, 48; Where-things-live for `angleCuts.ts`, `angledRefusal.ts`, `designCheck.ts`,
  `generate/joints/tapers.ts`; Status bullet; Rounds row; test count; follow-ups range)
- Modify: `docs/follow-ups.md` (fu 307 closed; fu 276/277 entries updated; new residue entries from the ledger)
- Modify: `docs/history.md` (the round's narrative under "What each round did")
- Modify: `docs/superpowers/specs/2026-10-13-sloyd-ai-angles-design.md` (status: chunk 1 implemented)
- Create: `docs/browser-verification-ai-angles.md`

- [ ] **Step 1: The full gate**

Run: `npm run build > /tmp/b.log 2>&1; echo build=$?; npx vitest run > /tmp/t.log 2>&1; echo test=$?; tail -5 /tmp/t.log`
(use the scratchpad, not /tmp, when executing). Expected: `build=0`, `test=0`, and the new test count.

- [ ] **Step 2: Live check on the dev server (free; no key, no paid call)**

Start `npm run dev -- --port 5233` (find a free port with `ps -eo pid,args | grep "[v]ite --port"`; never `pkill -f`).
The dev profile is the user's: create ONLY check projects, delete ONLY those afterwards, never `localStorage.clear()`.
Import two projects through the project menu's Import (write the `.sloyd` JSON files to the scratchpad from
`designToDocument` output plus angle cuts, or build them in the UI): (a) the CORNER table with Rail X mitered at the leg;
(b) the same with Rail X chamfered ⅛″ along its bottom edge instead. For each, open Claude ▾ → Add joinery and read the
dialog: (a) shows "Rail X's miter runs into its joint with Leg — add joinery before cutting it, or remove it."; (b) shows
no refusal. Record both readouts (DOM text) in `docs/browser-verification-ai-angles.md`, then delete both check
projects and confirm the user's project keys read back unchanged (count and names, never values; `sloyd.llm.v1` presence
only).

- [ ] **Step 3: Records**

- CLAUDE.md invariant 38: "Held/hangs contacts, grounding's `connected` and the tip footprint read `contactSolids` when a
  part is ANGLED (a taper's flat wood as before; every miter, bevel and chamfer splits it around its touched box —
  `touchedRegion`/`splitRegion` — so a sloped face is never a contact)"; replace "Joinery refuses every non-taper angle
  cut (and a taper running into a joint)" with "Joinery refuses any angle cut running into a joint (`joineryRefusal`)".
- Invariant 41: add "and, for every other kind, a cut whose touched box overlaps the patch with positive area
  (`angleConflicts`), except a cut running straight through an entering part's joined end that clears the tenon's
  section (`clearsTenon`). `resize` re-anchors angle cuts measured from the moving end (`rebaseAngleCuts`, fu 307)."
- Invariant 48: "Joinery and Repair accept every kind (refusing only at a joint); Refine still refuses every kind but
  `taper`"; "`contactSolids` is the second, narrower reader of angle cuts: box-valued, never over-claiming wood."
- Where-things-live: `angleCuts.ts` + "touchedRegion (the box a cut can remove), splitRegion"; `angledRefusal.ts` +
  "AngleConflict / jointRefusal (THE joint-refusal message)"; `designCheck.ts`: "contactRegions/contactSolids / isAngled";
  `tapers.ts`: "angleConflicts (+ the tenon-clearance exception)"; recipes "rebaseAngleCuts".
- Status: chunk 1 merged (not deployed until the user says so); Rounds row "AI angles (chunk 1)".
- `docs/follow-ups.md`: 307 → closed (date, commit); 276/277 → "chunk 1 of the AI-angles spec shipped …; Generate/Refine
  are chunk 2"; new entries for every deferred minor and residue the ledger holds.
- Spec status line: "chunk 1 implemented <date> (<merge>)".

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: AI angles chunk 1 — records, live check, fu 307 closed"
```
