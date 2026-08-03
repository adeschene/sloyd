# Guide points and the tape measure — design

A third tool: anchor on a snap point, hover a second one to read the distance
between them, and place a persistent **guide point** — at the hovered point, or
at any distance along the ray between them. Guide points are themselves snap
candidates, so the Move tool can snap a board onto one.

> **STATUS as of 2026-08-03, end of day: REVISED against the code as it stands,
> and now current.** This design was written before the selected-board grabs round
> and the cut-aware snap points round shipped, was deferred by one round behind the
> latter, and has been rewritten here against the merged result. Four sections
> changed and one is new:
>
> - **§3 is materially different.** The widening no longer breaks four store reads
>   that each need a runtime narrowing — it breaks *eight*, and the answer is a
>   type (`BoardSnapPoint`) rather than eight checks. Read it fresh; the old §3 is
>   not a subset of the new one.
> - **§3.1 is discharged rather than merged.** Its board-owned filter no longer
>   needs to exist at all: the pre-grab branch is already the *selected board's*
>   points, which are board-owned by construction. Adding a filter there would be
>   the dead-code-that-reads-as-load-bearing shape of follow-ups 113 and 125.
> - **§4 gained three actions and one prohibition.** Cut edits can destroy the
>   feature under an anchor now that a shoulder is anchorable; the two
>   *selection*-based clears must deliberately NOT touch the anchor.
> - **§5 had a false sentence** about `snapPoints.ts`'s imports, and understated
>   what the tape can measure to. §5.1 gains hover feedback.
> - **§10 is new**: guides make zero-separation coincident candidates reachable on
>   the round's most common path.
>
> Unchanged and still current: the whole of §1, the v6 migration argument in §2,
> §6, §7 and §9's scope cut.

Chosen 2026-08-03, immediately after the snap-move round shipped and deployed.
This is the successor snap-move's §8 named: the user identified the tape
measure, guide points and guide lines as the intended follow-ups when they
asked for the Move tool in the first place (follow-up 105). **Guide lines are
not in it** — see §9.

Snap-move's §2.3 is the interface this round lands through, and it discharges
its obligation exactly as designed: the picker's signature does not move.

---

## 1. What this adds

One new tool, modal, in the toolbar beside the pair snap-move added:

```
[ + Add board ] [ Cut list ] | ↶ ↷ | [ Select ][ Move ][ Tape ] | [ Orthographic ] ☐ Grid ☐ Origin ☐ Guides
```

With **Tape** active:

1. Hovering the viewport marks the single nearest snap point within
   `PICK_RADIUS_PX` — the same `pickSnapPoint`, the same markers as Move.
2. Clicking it sets the **anchor**.
3. Hovering elsewhere marks a second point and shows the distance between the
   two in an overlay box in the viewport corner, with a dashed line drawn from
   the anchor to the hovered point.
4. **Clicking** places a guide point at the hovered position.
   **Typing a length and pressing Enter** places one at
   `anchor + normalize(hover − anchor) × typed` instead.

No button is held between the two clicks, for the same reason snap-move chose
click-move-click: the camera stays fully usable mid-measurement, so you can
orbit to find the point you are aiming at and the anchor survives it.

### 1.1 The typed distance is one subtraction, not three cases

The value typed is a distance **from the anchor, along the anchor→hover ray**.
It is not an adjustment to the measured length, and the three things a user
might want are not three code paths:

| Typed | Where it lands |
|---|---|
| less than the measured distance | between the anchor and the hovered point |
| more | past the hovered point, on the same ray |
| negative | backward from the anchor, away from the hovered point |

All three fall out of `anchor + dir × d` with `d` free. `parseLength` already
accepts a leading `-`, so the negative case needs no new parsing.

Getting the midpoint therefore means reading `12"` off the overlay and typing
`6"`. A proportional syntax (`1/2`, `50%`) was considered and **rejected**:
`parseLength` already reads `1/2` as half an inch, so the two syntaxes collide
and only `%` would be unambiguous — a second meaning for one field, to save
arithmetic the user does once per guide with the answer already on screen. The
overlay stays a plain fractional-inch field, identical to every other length
input in the app.

### 1.2 The zero-length direction is refused, not normalized

If the hovered point coincides with the anchor, `hover − anchor` is the zero
vector and normalizing it yields `NaN` on every component. That is not a
theoretical case: it is what happens the moment the cursor comes back to the
point it started on, which costs one mouse movement.

`offsetPoint` returns `null` for it, and the tool places nothing. This is the
same shape as `commitSnapMove`'s zero-delta guard — a guard with a named
failure mode, not defensive habit — except that snap-move's guard prevents a
no-op undo entry, and this one prevents `NaN` coordinates entering the
document, which no validator downstream would catch as anything but a number.

---

## 2. Schema v6

```ts
export interface GuidePoint {
  id: string;
  /** World position, inches. */
  at: [number, number, number];
}

export interface SloydDocument {
  version: number;
  name: string;
  units: { display: 'imperial-fractional'; precision: number };
  stock: { kerf: number };
  guides: GuidePoint[];
  boards: Board[];
}
```

A guide point has no name. Its position is what identifies it, and inventing a
naming scheme would drag in `uniqueName`, the four-place uniqueness enforcement
of invariant 8, and a rename field — for a marker whose only job is to be
somewhere.

### 2.1 Document-level, so it takes `stock`'s migration shape and not `boards`'

`guides` is a document-level field, like `stock` and `units.precision` and
unlike `rotation`, `posture` and `cuts`. So, exactly as the sheet-nesting round
established for `stock`, the v5→v6 step has **no `rawBoards.map` call at all**.
It is read defensively off the raw document and defaulted to `[]` when absent
or not an array.

This is the second instance of that shape, and stating it as the pattern for
document-level fields is the point: the four `rawBoards.map` steps
(`foldRotationToV2`, `addPostureToV3`, `addCutsToV4`) exist because
`validateBoard`'s fallback for a missing field is a legal-but-wrong value
rather than an absence (invariant 11). There is no per-board version of a
guide, so that hazard does not exist here.

### 2.2 The bump's argument is NOT v5's, and copying v5's wording would be wrong

The v4→v5 bump had a specific justification: a v4 build would open a file
carrying a user-set kerf, silently drop the field, and **print a different
sheet count** than the build that saved it — a wrong purchasing number with
nothing on the page indicating anything was lost.

Guides produce no number. Nothing on the cut list, in the nesting or in the
board-feet totals reads them, and a build without them prints exactly what a
build with them prints. The argument here is plainer: **silent data loss on
round-trip.** A v5 build opens a v6 file, drops every guide the user placed,
autosaves, and the guides are gone — with the same absence of any indication.

That is a weaker consequence than a wrong purchasing number and it is still
what the gate is for. It is stated here rather than inherited because
CLAUDE.md currently asserts a v6 bump without giving a reason, and the next
person to add a document-level field should be reading which of these two
arguments applies to theirs.

The bump is, as with v5, **not needed to upgrade an old file** — an absent
`guides` defaults to `[]` cleanly regardless of `CURRENT_VERSION`.

### 2.3 Malformed guides are dropped, never refused

`validateGuide` keeps a guide whose `at` is three finite numbers and whose `id`
is a non-empty string; anything else is dropped from the array. A malformed
guide does not make `migrateDocument` throw.

This follows `validateCuts`' rule and its reason: a saved document must always
open. The asymmetry with the panel is the same one joinery established — the
panel refuses out-of-range entry outright, because silently correcting a number
the user just typed loses a measurement, while a file already on disk has to
load.

A guide has no nearest-legal-value to clamp toward the way a cut does, so
dropping is the only available repair.

**Guide ids are not deduplicated,** and this is a knowing choice rather than an
oversight. Follow-up 97 records that board `id` uniqueness became load-bearing
in the sheet-nesting round while never being enforced the way `dedupeNames`
enforces names. Guides inherit the same exposure: a duplicate id would make
`removeGuide` delete two rows at once and give React two identical keys.
Enforcing it here without enforcing it for boards would be the inconsistent
half-measure; the spec records the exposure and leaves both to whichever round
closes 97.

---

## 3. Widening `SnapOwner` — eight reads break silently, and a type fixes all of them

```ts
export type SnapOwner =
  | { type: 'board'; id: string }
  | { type: 'guide'; id: string };
```

This is the union working as intended. It is also the round's single most
dangerous edit, because **every existing consumer keeps typechecking while
quietly meaning something else.** Both members carry a field named `id` of type
`string`, so `owner.id` remains valid on the widened union and TypeScript
reports nothing.

The count has grown since this design was first written. Eight reads assume
`owner.id` names a board — five of them added by the two rounds that shipped
between the writing and now:

| Site in `src/store/store.ts` | What it assumes | Added by |
|---|---|---|
| `edit()`'s `dropGrab`, `heldGrab.owner.id !== nextSelectedId` | the grab names a board that could be selected | selected-board grabs |
| `dropGrabIfGone`, `grabbed.owner.id !== boardId` | the grab names a board with cuts | cut points |
| `commitSnapMove`, self-snap guard | both sides name boards | snap-move |
| `commitSnapMove`, `grabbed.owner.id !== get().selectedId` | the grab names the selected board | selected-board grabs |
| `commitSnapMove`, `doc.boards.find(b => b.id === grabbed.owner.id)` | a lookup that would silently take its not-found path | snap-move |
| `updateBoard`'s conditional grab-clear | never matches a guide-owned grab | snap-move |
| `deleteBoard`'s conditional grab-clear | never matches a guide-owned grab | snap-move |
| `selectBoard`'s conditional grab-clear | never matches a guide-owned grab | selected-board grabs |

### 3.0 The answer is a narrower type, not eight narrower checks

Writing `owner.type === 'board' &&` in front of eight comparisons would work,
and it would be wrong in the way this design already objects to: seven of those
eight are correct *by accident* even unfixed, because a guide-owned value can
never be `grabbed` — and **an accident that holds only because of an invariant
enforced two modules away is exactly the kind of thing the next round breaks.**
A comment cannot enforce that. A type can.

```ts
/**
 * A snap point that belongs to a board — the box lattice and the cut-owned
 * points, which is everything both providers under `document/` produce.
 *
 * Exists so that `grabbed` can be typed as one. The Move tool grabs boards and
 * targets anything (§3.1), and this is what makes the grab half of that rule
 * checkable rather than remembered.
 */
export type BoardSnapPoint = SnapPoint & { owner: { type: 'board'; id: string } };
```

Four signatures move, and nothing else does:

- `boardSnapPoints`, `cutSnapPoints` and `snapPointsFor` return
  `BoardSnapPoint[]`. Each already produces exactly that; only the annotation
  is new.
- `pickSnapPoint` becomes generic — `<T extends SnapPoint>(candidates: T[], …)
  => T | null`. It never reads `owner`, so this is three type positions and no
  logic. The payoff is that picking from a board-only candidate array yields a
  `BoardSnapPoint`, which is what makes the grab call typecheck with no runtime
  test.
- `grabbed: BoardSnapPoint | null` and `grabSnapPoint(point: BoardSnapPoint)`.
- `tapeAnchor` stays `SnapPoint | null`, and **the difference between the two
  fields is now the documentation**: the one that can hold a guide is the one
  typed to. That is the property no comment achieves.

All eight reads above then compile unchanged and are correct by construction.
**One runtime narrowing survives**, in `commitSnapMove`'s self-snap guard,
because it is the one comparison where the other side genuinely can be a guide:

```ts
if (target.owner.type === 'board' && target.owner.id === grabbed.owner.id) return;
```

Without the `type` test, a guide whose id happened to collide with the grabbed
board's would read as a self-snap and the move would be silently refused.

Two consequences worth stating so they are not read as gaps:

- **The "a guide-owned grab must be declined" case stops being testable, and
  that is the win.** An earlier draft of the plan specified a store test
  handing `commitSnapMove` a guide-owned `grabbed`. Under this design that state
  cannot be constructed in TypeScript at all, so the test is deleted rather than
  rewritten — the same reasoning follow-up 118 records for a requested test
  whose premise did not reproduce. Do not add a runtime `if (grabbed.owner.type
  !== 'board')` guard to `commitSnapMove` to make the test writable again.
- **`MoveTool`'s grab call needs one narrowing at the point of entry** — see
  §3.1, which is where the rule now lives in full.

`sameSnapPoint` needs no change: it already compares `owner.type` alongside
`owner.id`.

### 3.1 Move grabs boards; it targets anything — and the filter this used to ask for already exists

**This section previously said `MoveTool` must filter its grabbable candidates
to board-owned points. It must not: that filter would be dead code.** The
selected-board grabs round rewrote the memo into two branches, and the
cut-points round widened both:

```ts
const candidates = useMemo(() => {
  if (grabbed) {
    return boards.flatMap(snapPointsFor).filter((p) => p.owner.id !== grabbed.owner.id);
  }
  const selected = boards.find((b) => b.id === selectedId);
  return selected ? snapPointsFor(selected) : [];
}, [boards, grabbed, selectedId]);
```

The pre-grab branch is *one selected board's* points. Those are board-owned by
construction, so **`guides` belongs only in the post-grab branch** and the
pre-grab branch needs no edit at all beyond a comment. Stacking a board-owned
filter on top of a rule that is already narrower would be two predicates that
agree today and two places for a future rule to disagree — follow-ups 113 and
125 exactly, and 125 is discharged by this paragraph rather than by any code.

So the round's edit to this memo is:

```ts
    return [
      ...boards.flatMap(snapPointsFor).filter((p) => p.owner.id !== grabbed.owner.id),
      // Guides are TARGETS, never grab sources — hence this branch only. The
      // pre-grab branch is the selected board's points, board-owned by
      // construction, so the rule needs no filter to be true there.
      ...(showGuides ? guideSnapPoints(guides) : []),
    ];
```

with `guides` and `showGuides` joining the dependency list **beside the existing
`selectedId`, not replacing it** — dropping it is invariant 15's failure mode and
would look like it worked.

The grab call in `onPointerUp` takes the one narrowing §3.0 leaves:

```ts
      if (!store.grabbed) {
        // Board-owned by construction (the pre-grab branch), and checked
        // anyway, because this is the one place a SnapPoint becomes a
        // BoardSnapPoint. Deliberately redundant in the same sense as
        // commitSnapMove's self-snap guard: the memo makes the rule true of
        // the UI, this makes it true of the type.
        if (hit && hit.owner.type === 'board') store.grabSnapPoint(hit);
        return;
      }
```

You snap a board onto a guide; you never snap a guide onto a board. A guide
point is not itself movable in this round. Repositioning a guide means deleting
it and placing another, which is two clicks for a marker that took two clicks
to create.

---

## 4. The tape anchor is a second instance of invariant 24

Invariant 24 says: a grab holds a world position, so anything that moves the
boards under it must drop it. `grabbed.at` is `[x, y, z]` captured at grab
time, not a live reference, so five store actions clear it.

**The tape anchor is the same kind of thing.** `tapeAnchor` is a `SnapPoint`
captured at click time; the distance shown in the overlay and the direction the
typed offset runs along are both derived from `tapeAnchor.at`. If the board
under it moves, the readout measures from a position that no longer describes
anything, and a guide placed from it lands somewhere the user did not point at.

So `tapeAnchor` gets the same treatment, plus two more actions that `grabbed`
does not need — and, since the cut-points round shipped, the three cut edits as
well:

| Action | Clears `grabbed` | Clears `tapeAnchor` |
|---|---|---|
| `undo`, `redo` | yes | yes |
| `replaceDocument` | yes | yes |
| `deleteBoard` (conditional) | yes | yes |
| `updateBoard` (conditional) | yes | yes |
| `addCut`, `updateCut`, `removeCut` (point-precise) | yes | **yes** |
| `removeGuide` (conditional) | n/a — a grab is never guide-owned | **yes** |
| `clearGuides` | n/a | **yes** |
| `setTool` | yes | yes |
| `edit()`'s selection callback | yes | **NO — see below** |
| `selectBoard` | yes | **NO — see below** |

`removeGuide` and `clearGuides` are reachable for the obvious reason: the guides
list is not disabled while the tape is anchored, so deleting the guide you
anchored on is one click away.

### 4.1 The cut edits, which this design predates

Invariant 24's third clause — added by the cut-points round — is that
`addCut`/`updateCut`/`removeCut` can destroy the *feature underneath* a held
point rather than moving the board out from under it, so they clear
**point-precisely** via `dropGrabIfGone(boardId)`: the grab survives iff the
point it holds is still among that board's `snapPointsFor` output after the
edit.

A tape anchor can sit on a dado shoulder for exactly the same reason a grab can,
so it needs exactly the same treatment. **Generalise `dropGrabIfGone` to test
both held points against the one predicate rather than writing a second copy of
it** — two functions computing `snapPointsFor(board)` and comparing with
`sameSnapPoint` are two places for a future rule to disagree, which is
follow-up 113's shape applied before it can bite. The board-id guard at the top
already makes a guide-owned anchor fall through untouched, which is correct: a
cut edit cannot affect a guide.

### 4.2 The two clears the anchor must NOT inherit

`edit()`'s selection callback and `selectBoard` both drop a grab, and the
reason is specific to the Move tool: its grab candidates are the *selected*
board's points, so a selection landing elsewhere means the user retargeted the
tool and the point in hand is one they could no longer have picked up.

**None of that reaches the tape.** The tape offers every board's points as
anchors — measuring from one board to another is the ordinary case, and it is
most of what the tool is for. Clearing the anchor when the selection changes
would break the tool for its main use, and it would do so invisibly, since
nothing about the gesture involves selecting anything.

This is stated as a prohibition rather than left as an absence because "add
`tapeAnchor: null` beside every `grabbed: null`" is precisely what a tidying
pass would do, and it would look like consistency.

### 4.3 This is why `tapeAnchor` lives in the store

It cannot get that clearing anywhere else. A `useState` inside `TapeTool` would
have to subscribe to every one of those seven actions and re-derive when to
drop itself — the exact bookkeeping invariant 24 exists to avoid.

That reasoning is the same one snap-move used for `tool` and `grabbed`, and it
still does not reach `shortcutsSuspended`, which stays prop-drilled: that flag
is local view state nothing else in the store has to react to. `showGuides`
(§6) joins `shortcutsSuspended`, not `tapeAnchor` — read the three together as
one rule applied to three different fan-outs.

---

## 5. Two providers, one picker

```ts
export function guideSnapPoints(guides: GuidePoint[]): SnapPoint[];
```

One candidate per guide, `owner: { type: 'guide', id }`. `boardSnapPoints` and
`cutSnapPoints` are untouched, and `pickSnapPoint` gains only the generic
parameter §3.0 describes — both tools concatenate the providers' output and hand
the picker one array.

This is §2.3 discharging exactly what it was written for, and it is worth noting
how little happened: the round that was supposed to justify a discriminated union
added a nine-line function and one union member. The cut-points round has since
exercised the same interface once for real, as a second provider *over boards*;
this is the first one that is not.

**The tape measures to everything, which since the cut-points round means
`snapPointsFor`, not `boardSnapPoints`.** `TapeTool`'s candidate set is
`boards.flatMap(snapPointsFor)` plus the guides, with nothing withheld — there
is no self-snap case to exclude, because measuring from one corner of a board to
another corner of the *same* board is an ordinary thing to want and placing a
guide there is exactly what the tool is for. Using `boardSnapPoints` alone would
silently make the tape unable to measure to a dado shoulder, which is one of the
two things this round and the last one unlock together.

**`snapPoints.ts`'s imports.** An earlier version of this section claimed the
module imports only `./types` and `./geometry`. That stopped being true in the
cut-points round, which added `./cuts` (for the `Point` type and `stockProbe`).
What is still true, and is the part that matters, is the boundary this design
does not cross: `snapPoints.ts` does **not** import `../units`. A guide point
carries no printed string, so the `formatLength` edge that `cutlist.ts`,
`diagram.ts` and `nesting.ts` all take stays untaken here. The guides *list*
formats coordinates (§7), and it lives in `panels/`, which may.

### 5.1 A fourth `SnapKind`

`SnapKind` gains `'guide'`. A guide is not a corner, an edge midpoint or a face
centre, and colouring it as one of those would tell the user something false
about what they are about to snap to — which is the marker's only job.

That means a fourth off-palette colour beside corner green, edge-midpoint cyan
and face-centre violet. Like those three it is **browser-settled in the sense of
follow-up 60**, not test-settled: legibility on the near-white ground, on
walnut, and against the other three markers at ~9 px is a judgement a test
cannot make. The spec proposes one and the verification pass is what confirms
or retunes it.

Worth reading against follow-up 121, which *rejected* a fourth kind for cut
points, because the two decisions look contradictory and are not. There the
argument was that hue encodes which *kind* and position encodes which *feature*,
and a dado shoulder is a corner — a new colour would have said something the
marker's location already said. A guide is not a corner, an edge midpoint or a
face centre of anything; it is a position the user placed. Same rule, opposite
answer, because the thing being named is genuinely different.

### 5.2 A guide draws differently when it is resting than when it is hovered

Every other snap point exists only while hovered, so its marker appearing *is*
the confirmation that it is what you are about to snap to. A guide is drawn
whenever guides are shown, which takes that signal away: hover one and nothing
changes, so there is no moment at which the tool says "this one."

So `SnapMarker` takes a `resting` variant, drawn smaller and without the ring;
the hovered and grabbed marker is unchanged. A guide under the cursor therefore
grows into exactly the marker every other kind of point uses, which is the
confirmation the rest of the tool already gives.

The resting size is one more **browser-settled constant** in follow-up 60's
sense — it has to stay legible enough to aim at while staying quiet enough that
a document with a dozen guides does not read as noise. The spec proposes it and
the verification pass confirms or retunes it. This is the one place the round
touches `SnapMarker`'s geometry rather than only its palette.

---

## 6. The Guides checkbox gates candidates, not just pixels

`showGuides` sits beside Grid and Origin, as local view state in `App` —
outside the document and the undo stack, same as those two.

Worth stating explicitly because it is not only a render: **while guides are
hidden they offer no snap candidates**, in either tool. A marker appearing over
an invisible point is the same defect the snap-move round avoided by skipping
the volume centre — an inference indicator hanging where nothing is drawn,
which is the opposite of its job.

---

## 7. The guides list

A section under the parts list. One row per guide showing its coordinates
through `formatLength` at the document's precision, an `×` per row, and a
Clear all.

**No selection model.** No `selectedGuideId`, no Delete-key path, nothing
touching `selectedId`. The list exists to remove guides; adding selection would
mean deciding what a selected guide shows in the properties panel, which is a
panel for boards.

This also sidesteps invariant 21's trap rather than meeting it in a browser.
`THREE.Line` raycasting registers a hit only within
`raycaster.params.Line.threshold` — one inch here — of a drawn line, and a
guide point's marker is smaller than a board. Click-the-guide-in-the-viewport
is a known-bad hit target, recorded before anyone builds it.

---

## 8. Testing

Pure and unit-tested:

- `guideSnapPoints` — one candidate per guide, correct owner and kind.
- `offsetPoint(anchor, hover, distance)` — below, above and negative against
  the measured distance, and the zero-length-direction `null` (§1.2).
- The v5→v6 migration — an absent `guides` defaults to `[]`; a v1 file still
  walks the whole chain; a v6 file round-trips.
- `validateGuide` — a non-finite coordinate, a two-element `at`, a blank id,
  a non-array `guides`.
- `commitSnapMove`'s surviving narrowing — a **guide** target whose id collides
  with the grabbed board's must move the board rather than reading as a
  self-snap. That is the one ownership case still expressible in TypeScript;
  §3.0 explains why the other seven are not, and why the test that would have
  covered them is deleted rather than rewritten.
- `tapeAnchor`'s clearing — every row of §4's table, **including the two "NO"
  rows**. A test that a selection change *leaves the anchor alone* is what stops
  a later tidying pass from adding the clear.

### 8.1 What a test cannot settle here

The repo's standing rule holds: the r3f viewport is verified by driving a real
browser, not by asserting on mocks. That covers how the tool feels, the fourth
marker colour, the overlay's legibility and placement, and whether the dashed
measuring line reads against the grid.

Verification runs against the **dev server**, never production. Sloyd has no
server-side state, so `sloyd.autosave.v1` in the user's browser *is* their
project; exercising a new tool against production would overwrite it with a
demo document and there is nothing to restore from.

Follow-up 106's bound applies again and should be restated in the report rather
than rediscovered: every interaction a Playwright pass drives here is a
synthetic `PointerEvent` at a screenshot-located pixel, because snap points
have no DOM presence. Real pointer-capture, touch and OS input timing go
unexercised.

Follow-up 26a's bound applies to anything shader-adjacent: this host runs
software GL (llvmpipe), which returns `1.0` for `pow(0.0, 0.0)` where real
hardware returns `NaN`. Nothing in this round is obviously shader-dependent,
but the dashed measuring line borrows from the grid's screen-stable dash
scaling, which is.

---

## 9. Non-goals

Each looked at and deferred, with a reason.

- **Guide lines.** Designed into this round and then removed at the user's
  direction mid-brainstorm, which makes the reason worth recording rather than
  leaving as an absence: a segment drawn between two guide points is redundant
  with the points themselves. Its only new contribution would have been its own
  midpoint as a candidate, and that is reachable by anchoring on one end and
  typing half the measured distance. Removing it also collapsed the schema to
  one shape, dropped a line renderer, and made line-line intersections — the
  case `SnapOwner` would have had to grow a two-owner member for — not arise.
- **Semi-infinite construction lines.** The user's original mental model:
  axis-parallel lines bounded to `SCENE_EXTENT` the way the grid is. Set aside
  with guide lines, and for the same judgement — points with typed offsets may
  simply be enough in practice.
- **Moving or editing an existing guide.** Delete and re-place. A guide is two
  clicks to create; a drag-to-reposition gesture would need its own tool mode,
  its own gates, and a decision about whether it participates in undo
  coalescing.
- **Guides in the cut list, the nesting or the board-feet totals.** A guide is
  an annotation, not stock. Nothing on the printed sheet should change because
  one exists.
- **Guides as Move-tool grab sources** (§3.1).
- **Cut-aware snap points** (follow-up 99). **SHIPPED** — this entry is history.
  It landed first, as a second provider rather than a picker change, exactly as
  predicted. What it changes for this round is listed in the STATUS block; the
  one substantive consequence is that the tape must read `snapPointsFor` (§5).
- **Snapping to the origin, to grid intersections or to the ground plane.**
  Unchanged from snap-move's §8 — all are providers, all are cheap, none is
  needed here.

---

## 10. Coincident candidates, accepted with their numbers

Follow-up 123 records the cut-points round's honest negative result: at the
default camera a dado's floor corner and its mouth corner project **3.6 px**
apart, both `corner` and so both the same green, against a ~9 px marker — and no
pick radius can separate two candidates that close, because any radius large
enough to aim with contains both. The remedy is zoom.

**Guides make the degenerate version of that reachable on this round's most
common path.** Placing a guide at a board corner — check 3 of the verification
pass, and the obvious thing to do with the tool — puts two candidates at
*identical* world positions from then on. Not 3.6 px apart: zero. Their screen
distance ties and their NDC depth ties, so `pickSnapPoint`'s depth tie-break is
fully degenerate and the winner falls to concatenation order.

**Accepted, not fixed**, and the reason is that only one observable thing is
arbitrary:

- **Pre-grab in Move mode**, a guide is not a candidate at all (§3.1), so there
  is nothing to tie.
- **Post-grab, and in Tape mode**, the two candidates are at the same position,
  so whichever wins produces the identical delta or the identical measurement.
  The board lands in the same place; the tape reads the same number.
- **Only the marker's hue is arbitrary** — guide blue or corner green,
  decided by concat order.

That is follow-up 120's shape (two coincident candidates differing in kind, so
the colour is decided by the tie-break) rather than follow-up 123's (two
*distinguishable* candidates too close to aim between). It is recorded here as a
decision so that a future round reading a flickering marker reaches for a
deterministic ordering rule — which is what 120 already names as the fix — and
not for a de-duplication step, which would delete a real candidate.

A guide placed at a corner is also the case where §5.2's resting-versus-hovered
distinction does the most work: the resting guide marker is visibly there before
the pick, so the user can see that two things occupy the pixel.
