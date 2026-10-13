# Turned links (fu 301) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generated or refined table's four inside-tapered square legs become ONE linked component: role linking stores
each leg at the quarter turn that makes it identical, and aligns angle-cut ids so identical tapered parts link at all.

**Architecture:** Everything happens in `linkByRole` (`src/document/roleLinks.ts`), the one place Generate and Refine decide
which same-role parts share a Shape:
- A new `turnCandidates(b)` lists the part re-stored at each other quarter turn that keeps its world box and grain axis. Its
  tapers are re-stored through `taperWorld` (`worldTapers` → `taperCutsFor`).
- A new `alignedTo(rep, b)` gives a part the representative's angle-cut ids when their angle cuts match by geometry.
- The class search tries the part itself, then its candidates.
- A part that matches through a candidate is replaced in the document before `linksToShapes` runs.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-sloyd-turned-links-design.md`. Read it first, including the passages marked
*amended while planning*. Also read CLAUDE.md invariants 2, 44, 45 and 48.

## Global Constraints

- No schema change; `CURRENT_VERSION` stays 14. No change to `DESIGN_SCHEMA`.
- Layer rule: `roleLinks.ts` is in `document`. It may import `taperWorld`, `geometry`, `angleCuts`, `ids` and `links`, and
  never `units`.
- Every world↔part crossing goes through `geometry.ts` helpers or `taperWorld` (invariant 44). A turned candidate's tapers
  are re-stored by `taperCutsFor(candidate, worldTapers(b))`, never by hand.
- `sameShared` (`links.ts`) is the ONE equality for linking (invariant 45). Do not loosen it. Align ids instead, and only when
  the angle cuts are equal by `sameAngleCut`.
- An untapered design links byte-for-byte as before: no turn, the same stored objects, the same Shapes.
- `npm run build` is the typecheck gate; `npm test` does not typecheck.
- Mutate every plan-supplied test once before trusting it. Plan code and expectations have been wrong before. Fix the code
  if the code is wrong; if an expectation is wrong, keep its intent, fix it, and say so in your report.

## Review Focus

1. **The four corner legs at different stored encodings.** `orient` may store a square upright leg at 0° or 90° depending on
   tie-breaks. The search must still find each leg's matching turn (any of 0/90/180/270), whatever the representative's turn.
   Test in Task 1 (the four-leg set, with turns asserted as a permutation of 0/90/180/270).
2. **A world part changed by a turn.** Box, position and tapered world faces must be identical before and after. Task 1
   asserts `boardExtents`, `position` and `worldTapers` per leg against the unlinked conversion.
3. **Grain direction on a square flat part.** A 90° turn would show its figure crosswise and must be refused. Test in Task 1.
4. **Refine round trip.** A refined linked table must stay one leg component, and the change list must say nothing. Test in
   Task 2.
5. **Joinery on the linked legs.** It must keep the Shape when the four legs' cuts are identical. Test in Task 2. If it
   splits, report it; do not bend the test.

---

### Task 1: turn candidates, id alignment, and the class search

**Files:**
- Modify: `src/document/roleLinks.ts`
- Test: `src/document/roleLinks.test.ts` (extend)

**Interfaces:**
- Consumes:
  - `worldTapers` and `taperCutsFor` (`taperWorld.ts`).
  - `boardExtents` and `axisDimensions` (`geometry.ts`).
  - `sameAngleCut` (`angleCuts.ts`), `sameShared` (`links.ts`), `nextId` (`ids.ts`).
- Produces:
  - `export function turnCandidates(b: Board): Board[]`
  - `export function alignedTo(rep: Board, b: Board): Board | null`
  - `linkByRole` with the same signature and new behaviour.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/roleLinks.test.ts`. Add imports: `turnCandidates` and `alignedTo` from `./roleLinks`;
`createBoard`, `flatDocument` from `./document` (check where `flatDocument` is exported; `./tree` also has it);
`worldTapers` from `./taperWorld`; `boardExtents` from `./geometry`; `taperCut` from `./angleCuts`; `Board` type.

```ts
describe('turned links (fu 301)', () => {
  type Dir = '+x' | '-x' | '+z' | '-z';
  const tapered = (name: string, at: [number, number, number], size: [number, number, number], faces: Dir[], role = 'leg'): GeneratedPart =>
    ({ ...part(name, role, at, size), tapers: [{ faces, toward: '-y', start: 20, amount: 0.5 }] });
  // The prompt's corner rule: each leg tapers its two INSIDE faces.
  const inside = (size: [number, number, number] = LEG, role = 'leg') => [
    tapered('Leg FL', [0, 0, 0], size, ['+x', '+z'], role), tapered('Leg FR', [20, 0, 0], size, ['-x', '+z'], role),
    tapered('Leg BL', [0, 0, 20], size, ['+x', '-z'], role), tapered('Leg BR', [20, 0, 20], size, ['-x', '-z'], role),
  ];
  const stored = (doc: ReturnType<typeof designToDocument>['doc']) => [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const shapeIds = (doc: ReturnType<typeof designToDocument>['doc']) => new Set(stored(doc).filter(isShaped).map((b) => b.shape));
  const world = (doc: ReturnType<typeof designToDocument>['doc']) => flatDocument(doc).boards
    .map((b) => ({ name: b.name, box: boardExtents(b), at: b.position, tapers: worldTapers(b) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  it('identical tapered parts link (the angle-cut id fix)', () => {
    const { doc } = designToDocument(d([0, 20, 40].map((x, i) => tapered(`Leg ${i + 1}`, [x, 0, 0], LEG, ['+x']))));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3']);
  });

  it('four inside-tapered square legs become ONE component, each world leg unchanged', () => {
    const unlinked = designToDocument(d(inside(LEG, ''))).doc;   // no role: today's encoding, never linked
    const { doc } = designToDocument(d(inside()));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Leg BL', 'Leg BR', 'Leg FL', 'Leg FR']);
    expect(world(doc)).toEqual(world(unlinked));
    expect(stored(doc).map((b) => b.rotation).sort((a, b) => a - b)).toEqual([0, 90, 180, 270]);
  });

  it('an outside-tapered set links the same way', () => {
    const outside: GeneratedPart[] = [
      tapered('Leg FL', [0, 0, 0], LEG, ['-x', '-z']), tapered('Leg FR', [20, 0, 0], LEG, ['+x', '-z']),
      tapered('Leg BL', [0, 0, 20], LEG, ['-x', '+z']), tapered('Leg BR', [20, 0, 20], LEG, ['+x', '+z']),
    ];
    expect(designToDocument(d(outside)).doc.shapes).toHaveLength(1);
  });

  it('legs tapered on different numbers of faces do not link', () => {
    const ps = inside();
    ps[3] = tapered('Leg BR', [20, 0, 20], LEG, ['-x']);
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toEqual(['Leg BL', 'Leg FL', 'Leg FR']);
  });

  it('a non-square leg set pairs only by 180°: two components', () => {
    const { doc } = designToDocument(d(inside([1.5, 28, 2.5])));
    expect(shapeIds(doc).size).toBe(2);
    expect(shapedNames(doc)).toEqual(['Leg BL', 'Leg BR', 'Leg FL', 'Leg FR']);
  });

  it('a square flat panel is never turned 90° (its figure would run crosswise)', () => {
    const b = createBoard({ length: 12, width: 12, thickness: 0.75, posture: 'flat', rotation: 0, grain: 'length' });
    expect(turnCandidates(b).map((c) => c.rotation)).toEqual([180]);
  });

  it('a part with rectangular cuts is never turned', () => {
    const b = createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright',
      cuts: [{ id: 'c', face: 'width', from: 'max', across: 'length', offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 }] });
    expect(turnCandidates(b)).toEqual([]);
  });

  it('candidates keep the world box, position and tapered faces', () => {
    const b: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright', rotation: 0, position: [3, 0, 4] }),
      angleCuts: [{ id: 'a1', ...taperCut({ face: 'width', from: 'max', end: 'min', start: 20, amount: 0.5 }) }] };
    const cs = turnCandidates(b);
    expect(cs.map((c) => c.rotation)).toEqual([90, 180, 270]);
    for (const c of cs) {
      expect(boardExtents(c)).toEqual(boardExtents(b));
      expect(c.position).toEqual(b.position);
      expect(worldTapers(c)).toEqual(worldTapers(b));
    }
  });

  it('alignedTo takes the representative\'s ids only when the angle cuts match by geometry', () => {
    const t = (id: string, start: number) => ({ id, ...taperCut({ face: 'width', from: 'max', end: 'min', start, amount: 0.5 }) });
    const rep: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), angleCuts: [t('r1', 20)] };
    const same: Board = { ...rep, id: 'other', angleCuts: [t('x9', 20)] };
    expect(alignedTo(rep, same)?.angleCuts.map((c) => c.id)).toEqual(['r1']);
    expect(alignedTo(rep, { ...same, angleCuts: [t('x9', 19)] })).toBeNull();
    const plain = createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' });
    expect(alignedTo({ ...plain, id: 'p0' }, plain)).toBe(plain);   // no angle cuts: the same object, as today
  });

  it('an untapered design links exactly as before: the same stored objects and turns', () => {
    const { doc } = designToDocument(d(legs()));
    expect(stored(doc).map((b) => b.rotation)).toEqual([0, 0, 0, 0]);
    expect(doc.shapes).toHaveLength(1);
  });
});
```

`LEG`, `part`, `d`, `legs` and `shapedNames` are the file's existing helpers. `GeneratedPart.tapers` takes
`WorldTaper[]`, so cast with `as never` where TypeScript needs it.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/roleLinks.test.ts`
Expected: FAIL. `turnCandidates` is not exported, and identical tapered parts give 0 Shapes.

- [ ] **Step 3: Implement**

Replace the body of `src/document/roleLinks.ts` below its imports (keep the doc comment, amended):

```ts
import type { Board, Rotation, SloydDocument, StoredBoard } from './types';
import { sameShared } from './links';
import { linksToShapes } from './linksToShapes';
import { dissolveShapes, isShaped, pruneShapes } from './shapes';
import { sameAngleCut } from './angleCuts';
import { axisDimensions, boardExtents } from './geometry';
import { nextId } from './ids';
import { taperCutsFor, worldTapers } from './taperWorld';

const TURNS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * The part re-stored at each OTHER quarter turn that leaves the world part unchanged (turned-links spec §2.2): the same
 * world box (so the same min corner, inv 2), the grain on the same world axis, and its tapers re-stored on the same world
 * faces through taperWorld (inv 44). None for a part with rectangular cuts, a non-taper angle cut or a non-standard taper.
 */
export function turnCandidates(b: Board): Board[] {
  if (b.cuts.length > 0 || b.angleCuts.some((c) => c.kind !== 'taper')) return [];
  const world = worldTapers(b);
  if (world === null) return [];
  const box = boardExtents(b);
  const grainAxis = axisDimensions(b).indexOf(b.grain);
  return TURNS.filter((r) => r !== b.rotation).flatMap((rotation): Board[] => {
    const t: Board = { ...b, rotation };
    if (boardExtents(t).some((v, i) => v !== box[i]) || axisDimensions(t).indexOf(b.grain) !== grainAxis) return [];
    const made = taperCutsFor(t, world);
    if ('fault' in made) return [];
    return [{ ...t, angleCuts: made.cuts.map((c, i) => ({ id: b.angleCuts[i]?.id ?? nextId(), ...c })) }];
  });
}

/**
 * `b` judged against a class representative (spec §2.3, amended): ids are not geometry, so a part whose angle cuts equal
 * the representative's (sameAngleCut, index by index) takes its ids first. Null when `sameShared` still says no. A part
 * with no angle cuts is judged as it is: the same object, so untapered linking is unchanged.
 */
export function alignedTo(rep: Board, b: Board): Board | null {
  if (b.angleCuts.length === 0) return sameShared(rep, b) ? b : null;
  if (b.angleCuts.length !== rep.angleCuts.length || !b.angleCuts.every((c, i) => sameAngleCut(c, rep.angleCuts[i]!))) return null;
  const a: Board = { ...b, angleCuts: b.angleCuts.map((c, i) => ({ ...c, id: rep.angleCuts[i]!.id })) };
  return sameShared(rep, a) ? a : null;
}

export function linkByRole(doc: SloydDocument, roles: ReadonlyMap<string, string>): SloydDocument {
  if (roles.size === 0) return doc;
  const stored: StoredBoard[] = [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const classes = new Map<string, Board[]>(); // role → one representative per class
  const labels = new Map<StoredBoard, string>();
  const replaced = new Map<StoredBoard, Board>(); // stored part → the aligned or turned part stored in its place
  for (const b of stored) {
    if (isShaped(b)) continue;
    const role = roles.get(b.id);
    if (!role) continue;
    const reps = classes.get(role) ?? [];
    classes.set(role, reps);
    let k = -1;
    let use: Board = b;
    for (let i = 0; i < reps.length && k < 0; i += 1) {
      // The part itself first, then each candidate in 0/90/180/270 order (spec §2.3).
      const hit = alignedTo(reps[i]!, b) ?? turnCandidates(b).map((c) => alignedTo(reps[i]!, c)).find((x) => x !== null) ?? null;
      if (hit) { k = i; use = hit; }
    }
    if (k < 0) { k = reps.length; reps.push(b); }
    if (use !== b) replaced.set(b, use);
    labels.set(use, `${role}#${k}`);
  }
  const swap = (bs: StoredBoard[]) => bs.map((b) => replaced.get(b) ?? b);
  const next: SloydDocument = replaced.size === 0 ? doc
    : { ...doc, boards: swap(doc.boards), definitions: doc.definitions.map((x) => ({ ...x, boards: swap(x.boards) })) };
  return dissolveShapes(pruneShapes(linksToShapes(next, labels)));
}
```

Check two things before relying on them:
- `linksToShapes` looks parts up by object identity (`partAt` then `legacy.get(stored)`). The labels must be keyed by the
  objects stored in `next`, which they are (`labels.set(use, …)`).
- `Board`'s `grain` is a `Dimension` (`types.ts`: `type Grain = Dimension`).

Update the doc comment of `linkByRole`: parts are judged with aligned angle-cut ids and, when the part itself does not
match, at each quarter turn that leaves the world part unchanged (turned-links spec).

- [ ] **Step 4: Run, full suite, typecheck**

Run: `npx vitest run src/document/roleLinks.test.ts && npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: all green.

Existing suites that assert a generated design's stored rotations or Shapes may now see turned legs. A test whose
expectation depends on tapered legs staying unlinked is out of date: update it, and list each one in your report with why.
An untapered expectation must NOT change. If one does, stop and report.

- [ ] **Step 5: Mutate**

Make each of these changes in turn, check that a test fails, and restore:
- Drop the grain-axis clause.
- Drop the extents clause.
- Make `alignedTo` skip the id rewrite.
- Make the search try only the part itself (no candidates).

- [ ] **Step 6: Commit**

```bash
git add src/document/roleLinks.ts src/document/roleLinks.test.ts
git commit -m "feat(generate): role linking aligns angle-cut ids and tries quarter turns — four tapered legs become one component (fu 301)"
```

---

### Task 2: Refine, joinery, the headline flow, and the prompt

**Files:**
- Modify: `src/generate/prompt.ts` (the "Legs whose tapers mirror each other…" line)
- Test:
  - `src/generate/prompt.test.ts`
  - `src/generate/joints/tapers.test.ts` (the headline describe)
  - `src/document/refineDesign.test.ts` (or `src/generate/refine.test.ts`; put the round trip beside the existing Refine
    taper round trips)

**Interfaces:**
- Consumes: Task 1's `linkByRole`, `documentToDesign`, `designValues`, `designToDocument`, `diffDesigns`, `applyJoints`,
  `findSites`, `writeBackFlat`, `worldParts`, `migrateDocument`.
- Produces: nothing new.

- [ ] **Step 1: The prompt line**

In `SYSTEM_PROMPT`, replace:
`- Legs whose tapers mirror each other (inside faces) differ, so they go under "parts", not in a repeated assembly, and do not share a role.`
with:
`- Legs tapered on their inside faces go under "parts", not in a repeated assembly; give them the same role ("leg"): Sloyd links legs that are the same leg turned.`

Update `prompt.test.ts`'s `toContain` for that line to the new text. Run the test, see it fail on the old text, then pass.

- [ ] **Step 2: The headline flow asserts one leg component**

In `tapers.test.ts`'s headline describe, give the four legs `role: 'leg'`. The other parts keep `''`. Add, after
`made.rejected`:

```ts
    // fu 301: the four inside-tapered legs are one component (turned links).
    const legShapes = new Set(made.doc.boards.filter((b) => b.name.startsWith('Leg')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(legShapes.size).toBe(1);
    expect([...legShapes][0]).toBeDefined();
```

Every existing assertion in that test must still pass unchanged: world tapers face inward, checks are clean, and joinery
applies.

- [ ] **Step 3: Joinery keeps the leg Shape**

In the same headline test, after `applyJoints`, write the joined world parts back to the tree as `runJoinery` does:

```ts
    const tree = migrateDocument(writeBackFlat(made.doc, flat.boards, worldParts(joined.doc)));
    const joinedLegShapes = new Set(tree.boards.filter((b) => b.name.startsWith('Leg')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(joinedLegShapes.size).toBe(1);
    expect([...joinedLegShapes][0]).toBeDefined();
```

Read `run.ts` `runJoinery`'s `build` to confirm that line is how it writes back. If joinery splits the Shape, do NOT change
the expectation. Report it as DONE_WITH_CONCERNS with which legs differ and why: the spec says this is pinned, not assumed.

- [ ] **Step 4: Refine round trip keeps one component and reports no change**

```ts
it('a refined table keeps its four turned legs as one component, and the change list is empty (fu 301)', () => {
  // The headline table's design (copy its json, legs with role 'leg'), converted with centre: false.
  const doc = designToDocument(parseDesign(json)!, { centre: false }).doc;
  const r = documentToDesign(doc, REFINE_MAX);
  if ('refused' in r) throw new Error(r.refused.message);
  const back = designToDocument(r.design, { centre: false, exact: designValues(r.design) }).doc;
  const legShapes = new Set(back.boards.filter((b) => b.name.startsWith('Leg')).map((b) => ('shape' in b ? b.shape : undefined)));
  expect(legShapes.size).toBe(1);
  expect([...legShapes][0]).toBeDefined();
  const worldOf = (x: typeof doc) => flatDocument(x).boards.map((b) => [b.name, boardExtents(b), b.position, worldTapers(b)]);
  expect(worldOf(back)).toEqual(worldOf(doc));
  expect(diffDesigns(doc, back)).toEqual([]);
});
```

Put the shared table json where both tests can use it. Moving it to a module-level const in the test file is fine; do not
duplicate it.

- [ ] **Step 5: Run, full suite, typecheck, mutate**

Run `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`. Then make each of these changes in turn, check that a test
fails, and restore:
- Revert Task 1's candidate search to the part only. The headline and round-trip tests must fail.
- Revert the prompt line. The prompt test must fail.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "test(generate): the generated, joined and refined Shaker table keeps its legs as one component; the prompt gives inside-tapered legs one role"
```

---

### Task 3: record, verify live, ship

**Files:**
- Modify:
  - `CLAUDE.md`:
    - Invariant 44: "Generate stays at 0° and 90°" becomes "the converter (`orient`) encodes at 0° or 90°; role linking may
      store any quarter turn that leaves the world part unchanged (`turnCandidates`)".
    - Invariant 45: `linkByRole` aligns angle-cut ids and may re-turn a member.
    - "Where things live": the `roleLinks.ts` line.
    - The follow-ups digest and the test count.
  - `docs/follow-ups.md`: close 301; record new entries for the spec's §4 items (turning parts with rectangular cuts;
    mirror-only matches need fu 232's mirrored placements).
  - `docs/browser-verification-ai-tapers.md`: a "Turned links" section.
- Modify on ship: `docs/history.md`, CLAUDE.md Status and the Rounds table, and `DEPLOYMENT.local.md`.

- [ ] **Step 1: Docs** (as listed above).

- [ ] **Step 2: Live check (dev server, free, no paid run)**

1. Generate a fixture JSON with a throwaway vitest file. Build the headline table through `parseDesign` →
   `designToDocument(…, { centre: false })`, then `JSON.stringify`. Write it to `.playwright-mcp/` (uploads must come from
   there), then delete the throwaway test.
2. Import it through Project menu → Import. The dev profile is the user's: never `localStorage.clear()`; delete only what
   this check created.
3. Read the stored project: the four legs point to one `shape`, with turns 0/90/180/270.
4. Select a leg. Properties shows it linked. Change its taper's Starts to 19 and press Enter.
5. Read the stored project back: the Shape's taper start is 19, and all four legs' world tapers (read through the flat
   document) start at 19 on their inside faces.
6. Take a screenshot (`docs/img/turned-links-legs.png`).
7. Delete the imported project and the fixture file.

- [ ] **Step 3: Merge and ask**

Merge `--no-ff` to master, verify the merged tree (`npm test`, `npm run build`), and delete the branch. **Ask the user before
deploying.**
