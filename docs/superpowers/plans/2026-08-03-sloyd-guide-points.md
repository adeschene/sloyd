# Guide Points and the Tape Measure — Implementation Plan

> **REVISED 2026-08-03 against the merged code, and now executable.** This plan was
> written before the selected-board grabs and cut-aware snap points rounds shipped,
> and was held back behind the latter. The revision pass has run. What changed:
>
> - **Task 2 is substantially rewritten.** The design's §3 grew from four store
>   narrowings to eight, and the answer changed with it: a `BoardSnapPoint` type and
>   a generic `pickSnapPoint`, not eight runtime checks. One of the plan's original
>   tests is **deleted** rather than rewritten, on purpose — read §3.0.
> - **`MoveTool`'s memo is two branches now, and the pre-grab one needs no filter.**
>   The original Step 7 would have reverted both prior rounds: it rebuilt the memo
>   as `boards.flatMap(boardSnapPoints)`, losing the selected-board restriction and
>   the cut-owned points, and its dependency list omitted `selectedId`.
> - **Task 5's clearing list grew by three** (the cut edits) **and gained two
>   prohibitions** (`edit()`'s selection callback and `selectBoard` must NOT clear
>   the anchor).
> - **Task 7's tape reads `snapPointsFor`, not `boardSnapPoints`** — otherwise the
>   tape cannot measure to a dado shoulder, which is half of what this round and the
>   last one unlock together. Its `sameSnapPoint` import also moved module.
> - **Tasks 6 and 10 gain the resting-versus-hovered guide marker** (design §5.2),
>   decided with the user during this revision.
> - **Follow-ups start at 129**, not 109.
>
> Everything else — Tasks 1, 3, 4, 8, 9 — was checked against the current code and
> is unchanged.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tape tool that measures between two snap points and places persistent, snappable guide points — at the hovered point, or at any typed distance along the ray from the anchor.

**Architecture:** `guides: GuidePoint[]` becomes a document-level field (schema v6, migrated the way `stock` was, with no `rawBoards.map` step). `SnapOwner` gains a `guide` member, which makes guide points candidates for the *existing* `pickSnapPoint` without changing its signature — snap-move's §2.3 discharging exactly what it was designed for. A new `TapeTool` mirrors `MoveTool`'s raw-DOM-pointer structure, with a DOM overlay for the live readout and the typed length.

**Tech Stack:** TypeScript, React 18, react-three-fiber / three.js, Zustand, Vitest (`globals: true`), Vite.

## Global Constraints

- **Design doc:** `docs/superpowers/specs/2026-08-03-sloyd-guide-points-design.md`. Read it before starting. Section references below (§1.2, §2.2, §3, §4) point into it.
- **No `import { describe, it, expect } from 'vitest'`.** This repo runs `globals: true` (`vite.config.ts`); every existing test file omits the import. Match them.
- **`npm test` does NOT typecheck.** A green suite proves nothing about `tsc`. Run `npm run build` before claiming anything compiles. Both gates must pass before every commit.
- **Test count is currently 699 across 32 files** (re-measured at the revision pass; it was 660 when this plan was first drafted). Each task states the expected direction of change, never a specific total — do not "fix" a mismatch by editing a count.
- **The r3f viewport has no unit tests by design.** Verify it by driving a real browser (Task 10), not by asserting on mocks. Pure modules (`snapPoints.ts`, `snapPick.ts`, the store) *are* unit-tested.
- **No pull requests.** Solo repo. Work on a branch `feat/guide-points`, merge with `git merge --no-ff` at the end.
- **If a test in this plan fails and you believe the *expectation* is wrong rather than the code — STOP and escalate.** Do not edit the assertion to match the behaviour. This has happened nine times in this repo's history (follow-ups 64, 68 ×2, 80, 87, 88, 107, 118, 126) and every instance was caught because someone stopped. You are the tenth chance.
- **`snapPointsFor`, not `boardSnapPoints`, is what a board offers.** The cut-points round made a board's candidates the box lattice *plus* its cuts' shoulders, behind one function. Anywhere this plan or your instinct reaches for `boardSnapPoints` directly, ask whether cut points belong there — they almost always do, and the exception (`GuideMarkers`, which draws guides only) is not about boards at all.
- **`position` is a min-corner, not a centre** (invariant 2). Guide points are bare positions and have no such subtlety, but anything you read off a board does.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/viewport/TapeTool.tsx` | The Tape tool: pointer handling, anchor/hover markers, the dashed measuring line. Mirrors `MoveTool.tsx`'s structure. |
| `src/viewport/GuideMarkers.tsx` | Draws every guide point in the document, independent of any tool. |
| `src/panels/TapeReadout.tsx` | The DOM overlay box: live distance, and the `<input>` that takes a typed length. |
| `src/panels/GuidesList.tsx` | The sidebar section: one row per guide, `×` per row, Clear all. |
| `src/document/snapPoints.test.ts` additions | (existing file) `guideSnapPoints` and `offsetPoint` coverage. |

**Modified:**

| File | Change |
|---|---|
| `src/document/types.ts` | `GuidePoint` interface; `guides` on `SloydDocument`. |
| `src/document/document.ts` | `CURRENT_VERSION = 6`; `createDocument` seeds `guides: []`; `validateGuides`; migration reads `d.guides`; re-export `guideSnapPoints`, `offsetPoint`, `createGuide`. |
| `src/document/snapPoints.ts` | `SnapOwner` widened; `BoardSnapPoint`; `SnapKind` gains `'guide'`; the three board providers' return types; `guideSnapPoints`; `offsetPoint`. |
| `src/viewport/snapPick.ts` | `pickSnapPoint` becomes generic in the candidate type. Three type positions, no logic. |
| `src/store/store.ts` | `ToolMode` gains `'tape'`; `tapeAnchor`; `addGuide`/`removeGuide`/`clearGuides`; `grabbed` retyped to `BoardSnapPoint`; `dropGrabIfGone` generalised to clear the anchor too; clearing across ten actions and deliberately not across two. |
| `src/viewport/SnapMarker.tsx` | Fourth colour for `SnapKind` `'guide'`, and a `resting` variant (design §5.2). |
| `src/viewport/MoveTool.tsx` | Guides added to the **post-grab branch only**; `showGuides` gate; one narrowing at the grab call. |
| `src/viewport/Viewport.tsx` | Renders `TapeTool` and `GuideMarkers`; `showGuides` prop; cursor for any non-select tool. |
| `src/panels/Toolbar.tsx` | Tape button; Guides checkbox. |
| `src/App.tsx` | `showGuides` state; `T` binding; Escape backs out of the tape anchor; `TapeReadout`; `GuidesList`. |
| `src/styles.css` | Overlay box and guides list styling. |

---

## Task 1: Schema v6 — `guides` on the document

**Files:**
- Modify: `src/document/types.ts`
- Modify: `src/document/document.ts`
- Test: `src/document/document.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `interface GuidePoint { id: string; at: [number, number, number] }` (exported from `types.ts`, re-exported from `document.ts`)
  - `SloydDocument.guides: GuidePoint[]`
  - `createGuide(at: [number, number, number]): GuidePoint`
  - `CURRENT_VERSION === 6`

- [ ] **Step 0: Record the baseline**

Run: `npm test`
Expected: PASS. **Write down the file count and the test count.**

This matters for Step 7 specifically: that step tells you to add `guides: []` to fixtures that lack it, and without a baseline you cannot tell a fixture fix from a real regression by count alone.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/document.test.ts`:

```ts
describe('guides — schema v6', () => {
  it('a fresh document has an empty guides array at version 6', () => {
    const doc = createDocument('Test');
    expect(doc.version).toBe(6);
    expect(doc.guides).toEqual([]);
  });

  it('defaults guides to [] when a v5 file has none', () => {
    const doc = migrateDocument({
      version: 5,
      name: 'Old',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      boards: [],
    });
    expect(doc.guides).toEqual([]);
    expect(doc.version).toBe(6);
  });

  it('keeps well-formed guides', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'G',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: [{ id: 'g1', at: [1, 2, 3] }],
      boards: [],
    });
    expect(doc.guides).toEqual([{ id: 'g1', at: [1, 2, 3] }]);
  });

  // Dropped, never refused: a saved document must always open. Same rule
  // validateCuts follows. A guide has no nearest-legal-value to clamp toward,
  // so dropping is the only available repair. See design §2.3.
  it('drops malformed guides rather than throwing', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'G',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: [
        { id: 'ok', at: [1, 2, 3] },
        { id: 'nan', at: [1, NaN, 3] },
        { id: 'infinite', at: [1, Infinity, 3] },
        { id: 'short', at: [1, 2] },
        { id: 'notarray', at: 'nope' },
        { id: '', at: [0, 0, 0] },
        { at: [0, 0, 0] },
        null,
        'guide',
      ],
    });
    expect(doc.guides).toEqual([{ id: 'ok', at: [1, 2, 3] }]);
  });

  it('defaults a non-array guides field to []', () => {
    const doc = migrateDocument({
      version: 6,
      name: 'G',
      units: { display: 'imperial-fractional', precision: 16 },
      stock: { kerf: 0.125 },
      guides: { id: 'g1' },
      boards: [],
    });
    expect(doc.guides).toEqual([]);
  });

  // The gate at the far end is the whole reason for the bump — see §2.2. The
  // argument is NOT v5's (a wrong purchasing number); it is silent data loss
  // on round-trip.
  it('still refuses a version above CURRENT_VERSION', () => {
    expect(() => migrateDocument({ version: 7, name: 'x', boards: [] }))
      .toThrow(DocumentError);
  });

  // A v1 file must still walk the whole chain, gaining guides at the end.
  it('a v1 file walks 1 -> 6', () => {
    const doc = migrateDocument({
      version: 1,
      name: 'Ancient',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'b1', name: 'B', length: 24, width: 6, thickness: 1,
        position: [0, 0, 0], rotation: 270, standing: true, material: 'pine',
      }],
    });
    expect(doc.version).toBe(6);
    expect(doc.guides).toEqual([]);
    expect(doc.stock.kerf).toBe(0.125);
    expect(doc.boards[0].rotation).toBe(90);
    expect(doc.boards[0].posture).toBe('on-edge');
    expect(doc.boards[0].cuts).toEqual([]);
  });
});

describe('createGuide', () => {
  it('gives each guide a distinct id and copies the position', () => {
    const a = createGuide([1, 2, 3]);
    const b = createGuide([1, 2, 3]);
    expect(a.at).toEqual([1, 2, 3]);
    expect(a.id).not.toBe(b.id);
  });
});
```

Add `createGuide` to the existing import at the top of the file:

```ts
import {
  createBoard, createDocument, createGuide, migrateDocument, DocumentError, CURRENT_VERSION,
} from './document';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/document/document.test.ts`
Expected: FAIL — `createGuide is not a function`, and `doc.version` is `5` not `6`.

- [ ] **Step 3: Add the type**

In `src/document/types.ts`, above `SloydDocument`:

```ts
/**
 * A position the user placed with the tape measure, as a snap target for
 * later work. Persistent — unlike a snap point, which is derived on demand
 * from a board — so it is document data and lands on the undo stack.
 *
 * No name. A guide's position is what identifies it, and inventing a naming
 * scheme would drag in uniqueName, invariant 8's four-place enforcement, and
 * a rename field, for a marker whose only job is to be somewhere.
 */
export interface GuidePoint {
  id: string;
  /** World position, inches. */
  at: [number, number, number];
}
```

And add the field to `SloydDocument`, between `stock` and `boards`:

```ts
  /**
   * Tape-measure guide points. Document-level like `stock`, so the v5 -> v6
   * migration step has no rawBoards.map — see document.ts.
   */
  guides: GuidePoint[];
```

- [ ] **Step 4: Bump the version and seed the field**

In `src/document/document.ts`, extend the `CURRENT_VERSION` doc comment and bump it:

```ts
/**
 * ... (keep the existing v2/v3/v4/v5 lines) ...
 * v6 added `guides`.
 *
 * v6's bump argument is NOT v5's, and the difference is worth keeping: v5
 * existed because a v4 build would drop a user-set kerf and print a DIFFERENT
 * SHEET COUNT — a wrong purchasing number with nothing indicating loss.
 * Guides produce no number at all; nothing on the cut list reads them. The
 * argument here is plain silent data loss on round-trip: a v5 build opens a
 * v6 file, drops every guide the user placed, autosaves, and they are gone.
 * Weaker consequence, same class, still exactly what the gate is for.
 */
export const CURRENT_VERSION = 6;
```

In `createDocument`, add the field:

```ts
export function createDocument(name = 'Untitled'): SloydDocument {
  return {
    version: CURRENT_VERSION,
    name,
    units: { display: 'imperial-fractional', precision: 16 },
    stock: { kerf: DEFAULT_KERF },
    guides: [],
    boards: [],
  };
}
```

Add `createGuide` beside `createBoard`:

```ts
/**
 * A guide point at a world position. Unlike createBoard this needs no
 * dedupe step from its caller — a guide has no name to collide.
 */
export function createGuide(at: [number, number, number]): GuidePoint {
  return { id: nextId(), at: [at[0], at[1], at[2]] };
}
```

- [ ] **Step 5: Add the validator**

In `src/document/document.ts`, beside `validateCuts`:

```ts
/**
 * The well-formed guides out of raw data, in order.
 *
 * Drops rather than refuses, the same rule validateCuts follows and for the
 * same reason: a saved document must always open. Unlike a cut there is
 * nothing to clamp toward — a guide with a NaN coordinate has no nearest
 * legal position — so dropping is the only available repair.
 *
 * Ids are NOT deduplicated. Follow-up 97 records that board id uniqueness
 * became load-bearing while never being enforced the way dedupeNames enforces
 * names; guides inherit the same exposure, and closing it here alone would be
 * the inconsistent half-measure. See design §2.3.
 */
export function validateGuides(raw: unknown): GuidePoint[] {
  if (!Array.isArray(raw)) return [];
  const guides: GuidePoint[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const g = item as Record<string, unknown>;
    if (typeof g.id !== 'string' || !g.id) continue;
    const at = g.at;
    if (!Array.isArray(at) || at.length !== 3) continue;
    if (!at.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    guides.push({ id: g.id, at: [at[0] as number, at[1] as number, at[2] as number] });
  }
  return guides;
}
```

- [ ] **Step 6: Wire the migration**

In `migrateDocument`, immediately after the existing `kerf` block and before the returned object, add:

```ts
  // Document-level, so — exactly like `stock` and unlike rotation, posture and
  // cuts — this has NO rawBoards.map step. There is no per-board version of a
  // guide, so invariant 11's hazard (validateBoard's fallback for a missing
  // field being a legal-but-wrong value rather than an absence) does not exist
  // here. Read defensively off the raw document; an absent field defaults
  // cleanly regardless of CURRENT_VERSION.
  const guides = validateGuides(d.guides);
```

And add `guides,` to the returned object, between `stock` and `boards`:

```ts
  return {
    version: CURRENT_VERSION,
    name,
    units: { display: 'imperial-fractional', precision },
    stock: { kerf },
    guides,
    boards: dedupeNames(rawBoards.map(validateBoard)),
  };
```

Make sure `GuidePoint` is imported into `document.ts` from `./types` alongside the existing type imports, and re-exported. Find the existing `export { ... } from './types'` block near the top and add `GuidePoint` to it as a type export; add `createGuide` and `validateGuides` to the module's own exports (they are declared with `export function`, so nothing more is needed).

- [ ] **Step 7: Run the tests**

Run: `npm test -- src/document/document.test.ts`
Expected: PASS.

Then run the whole suite — this bump touches every fixture that hand-builds a document:

Run: `npm test`
Expected: PASS. **If any test fails because a fixture literal lacks `guides`, add `guides: []` to the fixture.** If any test fails asserting `version` is 5, that assertion was pinning the old schema and should become 6. If a test fails for any *other* reason, stop and escalate — it means the migration changed behaviour it should not have.

- [ ] **Step 8: Typecheck**

Run: `npm run build`
Expected: exits 0. This is the real gate; `npm test` does not typecheck.

- [ ] **Step 9: Commit**

```bash
git add src/document/types.ts src/document/document.ts src/document/document.test.ts
git commit -m "feat: schema v6 — guides on the document

Document-level like stock, so no rawBoards.map step. The bump's argument
is silent data loss on round-trip, NOT v5's wrong-purchasing-number
argument — see the design's §2.2."
```

---

## Task 2: `SnapOwner` widening, `BoardSnapPoint`, and `guideSnapPoints`

This is the round's single most dangerous edit and it is deliberately one task: **every affected read keeps typechecking while quietly meaning something else.** Both union members carry `id: string`, so `owner.id` stays valid on the widened union and `tsc` reports nothing. Splitting this across tasks would leave a green build in a wrong state.

> **This task changed most in the revision pass. Read the design's §3.0 and §3.1 before writing anything.**
>
> The original plan told you to add `owner.type === 'board' &&` in front of four store reads. There are **eight** such reads now, and enumerating them is no longer the chosen answer: the round instead narrows the *field type*, so all eight compile unchanged and are correct by construction rather than by an invariant enforced two modules away.
>
> Two things follow that will look like omissions if you have not read §3.0:
>
> 1. **`commitSnapMove` does NOT get a `if (grabbed.owner.type !== 'board')` guard.** Its `grabbed` cannot be guide-owned — that is what the type says. Adding the guard back would be unreachable code that reads as load-bearing.
> 2. **One test from the original plan is deleted, not rewritten** — the one handing `commitSnapMove` a guide-owned grab. Under this design that state cannot be constructed in TypeScript, so the test cannot be written; that is the win, not a gap. Same reasoning as follow-up 118.

**Files:**
- Modify: `src/document/snapPoints.ts`
- Modify: `src/viewport/snapPick.ts`
- Modify: `src/document/document.ts` (re-export)
- Modify: `src/viewport/SnapMarker.tsx`
- Modify: `src/viewport/MoveTool.tsx`
- Modify: `src/store/store.ts` (two type positions, and exactly one runtime narrowing)
- Test: `src/document/snapPoints.test.ts`, `src/store/store.test.ts`

**Interfaces:**
- Consumes: `GuidePoint` (Task 1).
- Produces:
  - `type SnapOwner = { type: 'board'; id: string } | { type: 'guide'; id: string }`
  - `type BoardSnapPoint = SnapPoint & { owner: { type: 'board'; id: string } }`
  - `type SnapKind = 'corner' | 'edge-mid' | 'face-center' | 'guide'`
  - `boardSnapPoints` / `cutSnapPoints` / `snapPointsFor` return `BoardSnapPoint[]`
  - `pickSnapPoint<T extends SnapPoint>(candidates: T[], …): T | null`
  - `guideSnapPoints(guides: GuidePoint[]): SnapPoint[]`

- [ ] **Step 1: Write the failing provider tests**

Append to `src/document/snapPoints.test.ts`:

```ts
describe('guideSnapPoints', () => {
  it('yields one candidate per guide, owned by that guide', () => {
    const points = guideSnapPoints([
      { id: 'g1', at: [1, 2, 3] },
      { id: 'g2', at: [-4, 0, 8] },
    ]);
    expect(points).toEqual([
      { kind: 'guide', at: [1, 2, 3], owner: { type: 'guide', id: 'g1' } },
      { kind: 'guide', at: [-4, 0, 8], owner: { type: 'guide', id: 'g2' } },
    ]);
  });

  it('yields nothing for no guides', () => {
    expect(guideSnapPoints([])).toEqual([]);
  });

  // The whole payoff of §2.3: the picker's signature never moved, so the two
  // providers' output concatenates into one array.
  it('concatenates with board candidates into one array', () => {
    const b = board();
    const all = [...boardSnapPoints(b), ...guideSnapPoints([{ id: 'g1', at: [0, 0, 0] }])];
    expect(all).toHaveLength(27);
    expect(all.filter((p) => p.owner.type === 'guide')).toHaveLength(1);
    expect(all.filter((p) => p.owner.type === 'board')).toHaveLength(26);
  });
});
```

Extend the import at the top of that file:

```ts
import { boardSnapPoints, guideSnapPoints } from './snapPoints';
```

- [ ] **Step 2: Write the failing store tests**

Two tests, not three. The third one the original plan specified — a guide-owned value handed to `grabSnapPoint` — is **deleted**, because `grabbed: BoardSnapPoint | null` makes that state unconstructible. If you find yourself wanting to write it with an `as` cast to get past `tsc`, stop: the cast would be asserting the exact fact the type exists to deny, which is follow-up 128's shape.

Both surviving tests exercise the **one** ownership comparison that is still a runtime question — `commitSnapMove`'s self-snap guard, where the target genuinely can be a guide.

Note the board must be **selected** for `commitSnapMove` to proceed at all: the selected-board grabs round added `grabbed.owner.id !== get().selectedId` as a refusal, and `addBoard` already selects what it creates, so the fixture below satisfies it incidentally rather than by luck. Do not remove `addBoard`'s role here.

Append to `src/store/store.test.ts`:

```ts
describe('SnapOwner widening — a guide is a legal target', () => {
  const guidePoint = (id: string, at: [number, number, number]) =>
    ({ kind: 'guide' as const, at, owner: { type: 'guide' as const, id } });

  it('a board can be snapped onto a guide point', () => {
    useStore.getState().addBoard();
    const board = useStore.getState().doc.boards[0];
    const corner = boardSnapPoints(board)[0];
    useStore.getState().grabSnapPoint(corner);
    useStore.getState().commitSnapMove(guidePoint('g1', [
      corner.at[0] + 5, corner.at[1] + 6, corner.at[2] + 7,
    ]));
    const moved = useStore.getState().doc.boards[0];
    expect(moved.position).toEqual([
      board.position[0] + 5, board.position[1] + 6, board.position[2] + 7,
    ]);
    expect(useStore.getState().grabbed).toBeNull();
  });

  // The self-snap guard compares OWNERS, not bare ids — the ONE runtime
  // narrowing the BoardSnapPoint type does not subsume, because the TARGET can
  // legitimately be a guide. Without the `type` test, a guide whose id
  // collided with the grabbed board's would read as a self-snap and the move
  // would be silently refused. See the design's §3.0.
  it('does not mistake a guide for the grabbed board when their ids collide', () => {
    useStore.getState().addBoard();
    const board = useStore.getState().doc.boards[0];
    const corner = boardSnapPoints(board)[0];
    useStore.getState().grabSnapPoint(corner);
    useStore.getState().commitSnapMove(guidePoint(board.id, [
      corner.at[0] + 3, corner.at[1], corner.at[2],
    ]));
    expect(useStore.getState().doc.boards[0].position[0]).toBe(board.position[0] + 3);
  });
});
```

**Before moving on, confirm the second test can fail.** Drop the `target.owner.type === 'board' &&` clause from the guard once you have written it (Step 6) and check that this test goes red. A guard whose removal changes nothing is follow-up 126's shape — a test title that pins neither half of itself — and this one is cheap to verify because the mutation is a four-word deletion.

- [ ] **Step 3: Run both to verify they fail**

Run: `npm test -- src/document/snapPoints.test.ts src/store/store.test.ts`
Expected: FAIL — `guideSnapPoints is not a function`, and the store tests fail to construct a `'guide'` owner.

- [ ] **Step 4: Widen the union and add the provider**

In `src/document/snapPoints.ts`, replace the `SnapKind` and `SnapOwner` declarations:

```ts
/**
 * What a snap point sits on. Drives the marker's colour, and nothing else —
 * every kind snaps identically.
 */
export type SnapKind = 'corner' | 'edge-mid' | 'face-center' | 'guide';

/**
 * What a snap point belongs to.
 *
 * A discriminated union rather than a bare board id — see the snap-move
 * design's §2.3. The guide-points round is the first member to arrive, and it
 * arrived exactly as predicted: a new provider, no change to pickSnapPoint.
 *
 * READ THE TYPE, NOT THE ID. Both members carry `id: string`, so `owner.id`
 * typechecks on the union while meaning two different things. Every consumer
 * that means "this board" must narrow on `owner.type === 'board'` first.
 */
export type SnapOwner =
  | { type: 'board'; id: string }
  | { type: 'guide'; id: string };

/**
 * A snap point that belongs to a board — the box lattice and the cut-owned
 * points, which is everything both providers in this module produce.
 *
 * Exists so `grabbed` can be typed as one. The Move tool grabs boards and
 * targets anything (design §3.1), and this is what makes the grab half of that
 * rule CHECKABLE rather than remembered: eight reads in store.ts assume
 * `owner.id` names a board, seven of them are correct only because MoveTool's
 * candidate memo never offers a guide as a grab source, and an invariant
 * enforced two modules away is what the next round breaks. Narrowing the field
 * is the least accidental form available.
 *
 * `tapeAnchor` is deliberately NOT this type. The difference between the two
 * fields is now the documentation of which one can hold a guide.
 */
export type BoardSnapPoint = SnapPoint & { owner: { type: 'board'; id: string } };
```

Then annotate the three board providers. **Their bodies do not change** — each already builds `owner: SnapOwner = { type: 'board', id: board.id }` and produces nothing else, so this is the annotation catching up with the code:

```ts
export function boardSnapPoints(board: Board): BoardSnapPoint[]
export function cutSnapPoints(board: Board): BoardSnapPoint[]
export function snapPointsFor(board: Board): BoardSnapPoint[]
```

Inside each, the local `const owner: SnapOwner = { type: 'board', id: board.id }` must become `const owner = { type: 'board', id: board.id } as const` (or be annotated `BoardSnapPoint['owner']`) — annotated as the wide `SnapOwner` it will not narrow, and `tsc` will tell you so at the return.

And append the provider:

```ts
/**
 * One candidate per guide point.
 *
 * The whole of what the guide-points round needed from this module. Boards
 * offer 26 derived points; a guide offers the one position it is.
 */
export function guideSnapPoints(guides: GuidePoint[]): SnapPoint[] {
  return guides.map((g) => ({
    kind: 'guide' as const,
    at: [g.at[0], g.at[1], g.at[2]] as [number, number, number],
    owner: { type: 'guide' as const, id: g.id },
  }));
}
```

Add `GuidePoint` to the file's type import: `import type { Board, GuidePoint } from './types';`

Re-export from `document.ts`: add `guideSnapPoints` to the existing `./snapPoints` value export (which already carries `boardSnapPoints`, `cutSnapPoints`, `snapPointsFor` and `sameSnapPoint`), and add `BoardSnapPoint` to the type re-export beside `SnapPoint`/`SnapKind`/`SnapOwner`.

- [ ] **Step 4b: Make `pickSnapPoint` generic**

In `src/viewport/snapPick.ts` — three type positions, no logic:

```ts
export function pickSnapPoint<T extends SnapPoint>(
  candidates: T[],
  project: Projector,
  cursor: { x: number; y: number },
  radiusPx: number,
): T | null {
  let best: T | null = null;
```

Add to its doc comment, above the existing "Ties in screen distance" line:

```
 * Generic in the candidate type, and it never reads `owner` — so picking from
 * an array of BoardSnapPoint yields a BoardSnapPoint, which is what lets
 * MoveTool's grab call typecheck without a runtime ownership test on the
 * branch where the candidates are board-owned by construction. The picker
 * itself is indifferent: every kind snaps identically.
```

- [ ] **Step 5: Add the fourth marker colour**

`SNAP_COLORS` is `Record<SnapKind, string>`, so this is required for the build to compile at all — it is not deferrable to the browser task.

In `src/viewport/SnapMarker.tsx`, add to `SNAP_COLORS` and extend the doc comment above it:

```ts
export const SNAP_COLORS: Record<SnapKind, string> = {
  corner: '#2e9e5b',
  'edge-mid': '#22b8d4',
  'face-center': '#8a5fd0',
  // The guide-points round's fourth. A guide is not a corner, an edge midpoint
  // or a face centre, and colouring it as one would tell the user something
  // false about what they are about to snap to — the marker's only job. Kept
  // cool and desaturated with the other three, and placed in the blue-violet
  // gap between cyan and violet so all four stay mutually distinct.
  // Browser-settled in the sense of follow-up 60: Task 10 confirms or retunes
  // it against pine, walnut and plywood. Do not "fix" it from theory.
  guide: '#4f6fd0',
};
```

- [ ] **Step 6: Retype `grabbed`, and add the one surviving runtime narrowing**

In `src/store/store.ts`. **Two type positions and one guard — that is the whole store change in this task.** The eight `owner.id` reads the design's §3 enumerates need no edits at all; `tsc` will confirm that by staying silent about them.

```ts
  grabbed: BoardSnapPoint | null;
  grabSnapPoint: (point: BoardSnapPoint) => void;
```

Import the type: `import type { Board, BoardSnapPoint, Cut, SloydDocument, SnapPoint } from '../document/document';`

Extend the doc comment above `tool`/`grabbed`:

```ts
   * `grabbed` is a BoardSnapPoint, not a SnapPoint, and that is load-bearing
   * rather than tidy: the guide-points round widened SnapOwner, and eight
   * reads in this file assume `owner.id` names a board. Seven of them are
   * correct only because MoveTool never offers a guide as a grab source — an
   * invariant enforced two modules away. The narrower type moves that
   * enforcement here, where tsc can hold it. `tapeAnchor` below is
   * deliberately the WIDE type; the difference is what says which of the two
   * can hold a guide.
```

Then, in `commitSnapMove`, extend the existing self-snap guard — this is the one comparison the type does not subsume, because the *target* can legitimately be a guide:

```ts
      // A board cannot be snapped onto itself. It is a legal subtraction — it
      // would translate the board by its own length — but never what anyone
      // means. MoveTool also withholds these candidates so the case cannot be
      // clicked; this guard is what makes the rule true of the action itself.
      //
      // Compares OWNERS, not bare ids, since the guide-points round: a guide is
      // a legal target, both union members carry `id: string`, and a guide
      // whose id collided with the grabbed board's would otherwise read as a
      // self-snap and silently refuse a move the user asked for. This is the
      // ONLY runtime ownership test left in the file — everything else is the
      // BoardSnapPoint type. See design §3.0.
      if (target.owner.type === 'board' && target.owner.id === grabbed.owner.id) return;
```

**Do not add** `if (grabbed.owner.type !== 'board') return;`. An earlier draft of this plan did; under the current typing it is unreachable code that reads as load-bearing.

- [ ] **Step 7: Add guides to MoveTool's POST-GRAB branch only**

> **The original plan's Step 7 would have reverted two shipped rounds.** It rebuilt the memo as a single `boards.flatMap(boardSnapPoints)`, which drops the selected-board restriction (selected-board grabs) and the cut-owned points (cut points), and its dependency list omitted `selectedId` — invariant 15's exact failure mode, and one that would have looked like it worked. **Read the memo in the file before editing it.** The change below is additive to what is there.

The pre-grab branch is already the *selected board's* points, which are board-owned by construction, so the design's original §3.1 filter is discharged rather than merged (follow-up 125). **Adding a `p.owner.type === 'board'` filter there would be dead code that reads as load-bearing.**

In `src/viewport/MoveTool.tsx`:

```tsx
export function MoveTool({ showGuides = true }: { showGuides?: boolean }) {
```

```ts
  const guides = useStore((s) => s.doc.guides);
```

Extend the existing memo's doc comment with a paragraph, keeping every one already there:

```ts
   * GUIDES ARE TARGETS, NEVER GRAB SOURCES, so they appear in the post-grab
   * branch only — you snap a board onto a guide, never a guide onto a board.
   * The pre-grab branch needs no filter to make that true: it is one selected
   * board's points, which are board-owned by construction. Stacking a
   * board-owned filter on a rule that is already narrower would be two
   * predicates that agree today and two places for a future rule to disagree
   * (follow-ups 113 and 125). Hidden guides offer no candidates either — a
   * marker over an invisible point is an indicator with nothing under it
   * (design §6).
```

and add the one line to the branch itself:

```ts
  const candidates = useMemo(() => {
    if (grabbed) {
      return [
        ...boards.flatMap(snapPointsFor).filter((p) => p.owner.id !== grabbed.owner.id),
        ...(showGuides ? guideSnapPoints(guides) : []),
      ];
    }
    const selected = boards.find((b) => b.id === selectedId);
    return selected ? snapPointsFor(selected) : [];
  }, [boards, grabbed, selectedId, guides, showGuides]);
```

**`selectedId` stays in the dependency list.** Adding `guides` and `showGuides` beside it is the edit; replacing it is invariant 15.

Then the grab call in `onPointerUp` takes the one narrowing that turns a `SnapPoint` into a `BoardSnapPoint`:

```ts
      if (!store.grabbed) {
        // Board-owned by construction — this branch's candidates are the
        // selected board's points — and checked anyway, because this is the
        // one place a picked SnapPoint becomes the store's BoardSnapPoint.
        // Deliberately redundant in the same sense as commitSnapMove's
        // self-snap guard: the memo makes the rule true of the UI, this makes
        // it true of the type.
        if (hit && hit.owner.type === 'board') store.grabSnapPoint(hit);
        return;
      }
```

Update the import: `import { guideSnapPoints, sameSnapPoint, snapPointsFor } from '../document/document';`

- [ ] **Step 8: Run the tests**

Run: `npm test`
Expected: PASS, with the new cases from Steps 1-2 included.

- [ ] **Step 9: Typecheck**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
git add src/document/snapPoints.ts src/document/snapPoints.test.ts src/document/document.ts \
        src/viewport/snapPick.ts src/viewport/SnapMarker.tsx src/viewport/MoveTool.tsx \
        src/store/store.ts src/store/store.test.ts
git commit -m "feat: widen SnapOwner with guides, and type the grab as board-owned

Both union members carry \`id: string\`, so all eight \`.owner.id\` reads
in the store stayed valid on the widened union while meaning something
else. Rather than eight runtime narrowings, \`grabbed\` is a
BoardSnapPoint: the three board providers return it, pickSnapPoint is
generic, and tsc holds the rule the candidate memo used to hold alone.
One runtime narrowing survives — the self-snap guard, where the target
genuinely can be a guide. See the design's §3.0."
```

---

## Task 3: `offsetPoint` — the tape's arithmetic

**Files:**
- Modify: `src/document/snapPoints.ts`
- Modify: `src/document/document.ts` (re-export)
- Test: `src/document/snapPoints.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `offsetPoint(anchor: [number,number,number], toward: [number,number,number], distance: number): [number, number, number] | null`

- [ ] **Step 1: Write the failing tests**

Append to `src/document/snapPoints.test.ts`:

```ts
describe('offsetPoint', () => {
  const anchor: [number, number, number] = [0, 0, 0];
  const toward: [number, number, number] = [12, 0, 0];

  it('lands between the two points below the measured distance', () => {
    expect(offsetPoint(anchor, toward, 6)).toEqual([6, 0, 0]);
  });

  it('lands exactly on the target at the measured distance', () => {
    expect(offsetPoint(anchor, toward, 12)).toEqual([12, 0, 0]);
  });

  it('overshoots past the target above the measured distance', () => {
    expect(offsetPoint(anchor, toward, 18)).toEqual([18, 0, 0]);
  });

  it('runs backward from the anchor for a negative distance', () => {
    expect(offsetPoint(anchor, toward, -6)).toEqual([-6, 0, 0]);
  });

  it('places at the anchor for a zero distance', () => {
    expect(offsetPoint(anchor, toward, 0)).toEqual([0, 0, 0]);
  });

  it('normalises a diagonal direction rather than scaling the component-wise delta', () => {
    // A 3-4-5 triangle: the direction is 5 long, so a distance of 5 must land
    // exactly on the target and a distance of 10 exactly twice as far.
    const result = offsetPoint([0, 0, 0], [3, 4, 0], 10);
    expect(result![0]).toBeCloseTo(6, 10);
    expect(result![1]).toBeCloseTo(8, 10);
    expect(result![2]).toBeCloseTo(0, 10);
  });

  it('offsets from a non-zero anchor', () => {
    expect(offsetPoint([10, 2, -5], [10, 2, 5], 4)).toEqual([10, 2, -1]);
  });

  // §1.2 — the case that costs one mouse movement to reach. Normalising a
  // zero vector yields NaN on every component, and NaN coordinates entering
  // the document would pass every downstream check as "a number".
  it('refuses a zero-length direction rather than emitting NaN', () => {
    expect(offsetPoint([1, 2, 3], [1, 2, 3], 6)).toBeNull();
  });

  it('refuses a zero-length direction even at distance zero', () => {
    expect(offsetPoint([1, 2, 3], [1, 2, 3], 0)).toBeNull();
  });

  it('refuses a non-finite distance', () => {
    expect(offsetPoint(anchor, toward, NaN)).toBeNull();
    expect(offsetPoint(anchor, toward, Infinity)).toBeNull();
  });
});
```

Extend the import: `import { boardSnapPoints, guideSnapPoints, offsetPoint } from './snapPoints';`

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/document/snapPoints.test.ts`
Expected: FAIL with `offsetPoint is not a function`.

- [ ] **Step 3: Implement**

Append to `src/document/snapPoints.ts`:

```ts
/**
 * A position `distance` from `anchor`, along the ray toward `toward`.
 *
 * One subtraction and one scale, and the three things a user might want are
 * NOT three code paths — they are three values of one free parameter:
 *
 *   distance <  |toward - anchor|  ->  between the two points
 *   distance >  |toward - anchor|  ->  past the target, same ray
 *   distance <  0                  ->  backward from the anchor
 *
 * Returns null for a zero-length direction rather than normalising it.
 * Normalising the zero vector yields NaN on every component, and that is not
 * a theoretical case: it is what happens the moment the cursor returns to the
 * point it started on. NaN coordinates would enter the document and pass every
 * downstream check as "a number". Same shape as commitSnapMove's zero-delta
 * guard — a guard with a named failure mode, not defensive habit — except that
 * one prevents a no-op undo entry and this one prevents corrupt geometry.
 *
 * A non-finite `distance` is refused for the same reason: parseLength returns
 * null for unparseable input, but a caller that skipped it must not be able to
 * write Infinity into a position.
 */
export function offsetPoint(
  anchor: [number, number, number],
  toward: [number, number, number],
  distance: number,
): [number, number, number] | null {
  if (!Number.isFinite(distance)) return null;
  const dx = toward[0] - anchor[0];
  const dy = toward[1] - anchor[1];
  const dz = toward[2] - anchor[2];
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return null;
  const k = distance / length;
  return [anchor[0] + dx * k, anchor[1] + dy * k, anchor[2] + dz * k];
}
```

Re-export from `document.ts`:
add `offsetPoint` to the existing `./snapPoints` value export. **Add to it; do not retype the list** — it already carries `boardSnapPoints`, `cutSnapPoints`, `snapPointsFor`, `sameSnapPoint` and (since Task 2) `guideSnapPoints`, and rewriting the line from this plan's memory would silently drop the ones the cut-points round added.

- [ ] **Step 4: Run the tests**

Run: `npm test -- src/document/snapPoints.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run build
git add src/document/snapPoints.ts src/document/snapPoints.test.ts src/document/document.ts
git commit -m "feat: offsetPoint — the tape's one subtraction

Between, past and backward are three values of one free parameter, not
three code paths. A zero-length direction is refused rather than
normalised: it costs one mouse movement to reach and would write NaN
coordinates into the document. See the design's §1.1 and §1.2."
```

---

## Task 4: Guide store actions

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `createGuide` (Task 1).
- Produces: `addGuide(at: [number, number, number]): void`, `removeGuide(id: string): void`, `clearGuides(): void`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/store.test.ts`:

```ts
describe('guide actions', () => {
  it('appends a guide at the given position', () => {
    useStore.getState().addGuide([1, 2, 3]);
    expect(useStore.getState().doc.guides).toHaveLength(1);
    expect(useStore.getState().doc.guides[0].at).toEqual([1, 2, 3]);
  });

  it('removes one guide by id and leaves the rest', () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    const [first, second] = useStore.getState().doc.guides;
    useStore.getState().removeGuide(first.id);
    expect(useStore.getState().doc.guides.map((g) => g.id)).toEqual([second.id]);
  });

  it('clears every guide', () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    useStore.getState().clearGuides();
    expect(useStore.getState().doc.guides).toEqual([]);
  });

  it('places guides on the undo stack', () => {
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().undo();
    expect(useStore.getState().doc.guides).toEqual([]);
    useStore.getState().redo();
    expect(useStore.getState().doc.guides).toHaveLength(1);
  });

  // Invariant 4's rule: edit() unconditionally pushes an undo snapshot and
  // clears redo, so a no-op must not reach it. Same guard shape as
  // commitSnapMove's zero-delta and removeCut's.
  it('leaves no undo entry when removing a guide that does not exist', () => {
    useStore.getState().addGuide([1, 2, 3]);
    const before = useStore.getState().doc;
    useStore.getState().removeGuide('nope');
    expect(useStore.getState().doc).toBe(before);
  });

  it('leaves no undo entry when clearing an already-empty guide list', () => {
    const before = useStore.getState().doc;
    useStore.getState().clearGuides();
    expect(useStore.getState().doc).toBe(before);
  });

  it('does not touch the board selection', () => {
    useStore.getState().addBoard();
    const selected = useStore.getState().selectedId;
    useStore.getState().addGuide([1, 2, 3]);
    expect(useStore.getState().selectedId).toBe(selected);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/store/store.test.ts`
Expected: FAIL — `addGuide is not a function`.

- [ ] **Step 3: Declare the actions in `StoreState`**

In `src/store/store.ts`, after the `addCut`/`updateCut`/`removeCut` declarations:

```ts
  addGuide: (at: [number, number, number]) => void;
  removeGuide: (id: string) => void;
  clearGuides: () => void;
```

- [ ] **Step 4: Implement them**

Add near the cut actions in the store body. Note `edit`'s second argument is the selection callback — these pass nothing for it, because a guide is not a board and must not touch `selectedId`:

```ts
    /**
     * Place a guide point. Document data, so it lands on the undo stack like
     * any other edit — a guide the user placed is a fact about the project.
     *
     * Deliberately does NOT change `selectedId`: a guide is not a board, and
     * the properties panel is a panel for boards. Compare commitSnapMove,
     * which DOES select, because it moved a board the user is working on.
     */
    addGuide: (at) => {
      const guide = createGuide(at);
      edit((doc) => ({ ...doc, guides: [...doc.guides, guide] }));
    },

    removeGuide: (id) => {
      // Guarded before the edit, the same rule updateCut, removeCut and
      // commitSnapMove follow: edit() unconditionally pushes an undo snapshot
      // and clears redo, so a no-op would leave a no-op undo entry
      // (invariant 4) and silently wipe the redo stack.
      if (!get().doc.guides.some((g) => g.id === id)) return;
      edit((doc) => ({ ...doc, guides: doc.guides.filter((g) => g.id !== id) }));
    },

    clearGuides: () => {
      if (get().doc.guides.length === 0) return;
      edit((doc) => ({ ...doc, guides: [] }));
    },
```

Add `createGuide` to the `../document/document` import at the top of the file.

`edit`'s second parameter (the selection callback) is **optional** — `store.ts:78-81` declares it `selection?`, and `edit` only writes `selectedId` when it is passed. So omitting it is what leaves the selection alone; that is not an accident to be tidied later. Do not alter `edit` itself — it is shared by every action in the file.

- [ ] **Step 5: Run the tests**

Run: `npm test -- src/store/store.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run build
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: addGuide / removeGuide / clearGuides

Document edits, so they land on the undo stack. Each guards its no-op
before reaching edit(), per invariant 4. None touches selectedId — a
guide is not a board."
```

---

## Task 5: The `tape` tool mode and `tapeAnchor`

The tape anchor is a **second instance of invariant 24** (design §4): it holds a world position captured at click time, so anything that moves the world under it must drop it. It needs everything `grabbed` needs, plus `removeGuide` and `clearGuides` — which `grabbed` does not need, because a grab is never guide-owned.

> **Two revisions here, both from rounds that shipped after this plan was drafted.**
>
> 1. **The cut edits join the list.** `addCut`/`updateCut`/`removeCut` clear a grab *point-precisely* via `dropGrabIfGone` — they can destroy the feature under a held point rather than moving the board out from under it. An anchor can sit on a dado shoulder for the same reason a grab can, so it needs the same treatment. **Generalise the existing helper to test both held points against one predicate; do not write a second copy of it** (design §4.1).
> 2. **Two clears the anchor must NOT inherit.** `edit()`'s selection callback and `selectBoard` both drop a grab, because the Move tool's grab candidates are the *selected* board's points. The tape anchors on any board — measuring from one board to another is most of what the tool is for — so clearing on selection change would break it invisibly. This is a **prohibition with its own tests**, because "add `tapeAnchor: null` beside every `grabbed: null`" is exactly what a tidying pass would do (design §4.2).

**Files:**
- Modify: `src/store/store.ts`
- Modify: `src/viewport/Viewport.tsx` (cursor only)
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `removeGuide`/`clearGuides` (Task 4).
- Produces: `ToolMode` includes `'tape'`; `tapeAnchor: SnapPoint | null`; `setTapeAnchor(point: SnapPoint): void`; `clearTapeAnchor(): void`

- [ ] **Step 1: Write the failing tests**

Append to `src/store/store.test.ts`:

```ts
describe('tapeAnchor — invariant 24, second instance', () => {
  const anchorOn = () => {
    useStore.getState().addBoard();
    const board = useStore.getState().doc.boards[0];
    const point = boardSnapPoints(board)[0];
    useStore.getState().setTapeAnchor(point);
    return board;
  };

  it('holds and clears an anchor', () => {
    const point = { kind: 'guide' as const, at: [1, 2, 3] as [number, number, number], owner: { type: 'guide' as const, id: 'g1' } };
    useStore.getState().setTapeAnchor(point);
    expect(useStore.getState().tapeAnchor).toEqual(point);
    useStore.getState().clearTapeAnchor();
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor when the tool changes', () => {
    anchorOn();
    useStore.getState().setTool('select');
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor on undo and on redo', () => {
    anchorOn();
    useStore.getState().undo();
    expect(useStore.getState().tapeAnchor).toBeNull();
    anchorOn();
    useStore.getState().redo();
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor when the document is replaced', () => {
    anchorOn();
    useStore.getState().replaceDocument(createDocument('Other'));
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor when its own board is deleted', () => {
    const board = anchorOn();
    useStore.getState().deleteBoard(board.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor when its own board moves', () => {
    const board = anchorOn();
    useStore.getState().updateBoard(board.id, { length: 48 });
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('keeps the anchor when a DIFFERENT board changes', () => {
    const board = anchorOn();
    useStore.getState().addBoard();
    const other = useStore.getState().doc.boards.find((b) => b.id !== board.id)!;
    useStore.getState().updateBoard(other.id, { length: 48 });
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  // The two `grabbed` does not need — a grab is never guide-owned, but an
  // anchor can be, and the guides list is not disabled while the tape is
  // anchored, so deleting the guide you anchored on is one click away.
  it('drops a guide-owned anchor when that guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    const guide = useStore.getState().doc.guides[0];
    useStore.getState().setTapeAnchor({
      kind: 'guide', at: guide.at, owner: { type: 'guide', id: guide.id },
    });
    useStore.getState().removeGuide(guide.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('keeps a guide-owned anchor when a DIFFERENT guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().addGuide([4, 5, 6]);
    const [first, second] = useStore.getState().doc.guides;
    useStore.getState().setTapeAnchor({
      kind: 'guide', at: first.at, owner: { type: 'guide', id: first.id },
    });
    useStore.getState().removeGuide(second.id);
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  it('drops any anchor when every guide is cleared', () => {
    const board = anchorOn();
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().clearGuides();
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(board).toBeTruthy();
  });

  // Invariant 24's third clause, which this plan predates: a cut edit does not
  // move the board, it can destroy the FEATURE under the held point. An anchor
  // on a shoulder needs the same point-precise clear a grab on one gets.
  it('drops an anchor on a cut shoulder when that cut is removed', () => {
    useStore.getState().addBoard();
    const board = useStore.getState().doc.boards[0];
    useStore.getState().addCut(board.id);
    const cut = useStore.getState().doc.boards[0].cuts[0];
    const shoulder = cutSnapPoints(useStore.getState().doc.boards[0])[0];
    useStore.getState().setTapeAnchor(shoulder);
    useStore.getState().removeCut(board.id, cut.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  // Point-precise, not blanket: a box corner usually survives a cut edit on
  // the same board, because a mid-face dado touches no box point. This is the
  // same asymmetry dropGrabIfGone already has for grabs — see invariant 24.
  it('keeps an anchor on a box corner when a mid-face cut is added', () => {
    useStore.getState().addBoard();
    const board = useStore.getState().doc.boards[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(board)[0]);
    useStore.getState().addCut(board.id);
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });
});

// Design §4.2. These are PROHIBITIONS, and they exist because adding
// `tapeAnchor: null` beside every `grabbed: null` is what a tidying pass would
// do. The tape anchors on any board; the Move tool grabs only the selected
// one. Only the second rule has anything to do with selection.
describe('tapeAnchor is NOT cleared by selection changes', () => {
  it('survives selecting a different board', () => {
    useStore.getState().addBoard();
    const first = useStore.getState().doc.boards[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(first)[0]);
    useStore.getState().addBoard();
    const second = useStore.getState().doc.boards[1];
    useStore.getState().selectBoard(second.id);
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  // addBoard selects what it creates through edit()'s selection callback,
  // which is the path that drops a grab. Measuring from an existing board to a
  // brand-new one is an ordinary thing to want.
  it('survives an edit whose selection callback moves the selection', () => {
    useStore.getState().addBoard();
    const first = useStore.getState().doc.boards[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(first)[0]);
    useStore.getState().addBoard();
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });
});
```

Add `cutSnapPoints` to the file's `../document/document` import if it is not already there.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/store/store.test.ts`
Expected: FAIL — `setTapeAnchor is not a function`.

- [ ] **Step 3: Extend `ToolMode` and `StoreState`**

```ts
export type ToolMode = 'select' | 'move' | 'tape';
```

Add beside `grabbed`:

```ts
  /**
   * The point the Tape tool is measuring from.
   *
   * A SECOND INSTANCE OF INVARIANT 24, not a copy of `grabbed`. Like a grab it
   * holds a world position captured at click time — the readout's distance and
   * the direction a typed offset runs along both derive from `tapeAnchor.at` —
   * so if the world moves under it, the readout measures from a position that
   * no longer describes anything and a guide placed from it lands somewhere
   * the user never pointed at.
   *
   * It lives here rather than in TapeTool for exactly that reason: it cannot
   * get its clearing anywhere else. A useState inside the component would have
   * to subscribe to seven actions and re-derive when to drop itself, which is
   * the bookkeeping invariant 24 exists to avoid.
   *
   * It needs two actions `grabbed` does not: removeGuide and clearGuides. A
   * grab is never guide-owned (MoveTool's filter); an anchor can be.
   */
  tapeAnchor: SnapPoint | null;
  setTapeAnchor: (point: SnapPoint) => void;
  clearTapeAnchor: () => void;
```

- [ ] **Step 4: Implement, and extend the seven clearing sites**

Initial state, beside `grabbed: null`:

```ts
    tapeAnchor: null,
    setTapeAnchor: (point) => set({ tapeAnchor: point }),
    clearTapeAnchor: () => set({ tapeAnchor: null }),
```

Then add `tapeAnchor: null` to each of these existing `set` calls, alongside the `grabbed: null` already there:

1. `setTool` — `set({ tool, grabbed: null, tapeAnchor: null })`
2. `replaceDocument` — add `tapeAnchor: null`
3. `undo` — add `tapeAnchor: null`
4. `redo` — add `tapeAnchor: null`

And add conditional clears:

5. In `updateBoard`, beside the existing conditional grab-clear:

```ts
      // The tape anchor is invariant 24's second instance and needs the same
      // conditional clear for the same reason — see its declaration.
      if (get().tapeAnchor?.owner.type === 'board' && get().tapeAnchor?.owner.id === id) {
        set({ tapeAnchor: null });
      }
```

6. In `deleteBoard`, the identical block.

7. In `removeGuide` (Task 4), **after** the no-op guard and before/around the edit:

```ts
      if (get().tapeAnchor?.owner.type === 'guide' && get().tapeAnchor?.owner.id === id) {
        set({ tapeAnchor: null });
      }
```

8. In `clearGuides`, unconditionally after the no-op guard: `set({ tapeAnchor: null })`.
   Unconditional rather than narrowed on purpose — every guide is going, so any
   guide-owned anchor is invalid, and a board-owned one is cheap to drop.

9. **`dropGrabIfGone` — generalise it rather than copying it.** The three cut
   actions already call it after their `edit()`. It must now clear the anchor on
   the same terms, and the two checks are the same predicate over two fields:

```ts
  /**
   * Invariant 24, for cut edits — now for BOTH held points.
   *
   * ... (keep the entire existing comment; it explains why this is
   * point-precise rather than blanket, why exact === is correct, and why the
   * call must sit AFTER edit()) ...
   *
   * The guide-points round added `tapeAnchor` as invariant 24's second
   * instance, and a tape anchor can sit on a dado shoulder for exactly the
   * reason a grab can. One helper over both rather than a second copy: two
   * functions computing snapPointsFor(board) and comparing with sameSnapPoint
   * are two places for a future rule to disagree (follow-up 113). The
   * board-id guard makes a guide-owned anchor fall through untouched, which is
   * correct — a cut edit cannot affect a guide.
   */
  const dropHeldIfGone = (boardId: string) => {
    const board = get().doc.boards.find((b) => b.id === boardId);
    const points = board ? snapPointsFor(board) : [];
    const gone = (held: SnapPoint | null) =>
      held !== null &&
      held.owner.type === 'board' &&
      held.owner.id === boardId &&
      !points.some((p) => sameSnapPoint(p, held));
    const patch: { grabbed?: null; tapeAnchor?: null } = {};
    if (gone(get().grabbed)) patch.grabbed = null;
    if (gone(get().tapeAnchor)) patch.tapeAnchor = null;
    if (patch.grabbed !== undefined || patch.tapeAnchor !== undefined) set(patch);
  };
```

   Rename the three call sites in `addCut`/`updateCut`/`removeCut`. **Keep the
   name honest** — if you would rather leave it `dropGrabIfGone`, don't: it
   clears two things now, and a name that says one of them is how the next
   reader concludes the anchor is unhandled and adds a second copy.

   Note the `held.owner.type === 'board'` test is redundant for `grabbed` (its
   type says so) and load-bearing for `tapeAnchor` (its type does not). That
   asymmetry is the design's §3.0 showing through, and is worth the one-line
   comment.

**Do NOT add `tapeAnchor: null` to `edit()`'s `dropGrab` or to `selectBoard`.**
Both drop a grab because the Move tool's grab candidates are the *selected*
board's points; the tape has no such restriction and measuring from one board to
another is most of what it is for. Design §4.2, and pinned by the two
prohibition tests in Step 1.

- [ ] **Step 5: Widen the Viewport cursor to any non-select tool**

`Viewport.tsx` currently reads `style={{ cursor: tool === 'move' ? 'crosshair' : undefined }}`. Invert the test so a third tool is covered:

```ts
      // R3F puts `style` on the wrapping div; the canvas inherits the cursor.
      // This is the only signal, other than the toolbar, that a tool is armed.
      // Any non-select tool, not `=== 'move'`: the Tape tool arms the same
      // pointer behaviour and must not read as the Select tool.
      style={{ cursor: tool === 'select' ? undefined : 'crosshair' }}
```

**This is the only gate in the file that needs changing, and that is a finding rather than an assumption — check it, don't take it on faith.** The other three snap-move gates are already written as `=== 'select'` rather than `!== 'move'`, so a third tool inherits all of them correctly with no edit:

| Gate | Line | Reads |
|---|---|---|
| board click-to-select | `<BoardMesh selectable={…} />` | `tool === 'select'` |
| click-to-deselect | `onPointerMissed` | `if (tool === 'select')` |
| the gizmo | `{… && <Gizmo />}` | `tool === 'select'` |

The Delete/Backspace guard in `App.tsx` is the fourth, and it *does* need extending — Task 8 Step 4. Toolbar's "Select a part to move" hint reads `tool === 'move' && !selectedId` and correctly stays Move-only.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run build
git add src/store/store.ts src/store/store.test.ts src/viewport/Viewport.tsx
git commit -m "feat: the tape tool mode and tapeAnchor

A second instance of invariant 24 — it holds a world position, so seven
actions clear it: the five that clear a grab, plus removeGuide and
clearGuides, which a grab does not need because a grab is never
guide-owned. See the design's §4."
```

---

## Task 6: Drawing guides, and the Guides checkbox

**Files:**
- Create: `src/viewport/GuideMarkers.tsx`
- Modify: `src/viewport/Viewport.tsx`, `src/viewport/MoveTool.tsx`, `src/panels/Toolbar.tsx`, `src/App.tsx`
- Test: `src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: `guideSnapPoints` (Task 2), `doc.guides` (Task 1).
- Produces: `<GuideMarkers />`; `Viewport` prop `showGuides?: boolean`; `Toolbar` props `showGuides: boolean`, `onToggleGuides: () => void`.

- [ ] **Step 1: Write the failing toolbar test**

Append to `src/panels/Toolbar.test.tsx`, matching the file's existing render-helper style (read the top of the file and reuse its helper rather than inventing one):

```ts
describe('Guides checkbox', () => {
  it('renders checked and calls back on change', async () => {
    const onToggleGuides = vi.fn();
    renderToolbar({ showGuides: true, onToggleGuides });
    const box = screen.getByLabelText('Guides') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(onToggleGuides).toHaveBeenCalledTimes(1);
  });
});
```

If the existing helper does not accept prop overrides, extend it to spread a `Partial<Props>` over its defaults rather than writing a second helper.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/panels/Toolbar.test.tsx`
Expected: FAIL — no element labelled `Guides`.

- [ ] **Step 3: Add `SnapMarker`'s resting variant, then create `GuideMarkers`**

Design §5.2, decided with the user during the revision pass. Every other snap point exists only while hovered, so its marker *appearing* is the confirmation that it is what you are about to snap to. A guide is drawn whenever guides are shown, which takes that signal away — hover one and nothing changes.

In `src/viewport/SnapMarker.tsx`, add an optional prop and one browser-settled constant beside `MARKER_PX`/`RING_PX`:

```tsx
/**
 * A resting guide's marker, in screen pixels — smaller than MARKER_PX, and
 * drawn without the ring.
 *
 * Guides are the only points drawn when nothing is hovering them, so this is
 * what keeps "the marker grew" as the confirmation that a point is picked —
 * the signal every other kind gets for free by appearing at all. It has to
 * stay big enough to aim at and quiet enough that a dozen guides do not read
 * as noise, which makes it browser-settled in the sense of follow-up 60. Task
 * 10 confirms or retunes it; do not "fix" it from theory.
 */
export const RESTING_PX = 6;
```

Take `resting?: boolean` on the component, use `RESTING_PX` for the disc and skip the ring when it is set. **Leave every other marker path untouched** — the hovered and grabbed markers must render exactly as they do today, so a guide under the cursor grows into the same marker every other kind uses.

`src/viewport/GuideMarkers.tsx`:

```tsx
import { useMemo } from 'react';
import { useStore } from '../store/store';
import { guideSnapPoints } from '../document/document';
import { SnapMarker } from './SnapMarker';

/**
 * Every guide point in the document, drawn whenever guides are shown.
 *
 * Independent of any tool: a guide is document data, so it is visible in
 * Select mode too — unlike a snap marker, which is transient chrome that only
 * exists while a tool is hovering something.
 *
 * Reuses SnapMarker rather than drawing its own disc, in its RESTING variant.
 * A guide's hue names what it is in both states; the SIZE is what says whether
 * it is currently picked. Without that distinction a guide would be the one
 * kind of point where hovering gives no confirmation at all, because the
 * marker was already there — see design §5.2.
 *
 * The hovered marker is drawn by whichever tool is hovering it (MoveTool,
 * TapeTool), on top of this one and at full size. Two markers at one position
 * is correct and is what produces the growth: SnapMarker draws with depthTest
 * off, so the larger one wins visually.
 */
export function GuideMarkers() {
  const guides = useStore((s) => s.doc.guides);
  const points = useMemo(() => guideSnapPoints(guides), [guides]);
  return (
    <>
      {points.map((p) => (
        <SnapMarker key={p.owner.id} point={p} resting />
      ))}
    </>
  );
}
```

- [ ] **Step 4: Thread `showGuides` through Viewport**

In `src/viewport/Viewport.tsx`, add to the props interface beside `showAxes`:

```ts
  /**
   * False hides the guide points AND withholds them as snap candidates.
   *
   * Not merely a render flag: a marker appearing over an invisible point is
   * the same defect the snap-move round avoided by skipping a board's volume
   * centre — an inference indicator hanging where nothing is drawn, which is
   * the opposite of its job. See the design's §6.
   */
  showGuides?: boolean;
```

Default it to `true` in the destructure, render `{showGuides && <GuideMarkers />}` beside the `showAxes && <OriginAxes />` line, and pass it to `<MoveTool showGuides={showGuides} />`.

- [ ] **Step 5: Confirm MoveTool's gate — no new edit**

`MoveTool` already takes `showGuides` and already gates the guide half of its post-grab branch: that landed in **Task 2 Step 7**, because the branch and the prop had to be written together to compile. Nothing to add here.

Two things to verify rather than write:

- The pointer effect's dependency array lists `candidates`, which already depends on `showGuides` — so `showGuides` needs no separate entry. Check the array; add nothing if this holds.
- The memo's deps are `[boards, grabbed, selectedId, guides, showGuides]`. If `selectedId` is missing, Task 2 was applied incorrectly — stop and fix it there, not here. That is invariant 15's failure mode and it would look like it worked.

- [ ] **Step 6: Add the Toolbar checkbox**

In `src/panels/Toolbar.tsx`, add to `Props`:

```ts
  /**
   * True when tape-measure guide points are drawn. A third flag beside
   * showGrid and showAxes, and view state for the same reason — guides are
   * scaffolding, and wanting them on is a property of what you are doing right
   * now, not of the project.
   */
  showGuides: boolean;
  onToggleGuides: () => void;
```

Destructure both, and add the checkbox after the Origin one:

```tsx
        <label className="checkbox toolbar-checkbox">
          <input type="checkbox" checked={showGuides} onChange={onToggleGuides} />
          Guides
        </label>
```

- [ ] **Step 7: Add the state in App**

In `src/App.tsx`, beside `showAxes`:

```ts
  const [showGuides, setShowGuides] = useState(true);
```

Pass `showGuides={showGuides} onToggleGuides={() => setShowGuides((v) => !v)}` to `Toolbar`, and `showGuides={showGuides}` to `Viewport`.

- [ ] **Step 8: Run the tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/viewport/GuideMarkers.tsx src/viewport/Viewport.tsx src/viewport/MoveTool.tsx \
        src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/App.tsx
git commit -m "feat: draw guide points, and a Guides checkbox that gates candidates too

Hiding guides withholds them as snap candidates, not just as pixels — a
marker over an invisible point is an indicator with nothing under it.
See the design's §6."
```

---

## Task 7: `TapeTool` and the readout overlay

**Files:**
- Create: `src/viewport/TapeTool.tsx`, `src/panels/TapeReadout.tsx`
- Modify: `src/viewport/Viewport.tsx`, `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `tapeAnchor`/`setTapeAnchor`/`clearTapeAnchor` (Task 5), `addGuide` (Task 4), `offsetPoint` (Task 3), `guideSnapPoints` (Task 2), `snapPointsFor`/`sameSnapPoint` (existing, both from `document/document` — `sameSnapPoint` moved out of `snapPick.ts` in the cut-points round and is no longer importable from there), `pickSnapPoint`/`PICK_RADIUS_PX` (existing, from `./snapPick`), `CLICK_DRAG_SLOP_PX` (existing).
- Produces: `<TapeTool showGuides />`, `<TapeReadout />`.

**Read `src/viewport/MoveTool.tsx` in full before starting.** `TapeTool` mirrors its pointer structure exactly — the pointerId-tagged `downAt`, the drag-slop test, the re-pick at the release position, the hover-committed-on-change ref, the `project` callback. Every one of those carries a comment explaining a real failure mode. Copy the structure and the reasoning; do not re-derive it.

- [ ] **Step 1: Create `TapeTool`**

`src/viewport/TapeTool.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { guideSnapPoints, sameSnapPoint, snapPointsFor } from '../document/document';
import type { SnapPoint } from '../document/document';
import { useStore } from '../store/store';
import { CLICK_DRAG_SLOP_PX } from './pointer';
import { PICK_RADIUS_PX, pickSnapPoint } from './snapPick';
import type { ProjectedPoint } from './snapPick';
import { SnapMarker } from './SnapMarker';

/** Reused rather than allocated per candidate per pointer event. */
const projected = new THREE.Vector3();

/** The measuring line's colour — the guide marker's hue, so the two read as one tool. */
const TAPE_COLOR = '#4f6fd0';

/**
 * The Tape tool: click a snap point to anchor, hover a second to read the
 * distance, click to place a guide point there (or type a length in the
 * readout to place one at that distance along the same ray).
 *
 * Structurally a sibling of MoveTool — same raw-DOM pointer handling on
 * gl.domElement, same pointerId-tagged down slot, same drag-slop test, same
 * re-pick at the release position. Read MoveTool's comments for why each of
 * those is shaped the way it is; every one names a real failure mode.
 *
 * Renders nothing and listens to nothing unless `tool === 'tape'`.
 */
export function TapeTool({ showGuides = true }: { showGuides?: boolean }) {
  const tool = useStore((s) => s.tool);
  const boards = useStore((s) => s.doc.boards);
  const guides = useStore((s) => s.doc.guides);
  const anchor = useStore((s) => s.tapeAnchor);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const [hovered, setHovered] = useState<SnapPoint | null>(null);
  const hoveredRef = useRef<SnapPoint | null>(null);
  const downAt = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  /**
   * Every candidate: boards and guides alike, with no exclusions.
   *
   * Unlike MoveTool this withholds nothing, in EITHER direction. There is no
   * self-snap case to exclude — measuring from one corner of a board to
   * another corner of the SAME board is an ordinary thing to want, and placing
   * a guide there is exactly what the tool is for — and there is no
   * selected-board restriction either, because the tape measures BETWEEN
   * boards and restricting it to one would remove most of what it is for.
   * (That is also why tapeAnchor is deliberately absent from the two
   * selection-based clears — design §4.2.)
   *
   * snapPointsFor, NOT boardSnapPoints: a board's candidates are the box
   * lattice plus its cuts' shoulders since the cut-points round. Reaching for
   * boardSnapPoints here would silently make the tape unable to measure to a
   * dado shoulder — half of what this round and the last one unlock together.
   */
  const candidates = useMemo(
    () => [...boards.flatMap(snapPointsFor), ...(showGuides ? guideSnapPoints(guides) : [])],
    [boards, guides, showGuides],
  );

  useEffect(() => {
    if (tool !== 'tape') {
      hoveredRef.current = null;
      setHovered(null);
      return;
    }

    const el = gl.domElement;

    const project = (at: [number, number, number]): ProjectedPoint | null => {
      projected.set(at[0], at[1], at[2]).project(camera);
      if (projected.z < -1 || projected.z > 1) return null;
      return {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
        depth: projected.z,
      };
    };

    const cursorOf = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      downAt.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    };

    const onPointerMove = (e: PointerEvent) => {
      const next = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      if (sameSnapPoint(next, hoveredRef.current)) return;
      hoveredRef.current = next;
      setHovered(next);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const down = downAt.current;
      if (down && down.pointerId !== e.pointerId) return;
      downAt.current = null;
      if (!down) return;
      // A release that travelled is an orbit, a pan or a zoom — not a click.
      // This is what leaves OrbitControls ungated: the camera stays fully
      // usable between anchoring and placing.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_DRAG_SLOP_PX) return;

      const hit = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      // Read imperatively: the render closure's `anchor` would be stale for
      // any event arriving between a store write and the next commit.
      const store = useStore.getState();
      if (!store.tapeAnchor) {
        if (hit) store.setTapeAnchor(hit);
        return;
      }
      // A second click with no candidate under it cancels, the same as
      // MoveTool's empty-space release. Placing a guide would need a position,
      // and there is none.
      if (!hit) {
        store.clearTapeAnchor();
        return;
      }
      store.addGuide(hit.at);
      store.clearTapeAnchor();
    };

    /**
     * THE LATCH, and it is load-bearing rather than an optimisation.
     *
     * MoveTool clears its hover on leave, because a grab needs no hover to
     * survive — the next click re-picks. The tape does: the typed distance
     * runs along the anchor -> hover direction, and the ONLY way to type is to
     * move the pointer off the canvas and into the readout input. Clearing on
     * leave would therefore destroy the direction on the way to entering the
     * number, and every typed offset would fail with "no target" — the round's
     * central feature, dead.
     *
     * So while anchored, the last target stands until a new one replaces it.
     */
    const onPointerLeave = () => {
      if (useStore.getState().tapeAnchor) return;
      hoveredRef.current = null;
      setHovered(null);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerLeave);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [tool, candidates, gl, camera, size.width, size.height]);

  // Clearing the anchor ends the measurement, so the latched target goes with
  // it — otherwise a stale marker would sit on screen after Escape.
  useEffect(() => {
    if (anchor) return;
    hoveredRef.current = null;
    setHovered(null);
  }, [anchor]);

  // Published for the readout, which lives in the DOM outside the Canvas and
  // so cannot read r3f state itself. A ref would not re-render it; this is
  // the one piece of tool state that has a consumer outside the scene graph.
  const setHoverPoint = useStore((s) => s.setTapeHover);
  useEffect(() => {
    setHoverPoint(hovered);
  }, [hovered, setHoverPoint]);

  if (tool !== 'tape') return null;

  const line =
    anchor && hovered
      ? new Float32Array([...anchor.at, ...hovered.at])
      : null;

  return (
    <>
      {anchor && <SnapMarker point={anchor} />}
      {hovered && <SnapMarker point={hovered} />}
      {line && (
        <line raycast={() => null} renderOrder={9}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[line, 3]} />
          </bufferGeometry>
          <lineDashedMaterial
            color={TAPE_COLOR}
            dashSize={1}
            gapSize={0.5}
            depthTest={false}
            transparent
            toneMapped={false}
          />
        </line>
      )}
    </>
  );
}
```

- [ ] **Step 1b: Settle the measuring line, then move on**

Two known traps here, both of which have cost time elsewhere and neither of which is worth more than one attempt:

1. **Dashes need `computeLineDistances()`.** three.js will not draw a `lineDashedMaterial` without it and r3f does not call it for you. Call it on the geometry via a ref in a `useLayoutEffect`, re-running whenever the position array changes.
2. **`<line>` can collide with SVG's `line` in TS's JSX namespace.** If `npm run build` complains about the intrinsic, use `<primitive object={...} />` with a `THREE.Line` built in a `useMemo` rather than fighting the types.

**If either resists one attempt, fall back to `lineBasicMaterial` and a solid line.** A solid measuring line is fully acceptable — it is a connector, not a legend, and nothing in the design rests on it being dashed. Record which you shipped in the task report.

Follow-up 26a applies: this host runs software GL (llvmpipe) and is not a reliable judge of line rendering. Do not tune this beyond "visible".

- [ ] **Step 2: Add `tapeHover` to the store**

The readout is DOM, outside the `<Canvas>`, so it cannot read `TapeTool`'s local hover state. Add to `StoreState` beside `tapeAnchor`:

```ts
  /**
   * The candidate currently under the cursor in Tape mode.
   *
   * In the store ONLY because the readout is a DOM overlay outside the Canvas
   * and needs it — this is not view state with the standing to sit beside
   * `tool`.
   *
   * Deliberately NOT on invariant 24's clearing list, and the reason is the
   * anchor, not this field. While anchored it is LATCHED (TapeTool's
   * onPointerLeave), so it can outlive a board move — but nothing can be
   * committed from it alone: every path through TapeReadout.commit() reads
   * `tapeAnchor` first and returns when it is null, and all seven of those
   * actions clear the anchor. Clearing this too would be belt-and-braces that
   * also breaks the latch the typed offset depends on.
   */
  tapeHover: SnapPoint | null;
  setTapeHover: (point: SnapPoint | null) => void;
```

```ts
    tapeHover: null,
    setTapeHover: (point) => set({ tapeHover: point }),
```

Add `tapeHover: null` to `setTool`'s `set` call, so leaving the tool clears it.

- [ ] **Step 3: Create the readout overlay**

`src/panels/TapeReadout.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { parseLength, formatLength } from '../units/length';
import { offsetPoint } from '../document/document';
import { useStore } from '../store/store';

/**
 * The tape's live distance and typed-length entry — SketchUp's VCB.
 *
 * A plain DOM element over the canvas rather than 3D text: no billboarding, no
 * drei Html, and the input is a real <input>, so parseLength and the app's
 * fractional-inch entry work unchanged. Always in one place, so the eye knows
 * where to find it.
 *
 * Renders nothing unless the Tape tool is anchored — before the first click
 * there is no distance to report.
 */
export function TapeReadout() {
  const tool = useStore((s) => s.tool);
  const anchor = useStore((s) => s.tapeAnchor);
  const hovered = useStore((s) => s.tapeHover);
  const precision = useStore((s) => s.doc.units.precision);
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // A fresh anchor starts a fresh measurement.
  useEffect(() => {
    setText('');
    setError(false);
  }, [anchor]);

  if (tool !== 'tape' || !anchor) return null;

  const measured =
    hovered
      ? Math.hypot(
          hovered.at[0] - anchor.at[0],
          hovered.at[1] - anchor.at[1],
          hovered.at[2] - anchor.at[2],
        )
      : null;

  const commit = () => {
    const store = useStore.getState();
    const from = store.tapeAnchor;
    // The anchor can be cleared out from under a focused input by any of
    // invariant 24's seven actions. Read it rather than asserting it.
    if (!from) return;
    // TapeTool latches its hover while anchored, which is what makes this
    // non-null after the pointer left the canvas to reach this input. Without
    // that latch this branch would fire on every typed offset — see
    // TapeTool's onPointerLeave.
    const target = store.tapeHover;
    // No direction without a target, and offsetPoint refuses a zero-length
    // one — §1.2. Both leave the anchor in place so the user can move the
    // cursor and try again.
    if (!target) {
      setError(true);
      return;
    }
    const distance = parseLength(text);
    if (distance === null) {
      setError(true);
      return;
    }
    const at = offsetPoint(from.at, target.at, distance);
    if (!at) {
      setError(true);
      return;
    }
    store.addGuide(at);
    store.clearTapeAnchor();
  };

  return (
    <div className="tape-readout">
      <span className="tape-readout-label">
        {measured === null ? '—' : formatLength(measured, precision)}
      </span>
      <input
        ref={input}
        className={error ? 'input tape-readout-input invalid' : 'input tape-readout-input'}
        aria-label="Guide distance from anchor"
        placeholder="distance"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            return;
          }
          // Escape needs its own handler HERE, because App's window listener
          // early-returns on isTextEntry — which this input is. Without it,
          // Escape would do nothing at all while focus is in the box, and the
          // box is where the user has to be to type a distance. Backs out one
          // level, matching App's ladder: drop the anchor, then let a second
          // Escape (now that focus has left) drop the tool.
          if (e.key === 'Escape') {
            e.preventDefault();
            useStore.getState().clearTapeAnchor();
            input.current?.blur();
          }
        }}
      />
    </div>
  );
}
```

**Do not autofocus the input.** Focusing it would put `isTextEntry` in `App`'s keydown guard between the user and every shortcut — which is precisely why the Escape handler above has to exist locally. Autofocusing would extend that dead zone to the whole gesture rather than only to the moment the user chose to type.

- [ ] **Step 4: Render both**

In `src/viewport/Viewport.tsx`, beside `<MoveTool showGuides={showGuides} />`:

```tsx
      <TapeTool showGuides={showGuides} />
```

In `src/App.tsx`, inside `<main className="workspace">`, wrap the `Viewport` in a positioned container or place `<TapeReadout />` as a sibling that the CSS positions over the canvas — read how `.workspace` is laid out in `styles.css` first and follow it.

- [ ] **Step 5: Style it**

Add to `src/styles.css`, matching the file's existing custom-property names (read the `:root` block first and reuse `--font-num`, the surface and border colours; do not introduce new literals where a variable exists):

```css
/* The tape's live readout — SketchUp's VCB, over the canvas rather than in it. */
.tape-readout {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  pointer-events: auto;
  z-index: 2;
}
.tape-readout-label {
  font-family: var(--font-num);
  min-width: 5ch;
  text-align: right;
}
.tape-readout-input {
  width: 8ch;
  font-family: var(--font-num);
}
```

Fill in `background`, `border`, `color` and `box-shadow` from the panel/toolbar rules already in the file so the box matches the app.

- [ ] **Step 6: Verify it builds and nothing regressed**

Run: `npm test`
Expected: PASS (no new unit tests here — this is viewport and DOM-overlay work, verified in Task 10 per the repo's standing rule).

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/viewport/TapeTool.tsx src/panels/TapeReadout.tsx src/viewport/Viewport.tsx \
        src/store/store.ts src/App.tsx src/styles.css
git commit -m "feat: the Tape tool and its readout overlay

Mirrors MoveTool's pointer structure. The readout is a DOM overlay, not
3D text, so the input is a real <input> and parseLength works unchanged."
```

---

## Task 8: The Tape button and the `T` binding

**Files:**
- Modify: `src/panels/Toolbar.tsx`, `src/App.tsx`
- Test: `src/panels/Toolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
describe('Tape button', () => {
  it('is pressed when the tape tool is active and activates it on click', async () => {
    renderToolbar();
    const tape = screen.getByRole('button', { name: /tape/i });
    expect(tape).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(tape);
    expect(useStore.getState().tool).toBe('tape');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/panels/Toolbar.test.tsx`
Expected: FAIL — no Tape button.

- [ ] **Step 3: Add the button**

In `src/panels/Toolbar.tsx`, after the Move button:

```tsx
        <button
          onClick={() => setTool('tape')}
          aria-pressed={tool === 'tape'}
          title="Tape measure — click a point, then click another to measure and place a guide point; type a distance to place it partway (T)"
        >
          Tape
        </button>
```

- [ ] **Step 4: Bind `T` and extend Escape**

In `src/App.tsx`'s existing keydown effect — **inside it, not as a new `window` listener.** That effect already early-returns on `cutListOpen` at its top, which is the behaviour we want: Escape while the cut list is open must close the sheet and leave any anchor behind it untouched. This is the same correction the snap-move round made to its own design's §5.5.

Replace the Escape block:

```ts
      // Escape backs out one level: drop what is held first, then the tool.
      // Note this sits below the cutListOpen guard on purpose — CutList owns
      // Escape while it is open, and a grab or anchor behind the sheet must
      // survive it.
      if (e.key === 'Escape') {
        const { grabbed, tapeAnchor, tool, cancelGrab, clearTapeAnchor, setTool } =
          useStore.getState();
        if (grabbed) {
          e.preventDefault();
          cancelGrab();
        } else if (tapeAnchor) {
          e.preventDefault();
          clearTapeAnchor();
        } else if (tool !== 'select') {
          e.preventDefault();
          setTool('select');
        }
        return;
      }
```

And add the `T` binding directly after the `M` block:

```ts
      // T toggles the Tape tool, the same shape as M. Modifier chords are left
      // alone — Ctrl+T and Cmd+T are the browser's.
      if (e.key === 't' || e.key === 'T') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        const { tool, setTool } = useStore.getState();
        setTool(tool === 'tape' ? 'select' : 'tape');
        return;
      }
```

The Delete/Backspace guard already returns early on `grabbed`. Extend it to the anchor too:

```ts
        // Deleting the board being carried — or the one the tape is anchored
        // on — would leave the held point naming something that no longer
        // exists. The store drops both defensively; this stops the delete
        // happening at all.
        if (useStore.getState().grabbed || useStore.getState().tapeAnchor) return;
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/App.tsx
git commit -m "feat: Tape toolbar button, T binding, Escape backs out the anchor

All three go inside App's EXISTING keydown effect, not a new window
listener — that effect's cutListOpen early-return is the behaviour we
want, not merely one fewer listener."
```

---

## Task 9: The guides list

**Files:**
- Create: `src/panels/GuidesList.tsx`
- Modify: `src/App.tsx`, `src/styles.css`
- Test: `src/panels/GuidesList.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/panels/GuidesList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuidesList } from './GuidesList';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('GuidesList', () => {
  it('says so when there are no guides', () => {
    render(<GuidesList />);
    expect(screen.getByText(/no guides/i)).toBeInTheDocument();
  });

  it('lists each guide by its formatted coordinates', () => {
    useStore.getState().addGuide([12, 0.5, -6.25]);
    render(<GuidesList />);
    // formatLength joins a mixed number with a HYPHEN, not a space:
    // formatLength(-6.25, 16) === '-6-1/4"'. All three regexes match the one
    // coordinate span, which is the whole row's text.
    expect(screen.getByText(/12"/)).toBeInTheDocument();
    expect(screen.getByText(/1\/2"/)).toBeInTheDocument();
    expect(screen.getByText(/-6-1\/4"/)).toBeInTheDocument();
  });

  it('removes one guide without touching the others', async () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    render(<GuidesList />);
    const [first] = screen.getAllByRole('button', { name: /remove guide/i });
    await userEvent.click(first);
    expect(useStore.getState().doc.guides).toHaveLength(1);
    expect(useStore.getState().doc.guides[0].at[0]).toBe(2);
  });

  it('clears every guide', async () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    render(<GuidesList />);
    await userEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(useStore.getState().doc.guides).toEqual([]);
  });
});
```

Check `src/panels/Properties.test.tsx`'s imports first and match whatever this repo's setup provides — if `@testing-library/jest-dom` matchers are registered globally, `toBeInTheDocument` works as written; if not, use `expect(...).toBeTruthy()` on the queried element instead.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/panels/GuidesList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/panels/GuidesList.tsx`:

```tsx
import { useStore } from '../store/store';
import { formatLength } from '../units/length';

/**
 * The guides a project carries, and the only way to remove one.
 *
 * DELIBERATELY NO SELECTION MODEL — no selectedGuideId, no Delete-key path,
 * nothing touching selectedId. The list exists to remove guides; adding
 * selection would mean deciding what a selected guide shows in the properties
 * panel, which is a panel for boards.
 *
 * It is also how this round avoids invariant 21's trap rather than meeting it
 * in a browser: THREE.Line raycasting registers a hit only within
 * raycaster.params.Line.threshold — one inch here — of a drawn line, so
 * click-the-guide-in-the-viewport is a known-bad hit target. A guide is
 * removed by id, the way PartsList already selects a board by id.
 */
export function GuidesList() {
  const guides = useStore((s) => s.doc.guides);
  const precision = useStore((s) => s.doc.units.precision);
  const removeGuide = useStore((s) => s.removeGuide);
  const clearGuides = useStore((s) => s.clearGuides);

  if (guides.length === 0) {
    return <p className="empty">No guides. Use the Tape tool to place one.</p>;
  }

  return (
    <>
      <ul className="guides">
        {guides.map((g) => (
          <li key={g.id}>
            <span className="guide-coords">
              {g.at.map((n) => formatLength(n, precision)).join(', ')}
            </span>
            <button
              className="guide-remove"
              aria-label={`Remove guide at ${g.at.map((n) => formatLength(n, precision)).join(', ')}`}
              onClick={() => removeGuide(g.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button className="guides-clear" onClick={clearGuides}>Clear all</button>
    </>
  );
}
```

- [ ] **Step 4: Render it in App**

In `src/App.tsx`, add a section to the sidebar after the Properties panel:

```tsx
            <section className="panel panel-guides">
              <h2>Guides</h2>
              <GuidesList />
            </section>
```

- [ ] **Step 5: Style it**

Add to `src/styles.css`, following the `.parts` rules already there for spacing, hover and focus. The `×` button should be a bare icon button, right-aligned in its row.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/panels/GuidesList.tsx src/panels/GuidesList.test.tsx src/App.tsx src/styles.css
git commit -m "feat: the guides list

No selection model on purpose — removal by id sidesteps invariant 21's
Line-raycast trap rather than meeting it in a browser."
```

---

## Task 10: Browser verification

The repo's standing rule: the r3f viewport is verified by driving a real browser, not by asserting on mocks. This task produces `docs/browser-verification-guide-points.md`.

**Files:**
- Create: `docs/browser-verification-guide-points.md`

- [ ] **Step 1: Start the dev server**

```bash
npm run dev -- --port 5180
```

**Against the dev server, never production.** Sloyd has no server-side state, so `sloyd.autosave.v1` in the user's browser *is* their project; exercising a new tool against production would overwrite it with a demo document and there is nothing to restore from.

Use the Playwright MCP — it is the only browser tooling that works on this host.

- [ ] **Step 2: Check each of these, with a screenshot for each**

Build a document with at least three boards of different materials (pine, walnut, plywood) at different postures, **and put a dado in at least one of them** — checks 15-17 need one, and they are the point of doing this round after the cut-points round rather than before it.

1. **The fourth marker colour is legible and distinct** on the near-white ground, on walnut, and on plywood — and distinguishable from corner green, edge-mid cyan and face-centre violet with all four on screen. `SNAP_COLORS.guide` is browser-settled (follow-up 60): **retune it here if it does not hold, and say so in the report.**

1b. **The resting-versus-hovered distinction reads** (design §5.2). A resting guide is visibly smaller and ringless; hovering it grows it into the full marker. Screenshot both states of the same guide. `RESTING_PX` is browser-settled the same way: retune it here if a dozen guides read as noise, or if a resting one is too small to aim at, and say so.
2. **Anchor, hover, dashed line.** Anchor a corner, hover another, confirm the readout shows a plausible distance and the measuring line is visible. Record whether `computeLineDistances` was needed (Task 7's note).
3. **Plain second click places a guide at the target** — read the placed position out of `localStorage`, do not judge by eye.
4. **A typed distance BELOW the measured lands between the two points.** Measure a 24" span, type `6"`, and confirm the stored position from `localStorage` is exactly 6" along.
5. **A typed distance ABOVE the measured overshoots**, and **a negative runs backward.** Both read from `localStorage`.
6. **Exact coincidence, not rounded.** Place a guide at a target that is off the 1/16" grid and confirm the stored coordinate is the target's exact value — invariant 25's rule reaching a second tool. A value snapped to 1/16" is a failure.
7. **The zero-length refusal.** Anchor a point, hover the same point, type a distance, press Enter — nothing is placed and the anchor survives. Confirm no guide with a `NaN` coordinate exists in `localStorage`.
8. **Guides are snappable by the Move tool.** Place a guide, switch to Move, grab a board corner, snap it onto the guide, and read the board's position out of `localStorage` to confirm exact coincidence.
9. **A guide cannot be grabbed as a Move source.** In Move mode with nothing grabbed, hover a guide point: no marker appears.
10. **The Guides checkbox hides markers AND withholds candidates.** With it off, hover a known guide position in Move mode — no marker.
11. **All four gates still hold in Tape mode**: no board selection on the commit click, no deselect on an empty-space click, no gizmo, and Delete does not delete while anchored.
12. **The cut-list Escape interaction.** Anchor the tape, open the cut list, press Escape: the sheet closes and the anchor survives.
13. **Undo.** One `Ctrl+Z` after placing a guide removes exactly that guide. One after a Clear all restores all of them.
14. **Console is clean** — 0 errors. The two known three.js deprecation warnings are expected.

**Checks 15-17 are what this round and the cut-points round unlock together, and none of them was in the original plan.** They are the reason the tape reads `snapPointsFor`.

15. **The tape measures to a dado shoulder.** Anchor a board corner, hover the inside corner where a dado floor meets its shoulder, and confirm the readout shows a plausible distance and the shoulder marks. If it does not mark at all, `TapeTool` is reading `boardSnapPoints` — Task 7's candidate memo is wrong.
16. **A guide can be placed on a shoulder**, and read out of `localStorage` at the shoulder's exact coordinates. Note follow-up 123's measured ambiguity applies here: a dado's floor corner and mouth corner project ~3.6 px apart at the default camera, so **zoom in** before aiming, and say in the report which you got.
17. **A shelf can be seated into a dado via a guide.** Place a guide on the shoulder, switch to Move, grab the shelf's end corner, snap it onto the guide, and read the board position out of `localStorage`. This is the headline operation done the long way round; it should land exactly, and it is worth recording whether the guide added anything over snapping to the shoulder directly.
18. **Coincident candidates, design §10.** After check 3 has put a guide exactly on a board corner, hover that pixel repeatedly and record which hue wins and whether it is stable across re-hovers. **This is expected to be arbitrary and is accepted** — both candidates are at the identical position, so only the colour is undetermined. Record what you actually observed; if it *flickers* between hues on a stationary cursor, that is worth a follow-up (the fix is a deterministic ordering rule, per 120 — not de-duplication).
19. **The two anchor prohibitions hold in the real app** (design §4.2). Anchor the tape on one board, then click a different board in the parts list: the anchor survives. Anchor, then **+ Add board**: the anchor survives. Both are unit-tested in Task 5, but the unit tests cannot see that the readout keeps working.

- [ ] **Step 3: Write the report**

Create `docs/browser-verification-guide-points.md`. Follow `docs/browser-verification-snap-move.md`'s structure.

**State only what you actually checked.** Follow-up 108 is this repo's record of a verification report claiming broader coverage than it had — closed by taking the missing screenshots, not by narrowing the prose. If you skip a check, say you skipped it.

Restate follow-up 106's bound: every interaction here is a synthetic `PointerEvent` at a screenshot-located pixel, because snap points have no DOM presence. Real pointer-capture, touch and OS input timing go unexercised.

- [ ] **Step 4: Commit**

```bash
git add docs/browser-verification-guide-points.md src/viewport/SnapMarker.tsx
git commit -m "docs: browser verification for the guide-points round"
```

---

## Task 11: Follow-ups, CLAUDE.md, and the merge

- [ ] **Step 1: Add the round's follow-ups**

Append a "From the guide-points round" section to `docs/follow-ups.md`, numbered from **129** (the cut-aware snap points round ended at 128 — **not 109**, which is what this plan said before the revision pass; two rounds landed in between). At minimum, record:

- **105 is now CLOSED** for guide points and the tape measure; **guide lines were dropped**, with the design's §9 reason (a segment between two guide points is redundant with the points themselves).
- **125 is CLOSED, and by a document rather than by code.** It asked whoever shipped second to merge the guide-points board-owned filter with the selected-board rule into one predicate. The revision pass found there is nothing to merge: the pre-grab branch is already the selected board's points, which are board-owned by construction, so the filter was *discharged*. Record that the resolution was to write no filter at all — a future reader finding no merged predicate should not conclude one was forgotten.
- **120 gained a reachable instance** — design §10. A guide placed on a board corner makes two candidates coincide at zero separation, so `pickSnapPoint`'s depth tie-break is degenerate and the marker's hue falls to concat order. Accepted; record what Task 10's check 18 actually observed.
- Semi-infinite construction lines, still open, still a maybe.
- Guide ids are not deduplicated — the same exposure follow-up 97 records for board ids, deliberately left to whichever round closes 97.
- Guides cannot be moved or renamed; delete and re-place.
- Whether `SNAP_COLORS.guide` and `RESTING_PX` were retuned in Task 10, and to what.
- **The `BoardSnapPoint` decision and what it costs.** It removes seven runtime narrowings at the price of one type and a generic `pickSnapPoint`. What it does *not* cover: a future held-point field that is board-owned but typed `SnapPoint` inherits none of the protection, and the one surviving narrowing (`commitSnapMove`'s self-snap guard) is still a remembered rule.
- Any lesson the round produced. **If a test in this plan turned out to be wrong and an implementer stopped rather than editing the assertion, that is the tenth instance of the plan-supplied-code chain (64, 68 ×2, 80, 87, 88, 107, 118, 126) and it belongs here.** Note that the revision pass itself found one before execution: the original Task 2 Step 7 would have reverted two shipped rounds, which is the first time that chain was caught by re-reading a plan against the code rather than by running it.

- [ ] **Step 2: Update CLAUDE.md**

- Status: v6, the new test count from `npm test`, and a "What the guide-points round did" paragraph.
- The "next line of work IS chosen" paragraph is now spent — replace it with what the round shipped, and leave the successor open unless the user names one.
- Architecture: `guides` beside `stock` as the second document-level field taking the non-`rawBoards.map` migration shape, with §2.2's distinct bump argument.
- Where things live: `TapeTool.tsx`, `GuideMarkers.tsx`, `TapeReadout.tsx`, `GuidesList.tsx`, `snapPoints.ts` gaining `guideSnapPoints`/`offsetPoint`/`BoardSnapPoint`, `snapPick.ts`'s `pickSnapPoint` becoming generic, and `SnapMarker.tsx` gaining `RESTING_PX`.
- Invariants: extend **24** to name `tapeAnchor` as its second instance and list its extra actions — the two guide actions, **and the three cut edits via the generalised `dropHeldIfGone`**. State that `clearGuides`' clear is **unconditional** (every guide is going, so any guide-owned anchor is invalid and a board-owned one is cheap to drop), so the next reader does not narrow it as a cleanup. State the **prohibition** explicitly: `edit()`'s selection callback and `selectBoard` clear a grab and must **not** clear the anchor, because the tape has no selected-board restriction — that one is what a tidying pass would get wrong. Note that `tapeHover` is deliberately *not* on the list and why (it is latched, but nothing commits from it without an anchor). Extend **25** to note that a tape-placed guide is unrounded for the same reason a snap move is; add a new invariant for the `SnapOwner` rule (§3) — but write it as **"`grabbed` is a `BoardSnapPoint`, and that is what makes eight reads correct"** rather than as "read the type, not the id", because the round's answer was to move the enforcement into the type rather than into eight remembered checks. Name the one place a runtime narrowing survives and why.
- Update `CURRENT_VERSION` from 5 to 6 everywhere it appears in prose.

- [ ] **Step 3: Verify before claiming done**

```bash
npm test && npm run build
```

Both must pass. Report the actual test count; do not assume it.

- [ ] **Step 4: Merge**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: close out the guide-points round"
git checkout master
git merge --no-ff feat/guide-points
npm test && npm run build
git branch -d feat/guide-points
```

Deployment is a separate decision — do not deploy without asking.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 tool, gesture, toolbar, `T`, Escape | 5, 7, 8 |
| §1.1 typed distance, three values of one parameter | 3 |
| §1.2 zero-length refusal | 3, 10 (check 7) |
| §2 `GuidePoint`, `guides`, no name | 1 |
| §2.1 document-level migration, no `rawBoards.map` | 1 |
| §2.2 the distinct bump argument | 1 (comment), 11 (CLAUDE.md) |
| §2.3 drop don't refuse; ids not deduped | 1, 11 |
| §3 / §3.0 `BoardSnapPoint`, generic picker, the one surviving narrowing | 2 |
| §3.1 Move grabs boards, targets anything; pre-grab branch needs no filter | 2 (Step 7), 6 (Step 5, verify only), 10 (checks 8, 9) |
| §4 `tapeAnchor`, ten clearing actions | 5 |
| §4.1 the cut edits, one generalised helper | 5 (Step 4 item 9) |
| §4.2 the two clears it must NOT inherit | 5 (Step 1 prohibition tests, Step 4), 10 (check 19) |
| §4.3 why it lives in the store (was §4.1) | 5 (comment) |
| §5 `guideSnapPoints`, one picker, the tape reads `snapPointsFor` | 2, 7, 10 (checks 15-17) |
| §5.1 fourth `SnapKind` and colour | 2, 10 (check 1) |
| §5.2 resting versus hovered guide marker | 6 (Step 3), 10 (check 1b) |
| §6 checkbox gates candidates | 2 (Step 7), 6, 10 (check 10) |
| §7 guides list, no selection model | 9 |
| §8 what is tested, §8.1 what is not | 1-9, 10 |
| §9 non-goals | 11 |
| §10 coincident candidates, accepted | 10 (check 18), 11 |

**Placeholder scan:** two steps deliberately say "read the existing file and match it" rather than showing code — Task 6 Step 1's toolbar test helper, Task 9 Step 5's CSS. Both are cases where inventing a second pattern beside an existing one is the wrong move, and both name exactly what to read. Task 7 Step 5's CSS leaves four properties to be filled from existing rules for the same reason. No TBDs.

**Type consistency:** `guideSnapPoints`, `offsetPoint`, `createGuide`, `validateGuides`, `addGuide`, `removeGuide`, `clearGuides`, `tapeAnchor`, `setTapeAnchor`, `clearTapeAnchor`, `tapeHover`, `setTapeHover`, `showGuides`, `onToggleGuides` — each is used in later tasks exactly as declared in the task that produces it.

**Three things the plan adds that the spec did not name**, all discovered by tracing the typed-offset gesture end to end rather than by reading either document:

1. **`tapeHover` in the store** (Task 7 Step 2). The spec assumed the readout could see the tool's hover; it cannot, because the readout is DOM outside the `<Canvas>`.
2. **The hover latch** (Task 7 Step 1, `onPointerLeave`). The only way to type a distance is to move the pointer off the canvas and into the readout. `MoveTool`'s `onPointerLeave` clears the hover — copying it verbatim would have destroyed the direction on the way to entering the number, so *every* typed offset would have failed with "no target". The round's central feature would not have worked, and no unit test in this plan would have caught it.
3. **A local Escape handler on the readout input** (Task 7 Step 3). `App`'s window listener early-returns on `isTextEntry`, so Escape is dead exactly where the user has to be to type.

These are why the design's §1 gesture is one sentence and Task 7 is the longest task: the gesture crosses the canvas/DOM boundary twice, and both crossings have a failure mode.
