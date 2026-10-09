# Repair doubled joints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Repair joints" action that removes exactly the stray cuts the pre-`a899b51` joinery bug left in shared assemblies, proves the result is what today's joinery produces, and saves it as a new project — no model call.

**Architecture:** `unjoin.ts` exposes its body as `readJoints` (returns the cuts it cannot explain instead of refusing) plus `rejoin` and `sameCut`. A new `repair.ts` de-duplicates cuts on twin parts, accepts only twin strays, prunes, reorders to the re-join's order, and proves with `gateUnjoin`; `repairDocument` writes back into the tree. A `RepairNotice` panel, driven by a small `useRepair` hook in App, appears in the Refine and Joinery dialogs.

**Tech Stack:** TypeScript, React, Vitest, Vite (`npm run build` is the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-09-sloyd-repair-joints-design.md` (with its planning amendments). Read CLAUDE.md invariants 32, 36, 40, 41, 46 and `src/generate/joints/unjoin.ts` in full before Task 2.

## Global Constraints

- No schema change; documents stay `version: 11`. The repair never adopts: `storage.createProject(doc, { activate: false })`, opened only through App's `openProject` (invariants 32, 36).
- Refusal text, verbatim: `Sloyd can't repair this project's joints automatically — re-run Add joinery from the unjoined original.`
- Note text, verbatim: `This project's joints were doubled by a bug fixed on 2026-10-09: some parts carry duplicate cuts, or a mortise from another copy of their assembly.`
- Joinery warning, verbatim: `Running joinery again on this project would add to the damage — repair it first.`
- Button label: `Repair joints`. New project name: `` `${doc.name} — repaired` ``.
- Done line: `` `Saved as '${name}' — ${n} stray cut${n === 1 ? '' : 's'} removed.` `` Split line: `` `${list} no longer match, so they are no longer shared.` `` where `list` is `A and B`, `A, B and C`.
- Cut equality everywhere in the repair: `sameCut` from `unjoin.ts` (every `CUT_GEOMETRY_KEYS` field; numbers within `GATE_TOLERANCE` = 1e-9; others exact). Never a hand-written field list (invariant 40).
- Twins: equal `lastSegment(id)` AND equal own name (`name.split(NAME_SEPARATOR).pop()`).
- The repair is SUBTRACTIVE: output parts are the stored flat parts with some cuts removed and the rest reordered; positions, sizes, ids and surviving cut objects unchanged.
- `unjoin`, `gateUnjoin` and their existing tests keep their behaviour unmodified.
- The document layer imports nothing from `generate`.
- Branch `repair-joints`; merge locally `--no-ff`; every commit ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Mutate every equality, ordering, refusal and evidence test once and record the result in the task report.

## Review Focus

1. **An undamaged shared-assembly project joined with today's joinery** (with or without a hand-added cut). Expected: `repairDocument` is `null`; neither dialog mentions repair; Refine shows its own gate message for the hand-cut one. Pinned in Task 3 and Task 4.
2. **A damaged project that ALSO has a hand-added cut, or a phantom moved 1/16in.** Expected: refused with the refusal text, never a partial repair. Pinned in Task 3.
3. **Repair clicked twice quickly.** Expected: one project written. Pinned in Task 4 (`useRepair` busy guard).
4. **Storage unavailable.** Expected: the button is disabled; a write that fails shows `Could not save the project — storage is unavailable.` Pinned in Task 4.
5. **Opening Refine on the repaired project.** Expected: no note, the normal form (the gate passes; `repairDocument` of the repaired document is `null`). Pinned in Task 3.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/generate/joints/fixtures/*.json`, `README.md`, `make-damaged.4a340f7.ts.txt` | create | damaged documents made by the buggy code, and how |
| `src/generate/joints/unjoin.ts` | modify | `readJoints`, `rejoin`, `sameCut` exported; `unjoin`/`gateUnjoin` built on them |
| `src/generate/joints/repair.ts` | create | `repairJoints`, `repairDocument`, `splitCopies`, `REPAIR_REFUSAL`, `RepairCheck` |
| `src/generate/refine.ts` | modify | `refineDialogInfo` gains `repair` |
| `src/useRepair.ts` | create | the action's state: write without activating, done/failed |
| `src/panels/RepairNotice.tsx` | create | note, button, refusal, done and split lines, Open |
| `src/panels/RefineDialog.tsx`, `src/panels/JoineryDialog.tsx` | modify | `repairNotice` slot |
| `src/App.tsx` | modify | wiring |

---

### Task 0: Branch

- [ ] `cd /home/alec/docker/sloyd && git checkout -b repair-joints && npm test 2>&1 | grep -E "Tests "` — expect 2486 passing.

---

### Task 1: Fixtures (controller)

Already generated during planning in a scratch worktree at `4a340f7` by
`/tmp/claude-1000/-home-alec-docker-sloyd/01f4aa1e-9cd2-442a-a456-cb23d97b3c1f/scratchpad/prefix/src/gen/makeDamaged.test.ts`
into `…/scratchpad/prefix/out/`. Each JSON is `{ about, plain, choices, damaged }`; `choices` are `RecordedJoint`-shaped (`enter`, `receive`, `axis`, `side`, `choice`) for every non-butt choice.

- [ ] **Step 1:** Copy the six JSON files to `src/generate/joints/fixtures/`, and the generator to `src/generate/joints/fixtures/make-damaged.4a340f7.ts.txt` (`.txt` so neither Vitest nor `tsc` sees it; its imports are relative to the old `src/gen/`).
- [ ] **Step 2:** Write `src/generate/joints/fixtures/README.md`:

```markdown
# Damaged joinery fixtures (follow-up 240)

Made by `make-damaged.4a340f7.ts.txt`, run as a Vitest test in a worktree at commit `4a340f7`
(the last deploy before `a899b51`), with `FIXTURE_OUT=<dir>`. That commit's `applyJoints` cloned the
flat board list as a whole, so twin placements of one definition shared one `cuts` array. Each file:

- `plain` — the tree document before joinery;
- `choices` — every non-butt joint applied, keyed like `RecordedJoint` (`jointKey` rebuilds them);
- `damaged` — the stored document that commit's joinery wrote back.

| File | What it shows | Repair removes |
|---|---|---|
| 1-frames-duplicates | two shared frames; each leg's mortise doubled | 2 |
| 2-frames-phantom | a stretcher enters the Front leg only; phantom mortise in the Back leg | 3 |
| 3-frames-turned | metric, off-grid, second copy turned 90°; twins differ in the last bit; already split | 2 |
| 4-cases-every-kind | dados, stopped dados, rabbeted back in two shared cases | 12 |
| 5-rail-enters-once | entering parts were never aliased: joined by the buggy code, undamaged | — (null) |
| 6-nested | a shared bench of two shared frames, placed twice | 12 |

Do not regenerate them with today's code: today's joinery is fixed, so it cannot make them.
```

- [ ] **Step 3:** `git worktree remove --force <scratch>/prefix` (after the copy), `git add src/generate/joints/fixtures && git commit` (`test: damaged joinery fixtures made by the pre-a899b51 code (fu 240)`).

---

### Task 2: `readJoints`, `rejoin`, `sameCut`

**Files:** Modify `src/generate/joints/unjoin.ts`, `src/generate/joints/unjoin.test.ts`.

**Interfaces — Produces:**

```ts
export interface Unexplained { part: number; cut: number }   // indices into flat.boards[part].cuts
export function readJoints(flat: FlatDocument):
  { plain: Board[]; joints: RecordedJoint[]; unexplained: Unexplained[] } | { refused: string };
export function rejoin(plain: FlatDocument, joints: readonly RecordedJoint[]): FlatDocument | null; // null: a joint with no site
export const sameCut: (c: Cut, d: Cut) => boolean;   // was module-private
export const cutBox: (b: Board, c: Cut) => WorldBox;  // was module-private; WorldBox from ./pocket
```

- [ ] **Step 1: failing tests** (append to `unjoin.test.ts`, reusing its `design`, fixtures and the hand-added-cut construction of `refuses a hand-added cut`):

```ts
describe('readJoints (repair-joints spec §2 step 3)', () => {
  it('agrees with unjoin wherever unjoin succeeds, with nothing unexplained', () => {
    // every fixture × mode the spike block above iterates: build each joined flat the same way
    for (const joined of allJoinedCases()) {           // extract the existing loop's case builder into this helper
      const u = unjoin(joined); const r = readJoints(joined);
      if ('refused' in u || 'refused' in r) throw new Error('expected success');
      expect(r.unexplained).toEqual([]);
      expect(r.plain).toEqual(u.plain);
      expect(r.joints).toEqual(u.joints);
    }
  });
  it('names the hand-added cut by part and cut index instead of refusing', () => {
    const { flat, part, cut } = withHandCut();        // the hand-cut construction, returning where it put the cut
    const r = readJoints(flat);
    if ('refused' in r) throw new Error('expected a read');
    expect(r.unexplained).toEqual([{ part, cut }]);
    expect(unjoin(flat)).toHaveProperty('refused');
  });
});
describe('rejoin', () => {
  it('reproduces a joined design from its read-back', () => {
    const joined = /* one defaults-joined fixture */;
    const r = readJoints(joined); if ('refused' in r) throw new Error('read');
    expect(sameJoined(rejoin({ ...joined, boards: r.plain }, r.joints)!, joined)).toBe(true);
  });
  it('is null when a recorded joint has no site', () => {
    const joined = /* same */; const r = readJoints(joined); if ('refused' in r) throw new Error('read');
    expect(rejoin({ ...joined, boards: r.plain }, [{ ...r.joints[0]!, enter: 'Nobody' }])).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run src/generate/joints/unjoin.test.ts` — the new tests fail (not exported).
- [ ] **Step 3: implement.** Rename `unjoin`'s body to `readJoints`; replace the final `left` refusal with collecting `unexplained` from `cuts` (`{ part: i, cut: k }` for every `!used`, in board then cut order); keep `for (const b of boards) b.cuts = []`. Mid-body refusals (the stopped-dado one) stay `{ refused }`. Then:

```ts
export function unjoin(flat: FlatDocument): Unjoined {
  const r = readJoints(flat);
  if ('refused' in r) return r;
  if (r.unexplained.length) {
    // The internal reason names the cuts, as before (callers go through gateUnjoin).
    const left = r.unexplained.map(({ part, cut }) => { const b = flat.boards[part]!; const x = cutBox(b, b.cuts[cut]!); return `${b.name}[${x.min.join(',')}->${x.max.join(',')}]`; });
    return { refused: `unexplained cuts on ${[...new Set(left)].join(', ')}` };
  }
  return { plain: r.plain, joints: r.joints };
}

/** Re-join plain parts with recorded joints, every other site butt — the gate's re-join. */
export function rejoin(plain: FlatDocument, joints: readonly RecordedJoint[]): FlatDocument | null {
  const sites = findSites(plain);
  const key = (s: Site) => jointKey(plain.boards[s.enter]!.name, plain.boards[s.receive]!.name, s.axis, s.side);
  const bySite = new Map(sites.map((s) => [key(s), s]));
  const choices: JointChoice[] = sites.map((s) => ({ site: s.id, joint: 'butt' }));
  for (const j of joints) {
    const s = bySite.get(jointKey(j.enter, j.receive, j.axis, j.side));
    if (!s) return null;
    choices[sites.indexOf(s)] = { site: s.id, ...j.choice };
  }
  return applyJoints(plain, sites, choices).doc;
}

export function gateUnjoin(flat: FlatDocument): { plain: Board[]; joints: RecordedJoint[] } | { refused: string } {
  const u = unjoin(flat);
  if ('refused' in u) return { refused: GATE_REFUSAL };
  const again = rejoin({ ...flat, boards: u.plain }, u.joints);
  return again && sameJoined(again, flat) ? u : { refused: GATE_REFUSAL };
}
```

`cutBox` reads the ORIGINAL flat board (the box is computed from the joined document, as before). Export `sameCut` and `cutBox` (rename nothing). Update the file's doc comment: `readJoints` is the body; `unjoin` refuses unexplained cuts.
- [ ] **Step 4:** `npx vitest run src/generate/joints/` — all green, existing `unjoin`/`gateUnjoin` tests unmodified.
- [ ] **Step 5: mutate** — make `readJoints` drop the last unexplained entry → the hand-cut test fails; make `rejoin` ignore unmatched joints → the null test fails. Revert; record both.
- [ ] **Step 6:** `npm run build` clean; commit `refactor(unjoin): readJoints returns unexplained cuts; rejoin and sameCut exported (fu 240)`.

---

### Task 3: `repairJoints` and `repairDocument`

**Files:** Create `src/generate/joints/repair.ts`, `src/generate/joints/repair.test.ts`.

**Interfaces — Consumes:** Task 2's `readJoints`, `rejoin`, `sameCut`, `cutBox`; `worldSolids` and `TOUCH` from `document/designCheck`; `gateUnjoin`, `RecordedJoint` from `unjoin.ts`; Task 1's fixtures.
**Produces:**

```ts
export const REPAIR_REFUSAL = "Sloyd can't repair this project's joints automatically — re-run Add joinery from the unjoined original.";
export function repairJoints(flat: FlatDocument): null | { boards: Board[]; dropped: number } | { refused: string };
export type RepairCheck = null | { refused: string } | { doc: SloydDocument; dropped: number; splits: string[][] };
export function repairDocument(doc: SloydDocument): RepairCheck;
/** Placements that shared one definition in `before` and do not in `after`, by display path. */
export function splitCopies(before: SloydDocument, after: SloydDocument): string[][];
```

- [ ] **Step 1: failing tests** (`repair.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import f1 from './fixtures/1-frames-duplicates.json?raw';
import f2 from './fixtures/2-frames-phantom.json?raw';
import f3 from './fixtures/3-frames-turned.json?raw';
import f4 from './fixtures/4-cases-every-kind.json?raw';
import f5 from './fixtures/5-rail-enters-once.json?raw';
import f6 from './fixtures/6-nested.json?raw';
import { flatDocument, migrateDocument, writeBackFlat, worldParts } from '../../document/document';
import type { Board, Cut, FlatDocument, SloydDocument } from '../../document/document';
import { findSites, jointKey } from './sites';
import { applyJoints } from './recipes';
import { defaultChoice } from './choose';
import { cutBox, gateUnjoin, sameCut, sameJoined } from './unjoin';
import type { RecordedJoint } from './unjoin';
import { REPAIR_REFUSAL, repairDocument, repairJoints, splitCopies } from './repair';

type Fx = { plain: SloydDocument; choices: RecordedJoint[]; damaged: SloydDocument };
const load = (raw: string): Fx => { const j = JSON.parse(raw); return { plain: migrateDocument(j.plain), choices: j.choices, damaged: migrateDocument(j.damaged) }; };
const DAMAGED: [string, string, number][] = [['1', f1, 2], ['2', f2, 3], ['3', f3, 2], ['4', f4, 12], ['6', f6, 12]];

/** Today's (fixed) joinery over the saved plain input and choices: independent of the code under test. */
function oracle(fx: Fx): FlatDocument {
  const flat = flatDocument(fx.plain);
  const sites = findSites(flat);
  const rec = new Map(fx.choices.map((c) => [jointKey(c.enter, c.receive, c.axis, c.side), c.choice]));
  const key = (s: (typeof sites)[number]) => jointKey(flat.boards[s.enter]!.name, flat.boards[s.receive]!.name, s.axis, s.side);
  return applyJoints(flat, sites, sites.map((s) => ({ site: s.id, ...(rec.get(key(s)) ?? { joint: 'butt' as const }) }))).doc;
}
const repaired = (fx: Fx) => {
  const flat = flatDocument(fx.damaged);
  const r = repairJoints(flat);
  if (r === null || 'refused' in r) throw new Error(`expected a repair, got ${JSON.stringify(r)}`);
  return { flat, r, out: { ...flat, boards: r.boards } as FlatDocument };
};

describe('the fixtures are damaged as recorded', () => {
  it.each(DAMAGED)('fixture %s: Refine’s gate refuses it', (_n, raw) => {
    expect(gateUnjoin(flatDocument(load(raw).damaged))).toHaveProperty('refused');
  });
});

describe('repairJoints on the damaged fixtures', () => {
  it.each(DAMAGED)('fixture %s equals today’s joinery over its plain input (the oracle)', (_n, raw) => {
    const fx = load(raw);
    expect(sameJoined(repaired(fx).out, oracle(fx))).toBe(true);
  });
  it.each(DAMAGED)('fixture %s removes exactly the recorded count', (_n, raw, n) => {
    expect(repaired(load(raw)).r.dropped).toBe(n);
  });
  it.each(DAMAGED)('fixture %s is subtractive: everything but cuts as stored, every surviving cut a stored cut object’s values', (_n, raw) => {
    const { flat, out } = repaired(load(raw));
    out.boards.forEach((b, i) => {
      const { cuts, ...rest } = b; const { cuts: was, ...wasRest } = flat.boards[i]!;
      expect(rest).toEqual(wasRest);
      for (const c of cuts) expect(was).toContainEqual(c);
    });
  });
  it.each(DAMAGED)('fixture %s passes Refine’s gate afterwards', (_n, raw) => {
    expect(gateUnjoin(repaired(load(raw)).out)).not.toHaveProperty('refused');
  });
});

describe('repairJoints returns null for designs this bug did not damage', () => {
  it('a plain design', () => { expect(repairJoints(flatDocument(load(f1).plain))).toBeNull(); });
  it('fixture 5 (joined by the buggy code, undamaged: waste cuts were never aliased)', () => {
    expect(repairJoints(flatDocument(load(f5).damaged))).toBeNull();
  });
  it('a shared assembly joined with TODAY’s joinery', () => {
    expect(repairJoints(oracle(load(f2)))).toBeNull();
  });
  it('the same with a hand-added cut (evidence rule: Refine’s gate message stands)', () => {
    const o = oracle(load(f2));
    const i = o.boards.findIndex((b) => b.name === 'Back › Leg');
    const hand = { ...o.boards[i]!.cuts[0]!, id: 'hand', offset: o.boards[i]!.cuts[0]!.offset - 3 };
    const flat = { ...o, boards: o.boards.map((b, k) => (k === i ? { ...b, cuts: [...b.cuts, hand] } : b)) };
    expect(repairJoints(flat)).toBeNull();
  });
  it('an unrelated part sharing a twin’s id but not its name, carrying a copy of its mortise (name condition)', () => {
    const o = oracle(load(f1));
    const leg = o.boards.find((b) => b.name === 'Front › Leg')!;
    const spare: Board = { ...leg, id: `elsewhere/${leg.id.split('/').pop()}`, name: 'Elsewhere › Spare', position: [100, 0, 100] };
    expect(repairJoints({ ...o, boards: [...o.boards, spare] })).toBeNull();
  });
});

describe('repairJoints refuses damage it cannot account for', () => {
  const tweak = (raw: string, name: string, f: (b: Board) => Board) => {
    const flat = flatDocument(load(raw).damaged);
    return { ...flat, boards: flat.boards.map((b) => (b.name === name ? f(b) : b)) };
  };
  it('a damaged fixture plus a hand-added cut', () => {
    const flat = tweak(f2, 'Front › Rail', (b) => ({ ...b, cuts: [...b.cuts, { ...b.cuts[0]!, id: 'hand', offset: b.cuts[0]!.offset + 1 }] }));
    expect(repairJoints(flat)).toEqual({ refused: REPAIR_REFUSAL });
  });
  it('a phantom moved 1/16in (a near-miss is not a twin stray)', () => {
    const o = oracle(load(f2));
    const back = o.boards.findIndex((b) => b.name === 'Back › Leg');
    const isPhantom = (c: Cut) => !o.boards[back]!.cuts.some((d) => sameCut(c, d));
    const flat = tweak(f2, 'Back › Leg', (b) => ({ ...b, cuts: b.cuts.map((c) => (isPhantom(c) ? { ...c, offset: c.offset + 1 / 16 } : c)) }));
    expect(repairJoints(flat)).toEqual({ refused: REPAIR_REFUSAL });
  });
  it('a damaged fixture with a joined part resized by hand', () => {
    // The shelf is dadoed at both ends, so a longer shelf cannot round-trip (a rail's free end could).
    // Its own pocket goes unexplained while the twin case's identical pocket is explained: only the
    // emptiness condition stops the repair deleting a pocket the shelf still fills.
    const flat = tweak(f4, 'Left case › Shelf', (b) => ({ ...b, length: b.length + 0.5 }));
    expect(repairJoints(flat)).toEqual({ refused: REPAIR_REFUSAL });
  });
  it('a damaged fixture with a part placed inside its phantom (occupied, so not a stray)', () => {
    const flat = flatDocument(load(f2).damaged);
    const o = oracle(load(f2));
    const back = flat.boards.findIndex((b) => b.name === 'Back › Leg');
    // The phantom: the Back leg's cut that today's joinery does not make.
    const phantom = flat.boards[back]!.cuts.find((c) => !o.boards[back]!.cuts.some((d) => sameCut(c, d)))!;
    const box = cutBox(flat.boards[back]!, phantom);
    const filler: Board = { ...flat.boards[0]!, id: 'filler', name: 'Filler', cuts: [], posture: 'flat', rotation: 0,
      position: [...box.min] as [number, number, number], length: box.max[0] - box.min[0], width: box.max[2] - box.min[2], thickness: box.max[1] - box.min[1] };
    // Check the filler really covers the box (posture decides which dimension runs on which axis):
    // if worldSolids(filler)[0] does not equal the box, fix the FILLER's dimensions, not the expectation.
    expect(repairJoints({ ...flat, boards: [...flat.boards, filler] })).toEqual({ refused: REPAIR_REFUSAL });
  });
});

describe('repairJoints reorders to the re-join’s order', () => {
  it('a damaged fixture with one part’s stored cuts reversed still repairs, in the oracle’s order', () => {
    const fx = load(f4);
    const flat = flatDocument(fx.damaged);
    const i = flat.boards.findIndex((b) => b.name === 'Left case › Left');
    const rev = { ...flat, boards: flat.boards.map((b, k) => (k === i ? { ...b, cuts: [...b.cuts].reverse() } : b)) };
    const r = repairJoints(rev);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(sameJoined({ ...flat, boards: r.boards }, oracle(fx))).toBe(true);
  });
});

describe('repairDocument', () => {
  it('fixtures 1, 4 and 6 keep their definitions shared; nothing split', () => {
    for (const raw of [f1, f4, f6]) {
      const fx = load(raw); const r = repairDocument(fx.damaged);
      if (r === null || 'refused' in r) throw new Error('expected a repair');
      expect(r.doc.definitions).toHaveLength(fx.damaged.definitions.length);
      expect(r.splits).toEqual([]);
    }
  });
  it('fixture 2 splits Front from Back (their copies now differ)', () => {
    const fx = load(f2); const r = repairDocument(fx.damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(r.doc.definitions).toHaveLength(2);
    expect(r.splits).toEqual([['Front', 'Back']]);
  });
  it('fixture 3 stays split as stored', () => {
    const fx = load(f3); const r = repairDocument(fx.damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(r.doc.definitions).toHaveLength(fx.damaged.definitions.length);
    expect(r.splits).toEqual([]);
  });
  it('the written-back tree flattens to the repaired parts', () => {
    const fx = load(f2); const r = repairDocument(fx.damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(sameJoined(flatDocument(r.doc), oracle(fx))).toBe(true);
  });
  it.each(DAMAGED)('fixture %s: repairing the repaired document finds nothing (review focus 5)', (_n, raw) => {
    const r = repairDocument(load(raw).damaged);
    if (r === null || 'refused' in r) throw new Error('expected a repair');
    expect(repairDocument(r.doc)).toBeNull();
  });
  it('passes a refusal and a null through', () => {
    expect(repairDocument(load(f5).damaged)).toBeNull();
  });
});

describe('splitCopies', () => {
  it('names nested placements by display path', () => {
    const fx = load(f6);
    // Split the inner Frame by hand: give the second bench's Front its own copy of the definition.
    const after = structuredClone(fx.damaged);
    const outer = after.definitions.find((d) => d.instances.length > 0)!;
    const inner = after.definitions.find((d) => d.id === outer.instances[0]!.definition)!;
    after.definitions.push({ ...structuredClone(inner), id: 'copy' });
    outer.instances[0]!.definition = 'copy';
    const names = splitCopies(fx.damaged, after).flat();
    expect(names.every((n) => n.includes(' › '))).toBe(true);
    expect(names).toHaveLength(4);
  });
});
```

(`toContainEqual` compares values, ids included. If a fixture's stored names differ from the ones used above — `Front › Leg`, `Back › Leg`, `Front › Rail`, `Left case › Left`, placements `Front`/`Back` — read them from the JSON and fix the TEST, not the fixture; report it.)

- [ ] **Step 2:** `npx vitest run src/generate/joints/repair.test.ts` — fails (no module).
- [ ] **Step 3: implement** `repair.ts`:

```ts
import { definitionAt, flatDocument, instanceAt, itemPaths, lastSegment, migrateDocument, NAME_SEPARATOR, PATH_SEPARATOR, writeBackFlat } from '../../document/document';
import type { Board, Cut, FlatDocument, SloydDocument } from '../../document/document';
import { TOUCH, worldSolids } from '../../document/designCheck';
import { cutBox, gateUnjoin, readJoints, rejoin, sameCut } from './unjoin';

/**
 * Repairing what joinery did before a899b51 (repair-joints spec §2, follow-up 240): twin
 * placements of one definition shared one `cuts` array, so every copy of a receiving part
 * carries every copy's pockets — duplicates, and phantoms where only one copy had the joint.
 * Subtractive: the stored parts with the bug's cuts removed and the rest put in re-join order,
 * proved by Refine's own gate. Pure; no model call.
 */
export const REPAIR_REFUSAL = "Sloyd can't repair this project's joints automatically — re-run Add joinery from the unjoined original.";

const ownName = (b: Board) => b.name.split(NAME_SEPARATOR).pop()!;
const refused = { refused: REPAIR_REFUSAL } as const;

export function repairJoints(flat: FlatDocument): null | { boards: Board[]; dropped: number } | { refused: string } {
  // Twins: the same stored part under different placements (ids kept through splits); the name
  // guards against unrelated parts sharing an id (ids are unique per container only).
  const key = (b: Board) => `${lastSegment(b.id)}\u0000${ownName(b)}`;
  const groups = new Map<string, number[]>();
  flat.boards.forEach((b, i) => groups.set(key(b), [...(groups.get(key(b)) ?? []), i]));
  const twins = flat.boards.map((b, i) => groups.get(key(b))!.filter((j) => j !== i));
  // 1. Pre-check.
  if (!flat.boards.some((b, i) => twins[i]!.length > 0 && b.cuts.length > 0)) return null;
  // 2. De-duplicate (first kept). Before the read-back: a doubled pocket hides its joint from it.
  let dropped = 0;
  const deduped = flat.boards.map((b, i) => {
    if (twins[i]!.length === 0) return b;
    const cuts = b.cuts.filter((c, k) => !b.cuts.slice(0, k).some((d) => sameCut(c, d)));
    dropped += b.cuts.length - cuts.length;
    return { ...b, cuts };
  });
  // 3. Lenient read-back.
  const read = readJoints({ ...flat, boards: deduped });
  if ('refused' in read) return dropped > 0 ? refused : null;
  const isUnexplained = (i: number, k: number) => read.unexplained.some((u) => u.part === i && u.cut === k);
  // 4. Twin strays: equal to a cut the reader explained on a twin, AND empty — a phantom is a
  // pocket nothing enters (a hand-resized part's own pocket is filled, and must not be deleted).
  const solids = deduped.map(worldSolids);
  const empty = (part: number, c: Cut) => {
    const box = cutBox(deduped[part]!, c);
    return !solids.some((ss, j) => j !== part && ss.some((s) => [0, 1, 2].every((i) => Math.min(box.max[i]!, s.max[i]!) - Math.max(box.min[i]!, s.min[i]!) > TOUCH)));
  };
  const strays = read.unexplained.filter(({ part, cut }) => {
    const c = deduped[part]!.cuts[cut]!;
    return twins[part]!.some((t) => deduped[t]!.cuts.some((d, k) => !isUnexplained(t, k) && sameCut(c, d))) && empty(part, c);
  });
  // 7. Evidence first: no duplicate and no twin stray → not this bug's damage.
  if (dropped === 0 && strays.length === 0) return null;
  if (strays.length !== read.unexplained.length) return refused;
  dropped += strays.length;
  // 5. Prune, then put each part's surviving STORED cuts in the re-join's order.
  const again = rejoin({ ...flat, boards: read.plain }, read.joints);
  if (!again) return refused;
  const boards: Board[] = [];
  for (let i = 0; i < deduped.length; i++) {
    const left = deduped[i]!.cuts.filter((_, k) => !isUnexplained(i, k));
    const order = again.boards[i]!.cuts;
    if (order.length !== left.length) return refused;
    const cuts: Cut[] = [];
    for (const o of order) {
      const k = left.findIndex((c) => sameCut(c, o));
      if (k < 0) return refused;
      cuts.push(left.splice(k, 1)[0]!);
    }
    boards.push({ ...deduped[i]!, cuts });
  }
  // 6. Prove: Refine's gate, unchanged.
  if ('refused' in gateUnjoin({ ...flat, boards })) return refused;
  return { boards, dropped };
}

export type RepairCheck = null | { refused: string } | { doc: SloydDocument; dropped: number; splits: string[][] };

/** The repair written back into the tree (invariant 46), with the placements it un-shared. */
export function repairDocument(doc: SloydDocument): RepairCheck {
  const flat = flatDocument(doc);
  const r = repairJoints(flat);
  if (r === null || 'refused' in r) return r;
  const out = migrateDocument(writeBackFlat(doc, flat.boards, r.boards));
  return { doc: out, dropped: r.dropped, splits: splitCopies(doc, out) };
}

const instanceName = (doc: SloydDocument, path: string) => {
  const segs = path.split(PATH_SEPARATOR);
  return segs.map((_, i) => instanceAt(doc, segs.slice(0, i + 1).join(PATH_SEPARATOR))!.name).join(NAME_SEPARATOR);
};

export function splitCopies(before: SloydDocument, after: SloydDocument): string[][] {
  const byDef = new Map<string, string[]>();
  for (const p of itemPaths(before)) {
    if (!instanceAt(before, p)) continue;
    const d = definitionAt(before, p)!.id;
    byDef.set(d, [...(byDef.get(d) ?? []), p]);
  }
  const out: string[][] = [];
  for (const paths of byDef.values()) {
    if (paths.length < 2) continue;
    if (new Set(paths.map((p) => definitionAt(after, p)?.id)).size > 1) out.push(paths.map((p) => instanceName(before, p)));
  }
  return out;
}
```

- [ ] **Step 4:** `npx vitest run src/generate/joints/` — green.
- [ ] **Step 5: mutate** (each must turn a named test red; revert after each; record):
  1. Skip de-duplication (step 2 returns `b`) → the fixture oracle tests fail.
  2. Accept every unexplained cut as a stray → `a damaged fixture plus a hand-added cut` fails.
  3. Skip the reorder (use `left` as is) → the reversed-cuts test fails.
  4. Make `sameCut` exact (in `unjoin.ts`, temporarily) → fixture 3's tests fail.
  5. Drop the name from `key` → the name-condition test fails.
  6. Remove the evidence rule → the today's-joinery-plus-hand-cut test fails (it refuses instead of `null`).
  7. Drop `&& empty(part, c)` → the occupied-phantom test AND the resized-shelf test fail. If the resized-shelf test still passes under this mutant, record why (it refused for another reason) — the occupied-phantom test must fail.
- [ ] **Step 6:** `npm run build` clean; commit `feat(repair): repairJoints and repairDocument — prune the pre-a899b51 strays, prove by the gate (fu 240)`.

---

### Task 4: The action and the dialogs

**Files:** Create `src/useRepair.ts`, `src/useRepair.test.tsx`, `src/panels/RepairNotice.tsx`, `src/panels/RepairNotice.test.tsx`; modify `src/generate/refine.ts` (+ `refineBase.test.ts`), `src/panels/RefineDialog.tsx` (+ test), `src/panels/JoineryDialog.tsx` (+ test), `src/App.tsx`.

**Interfaces — Consumes:** Task 3's `repairDocument`, `RepairCheck`.
**Produces:**

```ts
// src/useRepair.ts
export type RepairRun =
  | { status: 'saving' }
  | { status: 'ready'; projectId: string; projectName: string; dropped: number; splits: string[][] }
  | { status: 'failed'; error: string };
export function useRepair(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }):
  { run: RepairRun | null; repair: (doc: SloydDocument) => Promise<void>; reset: () => void };
// src/panels/RepairNotice.tsx
export const REPAIR_NOTE: string; export const JOINERY_WARNING: string;
export function RepairNotice(p: { check: Exclude<RepairCheck, null>; context: 'refine' | 'joinery'; libraryAvailable: boolean;
  run: RepairRun | null; onRepair: () => void; onOpenProject: (id: string) => void }): JSX.Element;
export function nameList(names: string[]): string;   // 'A', 'A and B', 'A, B and C'
// src/generate/refine.ts — refineDialogInfo(doc) gains `repair: RepairCheck` (null unless the gate refused)
// RefineDialog, JoineryDialog — new optional prop `repairNotice?: ReactNode`
```

- [ ] **Step 1: failing tests.**

`useRepair.test.tsx` (mock storage exactly as `useRefine.test.tsx` does):

```ts
vi.mock('./storage/browser', () => ({ storage: { available: true, createProject: vi.fn() } }));
// load fixture 2's damaged doc via ?raw + migrateDocument
it('writes the repair WITHOUT activating it, named "<name> — repaired", and reports the count and the split', async () => {
  createProject.mockResolvedValue('p1');
  const { result, onCreated } = setup();
  await act(() => result.current.repair(damaged2));
  expect(createProject).toHaveBeenCalledTimes(1);
  expect(createProject.mock.calls[0][1]).toEqual({ activate: false });
  expect(createProject.mock.calls[0][0].name).toBe(`${damaged2.name} — repaired`);
  expect(result.current.run).toEqual({ status: 'ready', projectId: 'p1', projectName: `${damaged2.name} — repaired`, dropped: 3, splits: [['Front', 'Back']] });
  expect(onCreated).toHaveBeenCalledWith('p1');
});
it('two clicks write one project (review focus 3)', async () => {
  let release!: (v: string) => void;
  createProject.mockReturnValue(new Promise<string>((r) => { release = r; }));
  const { result } = setup();
  let a!: Promise<void>, b!: Promise<void>;
  act(() => { a = result.current.repair(damaged2); b = result.current.repair(damaged2); });
  release('p1'); await act(() => Promise.all([a, b]));
  expect(createProject).toHaveBeenCalledTimes(1);
});
it('a failed write says so (review focus 4)', async () => {
  createProject.mockResolvedValue(null);
  const { result } = setup();
  await act(() => result.current.repair(damaged2));
  expect(result.current.run).toEqual({ status: 'failed', error: 'Could not save the project — storage is unavailable.' });
});
it('an undamaged document writes nothing', async () => {
  const { result } = setup();
  await act(() => result.current.repair(plain2));
  expect(createProject).not.toHaveBeenCalled();
  expect(result.current.run).toEqual({ status: 'failed', error: 'Nothing to repair.' });
});
it('reset clears the run', async () => { /* repair, then act(() => result.current.reset()), run null */ });
```

`RepairNotice.test.tsx`:

```ts
const ok = { doc: {} as SloydDocument, dropped: 3, splits: [] };
it('shows the note and the button; the click calls onRepair', /* render context="refine"; getByText(REPAIR_NOTE); click 'Repair joints' */);
it('joinery adds the warning; refine does not', /* JOINERY_WARNING present only for context="joinery" */);
it('a refused check shows its text and no button', /* check={{ refused: 'X' }} → getByText('X'), no 'Repair joints' button */);
it('disables the button when storage is unavailable and while saving (review focus 4)', /* libraryAvailable false → disabled; run saving → disabled */);
it('done: the saved line, one split line per split, and Open', () => {
  const onOpen = vi.fn();
  render(<RepairNotice check={ok} context="refine" libraryAvailable run={{ status: 'ready', projectId: 'p9', projectName: 'Frames — repaired', dropped: 3, splits: [['Front', 'Back']] }} onRepair={vi.fn()} onOpenProject={onOpen} />);
  screen.getByText("Saved as 'Frames — repaired' — 3 stray cuts removed.");
  screen.getByText('Front and Back no longer match, so they are no longer shared.');
  fireEvent.click(screen.getByRole('button', { name: 'Open Frames — repaired' }));
  expect(onOpen).toHaveBeenCalledWith('p9');
  expect(screen.queryByRole('button', { name: 'Repair joints' })).toBeNull();
});
it('one stray cut is singular', /* dropped 1 → "— 1 stray cut removed." */);
it('a failed run shows its error', /* run failed 'Boom' → getByText('Boom') */);
it('nameList', () => { expect(nameList(['A'])).toBe('A'); expect(nameList(['A', 'B'])).toBe('A and B'); expect(nameList(['A', 'B', 'C'])).toBe('A, B and C'); });
```

`RefineDialog.test.tsx`: with `refusal="gate message"` and `repairNotice={<p>NOTICE</p>}` → `NOTICE` shown, `gate message` absent, Refine disabled; without `repairNotice` the refusal shows as today (existing test unchanged).
`JoineryDialog.test.tsx`: `repairNotice={<p>NOTICE</p>}` renders it; without it nothing extra (existing tests unchanged).
`refineBase.test.ts`: `refineDialogInfo(damaged2).repair` has `dropped: 3`; for an undamaged joined design (`oracle`-style, or an existing joined fixture there) `repair` is `null`; for a plain design `repair` is `null`.

- [ ] **Step 2:** run the five test files — fail.
- [ ] **Step 3: implement.**

`src/useRepair.ts`:

```ts
import { useCallback, useRef, useState } from 'react';
import type { SloydDocument } from './document/document';
import { repairDocument } from './generate/joints/repair';
import { storage } from './storage/browser';

/**
 * The repair action's state (repair-joints spec §3). Writes only via createProject(…, { activate:
 * false }) (invariant 36); opening the result is App's openProject. No model call, so no key.
 */
export function useRepair(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }) {
  const [run, setRun] = useState<RepairRun | null>(null);
  const busy = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const repair = useCallback(async (doc: SloydDocument) => {
    if (busy.current) return;
    busy.current = true;
    setRun({ status: 'saving' });
    try {
      const r = repairDocument(doc);
      if (r === null || 'refused' in r) { setRun({ status: 'failed', error: r === null ? 'Nothing to repair.' : r.refused }); return; }
      const name = `${doc.name} — repaired`;
      const id = await storage.createProject({ ...r.doc, name }, { activate: false });
      optsRef.current.onStorageVerdict();
      if (!id) { setRun({ status: 'failed', error: 'Could not save the project — storage is unavailable.' }); return; }
      optsRef.current.onCreated(id);
      setRun({ status: 'ready', projectId: id, projectName: name, dropped: r.dropped, splits: r.splits });
    } finally {
      busy.current = false;
    }
  }, []);
  const reset = useCallback(() => setRun(null), []);
  return { run, repair, reset };
}
```

`src/panels/RepairNotice.tsx`: render, in a `<div className="repair-notice">`:
- refused check → `<p className="field-error" role="status">{check.refused}</p>`;
- otherwise `<p role="status">{REPAIR_NOTE}</p>`, then `JOINERY_WARNING` in a `<p>` when `context === 'joinery'`, then (unless `run?.status === 'ready'`) `<button disabled={!p.libraryAvailable || p.run?.status === 'saving'} onClick={p.onRepair}>Repair joints</button>`;
- `run.status === 'failed'` → `<p className="field-error">{run.error}</p>`;
- `run.status === 'ready'` → the done line, one split line per `splits` entry (`nameList`), and `<button aria-label={`Open ${run.projectName}`} onClick={() => p.onOpenProject(run.projectId)}>Open</button>`.

`refine.ts`: `refineDialogInfo` returns `repair: 'refused' in base && base.refused.reason === 'joints' ? repairDocument(doc) : null` (import from `./joints/repair`). Do NOT change `refusal`.

`RefineDialog.tsx`: `repairNotice?: ReactNode` in Props; replace the refusal branch with `{p.refusal !== null ? (p.repairNotice ?? <p className="field-error" role="status">{p.refusal}</p>) : (…form…)}`.
`JoineryDialog.tsx`: `repairNotice?: ReactNode`; render `{p.repairNotice}` right after the sites list / NO_SITES paragraph.

`App.tsx`:
- `const repair = useRepair({ onCreated: (id) => setNewIds((s) => new Set(s).add(id)), onStorageVerdict: () => setAvailable(storage.available) });`
- `useEffect(() => { if (dialog === null) repair.reset(); }, [dialog, repair.reset]);` — closing a dialog clears a finished repair.
- `const joineryRepair = useMemo(() => (dialog === 'joinery' ? repairDocument(doc) : null), [dialog, doc]);` beside `joinerySites` (comment: once per document while the dialog is open; the pre-check and evidence rule make it null for undamaged designs).
- One builder:

```tsx
const repairNotice = (check: RepairCheck, context: 'refine' | 'joinery') => check && (
  <RepairNotice check={check} context={context} libraryAvailable={libraryAvailable} run={repair.run}
    onRepair={() => void repair.repair(useStore.getState().doc)}
    // The ONE adopting path (invariant 36): the existing openProject.
    onOpenProject={(id) => { setDialog(null); void openProject(id); }} />
);
```

  passed as `repairNotice={repairNotice(refineInfo.repair, 'refine')}` and `repairNotice={repairNotice(joineryRepair, 'joinery')}`.
- [ ] **Step 4:** `npm test` green; `npm run build` clean.
- [ ] **Step 5: mutate** — drop `busy` → two-clicks test fails; `activate: true` → the activate assertion fails; drop the `context === 'joinery'` condition → the refine-has-no-warning test fails; make `refineDialogInfo.repair` always `repairDocument(doc)` → still green is acceptable only if the plain/undamaged cases stay null — record what happened. Revert; record.
- [ ] **Step 6:** commit `feat(repair): Repair joints in the Refine and Joinery dialogs (fu 240)`.

---

### Task 5: Live check, docs, merge (controller; needs the user for the merge)

- [ ] **Live check (dev server on port 5199, Playwright MCP, no paid runs):**
  1. In the dev profile, import `src/generate/joints/fixtures/2-frames-phantom.json`'s `damaged` document (write it to a temp `.sloyd` file; use the project menu's Import). Note its project id.
  2. Open it; open Refine → the note and `Repair joints` show, no gate message. Click it → the done line `— 3 stray cuts removed.` and the split line.
  3. Read localStorage: the new `… — repaired` project exists, not active; its Back leg has 1 cut, Front leg 2.
  4. Open it via Open; open Refine → the normal form (no note). Open Add joinery on it → no note.
  5. Delete ONLY the imported project and the repaired one; read back that the stored key and the older projects are untouched.
  Write `docs/browser-verification-repair-joints.md`.
- [ ] **Docs:** close fu 240 in `docs/follow-ups.md` (closure: the repair action, fixtures, the measured damage shape); CLAUDE.md "Where things live" (`generate/joints/repair.ts`, `fixtures/`, `useRepair.ts`, `RepairNotice`), Status, a Rounds row `| repair joints | 10-09 | — | Repair joints: prune pre-a899b51 strays, prove by the gate (fu 240) |`, test count; `docs/history.md` entry.
- [ ] **Final review**, then `git checkout master && git merge --no-ff repair-joints`, `npm test` + `npm run build` on the merged tree, delete the branch. Deploy only when the user says so.
