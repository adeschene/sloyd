# Held and Stable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `checkDesign` reports a part that is not *held* (`hangs`) and a piece that would *tip* (`tips`), and the model is told both rules up front.

**Architecture:**
- Both checks live in `src/document/designCheck.ts`.
- They are built on one new helper that lists each box's face contacts (face, area, other part).
- `hangs` runs per part. `tips` runs over the whole piece, using the existing grounding pass.
- `SYSTEM_PROMPT` gains two fixed rule lines.
- Nothing outside `designCheck.ts`, `prompt.ts` and their tests changes.

**Tech Stack:** TypeScript 7, Vitest 4. `?raw` imports come from `vite/client`, which is already in `tsconfig.app.json` types.

**Spec:** `docs/superpowers/specs/2026-10-03-sloyd-held-and-stable-design.md`. Read it before
starting any task. Where this plan and the spec disagree, the two **Deviations** below are the
only intended ones; anything else is a plan error to escalate.

## Deviations from the spec (for approval with the plan)

1. **`tips` weighs only GROUNDED parts** (those connected to the floor, the existing
   `grounded` set), not every part. The spec skips `tips` only when nothing is on the floor.
   But a floating part already gets `unsupported`, and counting its mass as well gives one
   fault two messages: the spec's own one-fault-one-report rule (§3, Exclusion). It also
   breaks an existing test that would otherwise start reporting `tips`: *'orders by kind,
   then by part order, stably'*, where `Float` hovers over a 10 × 1/16 strip.
2. **A part named in an `overlap` violation gets no `hangs` either.** The spec reports both.
   But for a shelf sunk 1/16in into a rail, "passes into" plus "not held: nothing under it,
   0%" is one fault in two contradictory messages. Moving it out of the rail is also what
   makes it rest. Contact and overlap are already disjoint **by definition**: coincident
   face planes mean a shared span of ≤ TOUCH on that axis, so the pair cannot overlap.
   - **What this deviation changes:** the spec's test *"overlap gets overlap AND hangs"*
     becomes *"overlap gets overlap only"*, and the existing test *'flags interpenetration
     just past TOUCH'* keeps its `toHaveLength(1)`.
   - **One spec mutation row is dropped:** "count an overlap as a contact" has no
     observable effect once overlapping parts are excluded. It is replaced by the
     exclusion's own mutation.

## Global Constraints

- `TOUCH = 1/32` (existing). Coverage threshold `0.5` (`>= 0.5` passes). Tip margin `m = min(1, s / 4)`, where `s` is the smaller side of the footprint's bounding box.
- Face contact: face planes coincide within `TOUCH` on one axis, and the shared span is `> TOUCH` on both other axes.
- Broad faces: the faces normal to the smallest extent. Every extent within `1e-9` of the smallest counts.
- `hangs` is never emitted for a part that is on the floor (`min.y <= TOUCH`), that is `unsupported`, or that is named in an `overlap` violation.
- `tips` is skipped when no part is on the floor. Its centre of mass and its footprint use **grounded** parts only (Deviation 1). The centre of mass is volume-weighted.
- Output order: `too-small`, `overlap`, `unsupported`, `too-large`, `too-many-parts` (as today), then `hangs` in board order, then `tips`.
- Messages use the verbatim templates in each task. `designCheck.ts` stays pure and does NOT import `../units`.
- `connected` and the `unsupported` rule are unchanged.
- No change to `src/llm/`, the schema, any UI, or invariants 36, 37 or 38.
- `npm test` does not typecheck: run `npm run build` before claiming a task compiles.
- No pull requests. Work on branch `held`, merge locally with `--no-ff` (Task 4, after the user agrees).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A rail between two legs, the commonest generated part.** Expected: held by (b), no new
   violation. Pinned by the real workbench in Task 1, where eight rails must stay clean.
2. **A face-mounted part with nothing under it** (a backrest or an apron screwed to a post's
   face). Expected: held by (c). Pinned in Task 1.
3. **A design that already passes today.** Expected: no new violations unless it really
   hangs or tips. Pinned by every existing `designCheck`, `run` and `useGenerations` test
   staying green unedited (Tasks 1 and 2).
4. **A narrow piece**, like a stool on 3in feet. Expected: the shrunk margin, not an
   impossible 1in. Pinned in Task 2.
5. **A floating part.** Expected: `unsupported` only, never also `hangs` or `tips`. Pinned in
   Tasks 1 and 2.

---

## File map

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/document/fixtures/simple-workbench.sloyd` | Create (copy) | the user's exported workbench, byte-for-byte |
| `src/document/designCheck.ts` | Modify | `contactsOf`, `hangs`, `tips` |
| `src/document/designCheck.test.ts` | Modify | the new tests |
| `src/generate/prompt.ts` (+ test) | Modify | two rule lines in `SYSTEM_PROMPT` |

### Task 0: Branch

- [ ] `git checkout -b held` from `master` (clean tree). Confirm `npx vitest run` shows 1134 passing.

---

### Task 1: Face contacts and `hangs`

**Files:**
- Create: `src/document/fixtures/simple-workbench.sloyd`
- Modify: `src/document/designCheck.ts`, `src/document/designCheck.test.ts`

**Interfaces:**
- Produces: `ViolationKind` gains `'hangs'` and `'tips'` (both now, so Task 2 adds no type change). It also produces the module-private `contactsOf(boxes): Contact[][]` and `coverage(...)`, which Task 2 does not need. Exported API: only the widened `ViolationKind`.

- [ ] **Step 1: Copy the fixture byte-for-byte.**

```bash
mkdir -p src/document/fixtures
cp /home/alec/claude-inbox/Simple-workbench.sloyd src/document/fixtures/simple-workbench.sloyd
cmp /home/alec/claude-inbox/Simple-workbench.sloyd src/document/fixtures/simple-workbench.sloyd && echo identical
```

- [ ] **Step 2: Write the failing tests.** Append to `src/document/designCheck.test.ts`, adding `migrateDocument` to the existing `./document` import and this import at the top:

```ts
import workbenchRaw from './fixtures/simple-workbench.sloyd?raw';
```

```ts
/** A box from its min and max corners, as a flat board (length X, thickness Y, width Z). */
const span = (name: string, min: [number, number, number], max: [number, number, number]): Board =>
  box(name, min, [max[0] - min[0], max[1] - min[1], max[2] - min[2]]);
const hangs = (doc: SloydDocument) => checkDesign(doc, NO_LIMITS).filter((v) => v.kind === 'hangs');

describe('hangs — the real workbench (fu 165)', () => {
  const workbench = () => migrateDocument(JSON.parse(workbenchRaw));

  it('flags ONLY the lower shelf, which hangs by its corners below the low rails', () => {
    const v = checkDesign(workbench(), NO_LIMITS);
    expect(v.map((x) => x.kind)).toEqual(['hangs']);
    expect(v[0].message.startsWith('Lower shelf is not held: nothing is under it')).toBe(true);
    expect(v[0].message).toContain('X sides are covered 19% and 19%');
    expect(v[0].message).toContain('(by Front left leg, Front right leg, Back left leg, Back right leg)');
    expect(v[0].message).toContain('each needs 50%');
  });

  it('passes once the shelf rests ON the low rails — the fix the message suggests', () => {
    const doc = workbench();
    const shelf = doc.boards.find((b) => b.name === 'Lower shelf')!;
    // Between the legs on X, over the front and back low rails on Z, on top of them on Y.
    const fixed = { ...shelf, width: 24, position: [-26.5, 9.5, -12] as [number, number, number] };
    expect(checkDesign({ ...doc, boards: doc.boards.map((b) => (b === shelf ? fixed : b)) }, NO_LIMITS)).toEqual([]);
  });
});

describe('hangs — the three ways to be held', () => {
  it('(a) resting: a top on four legs', () => {
    expect(hangs(docOf(
      span('Leg 1', [0, 0, 0], [2, 28, 2]), span('Leg 2', [18, 0, 0], [20, 28, 2]),
      span('Leg 3', [0, 0, 18], [2, 28, 20]), span('Leg 4', [18, 0, 18], [20, 28, 20]),
      span('Top', [0, 28, 0], [20, 29, 20]),
    ))).toEqual([]);
  });

  const between = (sideDepth: number) => docOf(
    span('Left side', [0, 0, 0], [0.75, 20, sideDepth]),
    span('Right side', [20.75, 0, 0], [21.5, 20, sideDepth]),
    span('Shelf', [0.75, 10, 0], [20.75, 10.75, 24]),
  );
  it('(b) between: a shelf whose ends are covered exactly 50% passes', () => {
    expect(hangs(between(12))).toEqual([]);
  });
  it('(b) between: 49% fails, and says so', () => {
    const v = hangs(between(11.76));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('X sides are covered 49% and 49% (by Left side, Right side)');
  });

  it('(c) lapped: a backrest screwed to the faces of two posts, nothing under it', () => {
    expect(hangs(docOf(
      span('Post A', [0, 0, 0], [2, 30, 3]),
      span('Post B', [20, 0, 0], [22, 30, 3]),
      span('Backrest', [0, 20, 3], [22, 26, 3.75]),
    ))).toEqual([]);
  });

  it('side table C: a shelf edge-on to one face of a spine hangs — one side is not "between"', () => {
    const v = hangs(docOf(
      span('Plinth', [-8, 0, -6], [8, 1.5, 6]),
      span('Spine', [-0.375, 1.5, -6], [0.375, 24.5, 6]),
      span('Top', [-15, 24.5, -8], [15, 26, 8]),
      span('Shelf', [0.375, 10, -6], [12, 10.75, 6]),
    ));
    expect(v.map((x) => x.message.split(' ')[0])).toEqual(['Shelf']);
    expect(v[0].message).toContain('X sides are covered 100% and 0% (by Spine)');
  });
});

describe('hangs — one fault, one report', () => {
  it('a floating part is unsupported, never also hangs', () => {
    expect(kinds(docOf(box('Base', [0, 0, 0], [10, 1, 10]), box('Float', [0, 5, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
  it('a part sunk into another is an overlap, never also hangs', () => {
    expect(kinds(docOf(
      span('Post', [0, 0, 0], [2, 30, 2]),
      span('Peg', [1, 10, 0.5], [6, 11, 1.5]),
    ))).toEqual(['overlap']);
  });
});
```

The existing test *'flags interpenetration just past TOUCH'* must stay unedited (Deviation 2). So must every other existing test in this file, `src/generate/run.test.ts` and `src/useGenerations.test.tsx`. If one fails, STOP and report rather than editing it.

- [ ] **Step 3: Run, expect FAIL.** `npx vitest run src/document/designCheck.test.ts`. The `hangs` cases fail. TS may also reject `'hangs'` before Step 4.

- [ ] **Step 4: Implement.** In `designCheck.ts`:

Widen the kind:

```ts
export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts' | 'hangs' | 'tips';
```

After `distance`, add:

```ts
/** Coverage a side face needs, on BOTH faces of a pair, to hold a part between two others (fu 165). */
export const HELD_COVERAGE = 0.5;

/** One face contact ON a box: which face (axis, side), who touches it, over what area. */
interface Contact { other: number; axis: number; side: -1 | 1; area: number }

/**
 * Face contacts per box: face planes coincide within TOUCH on one axis, and
 * the shared span is > TOUCH on BOTH others. Disjoint from overlap BY
 * DEFINITION — coincident planes mean a shared span <= TOUCH on that axis —
 * so an interpenetrating pair is never a contact here.
 */
function contactsOf(boxes: Box[]): Contact[][] {
  const out: Contact[][] = boxes.map(() => []);
  boxes.forEach((a, i) => {
    boxes.forEach((b, j) => {
      if (i === j) return;
      for (const axis of [0, 1, 2]) {
        const [p, q] = [0, 1, 2].filter((k) => k !== axis);
        const sp = shared(a, b, p);
        const sq = shared(a, b, q);
        if (sp <= TOUCH || sq <= TOUCH) continue;
        if (Math.abs(a.min[axis] - b.max[axis]) <= TOUCH) out[i].push({ other: j, axis, side: -1, area: sp * sq });
        else if (Math.abs(a.max[axis] - b.min[axis]) <= TOUCH) out[i].push({ other: j, axis, side: 1, area: sp * sq });
      }
    });
  });
  return out;
}

/** Fraction of one face of `b` covered by its contacts, capped at 1. */
function coverage(b: Box, cs: Contact[], axis: number, side: -1 | 1): number {
  const [p, q] = [0, 1, 2].filter((k) => k !== axis);
  const face = (b.max[p] - b.min[p]) * (b.max[q] - b.min[q]);
  const touched = cs.filter((c) => c.axis === axis && c.side === side).reduce((s, c) => s + c.area, 0);
  return Math.min(1, touched / face);
}

/**
 * HELD (fu 165, inv 39): (a) something under it, (b) both faces of the X or Z
 * pair covered >= HELD_COVERAGE, or (c) any contact on a broad face (normal to
 * its smallest extent; ties all count). (c) is what lets a backrest or an
 * apron screwed to a post's face pass — without it, ordinary face-mounted
 * parts fail and cost repair rounds for nothing. Coverage, not two-sidedness,
 * is what catches the workbench shelf: it touched legs on BOTH ends, 19% each.
 */
function hangsMessage(b: Box, cs: Contact[], boxes: Box[]): string | null {
  if (cs.some((c) => c.axis === 1 && c.side === -1)) return null;
  const pairs = [0, 2].map((axis) => ({ axis, lo: coverage(b, cs, axis, -1), hi: coverage(b, cs, axis, 1) }));
  if (pairs.some((p) => p.lo >= HELD_COVERAGE && p.hi >= HELD_COVERAGE)) return null;
  const ext = [0, 1, 2].map((k) => b.max[k] - b.min[k]);
  const thin = Math.min(...ext);
  if (cs.some((c) => ext[c.axis] - thin <= 1e-9)) return null;

  // The pair closest to passing: larger smaller-coverage; a tie keeps X.
  const best = Math.min(pairs[1].lo, pairs[1].hi) > Math.min(pairs[0].lo, pairs[0].hi) ? pairs[1] : pairs[0];
  const who = [...new Set(cs.filter((c) => c.axis === best.axis).map((c) => c.other))].sort((x, y) => x - y);
  const by = who.length ? ` (by ${who.map((k) => boxes[k].name).join(', ')})` : '';
  const pct = (v: number) => Math.round(100 * v);
  return `${b.name} is not held: nothing is under it, and its ${AXES[best.axis]} sides are covered ${pct(best.lo)}% and ${pct(best.hi)}%${by}; each needs ${pct(HELD_COVERAGE)}%. Rest it on a part below, fit it between two parts that cover its sides, or fasten its broad face to another part.`;
}
```

In `checkDesign`, record overlap participants inside the existing overlap loop:

```ts
  const overlapping = new Set<number>();
  // ...inside the existing `if (s.every((v) => v > TOUCH))` block, beside out.push:
        overlapping.add(i);
        overlapping.add(j);
```

Then **after** the `too-many-parts` block and before `return out;`:

```ts
  // Held (fu 165). One fault, one report: a part on the floor, already
  // unsupported, or named in an overlap is never also reported as hanging.
  const contacts = contactsOf(boxes);
  boxes.forEach((b, i) => {
    if (b.min[1] <= TOUCH || !grounded.has(i) || overlapping.has(i)) return;
    const message = hangsMessage(b, contacts[i], boxes);
    if (message) out.push({ kind: 'hangs', message });
  });
```

Update the module doc comment's first paragraph with one line: "`hangs` (fu 165): every part off the floor must be held: resting, between, or lapped (inv 39)."

- [ ] **Step 5: Run, expect PASS.** Run `npx vitest run` (the whole suite: the existing `run` and `useGenerations` tests call `checkDesign` too), then `npm run build`.

- [ ] **Step 6: Mutate.** Each mutation turns the named test red. Revert each and record it in the report.
  - `HELD_COVERAGE = 0` turns *'flags ONLY the lower shelf'* red.
  - `pairs.some((p) => p.lo >= HELD_COVERAGE || p.hi >= HELD_COVERAGE)`, so one side satisfies (b), turns *'side table C'* red.
  - Deleting the (c) line turns *'(c) lapped'* red.
  - Deleting `|| overlapping.has(i)` turns *'a part sunk into another'* red.
  - Deleting `|| !grounded.has(i)` turns *'a floating part is unsupported'* red.
  - `p.lo > HELD_COVERAGE` (strict) turns *'exactly 50% passes'* red.

- [ ] **Step 7: Commit.** `git add src/document && git commit -m "feat(document): hangs — every part off the floor must be held (fu 165)"`, plus the trailer.

---

### Task 2: `tips`

**Files:**
- Modify: `src/document/designCheck.ts`, `src/document/designCheck.test.ts`

**Interfaces:**
- Consumes: Task 1's widened `ViolationKind`, and the existing `grounded` set and `inches()`.
- Produces: `TIP_MARGIN = 1` (exported). Nothing else is exported.

- [ ] **Step 1: Write the failing tests.** Append:

```ts
const tips = (doc: SloydDocument) => checkDesign(doc, NO_LIMITS).filter((v) => v.kind === 'tips');
/** A 10x1x10 base on the floor with a 10in-deep, 1in-thick beam of length L resting on it from x = 0. */
const cantilever = (L: number) => docOf(span('Base', [0, 0, 0], [10, 1, 10]), span('Beam', [0, 1, 0], [L, 2, 10]));

describe('tips (fu 165)', () => {
  it('passes a centre of mass more than the margin inside (L = 21.6 puts it at x ≈ 8.965)', () => {
    expect(tips(cantilever(21.6))).toEqual([]);
  });
  it('flags one less than the margin inside (L = 21.8 puts it at x ≈ 9.045), naming the direction', () => {
    const v = tips(cantilever(21.8));
    expect(v).toHaveLength(1);
    expect(v[0].message.startsWith('The piece would tip toward +X: its centre of mass is 0.955in inside the edge')).toBe(true);
    expect(v[0].message).toContain('keep it at least 1in inside');
  });
  it('says "beyond" when the centre of mass is outside the footprint', () => {
    // Centre at x = (100·5 + 300·15) / 400 = 12.5; the footprint's +X edge is at 10.
    expect(tips(cantilever(30))[0].message).toContain('its centre of mass is 2.5in beyond the edge');
  });

  it('a 3in footprint uses a 0.75in margin, not an impossible 1in', () => {
    const doc = docOf(span('Foot', [0, 0, 0], [3, 1, 3]), span('Arm', [0, 1, 0], [4.9, 2, 3]));
    expect(tips(doc)).toEqual([]); // centre at x ≈ 2.089: 0.911 inside, under 1 but over 0.75
  });

  it('weighs by VOLUME: a light arm far out does not tip a heavy base', () => {
    expect(tips(docOf(span('Base', [0, 0, 0], [10, 1, 10]), span('Arm', [0, 1, 4.5], [30, 1.25, 5.5])))).toEqual([]);
  });

  it('side table C: a heavy top offset past the plinth tips; centred, it does not', () => {
    const table = (topMinX: number) => docOf(
      span('Plinth', [-8, 0, -6], [8, 1.5, 6]),
      span('Spine', [-0.375, 1.5, -6], [0.375, 24.5, 6]),
      span('Top', [topMinX, 24.5, -8], [topMinX + 30, 26, 8]),
    );
    expect(tips(table(-15))).toEqual([]);
    expect(tips(table(0))[0].message).toContain('would tip toward +X');
  });

  it('no part on the floor: no tips (everything is already unsupported)', () => {
    expect(kinds(docOf(box('A', [0, 5, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
  it('a floating part adds no weight (Deviation 1): unsupported only', () => {
    expect(kinds(docOf(box('Base', [0, 0, 0], [2, 1, 2]), box('Far', [40, 5, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
});
```

The expected values are worked by hand. The base contributes 100in³ at x = 5, and the beam 10·L in³ at x = L/2.
- **L = 21.6:** the centre is at 2832.8 / 316 ≈ 8.965, so d ≈ 1.035, which passes.
- **L = 21.8:** the centre is at 2876.2 / 318 ≈ 9.0447, so d ≈ 0.9553. That prints `0.955in` (the module's `inches()` is `toFixed(3)` with trailing zeros dropped) and fails.

If an implementation prints something else, the implementation is wrong, not the number. Report it rather than editing the expectation.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** Add after `HELD_COVERAGE`:

```ts
/** Inches the centre of mass must sit inside the floor footprint; shrinks to s/4 for a footprint under 4in across (fu 165). */
export const TIP_MARGIN = 1;

type P2 = [number, number];
/** Andrew's monotone chain, counter-clockwise in (x, z); collinear points dropped. */
function hull(points: P2[]): P2[] {
  const ps = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: P2[]) => {
    const h: P2[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(ps), ...half([...ps].reverse())];
}

/**
 * STABLE (fu 165): the volume-weighted centre of mass of the GROUNDED parts
 * must sit at least min(TIP_MARGIN, s/4) inside the convex hull of the
 * on-the-floor parts' plan corners. Floating parts are left out — they are
 * already `unsupported`, and one fault gets one report.
 */
function tipsMessage(boxes: Box[], grounded: Set<number>): string | null {
  const floor = boxes.filter((b) => b.min[1] <= TOUCH);
  if (floor.length === 0) return null;
  let vol = 0, cx = 0, cz = 0;
  for (const i of grounded) {
    const b = boxes[i];
    const v = (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);
    vol += v;
    cx += v * (b.min[0] + b.max[0]) / 2;
    cz += v * (b.min[2] + b.max[2]) / 2;
  }
  const c: P2 = [cx / vol, cz / vol];
  const h = hull(floor.flatMap((b): P2[] => [
    [b.min[0], b.min[2]], [b.max[0], b.min[2]], [b.max[0], b.max[2]], [b.min[0], b.max[2]],
  ]));
  if (h.length < 3) {
    return 'The piece would tip: its centre of mass is not over a usable footprint. Widen the base or move weight inward.';
  }
  const xs = h.map((p) => p[0]);
  const zs = h.map((p) => p[1]);
  const s = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const m = Math.min(TIP_MARGIN, s / 4);
  let d = Infinity;
  let normal: P2 = [1, 0];
  h.forEach((a, k) => {
    const b = h[(k + 1) % h.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    const dist = (ex * (c[1] - a[1]) - ez * (c[0] - a[0])) / len; // + inside (CCW: interior on the left)
    if (dist < d) { d = dist; normal = [ez / len, -ex / len]; }   // outward = right of the edge
  });
  if (d >= m) return null;
  const dir = Math.abs(normal[0]) >= Math.abs(normal[1])
    ? `${normal[0] >= 0 ? '+' : '-'}X`
    : `${normal[1] >= 0 ? '+' : '-'}Z`;
  return `The piece would tip toward ${dir}: its centre of mass is ${inches(Math.abs(d))} ${d >= 0 ? 'inside' : 'beyond'} the edge of what touches the floor; keep it at least ${inches(m)} inside. Widen the base or move weight inward.`;
}
```

In `checkDesign`, after the `hangs` block and before `return out;`:

```ts
  const tip = tipsMessage(boxes, grounded);
  if (tip) out.push({ kind: 'tips', message: tip });
```

Add to the module doc comment: "`tips` (fu 165): the grounded parts' volume-weighted centre of mass sits at least min(1in, s/4) inside the floor footprint's hull."

- [ ] **Step 4: Run, expect PASS** for the whole suite, then `npm run build`.

- [ ] **Step 5: Mutate.** Each mutation turns the named test red. Revert each and record it.
  - `if (d >= 0) return null;` (no margin) turns *'flags one less than the margin'* red.
  - The unweighted mean (`v = 1`) turns *'weighs by VOLUME'* red.
  - Iterating over every box instead of `grounded` turns *'a floating part adds no weight'* red.
  - `const m = TIP_MARGIN;` (no shrink) turns *'a 3in footprint'* red.
  - Flipping the outward normal's sign turns *'side table C'*'s `+X` red.

- [ ] **Step 6: Commit.** `git commit -am "feat(document): tips — the centre of mass must sit inside the floor footprint (fu 165)"`, plus the trailer.

---

### Task 3: The model is told the rules

**Files:**
- Modify: `src/generate/prompt.ts`, `src/generate/prompt.test.ts`

- [ ] **Step 1: Write the failing test.** Add inside `describe('prompt')`:

```ts
  it('states the held and stable rules up front (fu 165)', () => {
    expect(SYSTEM_PROMPT).toContain(
      '- Every part off the floor must be held: resting on a part below it, fitted between two parts that cover at least half of each of its opposite sides, or fastened by its broad face to another part. A part touching only by an edge or its corners is not held.',
    );
    expect(SYSTEM_PROMPT).toContain(
      '- Keep the piece stable: its weight must sit well inside the outline of what touches the floor, so it cannot tip over.',
    );
    const lines = SYSTEM_PROMPT.split('\n');
    const floor = lines.findIndex((l) => l.startsWith('- Every part must connect to the floor'));
    expect(lines[floor + 1].startsWith('- Every part off the floor must be held')).toBe(true);
    expect(lines[floor + 2].startsWith('- Keep the piece stable')).toBe(true);
  });
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement.** In `SYSTEM_PROMPT`, directly after the line `- Every part must connect to the floor (y = 0) through a chain of parts touching face to face. Nothing floats.`, insert the two lines verbatim, exactly as the test states them.

- [ ] **Step 4: Run, expect PASS.** Run `npx vitest run` and `npm run build`. The existing "nothing per-run" test still passes, and the batch-of-1 literal pin is unaffected, because it pins `userMessage`, not `SYSTEM_PROMPT`.

- [ ] **Step 5: Commit.** `git commit -am "feat(generate): the model is told the held and stable rules (fu 165)"`, plus the trailer.

---

### Task 4: Live check, record, merge. STOP POINTS: paid runs and the merge need the user

**Files:**
- Create: `docs/browser-verification-held-and-stable.md`, plus screenshots `docs/img/held-*.png`
- Modify: `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`

- [ ] **Step 1: Paid runs. ASK THE USER FIRST.**
  - Claude drives the dev server (`npm run dev -- --host 127.0.0.1 --port 5180 --strictPort`) while the user watches. The user enters the key.
  - Install the same temporary fetch logger as the batch variety pass (request bodies only, never headers). Also log each repair round's feedback text, so `hangs` and `tips` messages are seen as the model sees them.
  - Run `"A simple workbench"`: Shop, Moderate, 1 generation, Sonnet 5.5.
  - Run `"A side table"`: oak, Mid-century, Detailed, 3 generations, Sonnet 5.5.
  - For each run, record: calls; every `hangs` or `tips` message sent; the issues left at the end; a screenshot.
  - **Pass:** no finished design keeps a `hangs` or `tips` violation, and the user judges the designs sound.
  - **If runs routinely use all 3 repair rounds on these rules:** record it and ask the user. Do not retune the thresholds.
  - Afterwards, clear `localStorage` and confirm `sloyd.llm.v1` is `null`.

- [ ] **Step 2: Write `docs/browser-verification-held-and-stable.md`**, in the shape of the batch variety one.

- [ ] **Step 3: Update `CLAUDE.md`.**
  - **Status:** the test count and the round.
  - **Rounds table row:** `held and stable | 10-03 | — | checkDesign reports a part that is not held and a piece that would tip (fu 165, inv 39)`.
  - **`designCheck.ts` entry under where-things-live:** a line for `hangs` and `tips`.
  - **New invariant 39, *support means held, not touching*.** It must state:
    - the three ways a part is held;
    - why (c) exists;
    - that overlap never holds, and an overlapping part is never also `hangs` (Deviation 2);
    - that coverage, not two-sidedness, is what catches the workbench shelf;
    - that `tips` weighs grounded parts only (Deviation 1);
    - **a prohibition:** do not drop (c) or the coverage threshold to "simplify". Each one exists because of a measured case.
  - **Follow-ups list:** replace the 165 bullet with its closure.

- [ ] **Step 4: Update `docs/history.md` and `docs/follow-ups.md`.**
  - **`docs/history.md`:** the round's narrative.
  - **`docs/follow-ups.md`:**
    - close **165** with the workbench evidence;
    - add any finding from the live check as a new numbered entry;
    - add every surviving mutation as a new numbered entry.

- [ ] **Step 5: Verify and commit.** Run `npx vitest run` and `npm run build`. Commit with the message `docs: the held and stable round — live check and invariant 39`, plus the trailer.

- [ ] **Step 6: Merge. ASK THE USER FIRST.**
  - `git checkout master && git merge --no-ff held`
  - Run the tests and the build on the merged tree.
  - `git branch -d held`
  - Deploy only if the user asks.
