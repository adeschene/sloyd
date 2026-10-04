# Add Joinery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Add joinery…" takes the open design and returns it joined — mortise and tenon, dado /
stopped dado, rabbet, half-lap — as a new, unactivated project.

**Architecture:**
- **Code finds the sites.** `findSites` locates every place two parts meet.
- **One model call chooses.** It picks a joint and its sizes for each site, from what that site allows.
- **Code builds the joints.** Pure recipes do the geometry through one converter, `pocketFor`, from a world box to a `Cut`.
- **Code checks the result.** `checkDesign` measures overlap on **solids**, and only problems the joinery introduced drive repairs.
- **The repair loop becomes generic.** Generate and joinery share it.

**Tech Stack:** React 19, TypeScript (strict), Vitest + Testing Library (globals, jsdom), Zustand,
`@anthropic-ai/sdk` behind the existing `LlmClient`.

**Spec:** `docs/superpowers/specs/2026-10-04-sloyd-joinery-design.md` — read it. It is the authority this plan argues from.

## Global Constraints

- **Branch and merging:** work on `joinery`, never `master`. No pull requests.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Gates:** every task ends with `npm test` all green AND `npm run build` passing. `tsconfig.app.json`
  includes the test files, so `npm test` alone does not typecheck.
- **When an expectation looks wrong:** never edit a test's expected value to make it pass. If you
  believe a plan-supplied expectation is wrong, STOP and report with evidence.
- **Layers:**
  - `src/generate/joints/*` imports only `src/document/*` and `src/llm/*` — never `units`,
    `store`, `storage`, `panels` or `viewport`;
  - `useJoinery.ts` sits beside `useGenerations.ts`;
  - formatting for people (`formatLength`) happens only in `panels/`.
- **No schema change.** `CURRENT_VERSION` stays 7.
- **Writes:** `useJoinery` writes only through `storage.createProject(doc, { activate: false })`
  (invariant 36). Opening the result goes through `App`'s `openProject`.
- **History:** invariant 37 holds. The loop's history is append-only, and assistant turns go back exactly as received.
- **Sizes:** every joint size is snapped to 1/16″ (`SNAP_INCHES`) and then clamped into its
  range. Ranges are snapped inward.
- **Exact strings:**
  - the toolbar button: `Add joinery…`
  - the project name: `<name> — joined`
  - the no-sites message: `No joints to add — no parts meet end-to-face, face-to-edge, or crossing.`
  - the fallback note: `Joints chosen by built-in rules — the model call failed: <reason>.`

## Review Focus

1. **`pocketFor` on a posed board.** A part that is upright, on edge, or turned 90°. The cut must
   remove exactly the world box clipped to the board, on every pose. This is Task 2's grid probe,
   and it uses no hand-written expected cuts.
2. **Two joints sharing a part.**
   - A back panel rabbeted into two sides moves once, not twice.
   - A shelf that is both dadoed and trimmed by the panel.
   - Task 5 covers both.
3. **The corner leg.** Two rails entering one leg at the same height from adjacent faces collide.
   The solids-overlap check must report it, and shorter tenons must clear it (Task 4).
4. **Problems that were already there.** A hand-made design that already has a problem must not
   drive repairs or count as joinery's fault (Task 7, "only new").
5. **A model answer that is partly invalid.** A disallowed joint, an out-of-range size, a missing
   site or a bad `stopAt` all fall back per site, with a note (Task 6).

**Plan clarifications against the spec (all made in the spec itself, in `fae9add` and the
commit that adds this plan):**
- rule 3 needs a panel at most 1/2″ thick;
- the model comes from Settings;
- `keepBestOnError` is a new option;
- `pocketFor` picks `across` by boundary contact;
- the default joint is decided by whether the receiving part is post-like.

---

### Task 1: `checkDesign` — solids overlap, `parts`, and `faceContacts`

**Files:**
- Modify: `src/document/designCheck.ts`
- Test: `src/document/designCheck.test.ts`

**Interfaces:**
- Produces:
  - `Violation` gains a required `parts: string[]`.
  - `export interface FaceContact { a: number; b: number; axis: number; side: -1 | 1; area: number }`
  - `export function faceContacts(doc: SloydDocument): FaceContact[]`: each face contact once,
    with `a < b`. `side` names **a's** touching face: `-1` for its min face, `+1` for its max face.
  - Overlap is measured between solids.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/designCheck.test.ts`. Reuse its existing imports, adding `createBoard`,
`createDocument` and `faceContacts` if they are missing.

```ts
describe('phase 2: overlap is measured between SOLIDS (invariant 38)', () => {
  const limits = { width: null, depth: null, height: null, maxParts: 99 };
  // A leg and a rail whose tenon sits in a mortise, built by hand: the boxes
  // interpenetrate by 1in, the solids do not.
  const doc = (withJoint: boolean) => ({
    ...createDocument('T'),
    boards: [
      createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [0, 0, 0],
        cuts: withJoint ? [{ id: 'm', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.75, depth: 1,
          stopMin: 24, stopMax: 1.5, }] : [] }),
      createBoard({ name: 'Rail', length: 19, width: 3.5, thickness: 0.75, posture: 'on-edge', position: [0.75, 23.5, 0.5],
        cuts: withJoint ? [
          { id: 'a', face: 'width', from: 'min', across: 'thickness', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 },
          { id: 'b', face: 'width', from: 'max', across: 'thickness', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 },
        ] : [] }),
    ],
  });

  it('reports a tenon whose mortise is missing', () => {
    expect(checkDesign(doc(false), limits).filter((v) => v.kind === 'overlap')).toHaveLength(1);
  });

  it('does not report a tenon seated in its mortise', () => {
    expect(checkDesign(doc(true), limits).filter((v) => v.kind === 'overlap')).toEqual([]);
  });
});

describe('every violation names its parts', () => {
  const limits = { width: 10, depth: null, height: null, maxParts: 1 };
  it('too-small, overlap, unsupported, too-large, too-many-parts', () => {
    const d = { ...createDocument('T'), boards: [
      createBoard({ name: 'A', length: 20, width: 4, thickness: 0.75, position: [0, 0, 0] }),
      createBoard({ name: 'B', length: 20, width: 4, thickness: 0.75, position: [1, 0.25, 1] }),
      createBoard({ name: 'C', length: 2, width: 2, thickness: 0.0625, position: [0, 9, 0] }),
    ] };
    const v = checkDesign(d, limits);
    const of = (k: string) => v.filter((x) => x.kind === k).map((x) => [...x.parts].sort());
    expect(of('overlap')).toEqual([['A', 'B']]);
    expect(of('too-small')).toEqual([['C']]);
    expect(of('unsupported')).toContainEqual(['C']);
    expect(of('too-large')).toEqual([[]]);
    expect(of('too-many-parts')).toEqual([[]]);
  });
});

describe('faceContacts', () => {
  it('lists a face contact once, with a < b and a\'s touching face', () => {
    const d = { ...createDocument('T'), boards: [
      createBoard({ name: 'Lower', length: 10, width: 4, thickness: 1, position: [0, 0, 0] }),
      createBoard({ name: 'Upper', length: 10, width: 4, thickness: 1, position: [0, 1, 0] }),
    ] };
    expect(faceContacts(d)).toEqual([{ a: 0, b: 1, axis: 1, side: 1, area: 40 }]);
  });
});
```

A note on the fixture. The rail is `on-edge`, and its axes come out as length on X, width on Y,
thickness on Z. That makes its tenon shoulders `face: 'width'` cuts. The 1″ of rail inside the
leg (x 0.75–1.75) reduces to a 1″-deep × 2-1/2″-tall × 3/4″-thick tenon (no cheeks) in the leg's mortise.

**Check the fixture before relying on it.** Confirm with `boardSolids` that the rail's and the
leg's solids do not overlap. If they do, the fixture is wrong, not the code: STOP and report the
overlap rather than adjust the expectation.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/document/designCheck.test.ts`
Expected: they FAIL. `parts` is undefined, `faceContacts` is not exported, and the joined pair
still overlaps because the check reads boxes.

- [ ] **Step 3: Implement**

In `src/document/designCheck.ts`:

1. **Imports.** Add `import { boardSolids } from './cuts';` and
   `import { axisDimensions, boardExtents } from './geometry';`. Merge the second with the
   existing `boardExtents` import.

2. **The `Violation` type** becomes
   `export interface Violation { kind: ViolationKind; message: string; parts: string[] }`.

3. **Box helpers.** Add these, and change `checkDesign` to call `boxesOf(doc)` instead of
   building its boxes inline:

```ts
const boxesOf = (doc: SloydDocument): Box[] => doc.boards.map((b) => {
  const e = boardExtents(b);
  return { name: b.name, min: [...b.position], max: b.position.map((p, i) => p + e[i]) };
});

/**
 * A part's SOLIDS in world space — invariant 2's mapping, position plus the
 * local span on the dimension each axis shows. NOT solidWorldBox, which is
 * centre-relative (CLAUDE.md warns about exactly this).
 */
const solidBoxesOf = (doc: SloydDocument): Box[][] => doc.boards.map((b) => {
  const dims = axisDimensions(b);
  return boardSolids(b).map((s) => ({
    name: b.name,
    min: [0, 1, 2].map((i) => b.position[i] + s[dims[i]][0]),
    max: [0, 1, 2].map((i) => b.position[i] + s[dims[i]][1]),
  }));
});

export interface FaceContact { a: number; b: number; axis: number; side: -1 | 1; area: number }

/** Every face contact once, a < b; `side` is a's touching face (-1 min, +1 max). */
export function faceContacts(doc: SloydDocument): FaceContact[] {
  return contactsOf(boxesOf(doc)).flatMap((cs, a) =>
    cs.filter((c) => c.other > a).map((c) => ({ a, b: c.other, axis: c.axis, side: c.side, area: c.area })));
}
```

4. **The overlap loop.** Replace it with one that compares solids, keeping the deepest
   interpenetration as the reported axis:

```ts
  // Invariant 38, rewritten for phase 2: overlap is measured between SOLIDS,
  // the stock left after cuts, so a tenon in its mortise is not overlap and a
  // tenon with no mortise is. A design with no cuts has one solid per part,
  // equal to its box — Generate's behaviour is unchanged by construction.
  const solids = solidBoxesOf(doc);
  const overlapping = new Set<number>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      let worst: number[] | null = null;
      for (const p of solids[i]) {
        for (const q of solids[j]) {
          const s = [0, 1, 2].map((k) => shared(p, q, k));
          if (s.every((v) => v > TOUCH) && (!worst || Math.min(...s) > Math.min(...worst))) worst = s;
        }
      }
      if (worst) {
        overlapping.add(i);
        overlapping.add(j);
        const axis = worst.indexOf(Math.min(...worst));
        out.push({ kind: 'overlap', message: `${boxes[i].name} passes ${inches(worst[axis])} into ${boxes[j].name} along ${AXES[axis]}.`, parts: [boxes[i].name, boxes[j].name] });
      }
    }
  }
```

5. **Every other `out.push`** gets a `parts` field:
   - too-small: `[b.name]`
   - unsupported: `[b.name]`
   - too-large: `[]`
   - too-many-parts: `[]`
   - hangs: `[boxes[i].name]`
   - tips: `[]`
   - `rejectedViolations`: `[r.name]`

6. **The header comment.** Replace its PHASE 2 NOTE paragraph with: "Overlap is measured between
   SOLIDS (invariant 38): a cut explains an overlap by removing the stock. Do not raise TOUCH to
   make joints pass."

- [ ] **Step 4: Fix existing exact comparisons**

Run `npx vitest run src/document/designCheck.test.ts src/generate/run.test.ts src/useGenerations.test.tsx`.
- An existing test that compares a violation with `toEqual` and now fails ONLY because of
  `parts` may add the right `parts` value to its expectation.
- **Change nothing else in an existing expectation.**
- List every such edit in your report.

- [ ] **Step 5: Mutation-check**

1. Change `solidBoxesOf` to return each part's whole box (one per board). The "does not report a
   tenon seated in its mortise" test must FAIL. Revert.
2. Drop `parts` from the overlap push. The parts test must FAIL, or the build must. Revert.

Record both results in your report.

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run build`
Expected: all green, and the build passes.

```bash
git add -A src
git commit -m "feat(check): overlap is measured between solids; every violation names its parts; faceContacts exported

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `pocketFor` — the one world-box → `Cut` converter

**Files:**
- Create: `src/generate/joints/pocket.ts`
- Test: `src/generate/joints/pocket.test.ts`

**Interfaces:**
- Produces:
  - `export type V3 = [number, number, number];`
  - `export interface WorldBox { min: V3; max: V3 }`
  - `export function boxOf(board: Board): WorldBox`
  - `export function pocketFor(board: Board, box: WorldBox): Cut`, which throws on a box that
    misses the board or touches none of its faces.

- [ ] **Step 1: Write the failing test**

Create `src/generate/joints/pocket.test.ts`:

```ts
import { createBoard } from '../../document/document';
import { stockProbe } from '../../document/cuts';
import { axisDimensions } from '../../document/geometry';
import type { Board, Posture, Rotation } from '../../document/types';
import { boxOf, pocketFor } from './pocket';
import type { WorldBox } from './pocket';

/**
 * The bound comes from OUTSIDE the code under test (invariant 23): a sample
 * point is stock exactly when it is NOT inside the world box. No expected cut
 * is written by hand. Samples sit at odd sixteenths; every box edge is on an
 * eighth, so no sample lies on a boundary.
 */
function assertCarves(board: Board, box: WorldBox) {
  const cut = pocketFor(board, box);
  const cutBoard = { ...board, cuts: [cut] };
  const probe = stockProbe(cutBoard);
  const dims = axisDimensions(board);
  let removed = 0;
  for (let l = 1 / 16; l < board.length; l += 1 / 8) {
    for (let w = 1 / 16; w < board.width; w += 1 / 8) {
      for (let t = 1 / 16; t < board.thickness; t += 1 / 8) {
        const local = { length: l, width: w, thickness: t };
        const world = [0, 1, 2].map((i) => board.position[i] + local[dims[i]]);
        const inside = world.every((v, i) => v > box.min[i] && v < box.max[i]);
        if (inside) removed++;
        expect(probe(local), `${JSON.stringify(local)} inside=${inside}`).toBe(!inside);
      }
    }
  }
  expect(removed, 'the box must actually remove something').toBeGreaterThan(0);
}

const POSES: [Posture, Rotation][] = [
  ['flat', 0], ['flat', 90], ['on-edge', 0], ['on-edge', 90], ['upright', 0], ['upright', 90],
];

describe('pocketFor', () => {
  const board = (posture: Posture, rotation: Rotation) =>
    createBoard({ length: 6, width: 3, thickness: 1, posture, rotation, position: [1, 2, 3] });

  it.each(POSES)('a pocket open on the +Y face, posture %s, turn %s', (posture, rotation) => {
    const b = board(posture, rotation);
    const e = boxOf(b);
    assertCarves(b, { min: [e.min[0] + 0.25, e.max[1] - 0.5, e.min[2] + 0.25], max: [e.min[0] + 0.75, e.max[1] + 1, e.min[2] + 0.75] });
  });

  it.each(POSES)('a corner rabbet open on two faces, posture %s, turn %s', (posture, rotation) => {
    const b = board(posture, rotation);
    const e = boxOf(b);
    assertCarves(b, { min: [e.min[0] - 1, e.min[1] - 1, e.min[2] - 1], max: [e.min[0] + 0.5, e.max[1] + 1, e.min[2] + 0.5] });
  });

  it.each(POSES)('a through slot spanning one axis fully, posture %s, turn %s', (posture, rotation) => {
    const b = board(posture, rotation);
    const e = boxOf(b);
    assertCarves(b, { min: [e.min[0] + 0.25, e.min[1] - 1, e.min[2] - 1], max: [e.min[0] + 0.5, e.max[1] + 1, e.max[2] + 1] });
  });

  it('throws on a box enclosed by the board — it cannot be cut from any face', () => {
    const b = createBoard({ length: 6, width: 3, thickness: 3, position: [0, 0, 0] });
    expect(() => pocketFor(b, { min: [1, 1, 1], max: [2, 2, 2] })).toThrow(/enclosed/);
  });

  it('throws on a box that misses the board', () => {
    const b = createBoard({ length: 6, width: 3, thickness: 1, position: [0, 0, 0] });
    expect(() => pocketFor(b, { min: [20, 20, 20], max: [21, 21, 21] })).toThrow(/misses/);
  });
});
```

About the poses:
- Every pose gives the 6 × 3 × 1 board an extent of at least 1″ on each axis, so the offsets
  above (≤ 0.75″) stay inside it.
- If a pose produces a board thinner than 0.75″ on X or Z, the first box would miss. STOP and
  report the pose rather than change the box.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run src/generate/joints/pocket.test.ts`
Expected: it FAILS, because the module does not exist.

- [ ] **Step 3: Implement**

Create `src/generate/joints/pocket.ts`:

```ts
import { nextId } from '../../document/document';
import type { Board, Cut, Dimension } from '../../document/document';
import { DIMENSION_ORDER, axisDimensions, boardExtents } from '../../document/geometry';

export type V3 = [number, number, number];
export interface WorldBox { min: V3; max: V3 }

const EPS = 1e-9;

/** A part's own box in world space (invariant 2: position is the min corner). */
export function boxOf(b: Board): WorldBox {
  const e = boardExtents(b);
  return { min: [...b.position] as V3, max: [0, 1, 2].map((i) => b.position[i] + e[i]) as V3 };
}

/**
 * The ONE place a world box becomes a Cut (invariant 41). The cut removes
 * exactly `box ∩ board`.
 *
 * The box is mapped to the board's own dimensions, then clipped. `face` is a
 * dimension where the clipped box reaches the board's boundary — the
 * shallowest such, ties to the earlier in DIMENSION_ORDER. `across` carries
 * the stops: the remaining dimension with the most boundary contact (full
 * span, then one end), ties to the earlier; the last is the position axis.
 *
 * A box touching no face is an enclosed void, which no cut can make. That is
 * a recipe bug, so this THROWS rather than returning something wrong.
 */
export function pocketFor(board: Board, box: WorldBox): Cut {
  const dims = axisDimensions(board);
  const local = {} as Record<Dimension, [number, number]>;
  dims.forEach((d, i) => {
    local[d] = [
      Math.max(0, box.min[i] - board.position[i]),
      Math.min(board[d], box.max[i] - board.position[i]),
    ];
  });
  if (DIMENSION_ORDER.some((d) => local[d][1] - local[d][0] <= EPS)) {
    throw new Error(`pocketFor: the box misses ${board.name}`);
  }
  const atMin = (d: Dimension) => local[d][0] <= EPS;
  const atMax = (d: Dimension) => local[d][1] >= board[d] - EPS;
  const touching = DIMENSION_ORDER.filter((d) => atMin(d) || atMax(d));
  if (touching.length === 0) throw new Error(`pocketFor: an enclosed box cannot be cut from ${board.name}`);

  const reach = (d: Dimension) => local[d][1] - local[d][0];
  const face = touching.reduce((best, d) => (reach(d) < reach(best) - EPS ? d : best));
  const from = atMin(face) ? 'min' : 'max';
  const depth = from === 'min' ? local[face][1] : board[face] - local[face][0];

  // `across` carries the stops, so it is the dimension the box runs out along:
  // full span first, then one reaching an edge, then the earlier dimension.
  // Order alone put a stopped dado's stopped direction on the position axis
  // and cutLabel called it a "notch" (spec §4.1).
  const others = DIMENSION_ORDER.filter((d) => d !== face);
  const contacts = (d: Dimension) => (atMin(d) ? 1 : 0) + (atMax(d) ? 1 : 0);
  const across = contacts(others[1]) > contacts(others[0]) ? others[1] : others[0];
  const pos = others.find((d) => d !== across)!;
  return {
    id: nextId(),
    face, from, across,
    offset: local[pos][0],
    width: local[pos][1] - local[pos][0],
    depth,
    stopMin: local[across][0],
    stopMax: board[across] - local[across][1],
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npx vitest run src/generate/joints/pocket.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Mutation-check**

Apply each mutation, confirm a test fails, then revert:
1. Swap `'min' : 'max'` in `from`.
2. Set `stopMax: 0`.
3. Map world to local with `box.min[i]` only, without subtracting `board.position[i]`.
4. Choose `across` as `others[0]` always, ignoring contacts. This one is caught later, by
   Task 4's stopped-dado label test, not here. Note that in the report.

Record one result line per mutation.

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run build`

```bash
git add -A src
git commit -m "feat(joints): pocketFor — the one world box → Cut converter, probed on every pose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `findSites` — classify contacts, and what each site allows

**Files:**
- Create: `src/generate/joints/sites.ts`
- Test: `src/generate/joints/sites.test.ts`

**Interfaces:**
- Consumes: `faceContacts` and `TOUCH` (Task 1); `boxOf` (Task 2).
- Produces:

```ts
export type SiteKind = 'end-into-face' | 'face-against-edge' | 'crossing';
export type JointKind = 'mortise-tenon' | 'dado' | 'stopped-dado' | 'rabbet' | 'half-lap' | 'butt';
export interface StopEnd { axis: 0 | 1 | 2; end: 'min' | 'max' }
export interface Site {
  id: number; kind: SiteKind;
  enter: number; receive: number;          // board indices: E and R
  axis: 0 | 1 | 2; side: -1 | 1;           // the contact's world axis; E's touching face
  allowed: JointKind[];                    // always ends with 'butt'
  stopEnds: StopEnd[];                     // end-into-face only
}
export interface Ranges { tenonLength: [number, number]; dadoDepth: [number, number]; rabbetDepth: [number, number]; inset(s: StopEnd): [number, number] }
export function findSites(doc: SloydDocument): Site[]
export function rangesOf(site: Site, doc: SloydDocument): Ranges
export function stopLabel(s: StopEnd): string        // '+Z', '-X'
export function siteLabel(site: Site, doc: SloydDocument): string   // 'Rail → Leg: end into face'
```

- [ ] **Step 1: Write the failing tests**

Create `src/generate/joints/sites.test.ts`. The fixtures go through `designToDocument`, which
orders each part's dimensions from its world sizes: the longest is `length`, then `width`, then
`thickness`. It also recentres the design, so the tests look parts up by name, never by position.

```ts
import { designToDocument } from '../../document/generated';
import { findSites, rangesOf, siteLabel, stopLabel } from './sites';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
const named = (doc: ReturnType<typeof design>) => (i: number) => doc.boards[i].name;

describe('findSites', () => {
  it('a rail end against a leg is end-into-face, rail entering', () => {
    const doc = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
    );
    const [s] = findSites(doc);
    expect(findSites(doc)).toHaveLength(1);
    expect(s.kind).toBe('end-into-face');
    expect(named(doc)(s.enter)).toBe('Rail');
    expect(named(doc)(s.receive)).toBe('Leg');
    expect(s.axis).toBe(0);
    expect(s.side).toBe(-1);
    expect(s.allowed).toEqual(['mortise-tenon', 'dado', 'butt']);
    expect(s.stopEnds).toEqual([]);
    expect(siteLabel(s, doc)).toBe('Rail → Leg: end into face');
    expect(rangesOf(s, doc).tenonLength).toEqual([0.5, 1.5]);
  });

  it('a shelf end flush with a side front and back offers a stopped dado at either end', () => {
    const doc = design(
      { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('end-into-face');
    expect(named(doc)(s.enter)).toBe('Shelf');
    expect(s.allowed).toEqual(['mortise-tenon', 'dado', 'stopped-dado', 'butt']);
    expect(s.stopEnds.map(stopLabel)).toEqual(['-Z', '+Z']);
    expect(rangesOf(s, doc).dadoDepth).toEqual([0.125, 0.375]);
    expect(rangesOf(s, doc).inset(s.stopEnds[0])).toEqual([0.25, 5.625]);
  });

  it('a thin back panel against a side\'s back edge is face-against-edge', () => {
    const doc = design(
      { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('face-against-edge');
    expect(named(doc)(s.enter)).toBe('Back');
    expect(s.allowed).toEqual(['rabbet', 'butt']);
    expect(rangesOf(s, doc).rabbetDepth).toEqual([0.125, 0.375]);
  });

  it('a back panel meeting a shelf\'s back edge mid-panel is NOT a site (rule 3 needs the panel\'s edge)', () => {
    const doc = design(
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
      { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('a 3/4in top on an apron\'s edge is NOT a site (rule 3 needs a thin panel)', () => {
    const doc = design(
      { name: 'Apron', at: [0, 0, 0], size: [20, 3.5, 0.75] },
      { name: 'Top', at: [-1, 3.5, -5], size: [22, 0.75, 12] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('a top resting on a side\'s END is end-into-face with the side entering (rule 2 wins)', () => {
    const doc = design(
      { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Top', at: [0, 30, 0], size: [22, 0.75, 11.25] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('end-into-face');
    expect(named(doc)(s.enter)).toBe('Side');
  });

  it('two crossing stretchers of equal thickness are a crossing, the upper one moving', () => {
    const doc = design(
      { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
      { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
    );
    const [s] = findSites(doc);
    expect(s.kind).toBe('crossing');
    expect(named(doc)(s.enter)).toBe('Upper');
    expect(s.side).toBe(-1);
    expect(s.allowed).toEqual(['half-lap', 'butt']);
  });

  it('a cleat lapped under a seat is NOT a site (it does not cross)', () => {
    const doc = design(
      { name: 'Seat', at: [0, 10, 0], size: [20, 0.75, 12] },
      { name: 'Cleat', at: [2, 9.25, 1], size: [1, 0.75, 10] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('two ends meeting are NOT a site', () => {
    const doc = design(
      { name: 'A', at: [0, 0, 0], size: [10, 2, 1] },
      { name: 'B', at: [10, 0, 0], size: [10, 2, 1] },
    );
    expect(findSites(doc)).toEqual([]);
  });

  it('numbers sites from 1 in (enter, receive, axis) order', () => {
    const doc = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Leg 2', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
    );
    const sites = findSites(doc);
    expect(sites.map((s) => s.id)).toEqual([1, 2]);
    expect(sites.map((s) => named(doc)(s.receive))).toEqual(['Leg', 'Leg 2']);
  });
});
```

Where those numbers come from. They are hand-derived. If one differs, STOP and report the actual
value; do not change the expectation.

- **Rail into leg:** the leg is 1.75″ deep on X, so the tenon range is [1/2, 1.75 − 1/4] = [0.5, 1.5].
- **Shelf into side:**
  - the side is 0.75″ deep on X, so the dado range is [1/8, 0.375];
  - M&T is allowed because the shelf is 0.75″ thick (≥ 1/2) and the side is 0.75″ deep (≥ 3/4);
  - the shelf spans the side's full Z extent, so both Z ends are stop ends;
  - the inset range is [1/4, shelf extent along Z / 2] = [0.25, 5.625].
- **Back panel:** the side is 0.75″ thick, so the rabbet range is [1/8, 0.375].

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/generate/joints/sites.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement**

Create `src/generate/joints/sites.ts`:

```ts
import type { SloydDocument } from '../../document/document';
import { TOUCH, faceContacts } from '../../document/designCheck';
import { SNAP_INCHES, axisDimensions } from '../../document/geometry';
import { boxOf } from './pocket';

export type SiteKind = 'end-into-face' | 'face-against-edge' | 'crossing';
export type JointKind = 'mortise-tenon' | 'dado' | 'stopped-dado' | 'rabbet' | 'half-lap' | 'butt';
export interface StopEnd { axis: 0 | 1 | 2; end: 'min' | 'max' }
export interface Site {
  id: number; kind: SiteKind;
  enter: number; receive: number;
  axis: 0 | 1 | 2; side: -1 | 1;
  allowed: JointKind[];
  stopEnds: StopEnd[];
}
export interface Ranges {
  tenonLength: [number, number];
  dadoDepth: [number, number];
  rabbetDepth: [number, number];
  inset(s: StopEnd): [number, number];
}

/** A face-against-edge panel is at most this thick: back and bottom panels, never tops (spec §3.2). */
export const THIN_PANEL = 0.5;

const AXES = ['X', 'Y', 'Z'] as const;
const KIND_TEXT: Record<SiteKind, string> = {
  'end-into-face': 'end into face', 'face-against-edge': 'face against edge', crossing: 'crossing',
};

export const stopLabel = (s: StopEnd) => `${s.end === 'max' ? '+' : '-'}${AXES[s.axis]}`;
export const siteLabel = (s: Site, doc: SloydDocument) =>
  `${doc.boards[s.enter].name} → ${doc.boards[s.receive].name}: ${KIND_TEXT[s.kind]}`;

const up = (v: number) => Math.ceil(v / SNAP_INCHES - 1e-9) * SNAP_INCHES;
const down = (v: number) => Math.floor(v / SNAP_INCHES + 1e-9) * SNAP_INCHES;
const range = (lo: number, hi: number): [number, number] => [up(lo), down(hi)];

/** R's extent along the contact axis — how far a joint can reach into it. */
const depthOf = (doc: SloydDocument, s: Site) => {
  const r = boxOf(doc.boards[s.receive]);
  return r.max[s.axis] - r.min[s.axis];
};

export function rangesOf(s: Site, doc: SloydDocument): Ranges {
  const rDepth = depthOf(doc, s);
  const e = boxOf(doc.boards[s.enter]);
  return {
    tenonLength: range(0.5, rDepth - 0.25),
    dadoDepth: range(0.125, rDepth / 2),
    rabbetDepth: range(0.125, doc.boards[s.receive].thickness / 2),
    inset: (st) => range(0.25, (e.max[st.axis] - e.min[st.axis]) / 2),
  };
}

function allowedFor(kind: SiteKind, s: Omit<Site, 'id' | 'allowed'>, doc: SloydDocument): JointKind[] {
  const E = doc.boards[s.enter];
  const R = doc.boards[s.receive];
  const rDepth = depthOf(doc, s as Site);
  const out: JointKind[] = [];
  if (kind === 'end-into-face') {
    if (E.thickness >= 0.5 && rDepth >= 0.75) out.push('mortise-tenon');
    if (rDepth >= 0.25) out.push('dado');
    if (rDepth >= 0.25 && s.stopEnds.length > 0) out.push('stopped-dado');
  } else if (kind === 'face-against-edge') {
    if (R.thickness >= 0.25) out.push('rabbet');
  } else {
    out.push('half-lap');
  }
  return [...out, 'butt'];
}

/** The two in-plane axes for a contact on `axis`. */
const inPlane = (axis: number) => [0, 1, 2].filter((k) => k !== axis) as (0 | 1 | 2)[];

/**
 * Every place two parts meet that a joint can serve (spec §3). Pure. Sites
 * come from BOX face contacts, so a pair already joined — interpenetrating —
 * is never a contact and is never joined twice.
 */
export function findSites(doc: SloydDocument): Site[] {
  const boxes = doc.boards.map(boxOf);
  const found: Omit<Site, 'id' | 'allowed'>[] = [];
  const kinds: SiteKind[] = [];

  for (const c of faceContacts(doc)) {
    const A = doc.boards[c.a];
    const B = doc.boards[c.b];
    const da = axisDimensions(A)[c.axis];
    const db = axisDimensions(B)[c.axis];
    const axis = c.axis as 0 | 1 | 2;
    const endArea = (i: number) => doc.boards[i].width * doc.boards[i].thickness;
    const push = (kind: SiteKind, enter: number, receive: number, side: -1 | 1) => {
      const stopEnds: StopEnd[] = [];
      if (kind === 'end-into-face') {
        const e = boxes[enter];
        const r = boxes[receive];
        for (const p of inPlane(axis)) {
          if (Math.abs(e.min[p] - r.min[p]) <= TOUCH) stopEnds.push({ axis: p, end: 'min' });
          if (Math.abs(e.max[p] - r.max[p]) <= TOUCH) stopEnds.push({ axis: p, end: 'max' });
        }
      }
      found.push({ kind, enter, receive, axis, side, stopEnds });
      kinds.push(kind);
    };

    // Rule 1: two ends meeting.
    if (da === 'length' && db === 'length') continue;
    // Rule 2: a whole end inside the contact.
    if (da === 'length' && c.area >= endArea(c.a) - 1e-6) { push('end-into-face', c.a, c.b, c.side); continue; }
    if (db === 'length' && c.area >= endArea(c.b) - 1e-6) { push('end-into-face', c.b, c.a, (-c.side) as -1 | 1); continue; }
    // Rule 3: a THIN panel's face against an edge AT THE PANEL'S OWN EDGE —
    // a side framing a back, never a shelf meeting the back mid-panel (that
    // one butts, and is trimmed when the panel moves).
    const atPanelEdge = (panel: number, other: number) => inPlane(axis).some((p) => {
      const lo = Math.max(boxes[panel].min[p], boxes[other].min[p]);
      const hi = Math.min(boxes[panel].max[p], boxes[other].max[p]);
      return lo <= boxes[panel].min[p] + TOUCH || hi >= boxes[panel].max[p] - TOUCH;
    });
    if (da === 'thickness' && db === 'width' && A.thickness <= THIN_PANEL && atPanelEdge(c.a, c.b)) { push('face-against-edge', c.a, c.b, c.side); continue; }
    if (db === 'thickness' && da === 'width' && B.thickness <= THIN_PANEL && atPanelEdge(c.b, c.a)) { push('face-against-edge', c.b, c.a, (-c.side) as -1 | 1); continue; }
    // Rule 4: equal-thickness parts crossing.
    if (da === 'thickness' && db === 'thickness' && Math.abs(A.thickness - B.thickness) <= TOUCH) {
      const [p, q] = inPlane(axis);
      const beyond = (x: number, y: number, k: number) =>
        boxes[x].min[k] < boxes[y].min[k] - TOUCH && boxes[x].max[k] > boxes[y].max[k] + TOUCH;
      const crosses = (beyond(c.a, c.b, p) && beyond(c.b, c.a, q)) || (beyond(c.a, c.b, q) && beyond(c.b, c.a, p));
      if (crosses) {
        // The part on the +axis side moves; `side` is its touching face.
        if (c.side === 1) push('crossing', c.b, c.a, -1);
        else push('crossing', c.a, c.b, -1);
      }
    }
  }

  return found
    .map((s, i) => ({ s, kind: kinds[i] }))
    .sort((x, y) => x.s.enter - y.s.enter || x.s.receive - y.s.receive || x.s.axis - y.s.axis)
    .map(({ s, kind }, i) => ({ ...s, id: i + 1, allowed: allowedFor(kind, s, doc) }));
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/generate/joints/sites.test.ts`
Expected: PASS.

- [ ] **Step 5: The user's real workbench**

Add a test that loads `src/document/fixtures/simple-workbench.sloyd` the way
`designCheck.test.ts` already does. Find that loader with `grep -n "simple-workbench"
src/document/designCheck.test.ts` and copy its import style. Assert:
- every site's `siteLabel`, as a literal list;
- each line explained in a comment from the fixture's geometry: which face, and why this kind.

You derive the list by reading the fixture's boards (names, sizes, positions), **not** by
printing `findSites` and pasting the result. Show the derivation in the report. A pinned list
nobody explained is the shape invariant 23 warns about.

- [ ] **Step 6: Mutation-check**

Apply each mutation, confirm a test fails, then revert:
1. Swap the order of rules 2 and 3.
2. Delete `A.thickness <= THIN_PANEL`.
2a. Delete `atPanelEdge(c.a, c.b)`.
3. Make `crosses` require only one direction.
4. Drop the `- 1e-6` area tolerance and use `>`.

Record one result line per mutation.

- [ ] **Step 7: Run everything and commit**

Run: `npm test && npm run build`

```bash
git add -A src
git commit -m "feat(joints): findSites — end into face, thin panel against edge, crossing; ranges and labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Recipes I — `applyJoints` with mortise and tenon, dado and stopped dado

**Files:**
- Create: `src/generate/joints/recipes.ts`
- Test: `src/generate/joints/recipes.test.ts`

**Interfaces:**
- Consumes: `pocketFor`, `boxOf` and `WorldBox` (Task 2); `Site`, `JointKind` and `StopEnd`
  (Task 3); `checkDesign` (Task 1).
- Produces:

```ts
export interface JointChoice { site: number; joint: JointKind; tenonLength?: number; depth?: number; stopAt?: StopEnd; inset?: number }
export interface JoinResult {
  doc: SloydDocument;
  applied: { site: number; joint: JointKind }[];
  skipped: { site: number; reason: string }[];
  moved: string[]; trimmed: string[];
  sizeBefore: V3; sizeAfter: V3;
}
export function applyJoints(doc: SloydDocument, sites: Site[], choices: JointChoice[]): JoinResult
export const tenonSection: (thickness: number, width: number) => { tenon: number; cheek: number; shoulder: number }
```

- [ ] **Step 1: Write the failing tests**

Create `src/generate/joints/recipes.test.ts`:

```ts
import { designToDocument } from '../../document/generated';
import { checkDesign } from '../../document/designCheck';
import { boardSolids, cutLabel } from '../../document/cuts';
import type { SloydDocument } from '../../document/document';
import { findSites } from './sites';
import { applyJoints, tenonSection } from './recipes';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
const limits = (doc: SloydDocument) => ({ width: null, depth: null, height: null, maxParts: doc.boards.length });
const board = (doc: SloydDocument, name: string) => doc.boards.find((b) => b.name === name)!;
const volume = (doc: SloydDocument, name: string) => boardSolids(board(doc, name)).reduce(
  (v, s) => v + (s.length[1] - s.length[0]) * (s.width[1] - s.width[0]) * (s.thickness[1] - s.thickness[0]), 0);
const boxVolume = (doc: SloydDocument, name: string) => { const b = board(doc, name); return b.length * b.width * b.thickness; };

const LEG_RAIL = () => design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
);

describe('tenonSection', () => {
  it('a third of the thickness, at least 1/4in; shoulders 1/2in or a quarter of the width', () => {
    expect(tenonSection(0.75, 3.5)).toEqual({ tenon: 0.25, cheek: 0.25, shoulder: 0.5 });
    expect(tenonSection(1.75, 1.5)).toEqual({ tenon: 0.5625, cheek: 0.59375, shoulder: 0.375 });
  });
});

describe('mortise and tenon', () => {
  const doc = LEG_RAIL();
  const sites = findSites(doc);
  const out = applyJoints(doc, sites, [{ site: 1, joint: 'mortise-tenon', tenonLength: 1 }]);

  it('grows the rail by the tenon and keeps names and part count', () => {
    expect(out.doc.boards.map((b) => b.name)).toEqual(['Leg', 'Rail']);
    expect(board(out.doc, 'Rail').length).toBe(19);
  });

  it('leaves no overlap between solids', () => {
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });

  it('conserves stock: the leg loses exactly the tenon the rail gains', () => {
    const tenon = 1 * 0.25 * (3.5 - 2 * 0.5);
    expect(boxVolume(out.doc, 'Leg') - volume(out.doc, 'Leg')).toBeCloseTo(tenon, 9);
    expect(volume(out.doc, 'Rail') - 18 * 3.5 * 0.75).toBeCloseTo(tenon, 9);
  });

  it('labels the leg\'s cut a mortise and the rail\'s four cuts rabbets', () => {
    const leg = board(out.doc, 'Leg');
    expect(leg.cuts.map((c) => cutLabel(leg, c))).toEqual(['mortise']);
    const rail = board(out.doc, 'Rail');
    expect(rail.cuts.map((c) => cutLabel(rail, c)).sort()).toEqual(['rabbet', 'rabbet', 'rabbet', 'rabbet']);
  });

  it('reports the joint applied', () => {
    expect(out.applied).toEqual([{ site: 1, joint: 'mortise-tenon' }]);
  });
});

describe('dado and stopped dado', () => {
  const doc = design(
    { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
  );
  const sites = findSites(doc);

  it('a dado: the shelf grows by d and the side is housed, no overlap', () => {
    const out = applyJoints(doc, sites, [{ site: 1, joint: 'dado', depth: 0.25 }]);
    expect(board(out.doc, 'Shelf').length).toBe(20.25);
    const side = board(out.doc, 'Side');
    expect(side.cuts.map((c) => cutLabel(side, c))).toEqual(['dado']);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });

  it('a stopped dado: the side\'s dado stops, the shelf is notched to match, no overlap', () => {
    const out = applyJoints(doc, sites, [{ site: 1, joint: 'stopped-dado', depth: 0.25, stopAt: sites[0].stopEnds[1], inset: 0.75 }]);
    const side = board(out.doc, 'Side');
    expect(side.cuts.map((c) => cutLabel(side, c))).toEqual(['stopped dado']);
    expect(board(out.doc, 'Shelf').cuts).toHaveLength(1);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    expect(boxVolume(out.doc, 'Side') - volume(out.doc, 'Side')).toBeCloseTo(0.25 * 0.75 * (11.25 - 0.75), 9);
  });

  it('butt leaves the site alone', () => {
    const out = applyJoints(doc, sites, [{ site: 1, joint: 'butt' }]);
    expect(out.doc.boards.every((b) => b.cuts.length === 0)).toBe(true);
    expect(out.applied).toEqual([{ site: 1, joint: 'butt' }]);
  });
});

describe('two tenons into one corner leg collide, and shorter ones do not', () => {
  const doc = design(
    { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
    { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3.5, 18] },
  );
  const sites = findSites(doc);
  const both = (L: number) => applyJoints(doc, sites, sites.map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: L })));
  const overlaps = (L: number) => checkDesign(both(L).doc, limits(doc)).filter((v) => v.kind === 'overlap');

  it('at 1-3/16in the tenons meet inside the leg', () => {
    expect(overlaps(1.1875).map((v) => [...v.parts].sort())).toEqual([['Rail X', 'Rail Z']]);
  });

  it('at 1/2in they clear', () => {
    expect(overlaps(0.5)).toEqual([]);
  });
});
```

Where those numbers come from. They are hand-derived. If one differs, STOP and report it.

**`tenonSection`:**
- `T = 0.75`: the tenon is `max(1/4, snap(0.25))` = 0.25; the cheek is (0.75 − 0.25)/2 = 0.25;
  the shoulder is `min(1/2, snap(0.875))` = 0.5.
- `T = 1.75`: `snap(0.5833)` is 0.5625 (9/16); the cheek is (1.75 − 0.5625)/2 = 0.59375; with
  `W = 1.5`, the shoulder is `min(0.5, snap(0.375))` = 0.375.

**The mortise:**
- the tenon is 1 × 0.25 × (3.5 − 1) = 0.625 in³;
- the rail's box grows by 1 × 3.5 × 0.75, and its solid volume grows by exactly the tenon.

**The stopped dado:**
- the side loses d × the shelf's thickness × (11.25 − inset);
- that is 0.25 × 0.75 × 10.5, because the shelf's end section is 0.75 thick.

**The corner leg** (rail thicknesses 0.75 on Z and on X, each centred in the leg):
- each tenon is 0.25 thick, at 0.75–1.0 across the other rail's axis;
- at L = 1.1875, each reaches from 1.75 to 0.5625 along its own axis, so they share x 0.75–1.0
  and z 0.75–1.0: an overlap;
- at L = 0.5, each reaches to 1.25 only, so there is no overlap.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/generate/joints/recipes.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement**

Create `src/generate/joints/recipes.ts`:

```ts
import { CURRENT_VERSION, migrateDocument } from '../../document/document';
import type { Board, SloydDocument } from '../../document/document';
import { TOUCH } from '../../document/designCheck';
import { SNAP_INCHES, axisDimensions } from '../../document/geometry';
import { boxOf, pocketFor } from './pocket';
import type { V3, WorldBox } from './pocket';
import type { JointKind, Site, StopEnd } from './sites';

export interface JointChoice { site: number; joint: JointKind; tenonLength?: number; depth?: number; stopAt?: StopEnd; inset?: number }
export interface JoinResult {
  doc: SloydDocument;
  applied: { site: number; joint: JointKind }[];
  skipped: { site: number; reason: string }[];
  moved: string[];
  trimmed: string[];
  sizeBefore: V3;
  sizeAfter: V3;
}

const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;

export const tenonSection = (thickness: number, width: number) => {
  const tenon = Math.max(0.25, snap(thickness / 3));
  return { tenon, cheek: (thickness - tenon) / 2, shoulder: Math.min(0.5, snap(width / 4)) };
};

/** `base` with some axes' spans replaced. */
const withSpans = (base: WorldBox, spans: Partial<Record<number, [number, number]>>): WorldBox => {
  const min = [...base.min] as V3;
  const max = [...base.max] as V3;
  for (const [k, s] of Object.entries(spans)) { min[+k] = s![0]; max[+k] = s![1]; }
  return { min, max };
};
const positive = (b: WorldBox) => [0, 1, 2].every((k) => b.max[k] - b.min[k] > 1e-9);
const span = (b: WorldBox, k: number): [number, number] => [b.min[k], b.max[k]];

/** Grow (or, negative, shrink) a part along world axis k on its `side` face. */
function resize(b: Board, k: number, side: -1 | 1, amount: number) {
  const d = axisDimensions(b)[k];
  b[d] = b[d] + amount;
  if (side === -1) b.position[k] -= amount;
}

/** The slab E grows into, on its `side` face along k, `amount` deep. */
const extension = (before: WorldBox, k: number, side: -1 | 1, amount: number): [number, number] =>
  side === 1 ? [before.max[k], before.max[k] + amount] : [before.min[k] - amount, before.min[k]];

/** Face contact on k between E's `side` face and R, within TOUCH, with real shared span. */
function touching(E: Board, R: Board, k: number, side: -1 | 1): boolean {
  const e = boxOf(E);
  const r = boxOf(R);
  const plane = side === 1 ? e.max[k] : e.min[k];
  const opposite = side === 1 ? r.min[k] : r.max[k];
  return Math.abs(plane - opposite) <= TOUCH &&
    [0, 1, 2].filter((i) => i !== k).every((i) => Math.min(e.max[i], r.max[i]) - Math.max(e.min[i], r.min[i]) > TOUCH);
}

function mortiseTenon(E: Board, R: Board, k: number, side: -1 | 1, L: number) {
  const before = boxOf(E);
  resize(E, k, side, L);
  const ext = extension(before, k, side, L);
  const dims = axisDimensions(E);
  const tAx = dims.indexOf('thickness');
  const wAx = dims.indexOf('width');
  const { cheek: c, shoulder: sh } = tenonSection(E.thickness, E.width);
  const [t0, t1] = span(before, tAx);
  const [w0, w1] = span(before, wAx);
  const box = (t: [number, number], w: [number, number]) => withSpans(before, { [k]: ext, [tAx]: t, [wAx]: w });
  for (const waste of [box([t0, t0 + c], [w0, w1]), box([t1 - c, t1], [w0, w1]), box([t0, t1], [w0, w0 + sh]), box([t0, t1], [w1 - sh, w1])]) {
    if (positive(waste)) E.cuts.push(pocketFor(E, waste));
  }
  R.cuts.push(pocketFor(R, box([t0 + c, t1 - c], [w0 + sh, w1 - sh])));
}

function dado(E: Board, R: Board, k: number, side: -1 | 1, d: number, stop?: { at: StopEnd; inset: number }) {
  const before = boxOf(E);
  resize(E, k, side, d);
  const ext = extension(before, k, side, d);
  let pocket = withSpans(before, { [k]: ext });
  if (stop) {
    const p = stop.at.axis;
    const [lo, hi] = span(before, p);
    const keep: [number, number] = stop.at.end === 'min' ? [lo + stop.inset, hi] : [lo, hi - stop.inset];
    const strip: [number, number] = stop.at.end === 'min' ? [lo, lo + stop.inset] : [hi - stop.inset, hi];
    pocket = withSpans(pocket, { [p]: keep });
    E.cuts.push(pocketFor(E, withSpans(before, { [k]: ext, [p]: strip })));
  }
  R.cuts.push(pocketFor(R, pocket));
}

const overall = (boards: Board[]): V3 => {
  const boxes = boards.map(boxOf);
  return [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b.max[k])) - Math.min(...boxes.map((b) => b.min[k]))) as V3;
};

/**
 * Build the chosen joints (spec §4). Pure. Recipes run in site order on a
 * COPY of the boards, and each reads the CURRENT geometry, so a site whose
 * part an earlier site already moved is recomputed rather than reused —
 * and skipped, with a reason, when its parts no longer touch.
 */
export function applyJoints(doc: SloydDocument, sites: Site[], choices: JointChoice[]): JoinResult {
  const boards: Board[] = structuredClone(doc.boards);
  const byId = new Map(choices.map((c) => [c.site, c]));
  const applied: JoinResult['applied'] = [];
  const skipped: JoinResult['skipped'] = [];
  const moved = new Set<string>();
  const trimmed = new Set<string>();
  const state: State = {
    moved, trimmed, movedFace: new Map(),
    // Every "<enter>-><receive>" pair joined by a rabbet: a panel's own
    // receivers keep their length when it moves; everything else butting it
    // is trimmed (Task 5).
    rabbetReceivers: new Set(sites.filter((s) => byId.get(s.id)?.joint === 'rabbet').map((s) => `${s.enter}->${s.receive}`)),
  };

  for (const site of sites) {
    const c = byId.get(site.id);
    const joint: JointKind = c?.joint ?? 'butt';
    if (joint === 'butt') { applied.push({ site: site.id, joint }); continue; }
    const E = boards[site.enter];
    const R = boards[site.receive];
    const k = site.axis;
    const side = site.side;
    const panelAlreadyIn = joint === 'rabbet' && state.movedFace.get(site.enter) === `${k}|${side}`;
    if (!panelAlreadyIn && !touching(E, R, k, side)) {
      skipped.push({ site: site.id, reason: `${E.name} no longer meets ${R.name} after an earlier joint` });
      continue;
    }
    switch (joint) {
      case 'mortise-tenon': mortiseTenon(E, R, k, side, c!.tenonLength!); break;
      case 'dado': dado(E, R, k, side, c!.depth!); break;
      case 'stopped-dado': dado(E, R, k, side, c!.depth!, { at: c!.stopAt!, inset: c!.inset! }); break;
      default: rest(joint, site, boards, state, c!); break;
    }
    applied.push({ site: site.id, joint });
  }

  const out = migrateDocument({ ...doc, version: CURRENT_VERSION, boards });
  return {
    doc: out, applied, skipped,
    moved: [...moved], trimmed: [...trimmed],
    sizeBefore: overall(doc.boards), sizeAfter: overall(out.boards),
  };
}

type State = { moved: Set<string>; trimmed: Set<string>; movedFace: Map<number, string>; rabbetReceivers: Set<string> };

/** Task 5 fills this in: rabbet and half-lap. */
function rest(joint: JointKind, _site: Site, _boards: Board[], _state: State, _c: JointChoice): void {
  throw new Error(`applyJoints: ${joint} is not built yet`);
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/generate/joints/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Apply each mutation, confirm a test fails, then revert:
1. Drop the shoulder waste boxes.
2. Use `ext` from the wrong side.
3. In `dado`, skip E's notch.
4. Remove the `touching` guard.

For the `touching` guard, also add one test that fails without it: run a site after its E has
been moved away by hand, and assert it lands in `skipped`.

Record one result line per mutation.

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run build`

```bash
git add -A src
git commit -m "feat(joints): applyJoints — mortise and tenon, dado, stopped dado; conservation and the corner collision tested

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Recipes II — rabbet (moves and trims) and half-lap

**Files:**
- Modify: `src/generate/joints/recipes.ts` (replace the `rest` stub)
- Test: `src/generate/joints/recipes.test.ts`

**Interfaces:**
- Consumes: Task 4's module.
- Produces: `rabbet` and `half-lap` in `applyJoints`. `moved`, `trimmed` and `sizeAfter` are now
  populated by them.

- [ ] **Step 1: Write the failing tests**

Append to `recipes.test.ts`:

```ts
describe('rabbet: the back panel moves into rabbets, and is trimmed back to the rabbet line', () => {
  const doc = design(
    { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
  );
  const sites = findSites(doc);
  const choices = sites.map((s) => s.kind === 'face-against-edge'
    ? { site: s.id, joint: 'rabbet' as const, depth: 0.375 }
    : { site: s.id, joint: 'butt' as const });
  const out = applyJoints(doc, sites, choices);
  const z = (name: string) => { const b = board(out.doc, name); const o = board(doc, name); return [b.position[2] - o.position[2]]; };

  it('finds two rabbet sites, one per side', () => {
    expect(sites.filter((s) => s.kind === 'face-against-edge')).toHaveLength(2);
  });

  it('moves the back ONCE, by its own thickness, toward the sides', () => {
    expect(z('Back')).toEqual([-0.25]);
    expect(out.moved).toEqual(['Back']);
  });

  it('trims the back to the rabbet lines: inner width plus two rabbet depths', () => {
    // Between the sides is 20in; each rabbet reaches 3/8in into a side.
    expect(board(out.doc, 'Back').width).toBe(20.75);
  });

  it('trims the shelf that butted the back by the back\'s thickness', () => {
    expect(board(out.doc, 'Shelf').width).toBe(11);
    expect(out.trimmed.sort()).toEqual(['Back', 'Shelf']);
  });

  it('rabbets each side, no overlap anywhere, and reports the piece 1/4in shallower', () => {
    for (const name of ['Left', 'Right']) {
      const b = board(out.doc, name);
      expect(b.cuts.map((c) => cutLabel(b, c))).toEqual(['rabbet']);
    }
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    expect(out.sizeBefore[2] - out.sizeAfter[2]).toBe(0.25);
  });
});

describe('half-lap', () => {
  const doc = design(
    { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
    { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
  );
  const out = applyJoints(doc, findSites(doc), [{ site: 1, joint: 'half-lap' }]);

  it('drops the upper part into the lower one\'s plane, notches both by half, no overlap', () => {
    expect(board(out.doc, 'Upper').position[1]).toBe(board(out.doc, 'Lower').position[1]);
    expect(board(out.doc, 'Upper').cuts).toHaveLength(1);
    expect(board(out.doc, 'Lower').cuts).toHaveLength(1);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    const notch = 2 * 2 * 0.375;
    expect(boxVolume(out.doc, 'Lower') - volume(out.doc, 'Lower')).toBeCloseTo(notch, 9);
    expect(boxVolume(out.doc, 'Upper') - volume(out.doc, 'Upper')).toBeCloseTo(notch, 9);
    expect(out.moved).toEqual(['Upper']);
  });
});
```

Where the rabbet numbers come from. They are hand-derived. If one differs, STOP and report it.
- **The back's travel:** it moves −0.25 along Z, from z 11.25–11.5 to 11–11.25.
- **The left side:** its centre is at x 0.375 and the back's centre at 10.75, so its inner face is
  `max` at x 0.75. The rabbet line is 0.75 − 0.375 = 0.375.
- **The right side:** its inner face is `min`, at x 20.75. The rabbet line is 20.75 + 0.375 = 21.125.
- **The back's width:** it was 0–21.5 and is trimmed to 0.375–21.125, which is 20.75.
- **The shelf:** its back edge was at z 11.25, touching the back's min face, so it shortens on that
  side by 0.25. Its width goes from 11.25 to 11.
- **Overall depth:** it was 11.5 (z 0–11.5) and is now 11.25 (z 0–11.25).

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/generate/joints/recipes.test.ts`
Expected: the new tests FAIL with "not built yet".

- [ ] **Step 3: Implement**

In `recipes.ts`, replace the `rest` stub with:

```ts
function rest(joint: JointKind, site: Site, boards: Board[], state: State, c: JointChoice): void {
  if (joint === 'rabbet') rabbet(site, boards, state, c.depth!);
  else if (joint === 'half-lap') halfLap(site, boards, state);
  else throw new Error(`applyJoints: unknown joint ${joint}`);
}

/**
 * Rabbet (spec §4.5). The panel moves ONCE toward its receivers by its own
 * thickness, and every OTHER part butting the face that moves is shortened by
 * the same amount first — otherwise the back drives into the shelves. Each
 * receiver gets a rabbet t deep from its edge and r in from its inner face,
 * and the panel is trimmed back to the rabbet line.
 */
function rabbet(site: Site, boards: Board[], state: State, r: number) {
  const E = boards[site.enter];
  const R = boards[site.receive];
  const k = site.axis;
  const side = site.side;
  const t = E.thickness;
  const faceKey = `${k}|${side}`;
  const rb = boxOf(R);

  if (state.movedFace.get(site.enter) !== faceKey) {
    const eb = boxOf(E);
    const plane = side === 1 ? eb.max[k] : eb.min[k];
    boards.forEach((X, i) => {
      if (i === site.enter || i === site.receive) return;
      const xb = boxOf(X);
      const xFace = side === 1 ? xb.min[k] : xb.max[k];
      const sharesFace = [0, 1, 2].filter((a) => a !== k)
        .every((a) => Math.min(eb.max[a], xb.max[a]) - Math.max(eb.min[a], xb.min[a]) > TOUCH);
      // Rabbet receivers of this panel keep their length; everyone else
      // butting the moving face is shortened on that face.
      if (Math.abs(xFace - plane) <= TOUCH && sharesFace && !state.rabbetReceivers.has(`${site.enter}->${i}`)) {
        resize(X, k, (side === 1 ? -1 : 1) as -1 | 1, -t);
        state.trimmed.add(X.name);
      }
    });
    E.position[k] += side * t;
    state.moved.add(E.name);
    state.movedFace.set(site.enter, faceKey);
  }

  const P = side === -1 ? rb.max[k] : rb.min[k];
  const kSpan: [number, number] = side === -1 ? [P - t, P] : [P, P + t];
  const nAx = axisDimensions(R).indexOf('thickness');
  const q = [0, 1, 2].find((a) => a !== k && a !== nAx)!;
  const eb = boxOf(E);
  const inner = (eb.min[nAx] + eb.max[nAx]) / 2 >= (rb.min[nAx] + rb.max[nAx]) / 2 ? 'max' : 'min';
  const nSpan: [number, number] = inner === 'max' ? [rb.max[nAx] - r, rb.max[nAx]] : [rb.min[nAx], rb.min[nAx] + r];
  const qSpan: [number, number] = [Math.max(eb.min[q], rb.min[q]), Math.min(eb.max[q], rb.max[q])];
  R.cuts.push(pocketFor(R, withSpans(rb, { [k]: kSpan, [nAx]: nSpan, [q]: qSpan })));

  if (inner === 'max' && eb.min[nAx] < nSpan[0] - 1e-9) {
    resize(E, nAx, -1, -(nSpan[0] - eb.min[nAx]));
    state.trimmed.add(E.name);
  } else if (inner === 'min' && eb.max[nAx] > nSpan[1] + 1e-9) {
    resize(E, nAx, 1, -(eb.max[nAx] - nSpan[1]));
    state.trimmed.add(E.name);
  }
}
```

```ts
/**
 * Half-lap (spec §4.6). E — the part on the +axis side — drops by t into R's
 * plane; each is notched by half where they cross, E on R's original side.
 */
function halfLap(site: Site, boards: Board[], state: State) {
  const E = boards[site.enter];
  const R = boards[site.receive];
  const k = site.axis;
  const side = site.side;
  E.position[k] += side * E.thickness;
  state.moved.add(E.name);
  const eb = boxOf(E);
  const rb = boxOf(R);
  const mid = (rb.min[k] + rb.max[k]) / 2;
  const lower: [number, number] = [rb.min[k], mid];
  const upper: [number, number] = [mid, rb.max[k]];
  const cross = (a: number): [number, number] => [Math.max(eb.min[a], rb.min[a]), Math.min(eb.max[a], rb.max[a])];
  const [p, q] = [0, 1, 2].filter((a) => a !== k);
  const crossing = { [p]: cross(p), [q]: cross(q) };
  E.cuts.push(pocketFor(E, withSpans(eb, { ...crossing, [k]: side === -1 ? lower : upper })));
  R.cuts.push(pocketFor(R, withSpans(rb, { ...crossing, [k]: side === -1 ? upper : lower })));
}
```

Keep `State` where Task 4 declared it.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/generate/joints/recipes.test.ts`
Expected: PASS, including every Task 4 test, unchanged.

- [ ] **Step 5: Mutation-check**

Apply each mutation, confirm a test fails, then revert:
1. Move the panel for every rabbet site, not once.
2. Skip trimming butting parts.
3. Trim the receivers too.
4. Flip `inner`.
5. Put E's half-lap notch on the wrong half.

Record one result line per mutation.

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run build`

```bash
git add -A src
git commit -m "feat(joints): rabbet moves the panel once and trims butting parts; half-lap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `choose.ts` — the prompt, the schema, validation, defaults

**Files:**
- Create: `src/generate/joints/choose.ts`
- Test: `src/generate/joints/choose.test.ts`

**Interfaces:**
- Consumes: `Site`, `rangesOf`, `stopLabel` and `siteLabel` (Task 3); `JointChoice` (Task 4).
- Produces:
  - `export const JOINERY_PROMPT: string`
  - `export const JOINT_SCHEMA: Record<string, unknown>`
  - `export function siteMessage(doc, sites): string`
  - `export function defaultChoice(site, doc): JointChoice`
  - `export function parseChoices(json: unknown, sites, doc): { choices: JointChoice[]; notes: string[] }`
  - `export function jointsRepairMessage(v: Violation[]): string`
  - `export function jointsUnusableMessage(reason): string`

- [ ] **Step 1: Write the failing tests**

Create `src/generate/joints/choose.test.ts`:

```ts
import { designToDocument } from '../../document/generated';
import { defaultChoice, parseChoices, siteMessage, JOINT_SCHEMA } from './choose';
import { findSites } from './sites';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
const doc = design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
  { name: 'Side', at: [40, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [40.75, 12, 0], size: [20, 0.75, 11.25] },
);
const sites = findSites(doc);
const rail = sites.find((s) => doc.boards[s.enter].name === 'Rail')!;
const shelf = sites.find((s) => doc.boards[s.enter].name === 'Shelf')!;

describe('defaultChoice', () => {
  it('a narrow rail gets a mortise and tenon of min(1-1/4, 2/3 of the leg)', () => {
    expect(defaultChoice(rail, doc)).toEqual({ site: rail.id, joint: 'mortise-tenon', tenonLength: 1.1875 });
  });
  it('a wide shelf gets a dado a third of the side deep', () => {
    expect(defaultChoice(shelf, doc)).toEqual({ site: shelf.id, joint: 'dado', depth: 0.25 });
  });
});

describe('parseChoices', () => {
  it('keeps a valid answer', () => {
    const out = parseChoices({ joints: [
      { site: rail.id, joint: 'mortise-tenon', tenonLength: 1 },
      { site: shelf.id, joint: 'stopped-dado', depth: 0.25, stopAt: '+Z', inset: 0.75 },
    ] }, sites, doc);
    expect(out.notes).toEqual([]);
    expect(out.choices).toEqual([
      { site: rail.id, joint: 'mortise-tenon', tenonLength: 1 },
      { site: shelf.id, joint: 'stopped-dado', depth: 0.25, stopAt: { axis: 2, end: 'max' }, inset: 0.75 },
    ]);
  });

  it('falls back per site, with a note, for a disallowed joint, a missing site, a bad stopAt', () => {
    const out = parseChoices({ joints: [
      { site: rail.id, joint: 'rabbet' },
      { site: 99, joint: 'dado' },
    ] }, sites, doc);
    expect(out.choices).toEqual([defaultChoice(rail, doc), defaultChoice(shelf, doc)]);
    expect(out.notes).toHaveLength(2);
    const bad = parseChoices({ joints: [
      { site: rail.id, joint: 'butt' },
      { site: shelf.id, joint: 'stopped-dado', depth: 0.25, stopAt: '+Q', inset: 0.75 },
    ] }, sites, doc);
    expect(bad.choices[1]).toMatchObject({ stopAt: shelf.stopEnds[0] });
    expect(bad.notes).toHaveLength(1);
  });

  it('snaps then clamps an out-of-range size, with a note', () => {
    const out = parseChoices({ joints: [
      { site: rail.id, joint: 'mortise-tenon', tenonLength: 9 },
      { site: shelf.id, joint: 'dado', depth: 0.01 },
    ] }, sites, doc);
    expect(out.choices[0].tenonLength).toBe(1.5);
    expect(out.choices[1].depth).toBe(0.125);
    expect(out.notes).toHaveLength(2);
  });

  it('treats an answer that is not the schema\'s shape as all-defaults', () => {
    const out = parseChoices('nonsense', sites, doc);
    expect(out.choices).toEqual(sites.map((s) => defaultChoice(s, doc)));
  });
});

describe('siteMessage', () => {
  it('names every part and every site with its allowed joints and ranges', () => {
    const m = siteMessage(doc, sites);
    for (const b of doc.boards) expect(m).toContain(b.name);
    expect(m).toContain(`${rail.id}. Rail → Leg — end into face`);
    expect(m).toContain('mortise-tenon (tenonLength 0.5–1.5)');
    expect(m).toContain('stopped-dado');
  });
});

it('JOINT_SCHEMA enumerates the six joints', () => {
  expect(JSON.stringify(JOINT_SCHEMA)).toContain('"half-lap"');
});
```

Where those numbers come from. They are hand-derived. If one differs, STOP and report it.
- **Rail:**
  - the leg is 1.75″ deep, so 2/3 of it is 1.1667, which snaps to 1.1875;
  - `min(1.25, 1.1875)` = 1.1875, inside [0.5, 1.5];
  - the leg is post-like (1.75 ≤ 2 × 1.75), and the rail is not wide (3.5 ≤ 6 × 0.75), so the
    default is mortise and tenon (spec §5.3, as corrected).
- **Shelf:**
  - the side is not post-like (11.25 > 2 × 0.75), so the default is a dado;
  - a third of the side's 0.75 is 0.25.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/generate/joints/choose.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement**

Create `src/generate/joints/choose.ts`:

```ts
import type { SloydDocument } from '../../document/document';
import type { Violation } from '../../document/designCheck';
import { SNAP_INCHES } from '../../document/geometry';
import { boxOf } from './pocket';
import type { JointChoice } from './recipes';
import { rangesOf, siteLabel, stopLabel } from './sites';
import type { JointKind, Site, StopEnd } from './sites';

const JOINTS: JointKind[] = ['mortise-tenon', 'dado', 'stopped-dado', 'rabbet', 'half-lap', 'butt'];
const n = (v: number) => `${+v.toFixed(4)}`;
const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));
const AXES = ['X', 'Y', 'Z'] as const;

export const JOINERY_PROMPT = `You choose woodworking joints for a design in Sloyd, a woodworking planner.

You are given the design's parts and a numbered list of SITES — places where two parts meet. For EVERY site, choose one joint from that site's allowed list, with its sizes. The program builds the joints exactly; you supply judgment only.

Joints:
- mortise-tenon: the entering part grows a tenon (a third of its thickness, with shoulders) into a stopped mortise in the receiving part. Size: tenonLength, how far the tenon reaches in. About 2/3 of the receiving part's depth is typical; leave at least 1/4in of wood behind it.
- dado: the entering part's whole end is housed in a trench in the receiving part. Size: depth, about 1/3 of the receiving part's thickness.
- stopped-dado: a dado that stops short of one edge so it does not show there; the entering part is notched to match. Sizes: depth, stopAt (one of the site's named ends, e.g. "+Z"), inset (how far short it stops).
- rabbet: a thin panel (a back or bottom) sits in a rabbet along the receiving part's edge. Size: depth, how far the rabbet reaches into the receiving part's thickness — half its thickness is typical. The panel moves into the rabbet; parts butting it are shortened to make room.
- half-lap: two crossing parts of equal thickness are each cut halfway so they lie in one plane. No sizes.
- butt: leave the site as it is. Choose it where a joint adds nothing.

Rules of thumb: rails and aprons into legs take mortise and tenon; shelves and dividers into case sides take dados, stopped at the edge that shows (usually the front); backs take rabbets; crossing stretchers take half-laps. Two tenons entering one leg from adjacent faces at the same height will collide unless both are short.

Answer for every site, using its number. All sizes are decimal inches.`;

export const JOINT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    joints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          site: { type: 'integer' },
          joint: { type: 'string', enum: JOINTS },
          tenonLength: { type: 'number' },
          depth: { type: 'number' },
          stopAt: { type: 'string' },
          inset: { type: 'number' },
        },
        required: ['site', 'joint'],
        additionalProperties: false,
      },
    },
  },
  required: ['joints'],
  additionalProperties: false,
};

const SIDE = (s: Site) => `${s.side === 1 ? '+' : '-'}${AXES[s.axis]}`;

export function siteMessage(doc: SloydDocument, sites: Site[]): string {
  const parts = doc.boards.map((b) => {
    const x = boxOf(b);
    return `- ${b.name} (${b.material}): ${n(x.max[0] - x.min[0])} x ${n(x.max[1] - x.min[1])} x ${n(x.max[2] - x.min[2])} in, ` +
      `x ${n(x.min[0])}–${n(x.max[0])}, y ${n(x.min[1])}–${n(x.max[1])}, z ${n(x.min[2])}–${n(x.max[2])}`;
  });
  const lines = sites.map((s) => {
    const r = rangesOf(s, doc);
    const opts = s.allowed.map((j) => {
      switch (j) {
        case 'mortise-tenon': return `mortise-tenon (tenonLength ${n(r.tenonLength[0])}–${n(r.tenonLength[1])})`;
        case 'dado': return `dado (depth ${n(r.dadoDepth[0])}–${n(r.dadoDepth[1])})`;
        case 'stopped-dado': return `stopped-dado (depth ${n(r.dadoDepth[0])}–${n(r.dadoDepth[1])}; stopAt ${s.stopEnds.map((e) => `${stopLabel(e)} with inset ${n(r.inset(e)[0])}–${n(r.inset(e)[1])}`).join(' or ')})`;
        case 'rabbet': return `rabbet (depth ${n(r.rabbetDepth[0])}–${n(r.rabbetDepth[1])})`;
        default: return j;
      }
    });
    return `${s.id}. ${siteLabel(s, doc).replace(': ', ' — ')}, meeting on ${AXES[s.axis]} (${doc.boards[s.enter].name}'s ${SIDE(s)} face). Allowed: ${opts.join(', ')}.`;
  });
  return `Parts:\n${parts.join('\n')}\n\nSites:\n${lines.join('\n')}`;
}

export function defaultChoice(s: Site, doc: SloydDocument): JointChoice {
  const E = doc.boards[s.enter];
  const R = doc.boards[s.receive];
  const r = rangesOf(s, doc);
  const rb = boxOf(R);
  const rDepth = rb.max[s.axis] - rb.min[s.axis];
  const has = (j: JointKind) => s.allowed.includes(j);
  const dadoDefault = (): JointChoice => ({ site: s.id, joint: 'dado', depth: clamp(Math.max(0.125, snap(rDepth / 3)), r.dadoDepth) });
  if (s.kind === 'end-into-face') {
    // Spec §5.3 (as corrected): legs and posts take tenons, panels take dados.
    const postLike = R.width <= 2 * R.thickness;
    const wide = E.width > 6 * E.thickness;
    if (postLike && !wide && has('mortise-tenon')) return { site: s.id, joint: 'mortise-tenon', tenonLength: clamp(Math.min(1.25, snap((2 / 3) * rDepth)), r.tenonLength) };
    if (has('dado')) return dadoDefault();
    return { site: s.id, joint: 'butt' };
  }
  if (s.kind === 'face-against-edge') {
    return has('rabbet') ? { site: s.id, joint: 'rabbet', depth: clamp(snap(R.thickness / 2), r.rabbetDepth) } : { site: s.id, joint: 'butt' };
  }
  return { site: s.id, joint: 'half-lap' };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate the model's answer against each site (spec §5.2). Every substitution
 * — a missing site, a disallowed joint, a missing or out-of-range size, a bad
 * stopAt — falls back per site and leaves a NOTE for the person.
 */
export function parseChoices(json: unknown, sites: Site[], doc: SloydDocument): { choices: JointChoice[]; notes: string[] } {
  const given = new Map<number, Record<string, unknown>>();
  if (isObj(json) && Array.isArray(json.joints)) {
    for (const j of json.joints) if (isObj(j) && typeof j.site === 'number') given.set(j.site, j);
  }
  const notes: string[] = [];
  const choices = sites.map((s): JointChoice => {
    const label = `Site ${s.id} (${siteLabel(s, doc)})`;
    const g = given.get(s.id);
    const fallback = defaultChoice(s, doc);
    if (!g) { if (given.size > 0) notes.push(`${label}: no answer; used ${fallback.joint}.`); return fallback; }
    const joint = g.joint as JointKind;
    if (!s.allowed.includes(joint)) { notes.push(`${label}: ${String(g.joint)} is not possible there; used ${fallback.joint}.`); return fallback; }
    const r = rangesOf(s, doc);
    const size = (key: 'tenonLength' | 'depth' | 'inset', rng: [number, number], dflt: number) => {
      const v = g[key];
      if (typeof v !== 'number' || !Number.isFinite(v)) { notes.push(`${label}: no ${key}; used ${n(dflt)}.`); return dflt; }
      const out = clamp(snap(v), rng);
      if (out !== v) notes.push(`${label}: ${key} ${n(v)} became ${n(out)}.`);
      return out;
    };
    switch (joint) {
      case 'mortise-tenon': return { site: s.id, joint, tenonLength: size('tenonLength', r.tenonLength, clamp(Math.min(1.25, snap((2 / 3) * (boxOf(doc.boards[s.receive]).max[s.axis] - boxOf(doc.boards[s.receive]).min[s.axis]))), r.tenonLength)) };
      case 'dado': return { site: s.id, joint, depth: size('depth', r.dadoDepth, defaultDado(s, doc)) };
      case 'stopped-dado': {
        let at: StopEnd | undefined = s.stopEnds.find((e) => stopLabel(e) === g.stopAt);
        if (!at) { at = s.stopEnds[0]; notes.push(`${label}: stopAt ${String(g.stopAt)} is not one of ${s.stopEnds.map(stopLabel).join(', ')}; used ${stopLabel(at)}.`); }
        const insetRange = r.inset(at);
        return { site: s.id, joint, depth: size('depth', r.dadoDepth, defaultDado(s, doc)), stopAt: at, inset: size('inset', insetRange, clamp(0.75, insetRange)) };
      }
      case 'rabbet': return { site: s.id, joint, depth: size('depth', r.rabbetDepth, clamp(snap(doc.boards[s.receive].thickness / 2), r.rabbetDepth)) };
      default: return { site: s.id, joint };
    }
  });
  return { choices, notes };
}

function defaultDado(s: Site, doc: SloydDocument): number {
  const rb = boxOf(doc.boards[s.receive]);
  return clamp(Math.max(0.125, snap((rb.max[s.axis] - rb.min[s.axis]) / 3)), rangesOf(s, doc).dadoDepth);
}

export function jointsRepairMessage(v: Violation[]): string {
  return `The joints you chose cause ${v.length} new problem${v.length === 1 ? '' : 's'}:\n${v.map((x) => `- ${x.message}`).join('\n')}\n\nReturn the whole joint list again, changed to avoid them (for example, shorter tenons where two meet).`;
}

export function jointsUnusableMessage(reason: 'truncated' | 'unparseable'): string {
  return reason === 'truncated'
    ? 'Your response was cut off. Return the whole joint list again, more compactly.'
    : 'Your response was not a usable joint list. Return it again, matching the schema.';
}
```

Two things are deliberate:
- **The notes for a missing site** are skipped when the answer was entirely unusable
  (`given.size === 0`). The run reports that once, as the fallback.
- **The repeated tenon default** inside `parseChoices` must be refactored into one
  `defaultTenon(s, doc)` helper, used by both `defaultChoice` and `parseChoices`, so the rule
  lives in one place. Do that as you implement. It is part of this step.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/generate/joints/choose.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Apply each mutation, confirm a test fails, then revert:
1. Skip the `allowed` check.
2. Clamp without snapping.
3. Pick `stopEnds[1]` on a bad `stopAt`.
4. Drop the `postLike` test.

Record one result line per mutation.

- [ ] **Step 6: Run everything and commit**

Run: `npm test && npm run build`

```bash
git add -A src
git commit -m "feat(joints): the joinery prompt, schema, per-site validation and defaults

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The generic loop, and `runJoinery`

**Files:**
- Modify: `src/generate/run.ts`
- Test: `src/generate/run.test.ts`, and a new `src/generate/joints/runJoinery.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:

```ts
export interface LoopAdapter<T extends { doc: SloydDocument; violations: Violation[] }> {
  system: string; schema: Record<string, unknown>; first: string;
  evaluate(res: LlmResult): { value: T | null; feedback: string };
}
export async function runRepairLoop<T>(client, adapter: LoopAdapter<T>, signal, onProgress, opts?: { keepBestOnError?: boolean }): Promise<T & { usage: LlmUsage }>
export interface JoineryOutcome { result: JoinResult; notes: string[]; violations: Violation[]; preexisting: Violation[]; usage: LlmUsage; fallback?: string }
export async function runJoinery(client, doc, signal, onProgress): Promise<JoineryOutcome | { noSites: true }>
export function joineryEstimateUsd(client: LlmClient, doc: SloydDocument): number | null
```

- [ ] **Step 1: Refactor the loop with no behaviour change**

In `run.ts`, extract the loop body into `runRepairLoop`. `runGeneration` becomes:

```ts
export async function runGeneration(client, settings, signal, onProgress, concept?) {
  const limits = limitsOf(settings);
  return runRepairLoop(client, {
    system: SYSTEM_PROMPT, schema: DESIGN_SCHEMA, first: userMessage(settings, concept),
    evaluate: (res) => {
      const design = res.json === null ? null : parseDesign(res.json);
      const converted = design && designToDocument(design);
      if (!converted) return { value: null, feedback: unusableMessage(res.unusable ?? 'unparseable') };
      if (converted.doc.boards.length === 0) return { value: null, feedback: repairMessage(rejectedViolations(converted.rejected)) };
      const violations = [...rejectedViolations(converted.rejected), ...checkDesign(converted.doc, limits)];
      return { value: { doc: converted.doc, violations }, feedback: repairMessage(violations) };
    },
  }, signal, onProgress);
}
```

`runRepairLoop` keeps the existing loop **exactly**:
- each request gets a copy of the history;
- each assistant turn is appended exactly as received;
- the best attempt is the one with the fewest violations, and a tie goes to the later attempt;
- the loop stops at 0 violations;
- a user turn is pushed only while `attempt < MAX_REPAIRS`;
- `RunFailed` is thrown when no attempt was usable;
- a `null` value means the attempt was unusable, and it drives the `retrying` progress phase.

The one addition: with `opts.keepBestOnError`, an `LlmError` that is neither `auth` nor
`cancelled` and arrives **after** a usable attempt returns the best attempt instead of throwing.

Run: `npx vitest run src/generate/run.test.ts src/useGenerations.test.tsx`
Expected: **every existing test passes without a single edit.** That includes invariant 37's
identity test. If one fails, the refactor changed behaviour: fix the refactor.

Commit:

```bash
git add src/generate/run.ts
git commit -m "refactor(run): the repair loop is generic; Generate is its first adapter, unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing `keepBestOnError` and `runJoinery` tests**

Append a `keepBestOnError` test to `run.test.ts`, using its `fakeClient`:
- the first call returns ONE_ISSUE;
- the second throws `new LlmError('overloaded', 'busy')`;
- `runRepairLoop(..., { keepBestOnError: true })` resolves with the first attempt;
- without the option it rejects.

Create `src/generate/joints/runJoinery.test.ts`:

```ts
import { vi } from 'vitest';
import { designToDocument } from '../../document/generated';
import { LlmError } from '../../llm/types';
import type { LlmClient, LlmResult } from '../../llm/types';
import { runJoinery } from '../run';
import { findSites } from './sites';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const client = (...answers: (unknown | Error)[]): LlmClient => {
  let i = 0;
  return {
    complete: vi.fn(async (): Promise<LlmResult> => {
      const a = answers[Math.min(i++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return { json: a, assistantTurn: { n: i }, usage };
    }),
    userTurn: (t) => t,
    estimateCostUsd: () => 0.01,
  };
};
const run = (c: LlmClient, d = CORNER) => runJoinery(c, d, new AbortController().signal, () => {});

const CORNER = design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
  { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3, 18] },
);
const ids = findSites(CORNER).map((s) => s.id);
const long = { joints: ids.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 1.25 })) };
const short = { joints: ids.map((site) => ({ site, joint: 'mortise-tenon', tenonLength: 0.5 })) };

describe('runJoinery', () => {
  it('repairs a tenon collision: the second answer clears it', async () => {
    const c = client(long, short);
    const out = await run(c);
    if ('noSites' in out) throw new Error('expected sites');
    expect(c.complete).toHaveBeenCalledTimes(2);
    expect(out.violations).toEqual([]);
    expect(out.fallback).toBeUndefined();
  });

  it('makes no call when there are no sites', async () => {
    const c = client(long);
    const out = await run(c, design({ name: 'Lone', at: [0, 0, 0], size: [10, 1, 10] }));
    expect(out).toEqual({ noSites: true });
    expect(c.complete).not.toHaveBeenCalled();
  });

  it('builds the defaults when the FIRST call fails, and says why', async () => {
    const out = await run(client(new LlmError('overloaded', 'Overloaded.')));
    if ('noSites' in out) throw new Error('expected sites');
    expect(out.fallback).toBe('Overloaded.');
    expect(out.result.applied.map((a) => a.joint)).toEqual(['mortise-tenon', 'mortise-tenon']);
  });

  it('a rejected key throws and builds nothing', async () => {
    await expect(run(client(new LlmError('auth', 'API key was rejected')))).rejects.toMatchObject({ kind: 'auth' });
  });

  it('counts only problems the joinery introduced', async () => {
    // A floating part is already a problem; joining the legs and rails must not be blamed for it.
    const d = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
      { name: 'Float', at: [50, 40, 0], size: [5, 1, 5] },
    );
    const site = findSites(d)[0].id;
    const c = client({ joints: [{ site, joint: 'mortise-tenon', tenonLength: 1 }] });
    const out = await run(c, d);
    if ('noSites' in out) throw new Error('expected sites');
    expect(c.complete).toHaveBeenCalledTimes(1);
    expect(out.violations).toEqual([]);
    expect(out.preexisting.map((v) => v.parts)).toContainEqual(['Float']);
  });
});
```

**The defaults test:** `Rail X` and `Rail Z` enter a post-like leg and are not wide
(3 ≤ 6 × 0.75), so they default to mortise and tenon (spec §5.3).

**The defaults collide in the corner.** The default tenon is min(1.25, snap(1.1667)) = 1.1875,
and two of those meet in the corner leg, so `violations` is not asserted empty in that test. That
is the correct outcome: the defaults are built and checked once, and nothing repairs them.

- [ ] **Step 3: Implement `runJoinery` and `joineryEstimateUsd`**

Add to `run.ts`, importing the joints modules, `LlmError` and `ZERO_USAGE`:

```ts
const problemKey = (v: Violation) => `${v.kind}|${[...v.parts].sort().join(',')}`;

export interface JoineryOutcome {
  result: JoinResult; notes: string[]; violations: Violation[]; preexisting: Violation[];
  usage: LlmUsage; fallback?: string;
}

/**
 * Add joinery (spec §6). Sites are found first; with none, NO call is made.
 * One choosing call, repaired through the shared loop. Only problems the
 * joinery INTRODUCED — keyed on kind and parts, never on message text —
 * drive repairs and count toward "fewest" (invariant 41). A first call that
 * fails for any reason but the key builds the defaults instead.
 */
export async function runJoinery(client: LlmClient, doc: SloydDocument, signal: AbortSignal, onProgress: (p: RunProgress) => void): Promise<JoineryOutcome | { noSites: true }> {
  const sites = findSites(doc);
  if (sites.length === 0) return { noSites: true };
  const limits = { width: null, depth: null, height: null, maxParts: doc.boards.length };
  const preexisting = checkDesign(doc, limits);
  const old = new Set(preexisting.map(problemKey));
  const build = (choices: JointChoice[], notes: string[]) => {
    const result = applyJoints(doc, sites, choices);
    const violations = checkDesign(result.doc, limits).filter((v) => !old.has(problemKey(v)));
    return { doc: result.doc, violations, result, notes, preexisting };
  };
  try {
    return await runRepairLoop(client, {
      system: JOINERY_PROMPT, schema: JOINT_SCHEMA, first: siteMessage(doc, sites),
      evaluate: (res) => {
        if (res.json === null) return { value: null, feedback: jointsUnusableMessage(res.unusable ?? 'unparseable') };
        const { choices, notes } = parseChoices(res.json, sites, doc);
        const value = build(choices, notes);
        return { value, feedback: jointsRepairMessage(value.violations) };
      },
    }, signal, onProgress, { keepBestOnError: true });
  } catch (e) {
    if (e instanceof LlmError && (e.kind === 'auth' || e.kind === 'cancelled')) throw e;
    const reason = e instanceof RunFailed ? 'no usable answer' : e instanceof Error ? e.message : 'unknown error';
    return { ...build(sites.map((s) => defaultChoice(s, doc)), []), usage: e instanceof RunFailed ? e.usage : ZERO_USAGE, fallback: reason };
  }
}

/** A rough before-you-run estimate: one call, the prompt and sites in, ~2,000 tokens out. */
export function joineryEstimateUsd(client: LlmClient, doc: SloydDocument): number | null {
  const sites = findSites(doc);
  if (sites.length === 0) return null;
  const chars = JOINERY_PROMPT.length + siteMessage(doc, sites).length;
  return client.estimateCostUsd({ inputTokens: Math.ceil(chars / 4), outputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0 });
}
```

`runRepairLoop`'s returned object spreads the best value, so `doc` and `result` ride along. The
outcome type simply carries both.

- [ ] **Step 4: Run, mutation-check, and commit**

Run: `npx vitest run src/generate`
Expected: PASS.

Apply each mutation, confirm a test fails, then revert:
1. Filter on message text, not on `problemKey`.
2. Count pre-existing problems too.
3. Drop `keepBestOnError`.

Record one result line per mutation. Then run `npm test && npm run build`.

```bash
git add -A src
git commit -m "feat(run): runJoinery — one choosing call, repaired through the shared loop; only new problems count

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `useJoinery`, `JoineryDialog`, and the wiring

**Files:**
- Create: `src/useJoinery.ts`, `src/useJoinery.test.tsx`, `src/panels/JoineryDialog.tsx`, `src/panels/JoineryDialog.test.tsx`
- Modify: `src/App.tsx`, `src/panels/Toolbar.tsx`, `src/panels/Toolbar.test.tsx` (its renders gain the new required prop), `src/styles.css` (only if a class is needed)

**Interfaces:**
- Consumes: `runJoinery`, `joineryEstimateUsd`, `findSites` and `siteLabel`.
- Produces:
  - `useJoinery({ onCreated, onStorageVerdict })` returns `{ run: JoineryRun | null, live: boolean, start(client, doc), cancel() }`;
  - `JoineryDialog`;
  - a Toolbar prop `onOpenJoinery`;
  - `App`'s `dialog` union gains `'joinery'`.

- [ ] **Step 1: Write the failing hook tests**

Create `src/useJoinery.test.tsx`, modelled on `useGenerations.test.tsx` (the same storage mock and
fake client):

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJoinery } from './useJoinery';
import { designToDocument } from './document/generated';
import { findSites } from './generate/joints/sites';
import { LlmError } from './llm/types';
import type { LlmClient, LlmResult } from './llm/types';
import { storage } from './storage/browser';

vi.mock('./storage/browser', () => ({ storage: { available: true, createProject: vi.fn() } }));
const createProject = storage.createProject as unknown as ReturnType<typeof vi.fn>;
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const doc = designToDocument({ name: 'Bench', parts: [
  { name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
  { name: 'Rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 } },
] }).doc;
const answer = { joints: findSites(doc).map((s) => ({ site: s.id, joint: 'mortise-tenon', tenonLength: 1 })) };
const client = (complete: LlmClient['complete']): LlmClient => ({ complete: vi.fn(complete), userTurn: (t) => t, estimateCostUsd: () => 0.02 });
const ok = async (): Promise<LlmResult> => ({ json: answer, assistantTurn: {}, usage });
const setup = () => {
  const onCreated = vi.fn();
  const onStorageVerdict = vi.fn();
  return { ...renderHook(() => useJoinery({ onCreated, onStorageVerdict })), onCreated, onStorageVerdict };
};

beforeEach(() => { createProject.mockReset().mockResolvedValue('p1'); });

describe('useJoinery', () => {
  it('writes the joined design WITHOUT activating it, named "<name> — joined"', async () => {
    const { result, onCreated } = setup();
    act(() => result.current.start(client(ok), doc));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(createProject.mock.calls[0][1]).toEqual({ activate: false });
    expect(createProject.mock.calls[0][0].name).toBe('Bench — joined');
    expect(result.current.run).toMatchObject({ status: 'ready', projectId: 'p1', projectName: 'Bench — joined' });
    expect(onCreated).toHaveBeenCalledWith('p1');
  });

  it('a rejected key writes nothing and says why', async () => {
    const { result } = setup();
    act(() => result.current.start(client(async () => { throw new LlmError('auth', 'API key was rejected — check Settings.'); }), doc));
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run).toMatchObject({ status: 'failed', error: 'API key was rejected — check Settings.' });
  });

  it('cancel writes nothing', async () => {
    const { result } = setup();
    const hang = (_r: unknown, signal: AbortSignal) => new Promise<LlmResult>((_, reject) => {
      signal.addEventListener('abort', () => reject(new LlmError('cancelled', 'Cancelled.')));
    });
    act(() => result.current.start(client(hang as LlmClient['complete']), doc));
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).not.toHaveBeenCalled();
    expect(result.current.run?.status).toBe('cancelled');
  });

  it('a second start while one is live is ignored', async () => {
    const { result } = setup();
    const c = client(ok);
    act(() => { result.current.start(c, doc); result.current.start(c, doc); });
    await waitFor(() => expect(result.current.live).toBe(false));
    expect(createProject).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Implement `useJoinery.ts`**

```ts
import { useCallback, useRef, useState } from 'react';
import { runJoinery } from './generate/run';
import type { JoineryOutcome, RunProgress } from './generate/run';
import type { SloydDocument } from './document/document';
import { LlmError } from './llm/types';
import type { LlmClient } from './llm/types';
import { storage } from './storage/browser';

export type JoineryStatus = 'choosing' | 'repairing' | 'retrying' | 'ready' | 'none' | 'failed' | 'cancelled';
export interface JoineryRun {
  status: JoineryStatus; round?: number; issues?: number;
  projectId?: string; projectName?: string; outcome?: JoineryOutcome;
  error?: string; costUsd: number | null;
}

const progressPatch = (p: RunProgress): Partial<JoineryRun> =>
  p.phase === 'designing' ? { status: 'choosing' }
    : p.phase === 'repairing' ? { status: 'repairing', round: p.round, issues: p.issues }
      : { status: 'retrying', round: p.round };

/**
 * One joinery run, owned by App so closing the dialog does not cancel it.
 * NEVER ADOPTS (invariant 36): the result is written with
 * createProject(doc, { activate: false }) and nothing else. Open goes
 * through App's openProject.
 */
export function useJoinery(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }) {
  const [run, setRun] = useState<JoineryRun | null>(null);
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback((client: LlmClient, doc: SloydDocument) => {
    if (liveRef.current) return;
    const ctl = new AbortController();
    controller.current = ctl;
    liveRef.current = true;
    setLive(true);
    setRun({ status: 'choosing', costUsd: null });
    void (async () => {
      try {
        const out = await runJoinery(client, doc, ctl.signal, (p) => setRun((r) => (r ? { ...r, ...progressPatch(p) } : r)));
        if ('noSites' in out) { setRun({ status: 'none', costUsd: null }); return; }
        const costUsd = client.estimateCostUsd(out.usage);
        if (ctl.signal.aborted) { setRun({ status: 'cancelled', costUsd }); return; }
        const name = `${doc.name} — joined`;
        const id = await storage.createProject({ ...out.result.doc, name }, { activate: false });
        optsRef.current.onStorageVerdict();
        if (!id) { setRun({ status: 'failed', error: 'Could not save the project — storage is unavailable.', costUsd }); return; }
        optsRef.current.onCreated(id);
        setRun({ status: 'ready', projectId: id, projectName: name, outcome: out, costUsd });
      } catch (e) {
        if (e instanceof LlmError && e.kind === 'cancelled') setRun({ status: 'cancelled', costUsd: null });
        else setRun({ status: 'failed', error: e instanceof Error ? e.message : 'Unexpected error.', costUsd: null });
      } finally {
        liveRef.current = false;
        setLive(false);
      }
    })();
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);
  return { run, live, start, cancel };
}
```

Run: `npx vitest run src/useJoinery.test.tsx`
Expected: PASS.

- [ ] **Step 3: The dialog — tests, then the component**

Create `src/panels/JoineryDialog.test.tsx` with these tests:
- **No key.** The primary button reads "Set up your API key" and calls `onOpenSettings`.
- **No sites.** The exact no-sites message shows, and the Run button is disabled.
- **Ready.** The site lines render one per site. Run calls `onRun`. The estimate shows as `≈ $0.02`.
- **Done.** "Saved as 'Bench — joined'" shows. The summary line reads exactly
  `2 joints: 1 mortise and tenon, 1 dado`; build it from a fixture outcome whose `applied` holds
  one of each plus a `butt` (butt is not counted). Open calls `onOpenProject('p1')`.
- **A size change.** With `sizeBefore` `[21.5, 30, 11.5]` and `sizeAfter` `[21.5, 30, 11.25]`, the
  dialog shows `Overall depth now 11-1/4" (was 11-1/2")`. Format through `formatLength(v, 16)`.
- **Fallback.** With `outcome.fallback = 'Overloaded.'`, it shows
  `Joints chosen by built-in rules — the model call failed: Overloaded.`

Then write `src/panels/JoineryDialog.tsx` to the same overlay pattern as `GenerateDialog`:
- `.modal-overlay` with `role="dialog"`, `aria-modal` and `aria-label="Add joinery"`;
- a `.modal-sheet` that takes focus on mount;
- Escape closes it.

Props:

```ts
interface Props {
  hasKey: boolean; libraryAvailable: boolean;
  projectName: string; sites: string[]; model: string | null; estimateUsd: number | null;
  run: JoineryRun | null; live: boolean;
  onRun: () => void; onCancel: () => void; onOpenProject: (id: string) => void;
  onOpenSettings: () => void; onClose: () => void;
}
```

The words for each joint in the summary are `mortise and tenon`, `dado`, `stopped dado`, `rabbet`
and `half-lap`. A count above 1 pluralises: `dados`, `rabbets`, `half-laps`, `stopped dados`.
`mortise and tenon` stays as it is.

Axis names in the size line: X is width, Y is height, Z is depth. These match `checkDesign`'s
limit labels.

The dialog also lists `moved`/`trimmed` ("Moved: Back. Trimmed: Back, Shelf."), the `notes`,
`preexisting` ("Already in the original: <message>") and any remaining `violations`.

Run the dialog tests: PASS.

- [ ] **Step 4: Wire `App` and `Toolbar`**

1. **Toolbar.** Add the required prop `onOpenJoinery: () => void`. Add a button directly after
   Generate:
   `<button onClick={onOpenJoinery} title="Add joints to the open design">Add joinery…</button>`.
   Add `onOpenJoinery={noop}` to every Toolbar render in `Toolbar.test.tsx` and anywhere else
   the build flags.
2. **The dialog union.** In `App.tsx`, widen it to `'generate' | 'settings' | 'joinery' | null`.
   `modalOpen` needs no change, because it is `cutListOpen || dialog !== null`.
3. **The hook.** `const joinery = useJoinery({ onCreated: (id) => setNewIds((s) => new Set(s).add(id)), onStorageVerdict: () => setAvailable(storage.available) });`
4. **The Toolbar prop.** Pass `onOpenJoinery` the same way `onOpenGenerate` is passed: save
   `opener` first, then call `setDialog('joinery')`.
5. **Render the dialog** beside the Generate one:

```tsx
      {dialog === 'joinery' && (
        <JoineryDialog
          hasKey={llmSettings !== null}
          libraryAvailable={libraryAvailable}
          projectName={doc.name}
          sites={findSites(doc).map((s) => siteLabel(s, doc))}
          model={llmSettings?.model ?? null}
          estimateUsd={llmSettings ? joineryEstimateUsd(new AnthropicClient(llmSettings.apiKey, llmSettings.model), doc) : null}
          run={joinery.run}
          live={joinery.live}
          onRun={() => {
            if (!llmSettings) return;
            joinery.start(new AnthropicClient(llmSettings.apiKey, llmSettings.model), useStore.getState().doc);
          }}
          onCancel={joinery.cancel}
          // The ONE adopting path (invariant 36): the existing openProject.
          onOpenProject={(id) => { setDialog(null); void openProject(id); }}
          onOpenSettings={() => setDialog('settings')}
          onClose={() => setDialog(null)}
        />
      )}
```

- [ ] **Step 5: Run, mutation-check, and commit**

Run: `npm test && npm run build`
Expected: all green, and the build passes.

Apply each mutation, confirm a test fails, then revert:
1. Write with `{ activate: true }`.
2. Drop the post-run `aborted` guard.
3. Count `butt` in the summary.

Record one result line per mutation.

```bash
git add -A src
git commit -m "feat(joinery): Add joinery… — the dialog, the hook (never adopts), the toolbar button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Rules docs

**Files:**
- Modify: `CLAUDE.md`, `docs/follow-ups.md`

- [ ] **Step 1: CLAUDE.md**

1. **Invariant 38.** Rewrite its body to say:
   - overlap is measured between **solids** (`checkDesign`'s `solidBoxesOf`, invariant 2's
     mapping, never `solidWorldBox`);
   - a cut explains an overlap by removing the stock;
   - a design with no cuts behaves exactly as before;
   - do not raise `TOUCH`, and do not drop the check.

   Keep the number.
2. **Invariant 41.** Add it after 40:

```markdown
41. **Joinery has one converter, never adopts, and is blamed only for what it caused.**
    `pocketFor` (`generate/joints/pocket.ts`) is the ONLY place a world box becomes a `Cut`; it
    is tested by probing every pose against the box itself, never against hand-written cuts,
    because a pose mistake there is a plausible cut in the wrong place. `useJoinery` writes only
    through `createProject(doc, { activate: false })` — invariant 36 extended. And only problems
    the joinery INTRODUCED drive repairs: `runJoinery` checks the original and the joined design
    and compares problems by `kind` plus their `parts` names (the field exists for this), NEVER
    by message text, which carries coordinates that the joinery itself changes. A hand-made
    design's existing faults are reported once as "already in the original", not repaired at the
    user's expense.
```

3. **"Where things live."** Add:
   - `generate/joints/`: one line per file, with `pocketFor` marked as invariant 41;
   - `useJoinery.ts`, beside `useGenerations.ts`;
   - `JoineryDialog.tsx`.

   Also note on `designCheck.ts`: "overlap between SOLIDS (inv 38); `faceContacts`; every
   violation carries `parts`".
4. **The test count.** Update it in the Status and Commands lines to the count your final
   `npm test` prints.
5. **Status and the rounds table.** Do NOT add a rounds row or a Status paragraph. The controller
   does that after the live check.

- [ ] **Step 2: follow-ups**

1. Append to **171**: "**2026-10-04: joinery is built (Add joinery…).** Refine by instruction is
   now follow-up 179."
2. Add **179** at the end, under a heading `## From the joinery round — 2026-10-04`:

```markdown
**179. Refine by instruction.** Phase 2's other half: a box for change requests ("shelves 2in
lower", "thicker legs"), the model editing the design, and the existing checks. Chosen against in
favour of joinery first; it reuses `runRepairLoop` and `checkDesign` unchanged.
```


- [ ] **Step 3: Check and commit**

Run: `npm test && npm run build`

```bash
git add CLAUDE.md docs/follow-ups.md
git commit -m "docs: joinery — invariant 38 rewritten for solids, invariant 41, where things live, follow-up 179

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (the controller, not a task)

- **The final whole-branch review**, on the most capable model.
- **The live check (spec §10).** Claude drives the dev server and the user watches. **Each paid
  run needs the user's OK.**
- **The record:**
  - `docs/browser-verification-joinery.md`;
  - the history entry, the rounds row and the Status paragraph;
  - then the merge and the deploy, each on the user's word.
