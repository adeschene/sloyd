# AI integration meets tapers — chunk 2 (Generate and Refine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One prompt gives tapered legs that pass joinery. Generate and Refine read and write tapers through the design
schema. A design whose taper runs into a meeting is reported back to the model as a fault. Refine keeps tapers instead
of refusing them.

**Architecture:**
- **One world↔part taper module, `document/taperWorld.ts`.** It holds `Dir`, `WorldTaper`, `dirToLocal`/`localToDir`
  (through invariant 44's helpers), the reader `worldTapers` (stored cuts → design form, or null when a cut is not in
  standard form) and the writer `taperCutsFor` (design form → stored cuts in canonical order, or the first rule broken).
  `convertPart` (Generate), `documentToDesign` (Refine), `designDiff` and the fault message all go through it.
- **The design fault.** It is `taperJointViolations` (`designCheck.ts`, model-facing words), fed by chunk 1's
  `taperConflicts` through `taperFaults` (`generate/joints/tapers.ts`). It is added in `evaluateDesign` only.
- **Joined Refine.** It gains one up-front refusal and one handled outcome: `notJoined`.

**Tech Stack:** TypeScript, Vitest, React (RefineDialog only).

**Spec:** `docs/superpowers/specs/2026-10-13-sloyd-ai-tapers-design.md`, §2, §5, §6 and §7 chunk 2. Read it first,
including the passages marked *amended while planning chunk 2*. Also read CLAUDE.md invariants 36, 37, 41, 44, 45 and 48.

## Global Constraints

- **No schema change.** No document schema change; `CURRENT_VERSION` stays 14. Only `DESIGN_SCHEMA` changes.
- **Layer rule.** `generate` imports only `document` and `llm`. `document` imports `units` only where it builds a string
  a person reads: `designDiff.ts` and `angledRefusal.ts` already do. Model-facing strings (`designCheck.ts`,
  `taperWorld.ts`) do NOT import `units`; they print plain decimal inches (`22.4375in`).
- **Invariant 44.** Every world↔part crossing goes through `geometry.ts` helpers (`axisDimensions`, `endFacing`,
  `toWorldOffset`). Never write `board[dim] - u` at a call site.
- **Stored form.** A generated taper is stored exactly as Properties stores one, through `taperCut`
  (`kind: 'taper'`, `points: [[0, amount], [start, 0]]`, `along: 'length'`).
- **Strict schema.** `DESIGN_SCHEMA` is sent as strict structured output, so `tapers` is in `required` and every
  untapered part sends `[]`. `parseDesign` refuses a part without `tapers`. The TypeScript `GeneratedPart.tapers` is
  optional (as `role` is), so hand-built fixtures that never pass through `parseDesign` stay terse.
- **No call or mutation before a refusal.** Every refusal is decided before any LLM call or mutation (invariant 41).
  Tests of callers assert call counts and the unchanged document, never message text. Only a message builder's own unit
  test asserts text.
- **Typecheck.** `npm run build` is the typecheck gate; `npm test` does not typecheck.
- **Mutate every plan-supplied test once.** Break the code it guards, see it fail, restore it, before trusting the test.
  The plan's code has been wrong before (CLAUDE.md, working agreements). When a plan expectation looks wrong, fix the
  code if it is the code; if the expectation itself is wrong, say so in your report. Never bend the code to a wrong
  expectation.
- **SYSTEM_PROMPT is a fixed prefix.** Nothing per-run goes into it.

## Rulings made while planning (surface these to the user with the plan)

1. **Spec §5.4(b) was false: the joined re-join *can* refuse.** The repair loop returns its best attempt even with a
   `taper-joint` fault left. Two changes follow:
   - `runRefine` returns the refined design unjoined, with `JointsSummary.notJoined`, instead of throwing.
   - A joined original whose own taper already runs into a joint is refused up front.

   Spec §5.3 and §5.4 are amended.
2. **Refine's `preexisting` includes the original's taper conflicts.** Without this, a taper the person drew is pushed
   at the model every round. Spec §5.3 is amended.
3. **The fault's advice is floored to 1/16 (`SNAP_INCHES`).** `convertPart` snaps `start`, so advice like "22.47" would
   snap to 22.5 and conflict again. Spec §5.3 is amended.
4. **"Leaves no wood" includes one taper reaching the full dimension.** This is stricter than Properties by one knife
   edge. Spec §2.2 is amended.
5. **The fault reads "where it meets X (a joint goes there)".** A prototype has no joints yet; the model meets this
   wording before joinery ever runs.
6. **A rejected taper rejects its whole part.** This is the spec's §2.2 "rejected the way an unconvertible part is". The
   message names the rule, so the model repairs it. Rejected violations keep kind `'too-small'`, as every rejection does
   today.

## Review Focus

1. **A square-section leg (width === thickness).** `orient` breaks the tie by axis index, so which dimension gets
   "width" depends on the world axes. A world face must still land on the right stored face. Test in Task 1 (all
   postures × all four turns, plus a 1.75 × 28 × 1.75 upright leg) and Task 4 (round trip).
2. **A Refine input whose encoding `orient` would not produce** (rotation 180/270, on-edge). Refine re-encodes through
   `orient` (0/90 only), so the stored fields legitimately differ. The WORLD taper must not differ. Task 4 asserts world
   equality for every pose, and stored equality only for poses `orient` itself produces.
3. **A model that never fixes a conflict on a joined Refine.** It must give a saved result with a note, never a thrown
   error. Task 5 pins this with a fake model returning the conflicting design on all four calls.
4. **Advice the model follows exactly.** Following it must pass. Task 3: a meeting at 22.47 gives the advice `22.4375`,
   and converting a design with `start: 22.4375` passes `taperConflicts`.
5. **Untapered regressions.** Every existing Generate/Refine/joinery suite must stay green, with only the mechanical
   `tapers: []` fixture sweep of Task 2. A design with no tapers must convert byte-for-byte as before
   (`angleCuts: []`).

---

### Task 1: `taperWorld.ts` — world directions ↔ stored tapers

**Files:**
- Create: `src/document/taperWorld.ts`
- Test: `src/document/taperWorld.test.ts` (create)

**Interfaces:**
- Consumes:
  - `axisDimensions`, `endFacing`, `toWorldOffset`, `DIMENSION_ORDER` from `geometry.ts`.
  - `taperCut`, `depthAt`, `TaperFields` from `angleCuts.ts`.
  - `AngleCut`, `Board`, `CutFrom`, `Dimension` from `types.ts`.
- Produces:
  - `export type Dir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'`
  - `export const DIRS: readonly Dir[]`
  - `export interface WorldTaper { faces: Dir[]; toward: Dir; start: number; amount: number }`
  - `export function dirToLocal(b: Board, d: Dir): { dim: Dimension; from: CutFrom }`
  - `export function localToDir(b: Board, dim: Dimension, from: CutFrom): Dir`
  - `export function isStandardTaper(c: AngleCut): boolean`
  - `export function worldTapers(b: Board): WorldTaper[] | null`
  - `export function taperCutsFor(b: Board, tapers: readonly WorldTaper[]): { cuts: Omit<AngleCut, 'id'>[] } | { fault: string }`

- [ ] **Step 1: Write the failing tests**

Create `src/document/taperWorld.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { Board, Posture, Rotation } from './document';
import { taperCut } from './angleCuts';
import { axisDimensions, toWorldOffset } from './geometry';
import { DIRS, dirToLocal, isStandardTaper, localToDir, taperCutsFor, worldTapers } from './taperWorld';
import type { WorldTaper } from './taperWorld';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const poses = (size: Partial<Board>) => POSTURES.flatMap((posture) => TURNS.map((rotation) => createBoard({ ...size, posture, rotation })));

describe('dirToLocal / localToDir (invariant 44)', () => {
  for (const b of [...poses({ length: 20, width: 3, thickness: 1.5 }), ...poses({ length: 28, width: 1.75, thickness: 1.75 })]) {
    it(`${b.posture} ${b.rotation} ${b.width}x${b.thickness}: every world face maps to the stored face that lies there`, () => {
      for (const d of DIRS) {
        const { dim, from } = dirToLocal(b, d);
        expect(localToDir(b, dim, from)).toBe(d);
        // The meaning, not just the involution: the local face `from` sits at the world side `d` names.
        const axis = 'xyz'.indexOf(d[1]!);
        expect(axisDimensions(b)[axis]).toBe(dim);
        const w = toWorldOffset(b, axis, from === 'min' ? 0 : b[dim]);
        expect(w).toBe(d[0] === '-' ? 0 : b[dim]);
      }
    });
  }
});

const leg = () => createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', rotation: 0 });
const lengthAxisDir = (b: Board, sign: '-' | '+') => `${sign}${'xyz'[axisDimensions(b).indexOf('length')]}` as WorldTaper['toward'];

describe('taperCutsFor', () => {
  it('writes one taperCut per face, in canonical order, whatever order the faces came in', () => {
    const b = leg();
    const a = taperCutsFor(b, [{ faces: ['+z', '+x'], toward: '-y', start: 22, amount: 0.5 }]);
    const c = taperCutsFor(b, [{ faces: ['+x', '+z'], toward: '-y', start: 22, amount: 0.5 }]);
    expect(a).toEqual(c);
    if (!('cuts' in a)) throw new Error(a.fault);
    expect(a.cuts).toHaveLength(2);
    for (const cut of a.cuts) {
      expect(cut).toEqual(taperCut({ face: cut.face as 'width' | 'thickness', from: cut.from, end: dirToLocal(b, '-y').from, start: 22, amount: 0.5 }));
    }
  });
  it('refuses a taper not along the length', () => {
    expect('fault' in taperCutsFor(leg(), [{ faces: ['+z'], toward: '-x', start: 1, amount: 0.25 }])).toBe(true);
  });
  it('refuses no faces, five faces, a repeated face, and an end face', () => {
    const b = leg();
    const t = (faces: WorldTaper['faces']) => taperCutsFor(b, [{ faces, toward: '-y', start: 20, amount: 0.25 }]);
    expect('fault' in t([])).toBe(true);
    expect('fault' in t(['+x', '-x', '+z', '-z', '+x'])).toBe(true);
    expect('fault' in t(['+x', '+x'])).toBe(true);
    expect('fault' in t(['+y'])).toBe(true);
    expect('fault' in t(['-y'])).toBe(true);
    expect('cuts' in t(['+x', '-x', '+z', '-z'])).toBe(true);
  });
  it('refuses a start outside (0, length] and an amount not above 0', () => {
    const b = leg();
    const t = (start: number, amount: number) => taperCutsFor(b, [{ faces: ['+x'], toward: '-y', start, amount }]);
    expect('fault' in t(0, 0.25)).toBe(true);
    expect('fault' in t(28.0625, 0.25)).toBe(true);
    expect('cuts' in t(28, 0.25)).toBe(true);
    expect('fault' in t(20, 0)).toBe(true);
    expect('fault' in t(20, -0.25)).toBe(true);
  });
  it('refuses tapers that leave no wood at an end, alone or with the opposite face', () => {
    const b = leg();
    expect('fault' in taperCutsFor(b, [{ faces: ['+x'], toward: '-y', start: 20, amount: 1.75 }])).toBe(true);
    expect('cuts' in taperCutsFor(b, [{ faces: ['+x'], toward: '-y', start: 20, amount: 1.6875 }])).toBe(true);
    expect('fault' in taperCutsFor(b, [{ faces: ['+x', '-x'], toward: '-y', start: 20, amount: 0.875 }])).toBe(true);
    expect('cuts' in taperCutsFor(b, [{ faces: ['+x', '-x'], toward: '-y', start: 20, amount: 0.8125 }])).toBe(true);
    // Opposite faces tapered toward OPPOSITE ends never stack at one end.
    expect('cuts' in taperCutsFor(b, [
      { faces: ['+x'], toward: '-y', start: 10, amount: 1 }, { faces: ['-x'], toward: '+y', start: 10, amount: 1 },
    ])).toBe(true);
  });
});

describe('worldTapers', () => {
  const withCuts = (b: Board, t: WorldTaper[]) => {
    const r = taperCutsFor(b, t);
    if (!('cuts' in r)) throw new Error(r.fault);
    return { ...b, angleCuts: r.cuts.map((c, i) => ({ id: `a${i}`, ...c })) };
  };
  it('reads back what taperCutsFor wrote, faces merged and in DIRS order, in every pose', () => {
    for (const b of poses({ length: 20, width: 3, thickness: 1.5 })) {
      const toward = lengthAxisDir(b, '-');
      const sides = DIRS.filter((d) => d[1] !== toward[1]);
      const t: WorldTaper[] = [{ faces: [sides[2]!, sides[0]!], toward, start: 12, amount: 0.5 }, { faces: [sides[1]!], toward, start: 12, amount: 0.25 }];
      expect(worldTapers(withCuts(b, t))).toEqual([
        { faces: [sides[0]!, sides[2]!], toward, start: 12, amount: 0.5 },
        { faces: [sides[1]!], toward, start: 12, amount: 0.25 },
      ].sort((x, y) => x.amount - y.amount));
    }
  });
  it('is exact for a float-hostile number (spec §5.1: no zeroStation)', () => {
    const b = withCuts(leg(), [{ faces: ['+x'], toward: '-y', start: 0.1 * 3, amount: 0.1 }]);
    expect(worldTapers(b)).toEqual([{ faces: ['+x'], toward: '-y', start: 0.1 * 3, amount: 0.1 }]);
  });
  it('returns [] for an untapered part and null for a taper not in standard form', () => {
    expect(worldTapers(leg())).toEqual([]);
    const odd = { ...leg(), angleCuts: [{ id: 'a', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0], [20, 0.5]] as [[number, number], [number, number]] }] };
    expect(isStandardTaper(odd.angleCuts[0]!)).toBe(false);
    expect(worldTapers(odd)).toBeNull();
  });
});
```

The `.sort` in the first `worldTapers` test reflects the canonical group order: by `toward`, then `start`, then
`amount`. If your implementation's documented order differs, change the expectation to state that order explicitly,
and say so in your report.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/taperWorld.test.ts`
Expected: FAIL, "Cannot find module './taperWorld'".

- [ ] **Step 3: Implement**

Create `src/document/taperWorld.ts`:

```ts
import type { AngleCut, Board, CutFrom, Dimension } from './types';
import { DIMENSION_ORDER, axisDimensions, endFacing } from './geometry';
import { depthAt, taperCut } from './angleCuts';

/**
 * Tapers in WORLD words (AI-tapers spec §2): the design schema's form. A face is
 * the world side it lies on; `toward` is the end that gets thinner. The ONE place
 * a design taper crosses to a stored one and back, through invariant 44's helpers.
 * Model-facing text only (no `→ units` edge).
 */
export type Dir = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export const DIRS: readonly Dir[] = ['+x', '-x', '+y', '-y', '+z', '-z'];
export interface WorldTaper { faces: Dir[]; toward: Dir; start: number; amount: number }

const AXES = 'xyz';
const axisOf = (d: Dir) => AXES.indexOf(d[1]!);
const rank = (d: Dir) => DIRS.indexOf(d);
const fromRank = (f: CutFrom) => (f === 'min' ? 0 : 1);

/** The stored face (dimension and side) lying on world side `d`. */
export function dirToLocal(b: Board, d: Dir): { dim: Dimension; from: CutFrom } {
  const axis = axisOf(d);
  return { dim: axisDimensions(b)[axis]!, from: endFacing(b, axis, d[0] === '-' ? -1 : 1) };
}

/** The exact inverse of dirToLocal. */
export function localToDir(b: Board, dim: Dimension, from: CutFrom): Dir {
  const axis = axisDimensions(b).indexOf(dim);
  return `${endFacing(b, axis, -1) === from ? '-' : '+'}${AXES[axis]}` as Dir;
}

/**
 * A taper as `taperCut` writes it (spec §5.1): along the length, full depth at station
 * 0, zero at `start`. Recognised STRUCTURALLY, so its numbers read back exactly.
 */
export function isStandardTaper(c: AngleCut): boolean {
  const [[s0, q0], [s1, q1]] = c.points;
  return c.kind === 'taper' && c.along === 'length' && c.face !== 'length' && s0 === 0 && q1 === 0 &&
    Number.isFinite(q0) && q0 > 0 && Number.isFinite(s1) && s1 > 0;
}

/**
 * A part's tapers in design form: tapers sharing `toward`, `start` and `amount` merged into
 * one entry, faces in DIRS order, entries by `toward`, `start`, `amount`. Null when any taper
 * is not in standard form (Refine refuses those, spec §5.2). Other angle-cut kinds are not
 * read: every caller has refused them already.
 */
export function worldTapers(b: Board): WorldTaper[] | null {
  const out: WorldTaper[] = [];
  for (const c of b.angleCuts) {
    if (c.kind !== 'taper') continue;
    if (!isStandardTaper(c)) return null;
    const face = localToDir(b, c.face, c.from);
    const toward = localToDir(b, 'length', c.alongFrom);
    const start = c.points[1][0];
    const amount = c.points[0][1];
    const hit = out.find((t) => t.toward === toward && t.start === start && t.amount === amount);
    if (!hit) out.push({ faces: [face], toward, start, amount });
    else if (!hit.faces.includes(face)) hit.faces.push(face);
  }
  for (const t of out) t.faces.sort((x, y) => rank(x) - rank(y));
  return out.sort((x, y) => rank(x.toward) - rank(y.toward) || x.start - y.start || x.amount - y.amount);
}

/**
 * Design tapers → stored cuts on `b` (oriented; numbers already snapped), one `taperCut`
 * per face, in ONE canonical order (spec §2.1: `sameShared` compares angle cuts by index).
 * Or the first rule broken (spec §2.2), as a phrase the caller prefixes with the part's
 * name: "has a taper toward -x, …".
 */
export function taperCutsFor(b: Board, tapers: readonly WorldTaper[]): { cuts: Omit<AngleCut, 'id'>[] } | { fault: string } {
  const L = AXES[axisDimensions(b).indexOf('length')]!.toUpperCase();
  const cuts: Omit<AngleCut, 'id'>[] = [];
  for (const t of tapers) {
    const end = dirToLocal(b, t.toward);
    if (end.dim !== 'length') return { fault: `has a taper toward ${t.toward}, which is not along its length (${L}); a taper runs along a part's longest side` };
    if (t.faces.length === 0) return { fault: `has a taper toward ${t.toward} with no faces` };
    if (t.faces.length > 4) return { fault: `has a taper toward ${t.toward} with more than 4 faces` };
    if (new Set(t.faces).size !== t.faces.length) return { fault: `has a taper toward ${t.toward} that names a face twice` };
    const bad = t.faces.find((f) => dirToLocal(b, f).dim === 'length');
    if (bad) return { fault: `has a taper face ${bad}, which is an end of the part; taper faces are its sides` };
    if (!(t.start > 0 && t.start <= b.length)) return { fault: `has a taper toward ${t.toward} whose start (${t.start}in) is not above 0 and at most its length (${b.length}in)` };
    if (!(t.amount > 0)) return { fault: `has a taper toward ${t.toward} whose amount (${t.amount}in) is not above 0` };
    for (const f of t.faces) {
      const l = dirToLocal(b, f);
      cuts.push(taperCut({ face: l.dim as 'width' | 'thickness', from: l.from, end: end.from, start: t.start, amount: t.amount }));
    }
  }
  // Wood left at each END of the length, across each side dimension: the deepest cut on the
  // min face plus the deepest on the max face (cuts on one face overlap, they do not stack).
  // Depths are linear in station and clamped at 0, so the ends are where the sum is largest.
  for (const dim of ['width', 'thickness'] as const) {
    for (const at of ['min', 'max'] as const) {
      const station = (c: Omit<AngleCut, 'id'>) => (c.alongFrom === at ? 0 : b.length);
      const deepest = (from: CutFrom) => Math.max(0, ...cuts.filter((c) => c.face === dim && c.from === from).map((c) => depthAt(c, station(c))));
      if (deepest('min') + deepest('max') >= b[dim]) {
        return { fault: `has tapers that leave no wood across its ${localToDir(b, dim, 'min')[1]!.toUpperCase()} at its ${localToDir(b, 'length', at)} end` };
      }
    }
  }
  cuts.sort((x, y) => DIMENSION_ORDER.indexOf(x.face) - DIMENSION_ORDER.indexOf(y.face) || fromRank(x.from) - fromRank(y.from) ||
    fromRank(x.alongFrom) - fromRank(y.alongFrom) || x.points[1][0] - y.points[1][0] || x.points[0][1] - y.points[0][1]);
  return { cuts };
}
```

`depthAt(c, s)` is the line's depth at station `s` from `alongFrom`. For a standard taper it is `amount` at 0 and
negative past `start`, which the clamp absorbs. Check its signature in `angleCuts.ts` (`Pick<AngleCut, 'points'>`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/document/taperWorld.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutate**

Make each of these changes in turn, check that a test fails, and restore:
- Flip `-1 : 1` in `dirToLocal`.
- Drop the `cuts.sort`.
- Change `>=` to `>` in the wood-left check.
- Read `start` through `zeroStation` instead of `points[1][0]`.

- [ ] **Step 6: Commit**

```bash
git add src/document/taperWorld.ts src/document/taperWorld.test.ts
git commit -m "feat(document): taperWorld — design tapers in world directions, to and from stored taperCuts"
```

---

### Task 2: the design schema, `parseDesign` and `convertPart` take tapers

**Files:**
- Modify: `src/document/generated.ts`:
  - `partSchema`
  - `GeneratedPart`
  - `RejectedPart`
  - `isPart`
  - `partOf`
  - `convertPart`
- Modify: `src/document/designCheck.ts` (`rejectedViolations`, ~line 408)
- Modify: `src/document/refineDesign.ts` (`designValues`, and `box` emits `tapers: []` for now; Task 4 fills it)
- Test: `src/document/generated.test.ts` (extend). Fixture sweep across the test files whose JSON reaches
  `parseDesign` (see Step 5).

**Interfaces:**
- Consumes: Task 1's `DIRS`, `WorldTaper`, `taperCutsFor`.
- Produces:
  - `GeneratedPart.tapers?: WorldTaper[]`.
  - `RejectedPart { name; reason: 'not-finite' | 'too-small' | 'unplaced' | 'empty' | 'taper'; detail?: string }`.
  - `DESIGN_SCHEMA` part items require `tapers`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/generated.test.ts`. Add imports as needed: `parseDesign`, `designToDocument`, `DESIGN_SCHEMA`
from `./generated`; `worldTapers` from `./taperWorld`; `rejectedViolations` from `./designCheck`.

```ts
describe('tapers in the design (AI-tapers spec §2)', () => {
  const legPart = (tapers: unknown) => ({ name: 'Leg', role: 'leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, tapers });
  const json = (tapers: unknown) => ({ name: 'T', parts: [legPart(tapers)], assemblies: [] });

  it('the schema requires tapers on every part, with Dir enums', () => {
    const part = (DESIGN_SCHEMA.properties as any).parts.items;
    expect(part.required).toContain('tapers');
    expect(part.properties.tapers.items.properties.toward.enum).toEqual(['+x', '-x', '+y', '-y', '+z', '-z']);
    expect(part.properties.tapers.items.required).toEqual(['faces', 'toward', 'start', 'amount']);
  });
  it('parseDesign refuses a part without tapers or with a malformed one, and copies only schema fields', () => {
    expect(parseDesign({ name: 'T', parts: [{ ...legPart([]), tapers: undefined }], assemblies: [] })).toBeNull();
    expect(parseDesign(json([{ faces: ['up'], toward: '-y', start: 1, amount: 1 }]))).toBeNull();
    expect(parseDesign(json([{ faces: ['+x'], toward: '-y', start: '1', amount: 1 }]))).toBeNull();
    const ok = parseDesign(json([{ faces: ['+x'], toward: '-y', start: 22, amount: 0.5, extra: 1 }]))!;
    expect(ok.parts[0]!.tapers).toEqual([{ faces: ['+x'], toward: '-y', start: 22, amount: 0.5 }]);
  });
  it('converts a tapered leg to stored tapers that read back in world words', () => {
    const { doc, rejected } = designToDocument(parseDesign(json([{ faces: ['+z', '+x'], toward: '-y', start: 22, amount: 0.5 }]))!);
    expect(rejected).toEqual([]);
    const leg = doc.boards[0]!;
    expect(leg.angleCuts.every((c) => c.kind === 'taper')).toBe(true);
    expect(worldTapers(leg)).toEqual([{ faces: ['+x', '+z'], toward: '-y', start: 22, amount: 0.5 }]);
  });
  it('snaps start and amount like size, unless exact', () => {
    const d = parseDesign(json([{ faces: ['+x'], toward: '-y', start: 22.03, amount: 0.51 }]))!;
    expect(worldTapers(designToDocument(d).doc.boards[0]!)).toEqual([{ faces: ['+x'], toward: '-y', start: 22, amount: 0.5 }]);
    const kept = designToDocument(d, { exact: new Set([22.03, 0.51]) }).doc.boards[0]!;
    expect(worldTapers(kept)).toEqual([{ faces: ['+x'], toward: '-y', start: 22.03, amount: 0.51 }]);
  });
  it('rejects the part on a broken taper rule, naming the part and the rule', () => {
    const { doc, rejected } = designToDocument(parseDesign(json([{ faces: ['+z'], toward: '-x', start: 1, amount: 0.25 }]))!);
    expect(doc.boards).toEqual([]);
    expect(rejected).toEqual([{ name: 'Leg', reason: 'taper', detail: expect.stringContaining('Leg has a taper toward -x') }]);
    expect(rejectedViolations(rejected)[0]!.message).toBe(rejected[0]!.detail);
  });
  it('rejects a non-finite taper number as not-finite', () => {
    const { rejected } = designToDocument({ name: 'T', parts: [legPart([{ faces: ['+x'], toward: '-y', start: Infinity, amount: 0.5 }]) as never] });
    expect(rejected.map((r) => r.reason)).toEqual(['not-finite']);
  });
  it('an untapered part converts exactly as before (angleCuts: [])', () => {
    expect(designToDocument(parseDesign(json([]))!).doc.boards[0]!.angleCuts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/generated.test.ts`
Expected: the new tests FAIL. Either `tapers` is not in the schema, or `parseDesign` drops it.

- [ ] **Step 3: Implement**

In `src/document/generated.ts`:

1. Imports: `import { DIRS, taperCutsFor } from './taperWorld';` and `import type { WorldTaper } from './taperWorld';`.
2. `GeneratedPart` gains `tapers?: WorldTaper[];`, with a doc line: required from the model (parseDesign checks it),
   optional here like `role`.
3. `RejectedPart`:
   `export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' | 'unplaced' | 'empty' | 'taper'; detail?: string }`
   with a doc line: `detail` is the whole message, set for `'taper'`.
4. The schema:

```ts
const dirSchema = { type: 'string', enum: [...DIRS] };
/** One taper in world words (AI-tapers spec §2): the faces that slope, the end that gets thinner, where it starts
 *  (from that end) and how much it removes there. Counts and duplicates are the converter's to check. */
const taperSchema = {
  type: 'object',
  properties: { faces: { type: 'array', items: dirSchema }, toward: dirSchema, start: { type: 'number' }, amount: { type: 'number' } },
  required: ['faces', 'toward', 'start', 'amount'],
  additionalProperties: false,
};
```

   Add `tapers: { type: 'array', items: taperSchema }` to `partSchema.properties`, and `'tapers'` to its `required`.
5. Shape checks:

```ts
const isDir = (v: unknown) => (DIRS as readonly unknown[]).includes(v);
const isTaper = (t: unknown): boolean =>
  isObj(t) && Array.isArray(t.faces) && t.faces.every(isDir) && isDir(t.toward) && typeof t.start === 'number' && typeof t.amount === 'number';
```

   `isPart` adds `&& Array.isArray(p.tapers) && p.tapers.every(isTaper)`. `partOf` adds
   `tapers: (p.tapers ?? []).map((t) => ({ faces: [...t.faces], toward: t.toward, start: t.start, amount: t.amount }))`.
6. `convertPart`, after the `too-small` check:

```ts
  const fields = { name: clean(p.name), material: p.material, grain: isGrain(p.grain) ? p.grain : 'length', cuts: [], position: [ax, ay, az] as Vec, ...orient([sx, sy, sz]) };
  // Tapers (spec §2.1): numbers snapped as size is, unless exact; checked after the snap; mapped through taperWorld.
  const tapers = (p.tapers ?? []).map((t) => ({ ...t, start: exact?.has(t.start) ? t.start : snap(t.start), amount: exact?.has(t.amount) ? t.amount : snap(t.amount) }));
  if (!tapers.every((t) => usable(t.start) && usable(t.amount))) {
    rejected.push({ name: label, reason: 'not-finite' });
    return null;
  }
  const made = taperCutsFor({ id: '', angleCuts: [], ...fields } as Board, tapers);
  if ('fault' in made) {
    rejected.push({ name: label, reason: 'taper', detail: `${label} ${made.fault}.` });
    return null;
  }
  return { ...fields, angleCuts: made.cuts.map((c) => ({ id: nextId(), ...c })) };
```

   This replaces the old `return { name: …, angleCuts: [], … }`. Keep the object's field set identical for an
   untapered part (`angleCuts: []`).

In `src/document/designCheck.ts` `rejectedViolations`:

```ts
  const say: Record<RejectedPart['reason'], (n: string) => string> = {
    // … the four existing entries unchanged …
    taper: (n) => `${n} has a taper that cannot be built.`,
  };
  return rejected.map((r) => ({ kind: 'too-small' as const, message: r.detail ?? say[r.reason](r.name), parts: [r.name] }));
```

In `src/document/refineDesign.ts`:
- `box` adds `tapers: []`. Task 4 replaces it with the real reading; the field must be present now so `refineMessage`
  sends the format the model returns.
- `designValues` adds each part's taper numbers:

```ts
  const addTapers = (p: GeneratedPart) => { for (const t of p.tapers ?? []) { out.add(t.start); out.add(t.amount); } };
```

  Call it for loose parts and assembly parts.

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run src/document/generated.test.ts`
Expected: PASS.

- [ ] **Step 5: The fixture sweep**

Run: `npm test 2>&1 | tail -40`. Every test whose fake model returns design JSON without `tapers` now fails, because
`parseDesign` returns null and the run goes `RunFailed` or `retrying`. Find them with
`grep -rln "parseDesign\|runGeneration\|runRefine\|fakeClient" src --include=*.test.ts --include=*.test.tsx`.

Add `tapers: []` to each design-JSON part builder: the `p()` helper in `run.test.ts`, the `GOOD`/`ONE_ISSUE` constants,
and their counterparts in `useGenerations.test.tsx`, `useRefine.test.tsx`, `App.test.tsx`, `refine.test.ts` and
`refineBase.test.ts`. Prefer fixing a shared helper over editing every literal.

Do NOT add `tapers` to fixtures that call `designToDocument` directly with TypeScript objects (it is optional there).
Tests asserting `documentToDesign`'s output with `toEqual` (`refineDesign.test.ts`, `designDiff.test.ts`) gain
`tapers: []` per part.

**The sweep is mechanical: change only fixtures, never an assertion's meaning.** If a failure is not explained by a
missing `tapers: []`, stop and report it.

- [ ] **Step 6: Full suite and typecheck**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all green; build clean.

- [ ] **Step 7: Mutate**

Make each of these changes in turn, check that a test fails, and restore:
- Drop `'tapers'` from `required`.
- Drop the `exact?.has(t.start)` clause.
- Make `isPart` skip the `tapers` check.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(generate): the design schema carries tapers in world words; convertPart stores them through taperCut"
```

---

### Task 3: the taper-joint design fault in `evaluateDesign`

**Files:**
- Modify: `src/document/designCheck.ts`:
  - `ViolationKind` gains `'taper-joint'`.
  - Add `taperJointViolations`.
- Modify: `src/generate/joints/tapers.ts` (add `taperFaults`)
- Modify: `src/generate/run.ts`:
  - `evaluateDesign`: `raw` includes `taperFaults(flat)`.
  - `runRefine`: `preexisting` includes the original's.
- Test: `src/generate/joints/tapers.test.ts` (extend), `src/generate/run.test.ts` (extend)

**Interfaces:**
- Consumes:
  - `taperConflicts(flat, sites)` and `TaperConflict` (chunk 1).
  - `findSites`.
  - Task 1's `localToDir`.
  - Task 2's `tapers` in designs.
- Produces:
  - `export function taperJointViolations(flat: FlatDocument, conflicts: readonly TaperConflict[]): Violation[]` (designCheck.ts)
  - `export function taperFaults(flat: FlatDocument): Violation[]` (tapers.ts)

- [ ] **Step 1: Write the failing tests**

Append to `src/generate/joints/tapers.test.ts`, reusing its imports. Add `designToDocument` and `parseDesign` from
`../../document/generated`, `flatDocument` from `../../document/document`, and `taperFaults` from `./tapers`.

```ts
describe('taperFaults — the fault on designs (spec §5.3)', () => {
  const part = (name: string, at: number[], size: number[], tapers: unknown[] = []) =>
    ({ name, role: '', material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] }, tapers });
  const corner = (start: number, railY = 23.5) => flatDocument(designToDocument(parseDesign({ name: 'T', assemblies: [], parts: [
    part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x', '+z'], toward: '-y', start, amount: 0.375 }]),
    part('Rail X', [1.75, railY, 0.5], [18, 3, 0.75]),
  ] })!).doc);

  it('reports one taper-joint fault naming both parts, in world words', () => {
    const v = taperFaults(corner(24));
    expect(v).toHaveLength(1);
    expect(v[0]!.kind).toBe('taper-joint');
    expect([...v[0]!.parts].sort()).toEqual(['Leg', 'Rail X']);
    expect(v[0]!.message).toBe("Leg's taper toward -y runs into where it meets Rail X (a joint goes there) — start it 23.5in or less from its -y end, or remove it.");
  });
  it('allows start exactly at the meeting', () => {
    expect(taperFaults(corner(23.5))).toEqual([]);
  });
  it('floors the advice to 1/16, and following it passes (fu: snapped start)', () => {
    // The rail sits at 22.47: exact in the design (no snap) so the meeting is off-grid.
    const at = 22.47;
    const flat = flatDocument(designToDocument(parseDesign({ name: 'T', assemblies: [], parts: [
      part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 24, amount: 0.375 }]),
      part('Rail X', [1.75, at, 0.5], [18, 3, 0.75]),
    ] })!, { exact: new Set([at]) }).doc);
    const [v] = taperFaults(flat);
    expect(v!.message).toContain('start it 22.4375in or less');
    const fixed = flatDocument(designToDocument(parseDesign({ name: 'T', assemblies: [], parts: [
      part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 22.4375, amount: 0.375 }]),
      part('Rail X', [1.75, at, 0.5], [18, 3, 0.75]),
    ] })!, { exact: new Set([at]) }).doc);
    expect(taperFaults(fixed)).toEqual([]);
  });
  it('a meeting at the thin end advises tapering the other end', () => {
    const flat = flatDocument(designToDocument(parseDesign({ name: 'T', assemblies: [], parts: [
      part('Leg', [0, 1, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 10, amount: 0.375 }]),
      part('Foot', [-1, 0, -1], [4, 1, 4]),
    ] })!).doc);
    expect(taperFaults(flat)[0]!.message).toBe("Leg's taper toward -y runs to its -y end, where it meets Foot (a joint goes there) — taper the other end, or remove the taper.");
  });
});
```

Append to `src/generate/run.test.ts`, near its other `runGeneration` tests and reusing its `fakeClient` and `p()`
helpers:

```ts
describe('runGeneration — the taper-joint fault (AI-tapers spec §5.3)', () => {
  const leg = (start: number) => ({ name: 'Leg', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 },
    tapers: [{ faces: ['+x', '+z'], toward: '-y', start, amount: 0.375 }] });
  const rail = { name: 'Rail', role: '', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 }, tapers: [] };
  const post = { name: 'Post', role: '', material: 'oak', at: { x: 19.75, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, tapers: [] };
  const design = (start: number) => ({ name: 'T', parts: [leg(start), rail, post], assemblies: [] });

  it('reports the fault, sends it back, and keeps the repaired design', async () => {
    // No call count: this two-legged fixture may also trip the tip check, which drives its own repair rounds.
    const { client, seen } = fakeClient([design(24), design(22)]);
    const out = await runGeneration(client, SETTINGS, new AbortController().signal, () => {});
    expect(seen[1]).toContain("Leg's taper toward -y");
    expect(out.violations.filter((v) => v.kind === 'taper-joint')).toEqual([]);
  });
  it('checkDesign itself never emits the fault (joinery gate unchanged)', () => {
    // evaluateDesign adds it; checkDesign stays the joinery gate (spec §5.3).
    const flat = flatDocument(designToDocument(parseDesign(design(24))!).doc);
    expect(checkDesign(flat, { width: null, depth: null, height: null, maxParts: 10 }).some((v) => v.kind === ('taper-joint' as never))).toBe(false);
  });
});
```

Adapt `SETTINGS` and `seen` to what `run.test.ts` already defines: `seen` holds what each call was sent. Read the file's
`fakeClient` before writing. If `seen` records whole requests, assert on the second request's last user turn instead.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/generate/joints/tapers.test.ts src/generate/run.test.ts`
Expected: FAIL, because `taperFaults` is not exported.

- [ ] **Step 3: Implement**

In `src/document/designCheck.ts`:

```ts
// imports
import type { TaperConflict } from './angledRefusal';
import { SNAP_INCHES } from './geometry';   // merge into the existing geometry import
import { localToDir } from './taperWorld';

export type ViolationKind = 'too-small' | 'overlap' | 'unsupported' | 'too-large' | 'too-many-parts' | 'hangs' | 'tips' | 'taper-joint';

/**
 * The taper-at-joint rule as a DESIGN fault (AI-tapers spec §5.3), for the model: world words,
 * plain decimal inches. The advice is a LIMIT floored to SNAP_INCHES — the converter snaps the
 * model's `start` to 1/16, so advice off that grid would snap past the meeting and conflict again.
 * Multiples of 1/16 print exactly. Not part of checkDesign (joinery's gate); evaluateDesign adds it.
 */
export function taperJointViolations(flat: FlatDocument, conflicts: readonly TaperConflict[]): Violation[] {
  return conflicts.map(({ part, other, end, nearest }) => {
    const b = flat.boards[part]!;
    const o = flat.boards[other]!;
    const dir = localToDir(b, 'length', end);
    const limit = Math.floor(nearest / SNAP_INCHES + 1e-9) * SNAP_INCHES;
    const message = limit === 0
      ? `${b.name}'s taper toward ${dir} runs to its ${dir} end, where it meets ${o.name} (a joint goes there) — taper the other end, or remove the taper.`
      : `${b.name}'s taper toward ${dir} runs into where it meets ${o.name} (a joint goes there) — start it ${limit}in or less from its ${dir} end, or remove it.`;
    return { kind: 'taper-joint' as const, message, parts: [b.name, o.name] };
  });
}
```

Check for an import cycle: `taperWorld.ts` imports `angleCuts`, `geometry` and `types` only. `angledRefusal.ts`
imports `tree` and `angleText`. Type-only imports are fine.

In `src/generate/joints/tapers.ts`:

```ts
import { taperJointViolations } from '../../document/designCheck';
import type { Violation } from '../../document/designCheck';

/** The taper-at-joint rule on a DESIGN (spec §5.3): every conflict as a `taper-joint` fault, for evaluateDesign and Refine's preexisting set. */
export function taperFaults(flat: FlatDocument): Violation[] {
  return taperJointViolations(flat, taperConflicts(flat, findSites(flat)));
}
```

In `src/generate/run.ts`:
- Import `taperFaults` beside `joineryRefusal`.
- In `evaluateDesign`:
  `const raw = [...checkDesign(flat, limitsOf(s)), ...taperFaults(flat)];`
- In `runRefine`, replace the `preexisting` line:

```ts
  // The original's own taper conflicts are preexisting too (spec §5.3, amended): a taper the person drew is not
  // pushed back at the model as new.
  const plainFlat0 = flatDocument(base.plain);
  const preexisting = new Set([...checkDesign(plainFlat0, limitsOf(settings)), ...taperFaults(plainFlat0)].map(problemKey));
```

  Keep the existing `plainFlat` name further down unclashed.
- Update `evaluateDesign`'s doc comment: "… → checkDesign + the taper-joint fault → collapse".

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/generate/joints/tapers.test.ts src/generate/run.test.ts`
Expected: PASS.

- [ ] **Step 5: A Refine preexisting test**

Append to `run.test.ts`. An unjoined original whose leg taper already hits the rail (`start: 24`): a Refine whose model returns that design unchanged has the `taper-joint` fault in `out.present` and NOT in `out.violations`, and no repair message it sent names the taper (assert on what the fake recorded; do not assert a call count — other limits such as tips may drive rounds). Build the original with `designToDocument(parseDesign(design(24))!).doc` and reuse the file's `runRefine` settings helper.

- [ ] **Step 6: Full suite, typecheck, mutate**

Run `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`. Then make each of these changes in turn, check that a
test fails, and restore:
- Use `Math.round` instead of `Math.floor`.
- Drop `taperFaults` from `raw`.
- Drop it from `preexisting`.

- [ ] **Step 7: Commit**

```bash
git add src/document/designCheck.ts src/generate/joints/tapers.ts src/generate/joints/tapers.test.ts src/generate/run.ts src/generate/run.test.ts
git commit -m "feat(generate): the taper-joint fault reaches the model; Refine counts the original's as preexisting"
```

---

### Task 4: Refine writes tapers out (`documentToDesign`, the narrowed refusal)

**Files:**
- Modify: `src/document/angledRefusal.ts`: the `'refine'` branch allows tapers; reword it.
- Modify: `src/document/refineDesign.ts`:
  - `RefusalReason` gains `'taper-form' | 'taper-joint'`.
  - The angled check narrows.
  - Add the taper-form refusal.
  - `box` reads `worldTapers`.
- Test: `src/document/refineDesign.test.ts`, `src/document/angledRefusal.test.ts` and `src/generate/refine.test.ts`
  (update the chunk-1 "refuses tapers" tests).

**Interfaces:**
- Consumes: Task 1's `worldTapers`, Task 2's `designValues` and `tapers`.
- Produces:
  - `RefusalReason` includes `'taper-form'` and `'taper-joint'` (the latter is used by Task 5).
  - `angledRefusal(doc, 'refine')` is null for taper-only documents.

- [ ] **Step 1: Update the chunk-1 tests to the new contract (they must fail now)**

- `angledRefusal.test.ts`: "Refine still refuses tapers in this chunk" becomes "Refine allows tapers". Assert
  `angledRefusal(withCut(taper), 'refine')` is null. Its miter test expects:
  `"Refine doesn't handle mitered, beveled or chamfered parts yet (Frame 1, Frame 2, Frame 3…). Refine before cutting those angles, or remove them."`
  Adapt the names to the fixture. The old `doc(1)` refine assertion at line 17 uses a taper, so change it to use a
  miter fixture with the new text.
- `refine.test.ts` `'refine — angled documents'`: the TAPER document now passes `plainForRefine`
  (`'plain' in r`). Add the same two assertions for `{ ...TAPER, kind: 'miter' }`, expecting reason `'angled'`.

Append to `src/document/refineDesign.test.ts`:

```ts
describe('documentToDesign — tapers (AI-tapers spec §5.1, §5.2)', () => {
  const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
  const TURNS: Rotation[] = [0, 90, 180, 270];
  const tapered = (b: Board): Board => ({ ...b, angleCuts: [
    // A HAND: different amounts on two faces, so a mirrored mapping changes the part.
    { id: 'a', ...taperCut({ face: 'width', from: 'max', end: 'min', start: 12, amount: 0.5 }) },
    { id: 'b', ...taperCut({ face: 'thickness', from: 'min', end: 'min', start: 12, amount: 0.25 }) },
  ] });
  const parts = [
    ...POSTURES.flatMap((posture) => TURNS.map((rotation) => tapered(createBoard({ name: `P ${posture} ${rotation}`, length: 20, width: 3, thickness: 1.5, posture, rotation, position: [0, 0, 0] })))),
    tapered(createBoard({ name: 'Square leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', rotation: 90, position: [0, 0, 0] })),
  ];

  for (const b of parts) {
    it(`${b.name}: the world tapers round-trip exactly`, () => {
      const doc = { ...createDocument('T'), boards: [b] };
      const r = documentToDesign(doc, REFINE_MAX);
      if ('refused' in r) throw new Error(r.refused.message);
      expect(r.design.parts[0]!.tapers).toEqual(worldTapers(b));
      const back = designToDocument(r.design, { centre: false, exact: designValues(r.design) }).doc.boards[0]!;
      expect(boardExtents(back)).toEqual(boardExtents(b));
      expect(worldTapers(back)).toEqual(worldTapers(b));
      // Stored fields are equal only for an encoding orient itself produces (Review Focus 2).
      const o = orient(boardExtents(b));
      if (o.posture === b.posture && o.rotation === b.rotation) {
        expect(back.angleCuts.map(({ id: _i, ...c }) => c)).toEqual(b.angleCuts.map(({ id: _i, ...c }) => c));
      }
    });
  }

  it('keeps a float-hostile start exactly (no zeroStation)', () => {
    const b = { ...createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), angleCuts: [{ id: 'a', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 0.1 * 3, amount: 0.1 }) }] };
    const r = documentToDesign({ ...createDocument('T'), boards: [b] }, REFINE_MAX);
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.design.parts[0]!.tapers![0]!.start).toBe(0.1 * 3);
    expect(designValues(r.design).has(0.1 * 3)).toBe(true);
  });
  it('refuses a taper not in standard form, naming the part, before anything else is built', () => {
    const odd = { id: 'a', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0], [20, 0.5]] as [[number, number], [number, number]] };
    const r = documentToDesign({ ...createDocument('T'), boards: [{ ...createBoard({ name: 'Leg 3' }), angleCuts: [odd] }] }, REFINE_MAX);
    expect('refused' in r && r.refused).toEqual({ reason: 'taper-form', message: "Leg 3's taper can't be described to Refine — edit it in Properties first." });
  });
  it('still refuses a miter', () => {
    const miter = { id: 'm', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0], [3, 3]] as [[number, number], [number, number]] };
    const r = documentToDesign({ ...createDocument('T'), boards: [{ ...createBoard({ name: 'Frame' }), angleCuts: [miter] }] }, REFINE_MAX);
    expect('refused' in r && r.refused.reason).toBe('angled');
  });
});
```

Imports needed: `Board`, `Posture` and `Rotation` types; `createBoard` and `createDocument`; `taperCut`;
`designToDocument` and `orient` from `./generated`; `boardExtents`; `worldTapers`; `designValues`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/refineDesign.test.ts src/document/angledRefusal.test.ts src/generate/refine.test.ts`
Expected: FAIL. The angled refusal still fires on tapers.

- [ ] **Step 3: Implement**

In `src/generate/refine.ts`, `KEEP_LINE` gains tapers. A model told exactly what to keep must be told to keep them:
`'Keep every part you are not asked to change exactly as it is: the same name, role, material, size, position and tapers. Keep assembly and placement names. Return the whole design.'`
Pin it in `refine.test.ts`: `expect(refineMessage(design, settings)).toContain('position and tapers')`. Update any
literal expectation of the old line. `KEEP_LINE` rides in the user turn, so the fixed-prefix rule is untouched.

In `angledRefusal.ts`, the refine branch becomes:

```ts
  const names = angledParts(doc, ['taper']);
  if (names.length === 0) return null;
  return `Refine doesn't handle mitered, beveled or chamfered parts yet (${shown(names)}). Refine before cutting those angles, or remove them.`;
```

Update the doc comment: Refine accepts tapers it can describe exactly (AI-tapers chunk 2); `documentToDesign` refuses
the rest.

In `refineDesign.ts`:

```ts
import { worldTapers } from './taperWorld';

export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large' | 'joints' | 'mirrored' | 'angled' | 'taper-form' | 'taper-joint';
```

- The angled check becomes `if (angledParts(doc, ['taper']).length > 0) return refuse('angled', …)`.
- Directly after it, add:

```ts
  // A taper Refine cannot describe exactly is refused, never rewritten (spec §5.2). Flat names, as the person sees them.
  const odd = flatDocument(doc).boards.filter((b) => worldTapers(b) === null).map((b) => b.name);
  if (odd.length === 1) return refuse('taper-form', `${odd[0]}'s taper can't be described to Refine — edit it in Properties first.`);
  if (odd.length > 1) return refuse('taper-form', `The tapers on ${odd.slice(0, 3).join(', ')}${odd.length > 3 ? '…' : ''} can't be described to Refine — edit them in Properties first.`);
```

- `box` emits `tapers: worldTapers(b) ?? []`. It is never null here; the refusal above runs first. `worldTapers`
  reads the board's own posture and rotation, so a definition's part is read in the definition frame. That frame is
  the world's directions, because Refine refuses turned, mirrored and nested assemblies.

`'taper-joint'` is added to the union here for Task 5's use; nothing produces it yet.

- [ ] **Step 4: Run, full suite, typecheck**

Run: `npx vitest run src/document/refineDesign.test.ts src/document/angledRefusal.test.ts src/generate/refine.test.ts && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all green.

- [ ] **Step 5: Mutate**

Make each of these changes in turn, check that a test fails, and restore:
- Make `box` emit `tapers: []`.
- Drop `['taper']` from the angled check.
- Read `start` through `taperFields(c, b).start`.

- [ ] **Step 6: Commit**

```bash
git add src/document/angledRefusal.ts src/document/angledRefusal.test.ts src/document/refineDesign.ts src/document/refineDesign.test.ts src/generate/refine.ts src/generate/refine.test.ts
git commit -m "feat(refine): Refine describes tapers exactly in world words; refuses only non-standard tapers and other angles"
```

---

### Task 5: joined Refine with tapers

**Files:**
- Modify: `src/generate/joints/unjoin.ts`: `sameJoined` compares angle cuts exactly.
- Modify: `src/generate/refine.ts`: `plainForRefine` refuses a joined original whose taper already runs into a joint.
- Modify: `src/generate/run.ts`:
  - `JointsSummary.notJoined?: string`.
  - `runRefine` handles joinery's refusal.
  - Rewrite the `throw` comment.
- Modify: `src/panels/RefineDialog.tsx` (~line 129): show `notJoined`.
- Test:
  - `src/generate/joints/unjoin.test.ts`
  - `src/generate/refine.test.ts`
  - `src/generate/run.test.ts`
  - `src/panels/RefineDialog.test.tsx`

**Interfaces:**
- Consumes:
  - `taperConflicts` (chunk 1) and `taperJointRefusal` (chunk 1, person-facing).
  - `sameAngleCut` (`angleCuts.ts`).
  - Task 4's `'taper-joint'` reason.
- Produces:
  - `JointsSummary { kept; chosen; dropped; skipped; notJoined?: string }`.

- [ ] **Step 1: Write the failing tests**

`unjoin.test.ts`:

```ts
it('sameJoined compares angle cuts exactly (AI-tapers spec §5.4a)', () => {
  const flat = /* any fixture in this file with one board */;
  const t = { id: 'a', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 20, amount: 0.5 }) };
  const a = { ...flat, boards: flat.boards.map((b, i) => (i === 0 ? { ...b, angleCuts: [t] } : b)) };
  const b = { ...flat, boards: flat.boards.map((x, i) => (i === 0 ? { ...x, angleCuts: [{ ...t, points: [[0, 0.5], [20.0625, 0]] as typeof t.points }] } : x)) };
  expect(sameJoined(a, a)).toBe(true);
  expect(sameJoined(a, b)).toBe(false);
  expect(sameJoined(a, flat)).toBe(false);
});
```

Pick the fixture the file already builds; `sameJoined` must be exported (check; export it if not).

`refine.test.ts`. Build a joined tapered original with chunk 1's machinery: CORNER-like legs and rails from
`runJoinery.test.ts`, taper at `start: 22`, joined by `runJoinery` with a fake client answering short mortise-tenons.
Then:

```ts
describe('plainForRefine — tapers on a joined design (spec §5.4)', () => {
  it('a joined tapered design passes the gate with its tapers intact', () => {
    const r = plainForRefine(joined);           // joined at start 22
    if ('refused' in r) throw new Error(r.refused.message);
    expect(r.joints!.length).toBeGreaterThan(0);
    expect(flatDocument(r.plain).boards.find((b) => b.name === 'Leg')!.angleCuts).toEqual(flatDocument(joined).boards.find((b) => b.name === 'Leg')!.angleCuts);
  });
  it('refuses, before any call, a joined design whose taper already runs into a joint', () => {
    const bad = /* `joined` with the Leg's taper starts set to 24 (taperCut with the same face/from/end) */;
    const r = plainForRefine(bad);
    expect('refused' in r && r.refused.reason).toBe('taper-joint');
    // It IS joined (the gate read its joints): the dialog must say so, and offers no repair (repair is for 'joints').
    expect(refineDialogInfo(bad).joined).toBe(true);
    expect(refineDialogInfo(bad).repair).toBeNull();
  });
});
```

`run.test.ts`, the handled outcome:

```ts
it('a joined Refine whose model never fixes a taper conflict returns the design unjoined, with a note, never a throw', async () => {
  // Four refine answers, all with the Leg's taper at start 24 (into the rails). Joinery refuses before any call.
  const { client } = fakeClient([conflicting, conflicting, conflicting, conflicting]);
  const out = await runRefine(client, joined, REFINE_SETTINGS, new AbortController().signal, () => {});
  if ('refused' in out) throw new Error(out.refused.message);
  expect(client.complete).toHaveBeenCalledTimes(4);                 // no joinery call
  expect(out.joints?.notJoined).toBeTruthy();
  expect(out.violations.some((v) => v.kind === 'taper-joint')).toBe(true);
  expect(flatDocument(out.doc).boards.every((b) => b.cuts.length === 0)).toBe(true);
});
```

`conflicting` is the plain design JSON: Leg, Rail X and Rail Z at CORNER's boxes, every part with `tapers`, and the
Leg's `[{ faces: ['+x', '+z'], toward: '-y', start: 24, amount: 0.375 }]`. Read CORNER's leg faces from the chunk 1
fixture: `endFacing(b, axis, 1)` on axes 0 and 2, so `+x` and `+z`.

`RefineDialog.test.tsx`: an outcome with `joints: { kept: 0, chosen: 0, dropped: 0, skipped: [], notJoined: 'MSG' }`
shows the text `Joints were not re-applied. MSG`, and does not show the "joints kept" line.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/generate/joints/unjoin.test.ts src/generate/refine.test.ts src/generate/run.test.ts src/panels/RefineDialog.test.tsx`
Expected: FAIL. `sameJoined` ignores angle cuts, there is no `'taper-joint'` refusal, and runRefine throws.

- [ ] **Step 3: Implement**

`unjoin.ts` `sameJoined`: append
`&& p.angleCuts.length === q.angleCuts.length && p.angleCuts.every((c, k) => sameAngleCut(c, q.angleCuts[k]!))`.
Import `sameAngleCut` from `../../document/angleCuts`. Exact, by design: joinery never touches angle cuts, so their
round trip is identity.

`refine.ts` `plainForRefine`, after `gateUnjoin` succeeds and before returning:

```ts
    const plain = migrateDocument(writeBackFlat(doc, flat.boards, g.plain));
    // A joined original whose taper already runs into a joint could only come back unjoined (its re-join refuses):
    // refused before any call (AI-tapers spec §5.4, amended), with joinery's own message.
    const pf = flatDocument(plain);
    const taper = taperJointRefusal(pf, taperConflicts(pf, findSites(pf)));
    if (taper) return { refused: { reason: 'taper-joint', message: taper } };
    return { plain, joints: g.joints };
```

Imports: `taperJointRefusal` from `../document/document`, `taperConflicts` from `./joints/tapers`, `findSites` from
`./joints/sites`. Check for an import cycle: `tapers.ts` does not import `refine.ts`.

`refine.ts` `refineDialogInfo`: `joined` becomes
`'refused' in base ? base.refused.reason === 'joints' || base.refused.reason === 'taper-joint' : base.joints !== null`.
A `'taper-joint'` refusal is produced only after the gate read the joints. `repair` stays offered on `'joints'` only.

`run.ts`:

```ts
/** What re-joining a refined joined design did (refine-joined spec §4). `notJoined`: joinery refused the refined design
 *  (its taper runs into a joint the model never moved, AI-tapers spec §5.4) — the design is returned unjoined. */
export interface JointsSummary { kept: number; chosen: number; dropped: number; skipped: string[]; notJoined?: string }
```

Replace `if ('refused' in jo) throw new Error(jo.refused); // unreachable…` with:

```ts
    // Reachable (AI-tapers spec §5.4, amended): the repair loop keeps its best attempt even with a taper-joint fault
    // left, and joinery refuses that before any call. The refined design is kept, unjoined; the fault is in `violations`.
    if ('refused' in jo) {
      joints = { kept: 0, chosen: 0, dropped: 0, skipped: [], notJoined: jo.refused };
    } else if ('noSites' in jo) {
```

Keep the rest of the chain as `else` branches.

`RefineDialog.tsx`:

```tsx
            {out.joints?.notJoined
              ? <p>{`Joints were not re-applied. ${out.joints.notJoined}`}</p>
              : out.joints && <p>{`${out.joints.kept} joints kept · ${out.joints.chosen} chosen · ${out.joints.dropped} dropped`}</p>}
```

- [ ] **Step 4: Run, full suite, typecheck**

Run: `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all green.

- [ ] **Step 5: Mutate**

Make each of these changes in turn, check that a test fails, and restore:
- Drop the `sameAngleCut` clause.
- Drop the `plainForRefine` taper refusal.
- Restore the `throw`.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(refine): joined Refine with tapers — the gate proves angle cuts, a conflicting original is refused, an unfixed result comes back unjoined"
```

---

### Task 6: `designDiff` names taper changes

**Files:**
- Modify: `src/document/designDiff.ts`
- Test: `src/document/designDiff.test.ts`

**Interfaces:**
- Consumes: Task 1's `worldTapers` and `WorldTaper`.
- Produces: `ChangeKind` gains `'taper'`. Lines:
  - `Leg: taper added (+x, +z; 22" from the -y end, 3/8" off)`
  - `Leg: taper changed (…)` (the new values)
  - `Leg: taper removed (+x, +z)`

- [ ] **Step 1: Write the failing tests**

Use the file's `f` helper for lengths, and build sides with `designToDocument` and `tapers`:

```ts
describe('diffDesigns — tapers (AI-tapers spec §5.5)', () => {
  const leg = (tapers: unknown[]) => ({ name: 'T', parts: [{ name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, tapers: tapers as never }] });
  const doc = (t: unknown[]) => designToDocument(leg(t)).doc;
  const T = { faces: ['+x', '+z'], toward: '-y', start: 22, amount: 0.375 };
  it('added', () => {
    expect(diffDesigns(doc([]), doc([T])).map((c) => c.text)).toEqual([`Leg: taper added (+x, +z; ${f(22)} from the -y end, ${f(0.375)} off)`]);
  });
  it('changed', () => {
    expect(diffDesigns(doc([T]), doc([{ ...T, start: 20 }])).map((c) => c.text)).toEqual([`Leg: taper changed (+x, +z; ${f(20)} from the -y end, ${f(0.375)} off)`]);
  });
  it('removed', () => {
    expect(diffDesigns(doc([T]), doc([])).map((c) => c.text)).toEqual(['Leg: taper removed (+x, +z)']);
  });
  it('face order is not a change', () => {
    expect(diffDesigns(doc([T]), doc([{ ...T, faces: ['+z', '+x'] }]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/designDiff.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `designDiff.ts`:
- Add `'taper'` to `ChangeKind`.
- Import `worldTapers`.
- Inside the per-part loop, after the material line:

```ts
    // Tapers compared in design form (merged, ordered), so a reordering is not a change (spec §5.5).
    // worldTapers is never null here: Refine refuses a non-standard taper before any call.
    const ot = worldTapers(o.b) ?? [];
    const nt = worldTapers(e.b) ?? [];
    if (JSON.stringify(ot) !== JSON.stringify(nt)) {
      const say = (t: { faces: string[]; toward: string; start: number; amount: number }) => `${t.faces.join(', ')}; ${len(t.start)} from the ${t.toward} end, ${len(t.amount)} off`;
      const lines = nt.length === 0 ? ot.map((t) => `${n}: taper removed (${t.faces.join(', ')})`)
        : ot.length === 0 ? nt.map((t) => `${n}: taper added (${say(t)})`)
          : nt.map((t) => `${n}: taper changed (${say(t)})`);
      for (const t of lines) push('taper', 'part', n, t, key('taper', t));
    }
```

A part "added" (no `o`) already gets its own line and no taper line, by the existing `continue`.

- [ ] **Step 4: Run, typecheck, mutate**

Run `npx vitest run src/document/designDiff.test.ts && npm run build 2>&1 | tail -3`. Then make each of these changes
in turn, check that a test fails, and restore:
- Compare the raw `angleCuts` arrays instead of `worldTapers`.
- Swap the `added` and `removed` branches.

- [ ] **Step 5: Commit**

```bash
git add src/document/designDiff.ts src/document/designDiff.test.ts
git commit -m "feat(refine): the change list names taper additions, changes and removals"
```

---

### Task 7: the prompt

**Files:**
- Modify: `src/generate/prompt.ts` (`SYSTEM_PROMPT`, `STYLE_NOTES['mid-century']`)
- Test: `src/generate/prompt.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test**

```ts
it('teaches tapers in the fixed prefix (AI-tapers spec §6)', () => {
  expect(SYSTEM_PROMPT).toContain('Each part is an axis-aligned box, optionally tapered.');
  expect(SYSTEM_PROMPT).toContain('"tapers": [] for every part that is not tapered');
  expect(SYSTEM_PROMPT).toContain('start every taper at or below the lowest part that meets the tapered part');
  expect(SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);   // still a fixed prefix
});
```

Update any existing literal expectation of the mid-century note.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/generate/prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `SYSTEM_PROMPT`:
- Replace `- Each part is an axis-aligned box.` with `- Each part is an axis-aligned box, optionally tapered.`
- Add, after the "Coordinates and units" block:

```
Tapers:
- A part may taper along its length (its longest side), like a table leg narrowing toward the floor. Describe it in "tapers": "faces" are the sides that slope ("+x", "-x", "+z", "-z" for an upright leg), "toward" is the end that gets thinner ("-y" for the floor end), "start" is how far from that end the taper begins, and "amount" is how much it removes from each named face at that end.
- The usual Shaker leg tapers its two INSIDE faces (the faces toward the middle of the piece) toward the floor. By corner: the leg with the smallest x and z tapers "+x" and "+z"; the leg with the largest x and smallest z tapers "-x" and "+z"; the leg with the smallest x and largest z tapers "+x" and "-z"; the leg with the largest x and z tapers "-x" and "-z".
- Joints go where parts meet, and a joint cannot sit on tapered wood: start every taper at or below the lowest part that meets the tapered part. For legs under 5in aprons at the top of a 29in table, a start of 22 to 23in is typical.
- Leave wood: a taper removes at most about a third of the leg's width per face.
- Use "tapers": [] for every part that is not tapered.
```

In `STYLE_NOTES['mid-century']`:
`'Mid-century: light cases on separate bases or tapered legs (no splayed legs yet — taper them instead), raised off the floor.'`

The "same role only for identical parts" line stays: legs with mirrored tapers simply end up unlinked (spec §1).

- [ ] **Step 4: Run, full suite, typecheck**

Run `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`.

The estimate reads `SYSTEM_PROMPT.length + JSON.stringify(DESIGN_SCHEMA).length`, so it grows on its own. Constants
change only if Task 8's measured run falls outside the shown range (spec §6, fu 236).

- [ ] **Step 5: Commit**

```bash
git add src/generate/prompt.ts src/generate/prompt.test.ts
git commit -m "feat(generate): the prompt teaches tapers and the start-below-the-joints rule"
```

---

### Task 8: record, verify live, ship

**Files:**
- Modify:
  - `CLAUDE.md`: invariants 38, 41 and 48 (Refine accepts tapers); "Where things live" (`taperWorld.ts`); Status;
    test count; follow-ups.
- Modify: `docs/follow-ups.md`:
  - Close 305 (Generate/Refine tapers).
  - Record the residue as new numbered entries.
- Modify: `docs/browser-verification-ai-tapers.md` (a "Chunk 2" section)
- Modify: `docs/history.md` (the round's narrative, on ship)

- [ ] **Step 1: Docs**

Amend invariant 48: "Refine refuses all until AI-tapers chunk 2" becomes "Refine accepts tapers in standard form
(`worldTapers`); a non-standard taper refuses (`'taper-form'`)". Do the same in invariant 38's last sentence. Add
`taperWorld.ts` to "Where things live", under `document/`:

```
│   ├── taperWorld.ts     Dir/WorldTaper: design tapers in world words; dirToLocal/localToDir (inv 44), worldTapers
│   │                     (stored → design form, structural standard form), taperCutsFor (design → taperCuts, §2.2 rules)
```

Record any residue found during execution as follow-ups.

- [ ] **Step 2: Live check on the dev server (Playwright, the user watching)**

Start `npm run dev -- --port 5181`. Follow `docs/browser-verification-ai-tapers.md`'s conventions. The dev profile is
the user's: never `localStorage.clear()`; delete only what this check created.

1. **Free.** Import a hand-tapered table (legs tapered below the aprons). Open Refine: no refusal; the estimate shows.
   Change a leg's taper to a non-standard form via an imported file: Refine refuses with the `taper-form` message.
2. **Key.** The dev profile had no API key at chunk 1. Ask the user to enter one in Settings themselves; it never goes
   in chat.
3. **Paid, each one approved by the user at the time:**
   - One Generate: "Shaker side table with tapered legs", Shaker style. Expect legs with `tapers`, aprons, no
     `taper-joint` violation left. Record the actual cost against the dialog's estimate range.
   - One Add joinery on the result: expect mortise-and-tenon aprons, `violations []`, tapers intact.
   Screenshot the result (`docs/img/ai-tapers-generated.png`).
4. Delete the projects this check created; leave everything else.

- [ ] **Step 3: Merge and ask**

Merge `--no-ff` to master, verify the merged tree (`npm test`, `npm run build`), and delete the branch. **Ask the user
before deploying** (the deployment rule).
