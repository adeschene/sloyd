# Cardinal-Direction Guide Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With the Tape tool anchored, pressing `X`, `Y` or `Z` locks a world axis so a typed distance places a guide point that far along it — removing the constraint that every guide needs a second existing snap point to define its direction.

**Architecture:** One new pure helper (`towardFor`) becomes the single direction source for both the live preview and the commit, so the two continue to agree by construction. One new store field (`tapeAxis`) holds the lock; it holds no world position, so it is deliberately *not* governed by invariant 24 — its only rule is that it lives exactly as long as `tapeAnchor`. `offsetPoint` does not change: three axes plus a signed distance reach all six directions.

**Tech Stack:** TypeScript, React 18, Zustand, react-three-fiber + drei, Vitest + Testing Library, Vite.

## Global Constraints

- **Design doc:** `docs/superpowers/specs/2026-08-04-sloyd-cardinal-guides-design.md`. Read it before Task 1. Section references below (`§4`, `§7.1`, …) point into it.
- **No schema change.** `CURRENT_VERSION` stays **6**. Do not touch `validateGuides`, `createGuide`, `migrateDocument`, or `document/types.ts`.
- **`offsetPoint` does not change.** Its signature, its two null paths and its doc comment stay exactly as they are.
- **No new `window` listener.** `X`/`Y`/`Z` and the Escape rung go into `App`'s **existing** keydown effect, inheriting its `cutListOpen` and `isTextEntry` guards.
- **One capture path, one preview.** Extend the type-anywhere capture in `App` and the derived `preview` memo in `TapeTool`. Do not add a second of either.
- **Never round a placement.** No `SNAP_INCHES`, no `Math.round`, anywhere in this round's arithmetic (invariant 25).
- **`npm test` does not typecheck.** Run `npm run build` before claiming anything compiles. It is the typecheck gate.
- **Commit style:** conventional prefix, imperative subject, and end every commit message with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **Branch:** work on `feat/cardinal-guides`, branched from `master`. No pull requests — this is a solo repo; the branch is merged locally with `git merge --no-ff` at the end.
- **If a test's expectation looks wrong, stop and escalate rather than editing the assertion.** This repo has eight recorded instances of plan-supplied code or plan-supplied justifications being wrong (follow-ups 64, 68 ×2, 80, 87, 88, 107, 118, 141). Assume this plan contains a ninth. Fix the code when the code is wrong; raise it when the *expectation* is wrong.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/document/snapPoints.ts` | modify | Adds `TapeAxis`, `towardFor`, `tapeAxisFromKey`. Stays pure; imports nothing new. |
| `src/document/document.ts` | modify | Re-exports the three new names (one line each, joining lines 23-24). |
| `src/document/snapPoints.test.ts` | modify | Unit tests for the three new exports. |
| `src/store/store.ts` | modify | Adds `tapeAxis` + `setTapeAxis`, and the "axis lives as long as the anchor" rule at every site that nulls `tapeAnchor`. |
| `src/store/store.test.ts` | modify | Pins the lifecycle rule, both halves. |
| `src/App.tsx` | modify | `X`/`Y`/`Z` branch and the new Escape rung, both inside the existing keydown effect. |
| `src/App.test.tsx` | modify | RTL coverage for the keys, the Escape ladder, and each error cause/cure. |
| `src/panels/TapeReadout.tsx` | modify | Commits through `towardFor`; `error` becomes a cause-carrying union with split clearing; axis chip and axis keys. |
| `src/viewport/TapeTool.tsx` | modify | Preview through `towardFor`; `lineEnd` under a lock; re-anchor-instead-of-place on a locked click. |
| `src/styles.css` | modify | `.tape-readout-axis` chip, `.tape-readout-error`. |
| `docs/browser-verification-cardinal-guides.md` | create | The browser pass (§9). |
| `docs/follow-ups.md`, `CLAUDE.md` | modify | Round write-up and closure of follow-up 144. |

---

## Task 1: `towardFor` — the one direction source

**Files:**
- Modify: `src/document/snapPoints.ts` (append after `offsetPoint`, which is the last export in the file)
- Modify: `src/document/document.ts:23-24`
- Test: `src/document/snapPoints.test.ts` (append a new `describe` after the existing `describe('offsetPoint')`)

**Interfaces:**
- Consumes: `offsetPoint(anchor, toward, distance): [number, number, number] | null` — already exported from this file.
- Produces:
  - `type TapeAxis = 'x' | 'y' | 'z'`
  - `towardFor(anchor: [number, number, number], axis: TapeAxis | null, hover: [number, number, number] | null): [number, number, number] | null`
  - `tapeAxisFromKey(key: string): TapeAxis | null`

  All three re-exported from `src/document/document.ts`. Tasks 2-6 import them from `'../document/document'` (or `'./document/document'` in `App.tsx`), never from `'./snapPoints'` directly — that is the existing convention in `store.ts`, `TapeTool.tsx` and `TapeReadout.tsx`.

- [ ] **Step 1: Create the branch**

```bash
cd /home/alec/docker/sloyd
git checkout master && git pull --ff-only 2>/dev/null || true
git checkout -b feat/cardinal-guides
```

- [ ] **Step 2: Write the failing tests**

Append to `src/document/snapPoints.test.ts`. Add `towardFor` and `tapeAxisFromKey` to the existing import from `'./snapPoints'` at the top of the file.

```ts
describe('towardFor', () => {
  const anchor: [number, number, number] = [3, 5, 7];

  it('returns a point one inch along each world axis', () => {
    expect(towardFor(anchor, 'x', null)).toEqual([4, 5, 7]);
    expect(towardFor(anchor, 'y', null)).toEqual([3, 6, 7]);
    expect(towardFor(anchor, 'z', null)).toEqual([3, 5, 8]);
  });

  it('falls back to the hover when no axis is locked', () => {
    expect(towardFor(anchor, null, [1, 1, 1])).toEqual([1, 1, 1]);
  });

  it('returns null with neither an axis nor a hover', () => {
    expect(towardFor(anchor, null, null)).toBeNull();
  });

  // §5.1. The lock is a lock: a hover latched before the axis was pressed must
  // not go on supplying a direction the user cannot see and did not choose.
  it('lets the axis win over a hover that is still latched', () => {
    expect(towardFor(anchor, 'z', [99, 99, 99])).toEqual([3, 5, 8]);
  });

  // The anchor is the caller's array and is read all over the app. Mutating it
  // in place would move the anchor itself every time a preview recomputed.
  it('does not mutate the anchor it was given', () => {
    const a: [number, number, number] = [3, 5, 7];
    towardFor(a, 'x', null);
    expect(a).toEqual([3, 5, 7]);
  });
});

describe('towardFor composed with offsetPoint', () => {
  const anchor: [number, number, number] = [2, 0, 0];
  const along = (axis: 'x' | 'y' | 'z', d: number) =>
    offsetPoint(anchor, towardFor(anchor, axis, null)!, d);

  // INVARIANT 25's fourth operation. A guide exists to be snapped TO, so
  // rounding it to 1/16" would move it off the number the user typed while the
  // display rounded to the same string either way (invariant 5).
  it('places an off-grid distance exactly, with no rounding', () => {
    expect(along('y', 0.01)).toEqual([2, 0.01, 0]);
    expect(along('x', 3.5)).toEqual([5.5, 0, 0]);
  });

  it('places a negative distance on the opposite side of the anchor', () => {
    expect(along('x', -3)).toEqual([-1, 0, 0]);
    expect(along('z', -0.25)).toEqual([2, 0, -0.25]);
  });

  // The synthesized `toward` is exactly 1" away, so offsetPoint's
  // zero-length guard is unreachable in axis mode — §4.
  it('never hits offsetPoint zero-length refusal in axis mode', () => {
    expect(along('x', 0)).toEqual([2, 0, 0]);
  });
});

describe('tapeAxisFromKey', () => {
  it('accepts both cases of each axis letter', () => {
    expect(tapeAxisFromKey('x')).toBe('x');
    expect(tapeAxisFromKey('X')).toBe('x');
    expect(tapeAxisFromKey('Y')).toBe('y');
    expect(tapeAxisFromKey('z')).toBe('z');
  });

  it('rejects everything else, including the keys the app already binds', () => {
    for (const key of ['m', 't', 'f', 'Home', 'Escape', 'Enter', '3', '', 'xy']) {
      expect(tapeAxisFromKey(key)).toBeNull();
    }
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected: FAIL — `towardFor is not a function` / `tapeAxisFromKey is not a function` (and a TS error on the import).

- [ ] **Step 4: Implement**

Append to `src/document/snapPoints.ts`:

```ts
/**
 * A world axis the tape can lock its typed offset to.
 *
 * WORLD, not board-local, and that is the round's central decision rather than
 * a default. `axisDimensions` maps a board's length/width/thickness onto the
 * world axes, and by construction it is always a PERMUTATION of [X, Y, Z] —
 * `posture` names which dimension is up and `rotation` is only 0 or 90 about Y,
 * so each dimension lands on exactly one axis and no two share one. There is no
 * oblique case the document can express. So board-local axes would reach the
 * same six directions and buy a LABEL, not a capability — and they would be
 * unreachable from a guide-owned anchor, which owns no board. See design §2.
 */
export type TapeAxis = 'x' | 'y' | 'z';

const AXIS_INDEX: Record<TapeAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/**
 * The point a typed distance runs TOWARD, in either of the tape's two modes.
 *
 * ONE function called from BOTH `TapeTool`'s preview memo and `TapeReadout`'s
 * commit, which is the whole point of its existence. The round-2 guarantee was
 * that the marker and the placement agree by construction rather than by two
 * pieces of code being written to match, and it rested on both paths sharing
 * `offsetPoint`. Axis mode changes what `toward` IS, so if each side computed
 * its own the guarantee would be half true — arithmetic shared, direction not.
 *
 * Locked: the anchor plus one inch along the axis. The length is deliberately
 * exactly 1 and never 0, which is what makes `offsetPoint`'s zero-length
 * refusal unreachable in axis mode — the magnitude is normalised away there, so
 * any non-zero value would do and 1 is the one that reads as a unit vector.
 *
 * Unlocked: the hovered point, which is the round-1 behaviour unchanged.
 *
 * The axis WINS over a hover rather than falling back to it (§5.1). `TapeTool`
 * latches its hover while anchored, so a stale one can sit unreplaced across an
 * arbitrary number of events; a lock that a value the user cannot see can
 * override is not a lock.
 */
export function towardFor(
  anchor: [number, number, number],
  axis: TapeAxis | null,
  hover: [number, number, number] | null,
): [number, number, number] | null {
  if (!axis) return hover;
  // A copy, never a write into the caller's array: `anchor` is `tapeAnchor.at`,
  // read by the readout's distance, by the measuring line and by the commit.
  const out: [number, number, number] = [anchor[0], anchor[1], anchor[2]];
  out[AXIS_INDEX[axis]] += 1;
  return out;
}

/**
 * The axis a keystroke names, or null.
 *
 * Lives beside the type it produces rather than in either of the two keyboard
 * handlers that need it — `App`'s window keydown effect and `TapeReadout`'s own
 * `onKeyDown`, which exists because `isTextEntry` stops the window listener
 * seeing anything once the distance box has focus. Two copies of this mapping
 * that agree today are two places for a future rule to disagree, which is the
 * drift shape follow-up 64 recorded. Same reasoning that puts `canBeginLength`
 * in `units/length.ts` beside the grammar it is derived from.
 */
export function tapeAxisFromKey(key: string): TapeAxis | null {
  const lower = key.toLowerCase();
  return lower === 'x' || lower === 'y' || lower === 'z' ? lower : null;
}
```

Then in `src/document/document.ts`, extend the two existing re-export lines:

```ts
export { boardSnapPoints, cutSnapPoints, guideSnapPoints, offsetPoint, sameSnapPoint, snapPointsFor, tapeAxisFromKey, towardFor } from './snapPoints';
export type { BoardSnapPoint, SnapKind, SnapOwner, SnapPoint, TapeAxis } from './snapPoints';
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected: PASS, all describes.

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/document/snapPoints.ts src/document/document.ts src/document/snapPoints.test.ts
git commit -m "feat: towardFor, the tape's one direction source in both modes

Locked, it is the anchor plus one inch along a world axis; unlocked, it is
the hovered point. One function so TapeTool's preview and TapeReadout's
commit keep agreeing by construction rather than by two expressions being
written to match.

World axes and not board-local: axisDimensions is always a permutation of
[X, Y, Z], so board-local reaches the same six directions and buys a label
rather than a capability.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `tapeAxis` in the store, and its one structural rule

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `TapeAxis` from Task 1.
- Produces: `tapeAxis: TapeAxis | null` and `setTapeAxis: (axis: TapeAxis | null) => void` on the store.

**Background the implementer needs:** `store.ts` nulls `tapeAnchor` from **nine** places. Six are unconditional (`setTool`, `clearTapeAnchor`, `clearGuides`, `undo`, `redo`, `replaceDocument`); three are conditional (`deleteBoard` and `removeGuide` are owner-conditional, `dropHeldIfGone` is point-precise). Find them all with:

```bash
grep -n "tapeAnchor: null\|patch.tapeAnchor" src/store/store.ts
```

Note that one hit is the **initial state** near `tool: 'select'`, not a writer — it still needs `tapeAxis: null` beside it, but as an initial value.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/store.test.ts`. Add `TapeAxis` usage as needed; the file already imports `boardSnapPoints` and `createDocument`.

```ts
// `tapeAxis` sits beside three fields invariant 24 governs and is deliberately
// NOT a fourth instance of it — it holds no world position, so no document edit
// can invalidate it (the same argument `tapeTyped`'s block above makes). What it
// DOES have is a structural rule: an axis with no anchor names no ray, so it
// lives exactly as long as the anchor. Design §3.1.
describe('tapeAxis — a lock, deliberately NOT invariant 24', () => {
  const anchorOn = () => {
    useStore.getState().addBoard();
    const board = useStore.getState().doc.boards[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(board)[0]);
    return board;
  };

  it('locks an axis while anchored', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    expect(useStore.getState().tapeAxis).toBe('y');
  });

  it('toggles off when the same axis is pressed again', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTapeAxis('y');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('switches directly between axes', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTapeAxis('x');
    expect(useStore.getState().tapeAxis).toBe('x');
  });

  it('refuses to lock with no anchor — an axis with no anchor names no ray', () => {
    useStore.getState().setTapeAxis('x');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('can always be cleared explicitly, anchor or not', () => {
    anchorOn();
    useStore.getState().setTapeAxis('z');
    useStore.getState().setTapeAxis(null);
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  // THE HALF THAT IS EASY TO GET BACKWARDS, and the one a "clear it everywhere"
  // implementation passes every other test while breaking. Re-anchoring under a
  // lock is the §5.2 gesture: click a corner, type, Enter, click the next
  // corner, type, Enter — with the axis pressed once at the start.
  it('SURVIVES a re-anchor', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTapeAnchor(boardSnapPoints(board)[3]);
    expect(useStore.getState().tapeAxis).toBe('y');
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  it('drops with the anchor when the tool changes', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTool('select');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor on an explicit clear', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().clearTapeAnchor();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor on undo and on redo', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().setTapeAnchor(boardSnapPoints(useStore.getState().doc.boards[0])[0]);
    useStore.getState().setTapeAxis('x');
    useStore.getState().undo();
    expect(useStore.getState().tapeAxis).toBeNull();

    // Re-armed with a bare setTapeAnchor rather than through an edit: addBoard's
    // edit() wipes `future`, so redo() would early-return without running its
    // body and the assertion below would say nothing about redo. Same reason the
    // tapeAnchor block above re-arms this way.
    useStore.getState().setTapeAnchor(boardSnapPoints(useStore.getState().doc.boards[0])[0]);
    useStore.getState().setTapeAxis('x');
    useStore.getState().redo();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when the document is replaced', () => {
    anchorOn();
    useStore.getState().setTapeAxis('z');
    useStore.getState().replaceDocument(createDocument('Other'));
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when the anchored board is deleted', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('z');
    useStore.getState().deleteBoard(board.id);
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when the anchored guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    const guide = useStore.getState().doc.guides[0];
    useStore.getState().setTapeAnchor({
      kind: 'guide',
      at: [1, 2, 3],
      owner: { type: 'guide', id: guide.id },
    });
    useStore.getState().setTapeAxis('x');
    useStore.getState().removeGuide(guide.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when every guide is cleared', () => {
    useStore.getState().addGuide([1, 2, 3]);
    anchorOn();
    useStore.getState().setTapeAxis('x');
    useStore.getState().clearGuides();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  // dropHeldIfGone is POINT-PRECISE and runs after every updateBoard, addCut,
  // updateCut and removeCut. Both halves matter and only one of them is obvious.
  it('drops with the anchor when an edit takes the anchored point away', () => {
    const board = anchorOn();
    // Chosen BY THE PROPERTY THAT MAKES THE TEST MEAN SOMETHING, not by index.
    // boardSnapPoints(board)[0] is the min corner, which IS board.position, so
    // growing the length leaves it exactly where it was and the point-precise
    // clear correctly KEEPS it — the test would pass while pinning nothing.
    // That is follow-up 141's root cause verbatim: the most obvious point to
    // grab in a fixture is the one point that survives the edit you are testing.
    // A default board is `flat` at rotation 0, so axisDimensions puts `length`
    // on X; any point above the min X therefore moves when the length grows.
    const moves = boardSnapPoints(board).find((p) => p.at[0] > board.position[0])!;
    useStore.getState().setTapeAnchor(moves);
    useStore.getState().setTapeAxis('y');
    useStore.getState().updateBoard(board.id, { length: board.length + 12 });
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('KEEPS the lock through an edit the anchor survives', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('y');
    // The min corner is board.position, which a rename cannot move — and this
    // is the case §3.1 exists to state: the axis drops when the anchor actually
    // drops, not merely when a conditional writer runs.
    useStore.getState().updateBoard(board.id, { name: 'Renamed' });
    expect(useStore.getState().tapeAnchor).not.toBeNull();
    expect(useStore.getState().tapeAxis).toBe('y');
  });

  it('KEEPS the lock when an unrelated board is deleted', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().addBoard();
    const other = useStore.getState().doc.boards.find((b) => b.id !== board.id)!;
    useStore.getState().deleteBoard(other.id);
    expect(useStore.getState().tapeAxis).toBe('y');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/store/store.test.ts -t "tapeAxis"`
Expected: FAIL — `setTapeAxis is not a function`.

- [ ] **Step 3: Add the field and the action**

In `src/store/store.ts`, add to the store interface immediately **after** the `tapeTyped` block (so the two non-invariant-24 fields sit together):

```ts
  /**
   * The world axis the typed distance runs along, or null for the ray path.
   *
   * NOT A FOURTH INSTANCE OF INVARIANT 24, for `tapeTyped`'s reason rather than
   * its own: the three fields above hold captured WORLD POSITIONS, which is what
   * makes them go stale when the boards move under them. This holds an enum.
   * `'x'` means the same thing after an undo, a resize or a deleted cut, so it
   * must NOT be given clearing rules by analogy with its neighbours — doing so
   * would silently unlock an axis mid-measurement on every unrelated edit.
   *
   * Its one rule is STRUCTURAL instead: an axis with no anchor names no ray — no
   * origin for the offset to run from, and TapeReadout renders nothing without
   * an anchor — so the axis lives exactly as long as `tapeAnchor`. Stated as a
   * rule over that set rather than as a list of writers, because a list here is
   * a count that goes stale (a comment in CLAUDE.md did exactly that once).
   * Concretely, in both directions:
   *
   *  - every site that nulls `tapeAnchor` nulls this too, at the SAME
   *    conditionality: blanket where the anchor's clear is blanket,
   *    owner-conditional in `deleteBoard`/`removeGuide`, point-precise inside
   *    `dropHeldIfGone`. So an edit the anchor SURVIVES leaves the lock alone.
   *  - `setTapeAnchor` PRESERVES it, which is the half a "clear it everywhere"
   *    implementation breaks while passing every other test. It is what makes
   *    the design's §5.2 gesture work: click a corner, type, Enter, click the
   *    next corner, type, Enter — with the axis pressed once.
   *
   * See design §3. `setTapeAxis(axis)` toggles (setting the axis already locked
   * clears it) and is a no-op with no anchor; `setTapeAxis(null)` always clears,
   * which is what Escape's ladder uses.
   */
  tapeAxis: TapeAxis | null;
  setTapeAxis: (axis: TapeAxis | null) => void;
```

Import the type at the top of the file — it joins the existing `SnapPoint`/`BoardSnapPoint` type import from `'../document/document'`.

Add `tapeAxis: null` to the initial state, beside `tapeTyped: ''`.

Add the action beside `setTapeTyped`:

```ts
    setTapeAxis: (axis) => {
      // An explicit clear always lands — Escape's ladder calls it, and it must
      // work whether or not an anchor is still there.
      if (axis === null) {
        set({ tapeAxis: null });
        return;
      }
      // A lock with no anchor names no ray. Refused here rather than in each
      // of the two keyboard handlers, so neither needs a guard of its own.
      if (!get().tapeAnchor) return;
      set({ tapeAxis: get().tapeAxis === axis ? null : axis });
    },
```

- [ ] **Step 4: Add `tapeAxis: null` at every site that nulls `tapeAnchor`**

Six unconditional sites — add `tapeAxis: null` to the same `set({ … })`:

```ts
    setTool: (tool) =>
      set({ tool, grabbed: null, tapeAnchor: null, tapeHover: null, tapeTyped: '', tapeAxis: null }),
```

```ts
    clearTapeAnchor: () => set({ tapeAnchor: null, tapeAxis: null }),
```

…and the same one-property addition inside `undo`, `redo`, `replaceDocument` and `clearGuides`.

Three conditional sites — the addition goes **inside the existing condition**, never beside it:

```ts
      // deleteBoard
      if (get().tapeAnchor?.owner.type === 'board' && get().tapeAnchor?.owner.id === id) {
        set({ tapeAnchor: null, tapeAxis: null });
      }
```

```ts
      // removeGuide
      if (get().tapeAnchor?.owner.type === 'guide' && get().tapeAnchor?.owner.id === id) {
        set({ tapeAnchor: null, tapeAxis: null });
      }
```

```ts
      // dropHeldIfGone — the patch object's type gains one optional property
      const patch: { grabbed?: null; tapeAnchor?: null; tapeHover?: null; tapeAxis?: null } = {};
      …
      if (anchor && !survives(anchor)) {
        patch.tapeAnchor = null;
        // The lock goes with the anchor and only with it — point-precise, like
        // the clear it rides on. An edit this anchor survives leaves it alone.
        patch.tapeAxis = null;
      }
```

Leave `dropHeldIfGone`'s "did anything change" test exactly as it is: `tapeAxis` is only ever set beside `tapeAnchor`, so the existing three-property check already covers it, and adding a fourth clause would read as load-bearing while pinning nothing.

**Do NOT** add `tapeAxis: null` to `edit()`'s selection callback or to `selectBoard`. Those two clear `grabbed` because the user retargeted the *Move* tool; invariant 24 records that they must not touch the tape's fields, and the axis inherits that prohibition.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/store/store.test.ts`
Expected: PASS — the new describe and every pre-existing test in the file.

- [ ] **Step 6: Verify the lifecycle rule is actually load-bearing**

Two mutations, each run and then reverted. Record the output in the commit body if it differs from what is stated here.

```bash
# 1. Make setTapeAnchor clear the axis (the "clear it everywhere" mistake).
#    Expect: 'SURVIVES a re-anchor' fails, and ONLY it.
# 2. Delete the tapeAxis: null from dropHeldIfGone's anchor branch.
#    Expect: 'drops with the anchor when an edit takes the anchored point away' fails.
npx vitest run src/store/store.test.ts -t "tapeAxis"
```

- [ ] **Step 7: Typecheck and commit**

```bash
npm run build
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: tapeAxis, a lock that lives exactly as long as the anchor

Deliberately NOT invariant 24's fourth instance: it holds an enum, not a
captured world position, so no document edit can invalidate it and giving
it clearing rules by analogy would unlock an axis on every unrelated edit.

Its rule is structural instead — an axis with no anchor names no ray — and
it is applied at the same conditionality as each anchor clear, so an edit
the anchor survives leaves the lock alone. setTapeAnchor PRESERVES it,
which is the half a clear-it-everywhere implementation breaks silently.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `X`/`Y`/`Z` and the Escape rung in `App`'s existing keydown effect

**Files:**
- Modify: `src/App.tsx` (the Escape block, and a new block after the `T` block and before the type-anywhere capture)
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `tapeAxisFromKey` (Task 1), `setTapeAxis` / `tapeAxis` (Task 2).
- Produces: nothing new for later tasks.

**The trap in this task, stated up front.** The `M` and `T` blocks guard modifiers with an early `return`:

```ts
if (e.ctrlKey || e.metaKey || e.altKey) return;
```

**Copying that shape here breaks undo.** `Ctrl+Z` has `e.key === 'z'`, so an axis block that returns on a modifier would swallow it *before* the `Ctrl+Z` block further down ever runs. The modifier test must therefore be part of the **condition**, so a modified `z` falls through — exactly the way the type-anywhere capture spells its own (`if (!e.ctrlKey && !e.metaKey && !e.altKey && canBeginLength(e.key))`).

- [ ] **Step 1: Write the failing tests**

Append to the `describe('App type-anywhere tape capture')` block in `src/App.test.tsx`, which already has the `anchoredTape()` and `box()` helpers this needs.

```ts
  it('locks a world axis from the canvas and toggles it back off', async () => {
    const user = await anchoredTape();
    await user.keyboard('x');
    expect(useStore.getState().tapeAxis).toBe('x');
    await user.keyboard('x');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('does not lock an axis with no anchor', async () => {
    const user = await anchoredTape();
    await act(async () => { useStore.getState().clearTapeAnchor(); });
    await user.keyboard('y');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  // THE ONE THAT MATTERS. Ctrl+Z is `e.key === 'z'`, so an axis block guarding
  // modifiers with an early return would swallow undo entirely.
  it('leaves Ctrl+Z reaching the undo binding below it', async () => {
    const user = await anchoredTape();
    const before = useStore.getState().doc.boards.length;
    await act(async () => { useStore.getState().addBoard(); });
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{Control>}z{/Control}');
    expect(useStore.getState().doc.boards).toHaveLength(before);
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('backs out one level at a time on Escape: axis, then anchor, then tool', async () => {
    const user = await anchoredTape();
    await user.keyboard('z');
    expect(useStore.getState().tapeAxis).toBe('z');

    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAxis).toBeNull();
    expect(useStore.getState().tapeAnchor).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tool).toBe('tape');

    await user.keyboard('{Escape}');
    expect(useStore.getState().tool).toBe('select');
  });

  it('does not lock an axis while the cut list is open', async () => {
    const user = await anchoredTape();
    await user.click(screen.getByRole('button', { name: /cut list/i }));
    await user.keyboard('x');
    expect(useStore.getState().tapeAxis).toBeNull();
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/App.test.tsx -t "axis"`
Expected: FAIL — `tapeAxis` stays null after the keystroke.

- [ ] **Step 3: Add the axis block**

In `src/App.tsx`, insert immediately after the `T` block and before the type-anywhere capture's comment:

```tsx
      // X / Y / Z lock a world axis, so a typed distance can run somewhere no
      // second snap point happens to lie. In this EXISTING listener with M and
      // T rather than in one of its own, which is CLAUDE.md's standing rule for
      // window-level shortcuts — and here the inheritance buys behaviour rather
      // than merely satisfying the rule: `cutListOpen` above means nothing arms
      // an axis behind a sheet, and `isTextEntry` at the top is why the twin
      // branch in TapeReadout has to exist at all (once the box has focus this
      // listener never sees the key).
      //
      // The modifier test is part of the CONDITION and deliberately not an
      // early `return` like M's and T's: Ctrl+Z is `e.key === 'z'`, so a
      // returning guard here would swallow undo before the block below ever
      // runs. Same spelling the capture below uses, for the same reason.
      if (!e.ctrlKey && !e.metaKey && !e.altKey && tapeAxisFromKey(e.key)) {
        const { tool, tapeAnchor, setTapeAxis } = useStore.getState();
        // An axis with no anchor names no ray. The store refuses it anyway;
        // testing here is what keeps the key FALLING THROUGH when the tape is
        // not armed, rather than being swallowed by a tool that is not in use —
        // the rule the capture below states for its own early return.
        if (tool === 'tape' && tapeAnchor) {
          e.preventDefault();
          setTapeAxis(tapeAxisFromKey(e.key));
          return;
        }
      }
```

Add `tapeAxisFromKey` to the existing `'./document/document'` import at the top of `App.tsx`.

- [ ] **Step 4: Add the Escape rung**

Replace the Escape block's body:

```tsx
      if (e.key === 'Escape') {
        const { grabbed, tapeAxis, tapeAnchor, tool, cancelGrab, setTapeAxis, clearTapeAnchor, setTool } =
          useStore.getState();
        if (grabbed) {
          e.preventDefault();
          cancelGrab();
        } else if (tapeAxis) {
          // A rung above the anchor, keeping this ladder's back-out-one-level
          // shape: an axis is a level, and dropping the whole measurement to
          // correct a mis-pressed axis key would cost the anchor too.
          e.preventDefault();
          setTapeAxis(null);
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

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS for everything **except one pre-existing test, which will fail, and whose fixture is what is wrong.**

> **`does not capture a letter that no other binding claims` (`src/App.test.tsx:384`) types the literal `'x'`** — checked before this plan was written, not predicted. As of this task `x` *is* claimed, so the premise of the fixture is now false. The test's intent is sound and must be preserved: a letter that no binding claims must fall through the type-anywhere capture rather than being swallowed. Fix the **fixture**, not the assertion — change `'x'` to a letter nothing binds (`'q'`), and leave the expectation `tapeTyped === ''` exactly as it is. Add a line to its comment noting that `x`/`y`/`z` are no longer available for this purpose, so the next person does not reintroduce one.
>
> This is the ninth link in the plan-supplied-expectation chain (follow-ups 64, 68 ×2, 80, 87, 88, 107, 118, 141) and the first one the plan itself found in advance. Say so in the commit rather than fixing it silently.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run build
git add src/App.tsx src/App.test.tsx
git commit -m "feat: X/Y/Z lock a world axis, and Escape gains a rung

Both inside App's existing keydown effect, inheriting its cutListOpen and
isTextEntry guards rather than adding a listener.

The modifier test is part of the condition rather than an early return like
M's and T's: Ctrl+Z is e.key === 'z', so a returning guard would have
swallowed undo before its own block ever ran.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: `TapeReadout` commits through `towardFor`, and `error` carries its cause

**Files:**
- Modify: `src/panels/TapeReadout.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `towardFor` (Task 1), `tapeAxis` (Task 2).
- Produces: nothing importable — `TapeError` stays module-local.

This closes **follow-up 144**. The current `error` is a boolean, and its single clearing effect is keyed `[text, hovered]`, which means any new hover cures *every* error — including an unparseable number, which a hover has nothing to say about. That is tolerable on the ray path and wrong under a lock, where a hover cures nothing at all.

- [ ] **Step 1: Write the failing tests**

Append to `describe('App type-anywhere tape capture')` in `src/App.test.tsx`:

```ts
  const reason = () => screen.queryByTestId('tape-readout-error')?.textContent ?? null;

  it('names the cause when there is no direction at all', async () => {
    const user = await anchoredTape();
    await user.keyboard('5{Enter}');
    expect(box().className).toContain('invalid');
    expect(reason()).toMatch(/hover a point/i);
    expect(useStore.getState().doc.guides).toHaveLength(0);
  });

  it('names the cause when the number cannot be read', async () => {
    const user = await anchoredTape();
    const board = useStore.getState().doc.boards[0];
    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[25]); });
    await user.keyboard('.{Enter}');
    expect(box().className).toContain('invalid');
    expect(reason()).toMatch(/length/i);
  });

  // The distinction the boolean could not express: a hover is not an answer to
  // "can this be read as a length", so it must not clear that error.
  it('does not let a new hover clear an unparseable number', async () => {
    const user = await anchoredTape();
    const board = useStore.getState().doc.boards[0];
    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[25]); });
    await user.keyboard('.{Enter}');
    expect(box().className).toContain('invalid');

    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[24]); });
    expect(box().className).toContain('invalid');
  });

  it('lets a new character clear an unparseable number', async () => {
    const user = await anchoredTape();
    const board = useStore.getState().doc.boards[0];
    await act(async () => { useStore.getState().setTapeHover(boardSnapPoints(board)[25]); });
    await user.keyboard('.{Enter}');
    expect(box().className).toContain('invalid');
    await user.keyboard('5');
    expect(box().className).not.toContain('invalid');
  });

  // Pressing an axis key genuinely cures a no-direction refusal, and under the
  // boolean the red would have survived until Enter proved otherwise.
  it('lets an axis key clear a no-direction refusal', async () => {
    const user = await anchoredTape();
    await user.keyboard('5{Enter}');
    expect(box().className).toContain('invalid');
    await act(async () => { useStore.getState().setTapeAxis('y'); });
    expect(box().className).not.toContain('invalid');
  });

  it('places a guide along the locked axis with no target hovered at all', async () => {
    const user = await anchoredTape();
    const anchorAt = useStore.getState().tapeAnchor!.at;
    await act(async () => { useStore.getState().setTapeAxis('y'); });
    await user.keyboard('3 1/2{Enter}');

    const guides = useStore.getState().doc.guides;
    expect(guides).toHaveLength(1);
    expect(guides[0].at).toEqual([anchorAt[0], anchorAt[1] + 3.5, anchorAt[2]]);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('places on the opposite side for a negative distance', async () => {
    const user = await anchoredTape();
    const anchorAt = useStore.getState().tapeAnchor!.at;
    await act(async () => { useStore.getState().setTapeAxis('x'); });
    await user.keyboard('-2{Enter}');
    expect(useStore.getState().doc.guides[0].at).toEqual([
      anchorAt[0] - 2, anchorAt[1], anchorAt[2],
    ]);
  });

  // §5.1: the lock is a lock. A hover latched before the axis was pressed must
  // not supply the direction.
  it('ignores a latched hover while an axis is locked', async () => {
    const user = await anchoredTape();
    const board = useStore.getState().doc.boards[0];
    const anchorAt = useStore.getState().tapeAnchor!.at;
    await act(async () => {
      useStore.getState().setTapeHover(boardSnapPoints(board)[25]);
      useStore.getState().setTapeAxis('y');
    });
    await user.keyboard('1{Enter}');
    expect(useStore.getState().doc.guides[0].at).toEqual([
      anchorAt[0], anchorAt[1] + 1, anchorAt[2],
    ]);
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/App.test.tsx -t "cause"`
Expected: FAIL — no `tape-readout-error` element exists.

- [ ] **Step 3: Implement the union and the split clears**

In `src/panels/TapeReadout.tsx`, add `towardFor` to the existing `'../document/document'` import, and replace the `error` state, the two effects and `commit()`:

```tsx
/**
 * WHY the refusal is a union rather than a boolean — follow-up 144, closed here
 * because this round is what makes it stop being cosmetic.
 *
 * With the axis lock, "there is no target" stops being a refusal at all: in
 * axis mode `towardFor` always returns a direction, so `no-direction` and
 * `degenerate` are both unreachable by construction. A boolean cannot say which
 * of three questions failed, and — worse — could not be CLEARED correctly:
 * its one effect was keyed on [text, hovered], so any new hover cured every
 * error, including an unparseable number that a hover has nothing to say about.
 */
type TapeError = 'no-direction' | 'unparseable' | 'degenerate' | null;

const ERROR_TEXT: Record<Exclude<TapeError, null>, string> = {
  'no-direction': 'Hover a point, or press X / Y / Z',
  unparseable: "Can't read that as a length",
  degenerate: 'That target is on the anchor',
};
```

```tsx
  const axis = useStore((s) => s.tapeAxis);
  const [error, setError] = useState<TapeError>(null);
```

```tsx
  // A fresh anchor starts a fresh measurement.
  useEffect(() => {
    setText('');
    setError(null);
  }, [anchor, setText]);

  /**
   * A new character re-answers "can this be read as a length", and nothing else.
   *
   * Still an effect rather than an onChange handler, for the reason the round-2
   * comment gave: the type-anywhere path writes the store directly, so onChange
   * never fires for the first character. Still safe against defeating the error
   * it clears, for the same reason too — commit() sets the error WITHOUT
   * touching `tapeTyped` and is the only caller that sets one, so no single
   * event both raises an error and changes the text.
   */
  useEffect(() => {
    setError((e) => (e === 'unparseable' ? null : e));
  }, [text]);

  /**
   * A new hover OR a new axis re-answers "is there a direction".
   *
   * Both cures for the same question, which is why they share an effect. The
   * axis half is the one the boolean could not have: pressing X after a
   * no-direction refusal genuinely fixes it, and under the old rule the red
   * would have survived until Enter proved otherwise.
   *
   * And a hover no longer clears an UNPARSEABLE number, which the single
   * [text, hovered] effect did — harmless-looking on the ray path, and simply
   * wrong under a lock where a hover cures nothing at all.
   */
  useEffect(() => {
    setError((e) => (e === 'no-direction' || e === 'degenerate' ? null : e));
  }, [hovered, axis]);
```

```tsx
  const commit = () => {
    const store = useStore.getState();
    const from = store.tapeAnchor;
    // The anchor can be cleared out from under a focused input by any of the
    // actions enumerated at `tapeHover`'s declaration in store.ts (invariant
    // 24's third instance). Read it rather than asserting it.
    if (!from) return;
    // The SAME function TapeTool's preview memo calls, which is what keeps the
    // marker and the placement agreeing under both modes rather than only under
    // the ray one — design §4.
    const toward = towardFor(from.at, store.tapeAxis, store.tapeHover?.at ?? null);
    if (!toward) {
      setError('no-direction');
      return;
    }
    const distance = parseLength(text);
    if (distance === null) {
      setError('unparseable');
      return;
    }
    const at = offsetPoint(from.at, toward, distance);
    if (!at) {
      setError('degenerate');
      return;
    }
    store.addGuide(at);
    store.clearTapeAnchor();
  };
```

Update the input's className to `error ? '… invalid' : '…'` (it already reads that way — `error` being a union rather than a boolean does not change the expression, since `null` is falsy).

Render the reason in place of the hint when there is one, keeping the hint's quiet idiom:

```tsx
      {error ? (
        <span className="tape-readout-hint tape-readout-error" data-testid="tape-readout-error">
          {ERROR_TEXT[error]}
        </span>
      ) : (
        <span className="tape-readout-hint">Type a distance, Enter to place</span>
      )}
```

- [ ] **Step 4: Add the error style**

In `src/styles.css`, after `.tape-readout-hint`:

```css
/* The reason a refusal happened, in the hint's own slot and size — it replaces
   the hint rather than stacking under it, so the box does not change height
   when a commit is refused. Colour is the app's existing alert ink, not a new
   one. */
.tape-readout-error {
  color: var(--alert-bright);
}
```

`--alert-bright` is defined at `src/styles.css:39` (`#f3c4b8`) — checked, not assumed. Do not introduce a new colour token.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS, including the pre-existing `clears the refusal marking once a target is acquired`.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run build
git add src/panels/TapeReadout.tsx src/styles.css src/App.test.tsx
git commit -m "feat: commit through towardFor, and let the refusal carry its cause

Closes follow-up 144. Axis mode is what makes it stop being cosmetic: with
a lock, 'no target' is unreachable by construction rather than a refusal,
and the single [text, hovered] clearing effect was letting any new hover
cure an unparseable number a hover has nothing to say about.

Each cause is now cleared by what actually re-answers its question: text
for unparseable, hover OR axis for the two direction failures.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: The axis chip, the hint, and the axis keys inside the box

**Files:**
- Modify: `src/panels/TapeReadout.tsx`
- Modify: `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `tapeAxisFromKey` (Task 1), `setTapeAxis` (Task 2).
- Produces: nothing.

**Why the keys have to be here as well as in `App`.** Once the first digit lands, the input has focus, so `isTextEntry` at the top of `App`'s keydown effect early-returns and `X`/`Y`/`Z` **cannot reach `App` at all**. Escape already has a branch in this file for exactly that reason (`TapeReadout.tsx`, the `onKeyDown` handler); the axis keys follow its precedent. Without it the axis could never be corrected once typing had started, which is the most likely correction a user makes.

- [ ] **Step 1: Write the failing tests**

Append to `describe('App type-anywhere tape capture')` in `src/App.test.tsx`:

```ts
  it('shows which axis is locked', async () => {
    const user = await anchoredTape();
    expect(screen.queryByTestId('tape-readout-axis')).toBeNull();
    await user.keyboard('x');
    expect(screen.getByTestId('tape-readout-axis').textContent).toBe('X');
  });

  // The case App's listener CANNOT serve: isTextEntry early-returns once the
  // box has focus, so this branch is the only route to correcting a mis-pressed
  // axis mid-number.
  it('changes the axis from inside the focused box, keeping the number', async () => {
    const user = await anchoredTape();
    await user.keyboard('x');
    await user.keyboard('3');
    expect(document.activeElement).toBe(box());
    await user.keyboard('y');
    expect(useStore.getState().tapeAxis).toBe('y');
    expect(box().value).toBe('3');
  });

  it('does not type the axis letter into the box', async () => {
    const user = await anchoredTape();
    await user.keyboard('3');
    await user.keyboard('z');
    expect(box().value).toBe('3');
  });

  it('backs out the axis first on Escape from inside the box', async () => {
    const user = await anchoredTape();
    await user.keyboard('x3');
    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAxis).toBeNull();
    expect(useStore.getState().tapeAnchor).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(useStore.getState().tapeAnchor).toBeNull();
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/App.test.tsx -t "axis"`
Expected: FAIL — no `tape-readout-axis` element; the axis letter lands in the box as text.

- [ ] **Step 3: Add the chip and the hint wording**

Add `tapeAxisFromKey` to the `'../document/document'` import. In the render, put the chip first in the row:

```tsx
      <div className="tape-readout-row">
        {axis && (
          // The confirmation that the lock landed. It is the ONLY one in axis
          // mode until a number is typed: with no target there is nothing for
          // the measuring line to draw against, and drawing a semi-infinite
          // axis line instead would be follow-up 130's construction line, which
          // this round explicitly does not build (design §4.1, §8).
          <span className="tape-readout-axis" data-testid="tape-readout-axis">
            {axis.toUpperCase()}
          </span>
        )}
        <span className="tape-readout-label">
```

And the non-error hint becomes axis-aware:

```tsx
        <span className="tape-readout-hint">
          {axis ? `Along ${axis.toUpperCase()} — Enter to place` : 'Type a distance, Enter to place'}
        </span>
```

- [ ] **Step 4: Add the axis keys to `onKeyDown`**

Inside the input's `onKeyDown`, **above** the Enter branch:

```tsx
            // X / Y / Z have to be handled HERE as well as in App's window
            // listener, and this is not redundancy — it is forced. App's effect
            // early-returns on isTextEntry, which this input is, so once the
            // first character lands its listener never sees another key. Escape
            // is in this handler for exactly the same reason.
            //
            // The modifier test keeps Ctrl+Z (and Cmd+X, Cmd+C, Cmd+V) alone.
            const axisKey = tapeAxisFromKey(e.key);
            if (axisKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              useStore.getState().setTapeAxis(axisKey);
              return;
            }
```

And extend the Escape branch to back out the axis first, matching `App`'s ladder shape:

```tsx
            if (e.key === 'Escape') {
              e.preventDefault();
              const store = useStore.getState();
              // Same ladder as App's, one rung at a time: drop the axis if there
              // is one, otherwise drop the anchor and blur so a second Escape
              // reaches the window listener and leaves the tool.
              if (store.tapeAxis) {
                store.setTapeAxis(null);
                return;
              }
              store.clearTapeAnchor();
              input.current?.blur();
            }
```

- [ ] **Step 5: Add the chip style**

In `src/styles.css`, after `.tape-readout-label`:

```css
/* The app's existing "this control is active" idiom, borrowed from
   button[aria-pressed='true'] rather than introduced as a fourth off-palette
   colour — a DOM chip is not a 3D inference marker, and the reasons SnapMarker
   went off-palette (a ~9px disc on walnut) do not reach a text badge on a dark
   panel. */
.tape-readout-axis {
  font-family: var(--font-num);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
  padding: 0 0.4rem;
  border: 1px solid var(--brass-dim);
  border-radius: calc(var(--radius) / 2);
  background: var(--graphite-950);
  color: var(--brass-bright);
}
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx vitest run`
Expected: PASS, whole suite.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run build
git add src/panels/TapeReadout.tsx src/styles.css src/App.test.tsx
git commit -m "feat: the axis chip, and the axis keys inside the distance box

The second handler is forced rather than redundant: App's keydown effect
early-returns on isTextEntry, so once the box has focus its listener never
sees another key — which is why Escape already had a branch here.

The chip is the only confirmation a lock landed until a number is typed,
since with no target there is nothing for the measuring line to draw
against.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `TapeTool` — preview, measuring line, and the locked click

**Files:**
- Modify: `src/viewport/TapeTool.tsx`

**Interfaces:**
- Consumes: `towardFor` (Task 1), `tapeAxis` / `setTapeAnchor` (Task 2).
- Produces: nothing.

**No unit tests in this task, on purpose.** CLAUDE.md: *"The r3f viewport has no unit tests by design — verify it by driving a real browser, not by asserting on mocks."* The arithmetic underneath is already pinned by Task 1; what this task changes is which arguments reach it. Task 7's browser pass is this task's verification, and it is not optional.

- [ ] **Step 1: Subscribe to the axis**

Add `towardFor` to the existing `'../document/document'` import, and the subscription beside `typed`:

```tsx
  // Subscribed, not merely added to a dep list: this component reads `typed`
  // off the store rather than as a prop, and the axis has to arrive the same
  // way. A dep-list entry over a value nothing subscribes to is invariant 15's
  // failure mode wearing the right clothes — the memo would be correct and
  // would simply never re-run.
  const axis = useStore((s) => s.tapeAxis);
```

- [ ] **Step 2: Rewrite the preview memo**

```tsx
  const preview = useMemo(() => {
    if (!anchor) return null;
    // The SAME call TapeReadout's commit() makes. The `!hovered` gate this
    // replaces is exactly what made axis mode draw nothing — the direction no
    // longer has to come from a second feature.
    const toward = towardFor(anchor.at, axis, hovered?.at ?? null);
    if (!toward) return null;
    const distance = parseLength(typed);
    if (distance === null) return null;
    return offsetPoint(anchor.at, toward, distance);
  }, [anchor, hovered, typed, axis]);
```

Leave the long comment block above the memo in place; add one paragraph to it noting that `towardFor` now supplies the direction and that being derived-every-render is what still keeps a fourth held world position from existing.

- [ ] **Step 3: Fix the measuring line's far end**

```tsx
  // Locked with nothing typed yet draws NO line, and that is a decision rather
  // than an omission: the honest thing to draw would be a semi-infinite axis
  // line, which is follow-up 130's construction line and is out of this round's
  // scope (design §8). The readout's axis chip is what confirms the lock. If
  // the browser pass finds this reads as broken rather than as waiting, §9.1
  // names the remedy — a 1" stub to offsetPoint(anchor, toward, 1) — rather
  // than reopening §8.
  const lineEnd = preview ?? (axis ? null : hovered?.at) ?? null;
```

- [ ] **Step 4: Re-anchor instead of placing on a locked click**

In `onPointerUp`, after the existing `if (!hit) { store.clearTapeAnchor(); return; }`:

```tsx
      // LOCKED: a click re-anchors and KEEPS the axis, so walking a row of
      // corners placing a guide 3" up from each is click, type, Enter, click,
      // type, Enter — with the axis pressed once (design §5.2). Placing a guide
      // here instead would mean a click and Enter placing guides in two
      // different positions while one direction is drawn on screen, which is
      // the disagreement the lock exists to prevent.
      if (store.tapeAxis) {
        store.setTapeAnchor(hit);
        return;
      }
      store.addGuide(hit.at);
      store.clearTapeAnchor();
```

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npx vitest run && npm run build`
Expected: PASS, exit 0. No test in the repo drives `TapeTool` — this step is checking that nothing else regressed and that the file compiles.

- [ ] **Step 6: Commit**

```bash
git add src/viewport/TapeTool.tsx
git commit -m "feat: the preview follows the locked axis, and a locked click re-anchors

The preview memo loses its !hovered gate — that gate is precisely what made
axis mode draw nothing — and takes its direction from the same towardFor
call the commit path makes, so the marker and the placement still agree by
construction.

Locked with nothing typed draws no line. The honest alternative is a
semi-infinite axis line, which is follow-up 130's construction line and out
of scope; the readout's chip is the confirmation instead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Browser verification, then the write-up and the merge

**Files:**
- Create: `docs/browser-verification-cardinal-guides.md`
- Modify: `docs/follow-ups.md`
- Modify: `CLAUDE.md`

**Interfaces:** none — this task ships nothing importable.

**Constraint that overrides convenience:** verify against the **dev server**, never production. Sloyd has no server-side state, so `sloyd.autosave.v1` in the user's browser *is* their project, and exercising a feature against production would overwrite it with a demo document with nothing to restore from. Use the Playwright MCP (the only browser tooling that works on this host).

- [ ] **Step 1: Start the dev server**

```bash
cd /home/alec/docker/sloyd && npm run dev -- --port 5188
```

- [ ] **Step 2: Run the checks and screenshot each**

Drive real `page.mouse` / `page.keyboard` input, not synthetic `PointerEvent`s — follow-up 115 records why the previous round re-drove its checks after review caught a report claiming otherwise. Read guide positions out of `localStorage` rather than judging them by eye.

1. **Each axis, at two board postures.** Place a guide 3" along X, Y and Z from a corner of a `flat` board, then repeat from a corner of an `upright` rotated board. Read every placed guide's `at` out of `localStorage` and check it against a hand-derived world coordinate. *Two postures because a flat unrotated board at the origin cannot distinguish a correct mapping from several wrong ones — the trap the cut-points round recorded for local→world.*
2. **A negative distance** placing on the opposite side of the anchor.
3. **An off-grid distance** (`0.01`) landing exactly, with no 1/16" rounding — read from `localStorage`, as the snap-move pass did.
4. **The two-keystroke focus check.** Press `X`, then type `3`, then `5`; confirm the box reads `35`. This is the only check able to distinguish a landed focus from a failed one — a failed focus drops the second character.
5. **`X`/`Y`/`Z` reaching the axis from inside the focused box** (Task 5's branch), which no jsdom test can prove, since the question is which handler the event reaches.
6. **The re-anchor gesture**: press `Y` once, then click, type, Enter, click, type, Enter — two guides, one axis press.
7. **Escape's four rungs**, from the canvas and from inside the box.
8. **Legibility**: the axis chip against the readout panel, and what "locked with nothing typed draws no line" reads as. Both are browser-settled in the sense of follow-up 60. If the no-line state reads as broken, apply §9.1's 1" stub and re-check; if it reads as waiting, record that as the finding.

- [ ] **Step 3: Write the report**

Create `docs/browser-verification-cardinal-guides.md`, following `docs/browser-verification-guide-points.md`'s shape: what was checked, the numbers read out, what was **not** checked, and any negative findings recorded with their evidence rather than as impressions. **Claim only what was actually exercised** — follow-up 108 records a report that stated broader coverage than it had, closed by taking the missing screenshots rather than by narrowing the prose.

- [ ] **Step 4: Update `docs/follow-ups.md`**

- Open a **"From the cardinal guides round"** section, numbering from **146** (verify by reading the file's last entry — the guide-points round started at 130 rather than 129 because a late entry landed after its plan was written; the same can have happened here).
- **Close follow-up 144** in place, with what closed it: the union, the split clears, and the fact that axis mode is what made it stop being cosmetic.
- **Update follow-up 145** from "chosen successor" to shipped.
- **Amend follow-up 130**: cardinal placement has landed, semi-infinite construction lines remain the one genuinely open item there.
- Record §8's non-goals as decisions, and every negative finding from Step 2.

- [ ] **Step 5: Update `CLAUDE.md`**

- Status paragraph: add the round, and update the test count from `npm test`'s actual output rather than by arithmetic.
- Add a **"What the cardinal guides round did"** section in the existing idiom.
- Replace the roadmap paragraph ("The next line of work is GUIDE POINTS IN ARBITRARY CARDINAL DIRECTIONS…") with the shipped write-up — including that its own "central question" collapsed under §2, since that is the kind of thing the next reader would otherwise re-litigate.
- **Where things live**: `snapPoints.ts` gains `towardFor`/`tapeAxisFromKey`/`TapeAxis`; `store.ts` gains `tapeAxis`; `TapeReadout.tsx` gains the chip and the cause-carrying error.
- Note that `CURRENT_VERSION` stays **6** and no migration step was added.

- [ ] **Step 6: Final verification, then merge**

```bash
npx vitest run          # whole suite, record the count
npm run build           # the typecheck gate
```

Then, per CLAUDE.md's working agreements — no pull requests:

```bash
git add -A && git commit -m "docs: the cardinal guides round, its browser pass, and 144 closed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git checkout master
git merge --no-ff feat/cardinal-guides
npx vitest run && npm run build    # verify the MERGED tree, not just the branch
git branch -d feat/cardinal-guides
```

Do **not** deploy. Deployment is a separate decision the user makes, and `DEPLOYMENT.local.md` has to be read first.

---

## Self-Review

**Spec coverage.** §1 → the whole plan. §2 (world axes) → Task 1's `TapeAxis` doc comment. §2.1 (signed distance) → Task 1's tests, Task 4's negative-distance test, Task 7 check 2. §3/§3.1 (`tapeAxis`, not invariant 24, structural rule) → Task 2 entire. §4 (`towardFor`, one source, both call sites) → Task 1 + Task 4 Step 3 + Task 6 Step 2. §4's invariant-25 note → Task 1's off-grid test + Task 7 check 3. §4.1 (preview memo, `lineEnd`, subscription) → Task 6 Steps 1-3. §5.1 (hover inert) → Task 1's "axis wins" test + Task 4's latched-hover test. §5.2 (click re-anchors) → Task 2's survives-a-re-anchor test + Task 6 Step 4 + Task 7 check 6. §6 (two handlers, Escape rung) → Tasks 3 and 5. §7/§7.1 (error union, split clears) → Task 4. §8 (non-goals) → Global Constraints + Task 7 Step 4. §9 (testing) → Tasks 1-7. §9.1 (browser-settled) → Task 7 check 8. No gaps.

**Placeholder scan.** No TBDs. Every code step carries real code. Two steps deliberately instruct a *check* rather than an edit — Task 4's `--alert-bright` token verification and Task 7's follow-up numbering — and both state the fallback explicitly rather than leaving it open.

**Type consistency.** `TapeAxis` is spelled identically in all six files. `towardFor(anchor, axis, hover)` has the same argument order at both call sites (Task 4 Step 3, Task 6 Step 2). `setTapeAxis` takes `TapeAxis | null` everywhere, including Escape's `setTapeAxis(null)` in both Task 3 and Task 5. `tapeAxisFromKey` returns `TapeAxis | null` and is used as a truthiness test in `App` and as a bound value in `TapeReadout`. `TapeError`'s three members are spelled the same in the type, in `ERROR_TEXT` and in all four `setError` calls.

**One known breakage, verified rather than predicted.** `src/App.test.tsx:384` (`does not capture a letter that no other binding claims`) types the literal `'x'`, so Task 3 makes its premise false and it *will* fail. Task 3 Step 5 states the fix — change the fixture's letter, keep the assertion — and flags it as the ninth link in the plan-supplied-expectation chain. Two other fixture choices were made by property rather than by index for the same family of reason: Task 2's point-precise-drop test finds a point that actually moves under the edit (follow-up 141's root cause), and Task 7's browser pass uses two board postures because a flat unrotated board at the origin cannot distinguish a correct local→world mapping from several wrong ones.
