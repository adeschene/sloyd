# AI integration meets tapers — chunk 1 (joinery and checks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add joinery (and Repair joints) accept a document whose only angle cuts are tapers, refusing — before any call
or mutation — when a taper runs into a joint; the design checks stop trusting wood a taper removed.

**Architecture:** One new reader, `contactSolids` (`designCheck.ts`), gives the checks a tapered part's flat-wood solids
(box-valued, conservative); held contacts, grounding connectivity and the tip footprint read it, overlap and sites stay on
boxes. One decider, `joineryRefusal` (`generate/joints/tapers.ts`), returns the narrowed angled refusal or the
taper-at-joint refusal; `runJoinery` and `App` both call it. Person-facing text is built in `document/angledRefusal.ts`
(the `→ units` edge: `generate` may not import `units`).

**Tech Stack:** TypeScript, Vitest, React (App.tsx only).

**Spec:** `docs/superpowers/specs/2026-10-13-sloyd-ai-tapers-design.md` (§3, §4, the Repair narrowing; §7 chunk 1).
Read it first, and CLAUDE.md invariants 38, 41, 44, 48.

## Global Constraints

- No document schema change; `CURRENT_VERSION` stays 14.
- Layer rule: `generate` imports only `document` and `llm`. `document` may import `units` only where it builds a string a
  person reads (`angledRefusal.ts` now does).
- Every world↔part crossing goes through `geometry.ts` helpers (`axisFrame`, `endFacing`, `spanFromWorldOffset`) —
  never `board[dim] - u` at a call site (invariant 44).
- An untapered part's check results are byte-for-byte unchanged.
- Refusals are decided before any LLM call or mutation (invariant 41). Tests of callers assert call counts and the
  unchanged document, never message text; only the message builder's own unit test asserts text.
- Refine stays fully refusing on any angle cut in this chunk (`angledRefusal(doc, 'refine')` unchanged). Chunk 2 narrows it.
- `npm run build` is the typecheck gate; `npm test` does not typecheck.
- Mutate every plan-supplied test once (break the code it guards, see it fail, restore) before trusting it.

## Review Focus

1. **A turned or reversed leg** (rotation 180, or a taper toward the length max end): the station mapping in
   `taperConflicts` and `contactSolids` must use `spanFromWorldOffset`/`endFacing`, so the refusal and the contacts land on
   the right end. Test in Task 4 (rotation 180 leg) and Task 1 (taper toward max).
2. **A joined tapered leg** (mortise cells) after the run: the post-run `checkDesign` gate must not report new
   hangs/unsupported for the aprons. Test in Task 5 (the accepted run asserts `violations` is `[]`).
3. **A taper on a face the apron does not touch** (an outside-face taper at apron height): the rule is station-based, so it
   refuses — the mortise goes toward that thinned face. Expected behaviour; pinned in Task 4.
4. **A hand-edited taper stored deep-end-last** (`alongFrom` the far end): `contactSolids` and `taperConflicts` read it
   through `taperFields`, which describes it from its deep end. Test in Task 1.
5. **Untapered regression:** a notched (rectangular-cut) part keeps today's grounding and footprint (whole box). Test in
   Task 2, plus the existing `simple-workbench` and runJoinery suites must stay green untouched.

---

### Task 1: `contactSolids` — a tapered part's flat-wood solids

**Files:**
- Modify: `src/document/designCheck.ts` (add after `worldSolids`, ~line 255; imports at top)
- Test: `src/document/contactSolids.test.ts` (create)

**Interfaces:**
- Consumes: `pocketCells` (`cuts.ts`), `worldBox` (same file), `taperFields` (`angleCuts.ts`), `Region` (`types.ts`).
- Produces: `export function contactSolids(b: Board): Box[]` and `export function isTapered(b: Board): boolean` from
  `src/document/designCheck.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/document/contactSolids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contactSolids, isTapered, worldSolids } from './designCheck';
import type { Box } from './designCheck';
import { createBoard } from './document';
import { taperCut } from './angleCuts';
import { axisFrame, endFacing } from './geometry';
import type { AngleCut, Board } from './types';

/** An upright leg: width on X, length on Y, thickness on Z (turn 0). */
const leg = (rotation: 0 | 180 = 0): Board =>
  createBoard({ name: 'Leg', position: [0, 0, 0], length: 28, width: 1.5, thickness: 1.5, posture: 'upright', rotation });
/** A taper on the world face (axis, side), thin toward the world end `toward` on Y. */
const taper = (b: Board, axis: 0 | 2, side: -1 | 1, start: number, amount: number, toward: -1 | 1 = -1): AngleCut => ({
  id: `t${axis}${side}${toward}`,
  ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, side), end: endFacing(b, 1, toward), start, amount }),
});
const sorted = (bs: Box[]) => bs.map((b) => [b.min, b.max]).sort((p, q) => p[0][1]! - q[0][1]! || p[0][0]! - q[0][0]!);

describe('contactSolids (spec §3.2)', () => {
  it('is worldSolids, exactly, for a part with no taper — rectangular cuts included', () => {
    const b = createBoard({ name: 'Notched', length: 20, width: 4, thickness: 1, cuts: [
      { id: 'c1', face: 'thickness', from: 'max', across: 'length', offset: 2, width: 3, depth: 0.5, stopMin: 0, stopMax: 0 },
    ] });
    expect(isTapered(b)).toBe(false);
    expect(contactSolids(b)).toEqual(worldSolids(b));
  });

  it('trusts the square length and the shrunk thin end', () => {
    const b = leg();
    const t = { ...b, angleCuts: [taper(b, 0, 1, 20, 0.5)] };
    expect(isTapered(t)).toBe(true);
    expect(sorted(contactSolids(t))).toEqual([
      [[0, 0, 0], [1, 0, 1.5]],        // the floor end, 0.5 off its +X side
      [[0, 20, 0], [1.5, 28, 1.5]],    // the square length
    ]);
  });

  it('keeps the full far end of a full-length taper', () => {
    const b = leg();
    const t = { ...b, angleCuts: [taper(b, 0, 1, 28, 0.5)] };
    expect(sorted(contactSolids(t))).toContainEqual([[0, 28, 0], [1.5, 28, 1.5]]);
  });

  it('keeps only the end slabs when tapers from both ends overlap', () => {
    const b = leg();
    const t = { ...b, angleCuts: [taper(b, 0, 1, 20, 0.5, -1), taper(b, 2, 1, 20, 0.5, 1)] };
    expect(sorted(contactSolids(t))).toEqual([
      [[0, 0, 0], [1, 0, 1.5]],
      [[0, 28, 0], [1.5, 28, 1]],
    ]);
  });

  it('maps a turned leg through the turn table (taper toward the top)', () => {
    const b = leg(180);
    const t = { ...b, angleCuts: [taper(b, 0, 1, 20, 0.5, 1)] };
    expect(sorted(contactSolids(t))).toEqual([
      [[0, 0, 0], [1.5, 8, 1.5]],      // square from the floor up to 28 - 20
      [[0, 28, 0], [1, 28, 1.5]],      // the top end, 0.5 off its +X side
    ]);
  });

  it('reads a taper stored deep-end-last as the same taper', () => {
    const b = leg();
    const std = taper(b, 0, 1, 8, 0.5);                                   // thin toward the floor, square from 8
    const flipped: AngleCut = { ...std, alongFrom: std.alongFrom === 'min' ? 'max' : 'min', points: [[20, 0], [28, 0.5]] };
    expect(sorted(contactSolids({ ...b, angleCuts: [flipped] }))).toEqual(sorted(contactSolids({ ...b, angleCuts: [std] })));
  });

  it('throws on any other angle-cut kind (refused upstream)', () => {
    const b = leg();
    expect(() => contactSolids({ ...b, angleCuts: [{ ...taper(b, 0, 1, 20, 0.5), kind: 'miter' }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/contactSolids.test.ts`
Expected: FAIL — `contactSolids` / `isTapered` are not exported.

- [ ] **Step 3: Implement**

In `src/document/designCheck.ts`, extend the imports:

```ts
import type { Region, Span } from './types';
import { taperFields } from './angleCuts';
```

(`Span` is exported from `types.ts` alongside `Region`; if it is not, use `[number, number]`.) Then add after
`worldSolids`:

```ts
/** A part carrying any angle cut — for the checks, every one of them is a taper (spec §3.2; others are refused upstream). */
export const isTapered = (b: Board): boolean => b.angleCuts.length > 0;

/**
 * A part's solids AS FAR AS CONTACT CAN TRUST THEM (AI-tapers spec §3.2), world boxes.
 * No taper: exactly `worldSolids`. Tapered: every pocket cell clipped, along the length,
 * to the stations no taper removes (a side face is trusted only where it is still flat —
 * conservative for the faces beside a sloped one too), plus, at each end a taper runs
 * toward, a zero-thickness slab per cell reaching it, shrunk by each such taper's amount.
 * The second reader of angle cuts besides `boardBodies` (invariant 48): tapers only,
 * never claiming wood a taper removed. Read through `taperFields`, so a line stored
 * deep-end-last reads as the same taper.
 */
export function contactSolids(b: Board): Box[] {
  if (!isTapered(b)) return worldSolids(b);
  const tapers = b.angleCuts.map((c) => {
    if (c.kind !== 'taper') throw new Error(`contactSolids: ${b.name} carries a ${c.kind}; only tapers reach the checks`);
    return taperFields(c, b);
  }).filter((t) => t.amount > 0);
  const L = b.length;
  let lo = 0;
  let hi = L;
  for (const t of tapers) {
    if (t.end === 'min') lo = Math.max(lo, t.start);
    else hi = Math.min(hi, L - t.start);
  }
  const cells = pocketCells(b);
  const out: Region[] = [];
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
  return out.map((s) => worldBox(b, s));
}
```

Note the deliberate asymmetry: `taperFields`' `start` is not exact in floating point (`zeroStation`), which is harmless
here — contact uses `TOUCH` tolerance and the error only ever narrows trusted wood by ~1e-15in.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/document/contactSolids.test.ts`
Expected: PASS (7 tests). If the turned-leg case fails, check the expectation by hand against `axisFrame` before touching
the code (rotation 180 on upright reverses X and Z, not Y; `endFacing(b, 1, 1)` is the length `max` end).

- [ ] **Step 5: Mutate**

Temporarily change `if (t.end === 'min') lo = …` to apply to both ends; the turned-leg and both-ends tests must fail.
Restore. Temporarily drop the slab loop; the thin-end and full-length tests must fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/document/designCheck.ts src/document/contactSolids.test.ts
git commit -m "feat(checks): contactSolids — a tapered part's flat-wood solids (AI-tapers spec §3.2)"
```

---

### Task 2: the checks read `contactSolids`

**Files:**
- Modify: `src/document/designCheck.ts` (`groundedSet` ~119, `tipsMessage` ~79, `checkDesign` ~265)
- Test: `src/document/designCheck.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `contactSolids`, `isTapered` (Task 1).
- Produces: no new exports; `checkDesign`'s results change only for tapered parts.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/designCheck.test.ts` (it already imports `checkDesign`, `createBoard`, `createDocument`, has
`box`, `span`, `docOf`, `NO_LIMITS`):

```ts
import { taperCut } from './angleCuts';
import { axisFrame, endFacing } from './geometry';
import type { AngleCut } from './types';

describe('tapered parts: contacts read contactSolids (AI-tapers spec §3.3)', () => {
  const leg = (): Board => createBoard({ name: 'Leg', position: [0, 0, 0], length: 28, width: 1.5, thickness: 1.5, posture: 'upright', rotation: 0 });
  const plusX = (b: Board, start: number, amount = 0.5): AngleCut => ({
    id: 'tx', ...taperCut({ face: axisFrame(b)[0]!.dim as 'width' | 'thickness', from: endFacing(b, 0, 1), end: endFacing(b, 1, -1), start, amount }),
  });
  const tapered = (start: number) => { const b = leg(); return { ...b, angleCuts: [plusX(b, start)] }; };
  const about = (doc: FlatDocument, name: string) => checkDesign(doc, NO_LIMITS).filter((v) => v.parts.includes(name)).map((v) => v.kind);
  // A batten fastened by its broad (-X) face to the leg's +X face, 5in to 8in up.
  const batten = () => span('Batten', [1.5, 5, 0], [2.25, 8, 1.5]);

  it('a batten on square wood is held', () => {
    expect(about(docOf(leg(), batten()), 'Batten')).toEqual([]);
    expect(about(docOf(tapered(4), batten()), 'Batten')).toEqual([]);   // the taper ends below it
  });

  it('a batten against the tapered length touches air, so it connects to nothing', () => {
    expect(about(docOf(tapered(20), batten()), 'Batten')).toEqual(['unsupported']);
  });

  it('a full-length taper still carries a top on its far end', () => {
    expect(about(docOf(tapered(28), span('Top', [0, 28, 0], [3, 28.5, 1.5])), 'Top')).toEqual([]);
  });

  it('the footprint shrinks by the amount: a piece that stood now tips', () => {
    const top = span('Top', [0, 28, 0], [3, 28.5, 1.5]);
    const tips = (doc: FlatDocument) => checkDesign(doc, NO_LIMITS).some((v) => v.kind === 'tips');
    expect(tips(docOf(leg(), top))).toBe(false);
    expect(tips(docOf(tapered(20), top))).toBe(true);
  });

  it('an untapered notched part keeps its whole box for grounding and footprint', () => {
    // A notch under the leg's floor end would drop its floor cell from a cells-based footprint.
    const notched = createBoard({ name: 'Leg', position: [0, 0, 0], length: 28, width: 1.5, thickness: 1.5, posture: 'upright', rotation: 0,
      cuts: [{ id: 'n', face: 'width', from: 'max', across: 'thickness', offset: 0, width: 2, depth: 0.75, stopMin: 0, stopMax: 0 }] });   // offset/width run along the length (positionAxisOf)
    const top = span('Top', [0, 28, 0], [3, 28.5, 1.5]);
    expect(checkDesign(docOf(notched, top), NO_LIMITS)).toEqual(checkDesign(docOf(leg(), top), NO_LIMITS));
  });
});
```

(Check the `tips` arithmetic before trusting it: leg volume 63 at x 0.75, top 2.25 at x 1.5 → centre x ≈ 0.776. Untapered
footprint x∈[0,1.5], margin min(1, 1.5/4) = 0.375, distance 0.724 → stands. Tapered footprint x∈[0,1.0], margin 0.25,
distance 0.224 → tips. If the notched case's `cuts` literal does not match the `Cut` type exactly, read `types.ts`'s `Cut`
and adjust the literal, not the assertion.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/designCheck.test.ts`
Expected: the 'touches air' and 'tips' tests FAIL (box contacts and box footprint); the others pass already.

- [ ] **Step 3: Implement**

In `designCheck.ts`:

1. `groundedSet` takes the contact solids and decides connectivity per pair — boxes when neither part is tapered
   (byte-for-byte today), contact solids otherwise:

```ts
/** The parts connected to the floor through touching parts, optionally with one part removed from the design. */
function groundedSet(boxes: Box[], touching: Box[][], tapered: boolean[], skip: number | null = null): Set<number> {
  const joined = (i: number, j: number) => (tapered[i] || tapered[j]
    ? touching[i].some((a) => touching[j].some((b) => connected(a, b)))
    : connected(boxes[i], boxes[j]));
  const grounded = new Set<number>();
  const queue = boxes.flatMap((b, i) => (i !== skip && b.min[1] <= TOUCH ? [i] : []));
  queue.forEach((i) => grounded.add(i));
  while (queue.length) {
    const i = queue.shift()!;
    boxes.forEach((_, j) => {
      if (j !== skip && !grounded.has(j) && joined(i, j)) {
        grounded.add(j);
        queue.push(j);
      }
    });
  }
  return grounded;
}
```

2. `tipsMessage` takes each floor part's footprint boxes:

```ts
function tipsMessage(boxes: Box[], grounded: Set<number>, footprint: (i: number) => Box[]): string | null {
  const floor = boxes.flatMap((b, i) => (b.min[1] <= TOUCH ? footprint(i) : []));
```

and leave the rest of the function as is (`floor` now holds footprint boxes; the hull loop already reads their corners).

3. In `checkDesign`, after `const solids = solidBoxesOf(doc);`:

```ts
  // Contact trusts only flat wood (AI-tapers spec §3.3); overlap above stays on the full solids.
  const tapered = doc.boards.map(isTapered);
  const touching = doc.boards.map((b, i) => (tapered[i] ? contactSolids(b) : solids[i]));
```

then replace `groundedSet(boxes)` with `groundedSet(boxes, touching, tapered)`, the memo's
`groundedSet(boxes, skip)` with `groundedSet(boxes, touching, tapered, skip)`, `solidContactsOf(solids)` with
`solidContactsOf(touching)`, and `tipsMessage(boxes, grounded)` with:

```ts
  const tip = tipsMessage(boxes, grounded, (i) => (tapered[i] ? touching[i].filter((s) => s.min[1] <= TOUCH) : [boxes[i]]));
```

Update the module doc comment's overlap paragraph with one line: "Contacts, grounding and the tip footprint read
`contactSolids` (a tapered part counts only where it is flat); overlap stays on `worldSolids`."

- [ ] **Step 4: Run to verify they pass, and nothing else moved**

Run: `npx vitest run src/document/ src/generate/`
Expected: PASS, including every pre-existing designCheck, run and runJoinery test unchanged.

- [ ] **Step 5: Mutate**

Make `joined` always use boxes: 'touches air' must fail. Make the footprint always `[boxes[i]]`: 'tips' must fail. Make
`touching` use `contactSolids` for every part *and* `joined` use `touching` for every pair: the notched test must fail
(if it does not, the notch fixture does not reach the floor cell — fix the fixture so it does). Restore each.

- [ ] **Step 6: Commit**

```bash
git add src/document/designCheck.ts src/document/designCheck.test.ts
git commit -m "feat(checks): held, grounding and the tip footprint trust only a taper's flat wood (spec §3.3)"
```

---

### Task 3: narrow the angled refusal for joinery and Repair

**Files:**
- Modify: `src/document/angledRefusal.ts`
- Modify: `src/generate/joints/repair.ts:101`
- Test: `src/document/angledRefusal.test.ts`, `src/generate/joints/repair.test.ts:247-257`, `src/generate/run.test.ts:756-772`

**Interfaces:**
- Produces: `angledParts(doc: SloydDocument, allow?: readonly AngleKind[]): string[]` (default `[]`, today's behaviour);
  `angledRefusal(doc, 'joinery')` now ignores tapers; `angledRefusal(doc, 'refine')` unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/document/angledRefusal.test.ts`, replace the joinery expectations and add a miter case:

```ts
const miter = { ...taper, id: 'm1', kind: 'miter' as const };
const withCut = (cut: typeof taper | typeof miter, n = 1) => ({ ...createDocument('T'), boards: [
  createBoard({ id: 'apron', name: 'Apron' }),
  ...Array.from({ length: n }, (_, i) => createBoard({ id: `f${i}`, name: `Frame ${i + 1}`, angleCuts: [cut] })),
] });

describe('angledRefusal — tapers are joinable (AI-tapers spec §4.3)', () => {
  it('joinery ignores tapers', () => {
    expect(angledRefusal(withCut(taper), 'joinery')).toBeNull();
    expect(angledParts(withCut(taper), ['taper'])).toEqual([]);
  });
  it('joinery still refuses any other kind, naming the parts', () => {
    expect(angledRefusal(withCut(miter, 4), 'joinery')).toBe(
      "Add joinery doesn't handle mitered, bevelled or chamfered parts yet (Frame 1, Frame 2, Frame 3…). Add joinery first, or remove those angles.");
  });
  it('Refine still refuses tapers in this chunk', () => {
    expect(angledRefusal(withCut(taper), 'refine')).toBe(
      "Refine doesn't handle angled parts yet (Frame 1). Refine before tapering, or remove the angles first.");
  });
});
```

Delete the existing assertion `expect(angledRefusal(doc(4), 'joinery')).toBe("Add joinery doesn't handle angled parts yet …")`
(it is now wrong by design); keep the `angledParts(doc(4))` and refine assertions.

In `src/generate/run.test.ts`, the `runJoinery — angled documents` fixture must use a non-taper kind to keep testing the
refusal: change `angleCuts: [TAPER]` in `angledDoc` to `angleCuts: [{ ...TAPER, kind: 'miter' as const }]`.

In `src/generate/joints/repair.test.ts`, replace the angled describe block:

```ts
const MITER = { ...TAPER, kind: 'miter' as const };
const withAngle = (doc: SloydDocument, cut: typeof TAPER | typeof MITER): SloydDocument =>
  ({ ...doc, definitions: doc.definitions.map((d, i) => (i === 0 ? { ...d, boards: d.boards.map((b, j) => (j === 0 ? { ...b, angleCuts: [cut] } : b)) } : d)) });
describe('repairDocument — angled documents (AI-tapers spec §4.3)', () => {
  it('offers nothing when any non-taper angle cut is present', () => {
    const fx = load(f1);
    const angled = withAngle(fx.damaged, MITER);
    expect(flatDocument(angled).boards.some((b) => b.angleCuts.length > 0)).toBe(true);
    expect(repairDocument(angled)).toBeNull();
  });
  it('repairs a taper-only document as it would the plain one', () => {
    const fx = load(f1);
    const r0 = repairDocument(fx.damaged);
    if (r0 === null || 'refused' in r0) throw new Error('expected a repair');
    const r = repairDocument(withAngle(fx.damaged, TAPER));
    if (r === null || 'refused' in r) throw new Error(`expected a repair, got ${JSON.stringify(r)}`);
    expect(r.dropped).toBe(r0.dropped);
  });
});
```

If 'repairs a taper-only document' refuses after Step 3, **stop and investigate** (systematic-debugging): the spec claims
repair never touches angle cuts; a refusal means that claim is wrong, and that is a human decision, not an expectation to
edit.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/angledRefusal.test.ts src/generate/joints/repair.test.ts src/generate/run.test.ts`
Expected: the joinery-ignores-tapers, the new joinery message and the taper-only repair tests FAIL.

- [ ] **Step 3: Implement**

Replace the body of `src/document/angledRefusal.ts` (keep the imports, add `AngleKind`):

```ts
import type { AngleKind, SloydDocument } from './types';
import { flatDocument } from './tree';

/** Flat display names of every placed part carrying an angle cut whose kind is not in `allow`, in document order. */
export function angledParts(doc: SloydDocument, allow: readonly AngleKind[] = []): string[] {
  return flatDocument(doc).boards.filter((b) => b.angleCuts.some((c) => !allow.includes(c.kind))).map((b) => b.name);
}

const shown = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')}…` : names.join(', '));

/**
 * Why Add joinery or Refine will not run on this document, or null (angle-cuts
 * spec §6; AI-tapers spec §4.3). Their checks and joints are box-based throughout
 * (invariants 38, 41): a mitered frame's stock boxes overlap at its corners, so a
 * run would report a false overlap or cut into air. Joinery accepts tapers — the
 * taper-at-joint rule (`generate/joints/tapers.ts`) guards those. Refine still
 * refuses every angle cut until AI-tapers chunk 2. Decided before any mutation or call.
 */
export function angledRefusal(doc: SloydDocument, action: 'joinery' | 'refine'): string | null {
  if (action === 'joinery') {
    const names = angledParts(doc, ['taper']);
    if (names.length === 0) return null;
    return `Add joinery doesn't handle mitered, bevelled or chamfered parts yet (${shown(names)}). Add joinery first, or remove those angles.`;
  }
  const names = angledParts(doc);
  if (names.length === 0) return null;
  return `Refine doesn't handle angled parts yet (${shown(names)}). Refine before tapering, or remove the angles first.`;
}
```

In `src/generate/joints/repair.ts:101`:

```ts
    if (angledParts(doc, ['taper']).length > 0) return null; // not offered: AI-tapers spec §4.3 (tapers repair; other kinds do not)
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/document/ src/generate/`
Expected: PASS.

- [ ] **Step 5: Mutate**

Change the joinery branch's `['taper']` to `[]`: 'joinery ignores tapers' must fail. Change `repair.ts`'s `['taper']` to
`[]`: the taper-only repair test must fail. Restore both.

- [ ] **Step 6: Commit**

```bash
git add src/document/angledRefusal.ts src/document/angledRefusal.test.ts src/generate/joints/repair.ts src/generate/joints/repair.test.ts src/generate/run.test.ts
git commit -m "feat(joinery): tapers are joinable — the angled refusal and Repair narrow to other kinds (spec §4.3)"
```

---

### Task 4: the taper-at-joint rule and the one decider

**Files:**
- Modify: `src/document/angledRefusal.ts` (add `TaperConflict`, `taperJointRefusal`)
- Modify: `src/document/document.ts:31` (re-export them)
- Create: `src/generate/joints/tapers.ts`
- Test: `src/generate/joints/tapers.test.ts` (create)

**Interfaces:**
- Consumes: `findSites`, `Site` (`sites.ts`), `boxOf` (`pocket.ts`), `taperFields`, `angledRefusal` (Task 3).
- Produces:
  - `src/document/angledRefusal.ts`: `export interface TaperConflict { part: number; other: number; end: CutFrom; nearest: number }`
    (`part`/`other` are flat board indices; `nearest` is the patch's closest station to the taper's thin `end`, inches,
    0 when the joint is on that end) and `export function taperJointRefusal(flat: FlatDocument, conflicts: readonly TaperConflict[]): string | null`.
  - `src/generate/joints/tapers.ts`: `export function taperConflicts(flat: FlatDocument, sites: readonly Site[]): TaperConflict[]`
    (one per tapered part, the smallest `nearest`, sorted by `part`) and
    `export function joineryRefusal(doc: SloydDocument, flat?: FlatDocument, sites?: readonly Site[]): string | null`.
  - Chunk 2 reuses `taperConflicts` from `evaluateDesign`.

- [ ] **Step 1: Write the failing tests**

Create `src/generate/joints/tapers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { flatDocument, taperCut } from '../../document/document';
import type { AngleCut, Board, FlatDocument } from '../../document/document';
import { axisFrame, endFacing } from '../../document/geometry';
import { formatLength } from '../../units/length';
import { findSites } from './sites';
import { joineryRefusal, taperConflicts } from './tapers';
import { taperJointRefusal } from '../../document/angledRefusal';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);
// The runJoinery suite's corner: a leg with rails into its +X and +Z faces, 23.5in to 26.5in up.
const CORNER = design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
  { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3, 18] },
);
const face = (b: Board, axis: 0 | 2, side: -1 | 1, start: number, toward: -1 | 1 = -1): AngleCut => ({
  id: `t${axis}${side}${toward}`,
  ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, side), end: endFacing(b, 1, toward), start, amount: 0.375 }),
});
const withLeg = (doc: FlatDocument, cuts: (b: Board) => AngleCut[], patch: Partial<Board> = {}): FlatDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.name === 'Leg' ? { ...b, ...patch, angleCuts: cuts({ ...b, ...patch }) } : b)) });
const conflicts = (doc: FlatDocument) => taperConflicts(doc, findSites(doc));
const inside = (start: number) => (b: Board) => [face(b, 0, 1, start), face(b, 2, 1, start)];

describe('taperConflicts (AI-tapers spec §4.1)', () => {
  it('none for an untapered piece', () => {
    expect(conflicts(CORNER)).toEqual([]);
  });
  it('none when the taper starts below the joint — the start itself is allowed', () => {
    expect(conflicts(withLeg(CORNER, inside(22)))).toEqual([]);
    expect(conflicts(withLeg(CORNER, inside(23.5)))).toEqual([]);
  });
  it('one conflict per tapered part, at the patch nearest the thin end', () => {
    const leg = CORNER.boards.findIndex((b) => b.name === 'Leg');
    const out = conflicts(withLeg(CORNER, inside(24)));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ part: leg, end: endFacing(CORNER.boards[leg]!, 1, -1), nearest: 23.5 });
  });
  it('a taper on a face no rail touches still conflicts: the mortise runs toward it', () => {
    expect(conflicts(withLeg(CORNER, (b) => [face(b, 0, -1, 24)]))).toHaveLength(1);
  });
  it('a taper toward the top conflicts from the top end', () => {
    const out = conflicts(withLeg(CORNER, (b) => [face(b, 0, 1, 2, 1)]));   // square below 26
    expect(out).toHaveLength(1);
    expect(out[0]!.nearest).toBeCloseTo(28 - 26.5, 12);
  });
  it('a turned leg maps its stations through the turn table', () => {
    const turned = withLeg(CORNER, inside(24), { rotation: 180 });
    expect(conflicts(turned)).toHaveLength(1);
    expect(conflicts(withLeg(CORNER, inside(22), { rotation: 180 }))).toEqual([]);
  });
  it('a joint ON the thin end conflicts with nearest 0', () => {
    // A leg standing in a base: its floor end enters the base's top face.
    const doc = design(
      { name: 'Base', at: [-4, 0, -4], size: [10, 1, 10] },
      { name: 'Leg', at: [0, 1, 0], size: [1.75, 28, 1.75] },
    );
    const out = conflicts(withLeg(doc, (b) => [face(b, 0, 1, 20)]));
    expect(out).toHaveLength(1);
    expect(out[0]!.nearest).toBe(0);
  });
});

describe('taperJointRefusal / joineryRefusal', () => {
  it('names the part, the joint and where to start', () => {
    const doc = withLeg(CORNER, inside(24));
    const msg = taperJointRefusal(doc, conflicts(doc))!;
    expect(msg).toContain('Leg');
    expect(msg).toContain(`start it at ${formatLength(23.5, doc.units.precision)} or less from the length`);
  });
  it('the decider: angled kinds first, then tapers, else null', () => {
    expect(joineryRefusal(CORNER)).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(22)))).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(24)))).toContain('taper runs into its joint');
    const mitered = withLeg(CORNER, (b) => [{ ...face(b, 0, 1, 24), kind: 'miter' }]);
    expect(joineryRefusal(mitered)).toContain('mitered, bevelled or chamfered');
  });
});
```

(Before trusting 'a taper toward the top': the
square stations are [0, 26], the rails' patch on the leg is y 23.5–26.5, so from the top end the patch starts at
28 − 26.5 = 1.5 < start 2 → conflict, nearest 1.5. The turned case: rotation 180 on an upright part reverses X and Z,
not Y, so the same world rails meet the same stations — what changes is which local face each `face()` names.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/generate/joints/tapers.test.ts`
Expected: FAIL — `./tapers` does not exist.

- [ ] **Step 3: Implement**

Append to `src/document/angledRefusal.ts`:

```ts
import type { CutFrom, FlatDocument } from './types';
import { faceName } from './angleText';
import { formatLength } from '../units/length';

/** One tapered part whose taper runs into a joint (AI-tapers spec §4.1). Indices are flat-document board indices. */
export interface TaperConflict {
  part: number;
  other: number;
  /** The taper's thin end. */
  end: CutFrom;
  /** The joint's closest station to that end, inches; 0 when the joint is ON that end. */
  nearest: number;
}

/**
 * The person-facing refusal for taper conflicts (spec §4.1), one sentence per tapered part,
 * or null. Built here, not in generate/, because it is a string a person reads (→ units).
 */
export function taperJointRefusal(flat: FlatDocument, conflicts: readonly TaperConflict[]): string | null {
  if (conflicts.length === 0) return null;
  const f = (n: number) => formatLength(n, flat.units.precision);
  return conflicts.map(({ part, other, end, nearest }) => {
    const name = flat.boards[part]!.name;
    const joint = flat.boards[other]!.name;
    return nearest === 0
      ? `${name}'s taper runs to ${faceName('length', end)}, where it joins ${joint} — taper the other end, or remove it.`
      : `${name}'s taper runs into its joint with ${joint} — start it at ${f(nearest)} or less from ${faceName('length', end)}, or remove it.`;
  }).join(' ');
}
```

(Merge the new `import type` into the file's existing type import from `./types`. Confirm `angleText.ts` does not import
`angledRefusal.ts` — it does not today — so no cycle.)

In `src/document/document.ts:31`:

```ts
export { angledParts, angledRefusal, taperJointRefusal } from './angledRefusal';
export type { TaperConflict } from './angledRefusal';
```

Create `src/generate/joints/tapers.ts`:

```ts
import type { FlatDocument, SloydDocument, TaperConflict } from '../../document/document';
import { angledRefusal, flatDocument, taperJointRefusal } from '../../document/document';
import { taperFields } from '../../document/angleCuts';
import { axisDimensions, endFacing, spanFromWorldOffset } from '../../document/geometry';
import { boxOf } from './pocket';
import { findSites } from './sites';
import type { Site } from './sites';

/**
 * The taper-at-joint rule (AI-tapers spec §4.1): every site's contact patch on a tapered
 * part must lie on square wood — outside each taper's `[0, start)` from its thin end
 * (`start` itself allowed). Sites stay on BOX contacts on purpose: on flat-wood contacts a
 * rail meeting a taper would lose its contact and be left a silent butt. One conflict per
 * tapered part — the smallest `nearest` — sorted by part. Pure.
 */
export function taperConflicts(flat: FlatDocument, sites: readonly Site[]): TaperConflict[] {
  const best = new Map<number, TaperConflict>();
  for (const s of sites) {
    const e = boxOf(flat.boards[s.enter]!);
    const r = boxOf(flat.boards[s.receive]!);
    const sides: [number, number, -1 | 1][] = [[s.enter, s.receive, s.side], [s.receive, s.enter, (-s.side) as -1 | 1]];
    for (const [part, other, side] of sides) {
      const b = flat.boards[part]!;
      const tapers = b.angleCuts.filter((c) => c.kind === 'taper').map((c) => taperFields(c, b)).filter((t) => t.amount > 0);
      if (tapers.length === 0) continue;
      const L = axisDimensions(b).indexOf('length');
      // The patch's span along the part's length, as stations from its min end.
      let s0: number;
      let s1: number;
      if (L === s.axis) {
        // The joint is ON an end: which one faces the other part.
        s0 = s1 = endFacing(b, L, side) === 'min' ? 0 : b.length;
      } else {
        const lo = Math.max(e.min[L]!, r.min[L]!) - b.position[L]!;
        const hi = Math.min(e.max[L]!, r.max[L]!) - b.position[L]!;
        [s0, s1] = spanFromWorldOffset(b, L, [lo, hi]);
      }
      for (const t of tapers) {
        const nearest = Math.max(0, t.end === 'min' ? s0 : b.length - s1);
        if (nearest >= t.start) continue;
        const prev = best.get(part);
        if (!prev || nearest < prev.nearest) best.set(part, { part, other, end: t.end, nearest });
      }
    }
  }
  return [...best.values()].sort((x, y) => x.part - y.part);
}

/**
 * THE joinery refusal (spec §4.2): the angled refusal (non-taper kinds), else the
 * taper-at-joint refusal, else null. `runJoinery` and the dialog both call it, so the
 * dialog shows exactly what a run would refuse. Decided before any call or mutation.
 */
export function joineryRefusal(doc: SloydDocument, flat: FlatDocument = flatDocument(doc), sites: readonly Site[] = findSites(flat)): string | null {
  return angledRefusal(doc, 'joinery') ?? taperJointRefusal(flat, taperConflicts(flat, sites));
}
```

(Check `Site.side` is the ENTERING part's touching face — `findSites`' `push(kind, enter, receive, side)` passes the
enter side — so the receiver's side is `-s.side`. Check `boxOf`'s `WorldBox` fields are `min`/`max` tuples.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/generate/joints/tapers.test.ts src/document/`
Expected: PASS.

- [ ] **Step 5: Mutate**

Change `if (nearest >= t.start)` to `>`: the `inside(23.5)` boundary test must fail. Replace `spanFromWorldOffset(…)` with
`[lo, hi]`: the turned-leg test must fail (if it does not, the turned fixture does not exercise a reversed length axis —
it does not, since rotation reverses X/Z only; then confirm instead that 'a taper toward the top' fails when `b.length - s1`
is replaced by `s1`). Change the `L === s.axis` branch to always use `0`: 'a taper toward the top' stays green but the
thin-end test must still pass and a far-end case must not falsely conflict — add `expect(conflicts(withLeg(doc, (b) =>
[face(b, 0, 1, 20, 1)]))).toEqual([])` to the thin-end test (taper toward the top, joint on the floor end) and see it fail
under that mutation. Restore all.

- [ ] **Step 6: Commit**

```bash
git add src/document/angledRefusal.ts src/document/document.ts src/generate/joints/tapers.ts src/generate/joints/tapers.test.ts
git commit -m "feat(joinery): the taper-at-joint rule and one joinery refusal decider (spec §4.1-4.2)"
```

---

### Task 5: wire the decider into `runJoinery` and the dialog

**Files:**
- Modify: `src/generate/run.ts:325-331`
- Modify: `src/App.tsx:33, 85-91`
- Test: `src/generate/joints/runJoinery.test.ts` (append)

**Interfaces:**
- Consumes: `joineryRefusal` (Task 4).

- [ ] **Step 1: Write the failing tests**

Append to `src/generate/joints/runJoinery.test.ts` (it has `design`, `client`, `CORNER`, `short`, `run`):

```ts
import { taperCut } from '../../document/angleCuts';
import { axisFrame, endFacing } from '../../document/geometry';
import type { AngleCut } from '../../document/types';

describe('runJoinery — tapered legs (AI-tapers spec §4)', () => {
  const face = (b: Board, axis: 0 | 2, start: number): AngleCut => ({
    id: `t${axis}`, ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, 1), end: endFacing(b, 1, -1), start, amount: 0.375 }),
  });
  const tapered = (doc: SloydDocument & { boards: Board[] }, start: number) =>
    ({ ...doc, boards: doc.boards.map((b) => (b.name === 'Leg' ? { ...b, angleCuts: [face(b, 0, start), face(b, 2, start)] } : b)) });

  it('refuses a taper that runs into a joint before any call, leaving the document alone', async () => {
    const c = client(short);
    const doc = tapered(CORNER, 24);
    const before = JSON.stringify(doc);
    const out = await run(c, doc);
    expect('refused' in out).toBe(true);
    expect(c.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('joins a leg tapered below its rails, and the joined leg passes the gate with its taper intact', async () => {
    const c = client(short);
    const doc = tapered(CORNER, 22);
    const cuts = doc.boards.find((b) => b.name === 'Leg')!.angleCuts;
    const out = await run(c, doc);
    if ('noSites' in out || 'refused' in out) throw new Error(`expected a run, got ${JSON.stringify(out)}`);
    expect(c.complete).toHaveBeenCalled();
    expect(out.violations).toEqual([]);
    expect(flatDocument(out.result.doc).boards.find((b) => b.name === 'Leg')!.angleCuts).toEqual(cuts);
  });

  it('a tenon grown at the untapered end leaves the taper exactly where it was', async () => {
    const TOP = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Top', at: [-1, 28, -1], size: [4, 1, 4] },
    );
    const doc = tapered(TOP, 20);
    const ids = findSites(doc).map((s) => s.id);
    const c = client({ joints: ids.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 0.5 })) });
    const cuts = doc.boards.find((b) => b.name === 'Leg')!.angleCuts;
    const out = await run(c, doc);
    if ('noSites' in out || 'refused' in out) throw new Error(`expected a run, got ${JSON.stringify(out)}`);
    expect(out.result.applied.map((a) => a.joint)).toEqual(['mortise-tenon']);
    const leg = flatDocument(out.result.doc).boards.find((b) => b.name === 'Leg')!;
    expect(leg.length).toBe(28.5);
    expect(leg.angleCuts).toEqual(cuts);
  });
});
```

(If the joined result is not at `out.result.doc`, read `JoinResult` in `recipes.ts` and use its document field. If the
first accepted-run test reports violations, print them: per Review Focus 2 a `hangs`/`unsupported` for a rail means
`contactSolids` drops the mortised leg's cells — a Task 1/2 bug, not an expectation to relax.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/generate/joints/runJoinery.test.ts`
Expected: the refusal test FAILS (a taper alone no longer refuses after Task 3, and nothing checks the rule yet).

- [ ] **Step 3: Implement**

In `src/generate/run.ts`, replace the entry:

```ts
  // Angle cuts and the taper-at-joint rule (AI-tapers spec §4.2): ONE decider, shared with the
  // dialog, decided before any mutation or call. Joinery reads the FLAT document (assemblies
  // spec §6.1): placed parts named by their display paths, written back by index.
  const flat = flatDocument(doc);
  const sites = findSites(flat);
  const refusal = joineryRefusal(doc, flat, sites);
  if (refusal) return { refused: refusal };
  if (sites.length === 0) return { noSites: true };
```

Add `import { joineryRefusal } from './joints/tapers';` and drop `angledRefusal` from the `../document/document` import if
nothing else in `run.ts` uses it (grep first).

In `src/App.tsx`, replace the two memos at lines 85-91:

```ts
  // Joinery reads the FLAT design (assemblies spec §10): the tree document's own
  // `boards` hold only the root parts, so a grouped design would show no sites.
  const joineryFlat = useMemo(() => {
    if (dialog !== 'joinery') return null;
    const flat = flatDocument(doc);
    return { flat, sites: findSites(flat) };
  }, [dialog, doc]);
  const joinerySites = useMemo(() => (joineryFlat ? joineryFlat.sites.map((s) => siteLabel(s, joineryFlat.flat)) : []), [joineryFlat]);
  // THE joinery refusal (AI-tapers spec §4.2) — the same decider runJoinery calls, fed the sites above.
  const joineryRefusal = useMemo(() => (joineryFlat ? decideJoineryRefusal(doc, joineryFlat.flat, joineryFlat.sites) : null), [doc, joineryFlat]);
```

Import `joineryRefusal as decideJoineryRefusal` from `./generate/joints/tapers`, and remove `angledRefusal` from the
`./document/document` import on line 33 if it is now unused.

- [ ] **Step 4: Run everything and typecheck**

Run: `npm test && npm run build`
Expected: all tests PASS (3300 + this round's), build clean.

- [ ] **Step 5: Mutate**

Comment out `if (refusal) return { refused: refusal };`: the refusal test must fail. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/generate/run.ts src/App.tsx src/generate/joints/runJoinery.test.ts
git commit -m "feat(joinery): runJoinery and the dialog share the taper-aware refusal (spec §4.2)"
```

---

### Task 6: record, verify live, ship

**Files:**
- Modify: `CLAUDE.md` (Status, Rounds table, invariants 38/41/48, test count, follow-ups summary)
- Modify: `docs/follow-ups.md` (new entries after 300), `docs/history.md` (round narrative)
- Create: `docs/browser-verification-ai-tapers.md`
- Modify: `src/generate/run.ts` ~252 comment only if chunk 1 makes it reachable — it does not (Refine still refuses
  angled documents); leave it for chunk 2.

- [ ] **Step 1: Invariant amendments in `CLAUDE.md`** (condensed, per the working agreement):
  - 38: append "Held/hangs contacts, `connected` and the tip footprint read `contactSolids` (a tapered part counts only
    where it is flat; an untapered part keeps its box/solids byte-for-byte); overlap stays on `worldSolids`;
    `faceContacts` stays on boxes."
  - 41: append "Joinery accepts tapers and refuses, through the ONE decider `joineryRefusal` (`joints/tapers.ts`), any
    site whose patch lies on tapered wood (`taperConflicts`; `start` itself allowed). Sites stay on box contacts on purpose."
  - 48: change "Joinery, Refine and Repair stay box-based and REFUSE (or do not offer) an angled document" to name the
    exception: "…refuse every kind but `taper` (joinery, Repair); Refine refuses all until AI-tapers chunk 2.
    `contactSolids` is the second, narrower reader of angle cuts: tapers only, box-valued, never over-claiming wood."
  - Where things live: add `generate/joints/tapers.ts` and `contactSolids` to the index lines.

- [ ] **Step 2: Follow-ups** — append to `docs/follow-ups.md`, numbered from 301:
  - Mirrored-component legs (inside-tapered legs share no Shape).
  - Overlap stays box-based for tapered parts (false positives only).
  - The tip check's centre of mass uses box volumes (no body centroid).
  - The taper-at-joint rule is all-or-nothing (per-joint skip declined by the user).
  - Generate/Refine tapers: chunk 2 of this round (open until it ships).

- [ ] **Step 3: Live check on the dev server** (Playwright; the user can watch). Start `npm run dev -- --port 5181`.
  Write a fixture `.sloyd` file in the scratchpad: CORNER (Leg 1.75×28×1.75 upright, Rail X, Rail Z as in Task 4) with
  the Leg's two inside tapers at start 24. Import it through the project menu (a NEW project; never touch existing
  ones). Open Claude ▾ → Add joinery: the dialog shows the taper refusal naming Leg, with no estimate and no Run. Edit the
  taper start to 22 in Properties: the refusal disappears and the site list shows two sites. Do **not** run joinery
  unless the user approves the paid call at that moment. Record a DOM readout in
  `docs/browser-verification-ai-tapers.md`. Afterwards delete only the imported project (the dev profile is the user's;
  never `localStorage.clear()`), and confirm by reading the library index back.

- [ ] **Step 4: Ship.** Merge per the working agreement (branch `ai-tapers-chunk1` → `git merge --no-ff` into master,
  `npm test && npm run build` on the merged tree, delete the branch). **Ask the user before deploying**; then follow
  `DEPLOYMENT.local.md` and verify by bundle hash at the edge and in-network plus the CSP header. Record the bundle hash
  and the deployment in `DEPLOYMENT.local.md` and `docs/history.md`; update CLAUDE.md's Status (production matches
  master, bundle, schema 14 unchanged — rollback free), add the Rounds row ("AI tapers (chunk 1) | 10-13 | — | Add
  joinery and Repair accept tapers; the taper-at-joint refusal; checks trust only a taper's flat wood
  (`contactSolids`)"), and the test count.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "docs: AI-tapers chunk 1 — invariants 38/41/48, follow-ups 301+, live check, deployment"
```
