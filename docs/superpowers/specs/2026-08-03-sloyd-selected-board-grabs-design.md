# Snap-move: only the selected board can be grabbed

**Date:** 2026-08-03
**Status:** design, approved
**Schema:** no change — `CURRENT_VERSION` stays 5

## 1. The defect

With the Move tool active, `MoveTool` offers **every** board's snap points as
grab candidates. Boards in a real project touch each other — that is what the
tool is for — so two boards routinely have coincident or near-coincident
points, and `pickSnapPoint`'s tie-break (nearest the camera) then decides which
board the user is about to move. The tie-break is deterministic but invisible:
the marker is drawn at a position both boards share, so nothing on screen says
which one is under it. The user grabs what looks like the right corner, clicks a
target, and the wrong board moves.

The failure is confined to the **grab**. It has no analogue on the target side,
and §3 states why.

## 2. The change, in one sentence

Before a grab, only the **currently selected** board's points are grab
candidates; after a grab, the target set is unchanged.

## 3. Grab is restricted, target is not — and that asymmetry is deliberate

Two coincident *target* points produce the identical delta. Which one
`pickSnapPoint` returns is unobservable: the board lands in the same place
either way. Two coincident *grab* points name two different boards, and the
choice moves one of them. The ambiguity is only harmful on one side, so only one
side is restricted.

Restricting targets as well would be actively wrong: the board you are moving is
by definition the selected one, so a selected-only target set would leave nothing
to snap **to**. Recorded here because "restrict targets too, for symmetry" is the
obvious next reading of §2, and it breaks the tool.

## 4. How the user chooses which board to move

Through the **parts list**, or by selecting before switching to Move. Move mode
stays fully modal: `BoardMesh`'s `selectable` prop stays `tool === 'select'`, and
`Viewport`'s `onPointerMissed` deselect stays gated the same way. Nothing about
the four gates the snap-move round installed changes.

This was chosen over re-enabling board click-to-select while no point is grabbed.
That option would have cost the rule *a modal tool must not change the selection
as a side effect* — it would become *…except while nothing is grabbed* — and it
would have introduced a new ambiguity of its own, since a click on a board face
can also be a click within `PICK_RADIUS_PX` of a snap point.

Consecutive moves of one board already work without touching the parts list:
`commitSnapMove` selects the board it just moved (`store.ts:178`).

## 5. `MoveTool.tsx` — the candidate set

Today:

```ts
const candidates = useMemo(() => {
  const all = boards.flatMap(boardSnapPoints);
  return grabbed ? all.filter((p) => p.owner.id !== grabbed.owner.id) : all;
}, [boards, grabbed]);
```

After: the two phases build two different sets rather than one set with a filter.

- **No grab:** the selected board's points only. `selectedId === null` yields an
  empty array — no markers, nothing pickable, and `pickSnapPoint` correctly
  returns `null` for an empty candidate list.
- **Grab live:** unchanged — every board's points minus the grabbed board's own.
  The existing filter stays exactly as written, including its comment: it is
  still what makes the self-snap exclusion legible in the UI rather than silently
  ignored on click.

**The dep list gains `selectedId`.** This is invariant 15's exact failure mode
and this repo has shipped it once: a hand-written dependency array that omits a
field the memo now reads. The symptom here would be markers still drawn on the
*previously* selected board while `selectedId` is correct in the store and the
properties panel shows the new board — i.e. it would look like it worked.

Interaction with the guide-points design
(`2026-08-03-sloyd-guide-points-design.md` §3.1), which is specced but not yet
implemented: that design filters grabbable candidates to **board-owned** points,
so a guide can be snapped *to* but never *from*. This round's rule subsumes it —
points owned by the selected board are board-owned by construction. When guides
land, §3.1's filter and this one are one expression, not two; whichever ships
second should not add a second filter beside the first.

## 6. `store.ts` — keeping "the grabbed board is the selected board" true

A grab must not survive the selection moving to a different board. Without this,
the user retargets the tool in the panel and the tool keeps carrying a point
belonging to a board the panel is no longer showing.

### 6.1 Two sites, not an enumeration

`selectBoard` is not the only writer of `selectedId`. `edit()` takes an optional
`selection` callback (`store.ts:80`, applied at `:97`), and `addBoard`
(`:192-195`) and `duplicateBoard` both use it to select the board they just
created. So: grab a point on board A, click **+ Add board**, and `selectedId`
moves to the new board while `grabbed` still names A — the exact state this
section exists to prevent, reached through a toolbar button that nothing gates in
Move mode.

The remaining writers already handle it: `replaceDocument`, `undo` and `redo`
null `grabbed` unconditionally; `deleteBoard` nulls it conditionally;
`commitSnapMove` writes `selectedId` and nulls `grabbed` in the same `set`.

So two sites cover every path:

1. **inside `edit()`**, where the `selection` callback's result is applied — clear
   `grabbed` when the resulting selection is not the grabbed board's id;
2. **`selectBoard`** — the same rule.

Writing the rule at `edit()` rather than at each caller is what makes a *future*
action that selects something new inherit the behaviour instead of depending on
its author remembering.

### 6.2 The guard in `commitSnapMove`

```ts
if (grabbed.owner.id !== get().selectedId) return;
```

Deliberately redundant with §5's candidate filter and §6.1's clearing, and it
earns its place the same way the existing self-snap guard does: *the filter makes
the rule true of the UI, the guard makes it true of the action.* If a sixth
`selectedId` writer appears and misses §6.1, the worst outcome is a grab that
refuses to commit, not a board that moves without the user knowing which one.

It sits **after** the existing `if (!grabbed) return;` and beside the self-snap
guard, before the board lookup and before any `edit()` — no undo entry, no redo
clear. It does not null `grabbed`: the state it detects should be unreachable, and
silently discarding the grab on the way past would make it unreachable *and*
undiagnosable.

### 6.3 CLAUDE.md invariant 24

This joins invariant 24's **second** list — the one that already reads *"this
list is not everything that nulls `grabbed`: `setTool`, `cancelGrab`,
`commitSnapMove` itself … all do too, for their own reasons."* Not the enumerated
five. Those five are there because **the world moved** under a captured position;
this one is because **the user retargeted the tool**, which is a different reason
and stays a different reason. The invariant's own test for its first list — *does
this action rewrite `doc.boards` wholesale* — is unchanged.

## 7. `Toolbar.tsx` — the empty-selection hint

In Move mode with nothing selected, no point is grabbable and no marker ever
appears, so the tool reads as broken rather than as waiting. A short hint appears
beside the tool pair when `tool === 'move' && !selectedId`:

> Select a part to move

The Move button stays **enabled**. Disabling it was considered and rejected: it
takes a control away to explain a state, and it needs its own rule for what
happens when the selected board is deleted while the tool is active. With the
hint, that case needs no rule — `deleteBoard` already clears both `selectedId`
and `grabbed`, so the app lands in the hinted state on its own.

The hint is derived from store state at render, holds nothing, and is not part of
the document.

## 8. Testing

Split explicitly, because half of this is in a file the repo does not unit-test
by design.

**Unit tests (store):**
- selecting a different board while a point is grabbed clears the grab —
  through `selectBoard`, and through `addBoard`/`duplicateBoard`'s `edit()` path;
- re-selecting the **same** board does not clear it;
- `commitSnapMove` is a no-op — no document change, no undo entry, no redo clear —
  when `grabbed.owner.id !== selectedId`;
- the existing snap-move store tests still pass unchanged, since the normal path
  always has the two in agreement.

**Browser verification (dev server, per the repo's viewport rule):**
- with a board selected, markers appear on that board only, and hovering a
  coincident point on a neighbouring board produces no marker;
- with nothing selected, no marker appears anywhere and the toolbar hint shows;
- the ambiguity itself: two boards sharing a corner, the wrong one no longer
  moves;
- after a grab, points on other boards are offered as targets as before, and a
  move lands exactly (read out of `localStorage`, not judged by eye — the same
  method the snap-move round used).

`npm run build` is the typecheck gate; `npm test` does not typecheck.

## 9. Non-goals

- **No multi-board moves.** Still one board per gesture — a selection-model
  change, not a tool change (follow-up 103).
- **No click-to-select in Move mode** (§4).
- **No change to the target set** (§3).
- **No gizmo in Move mode**, no change to any of the four gates the snap-move
  round installed.
- **No schema change.**
