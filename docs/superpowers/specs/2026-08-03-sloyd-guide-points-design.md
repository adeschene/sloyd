# Guide points and the tape measure — design

A third tool: anchor on a snap point, hover a second one to read the distance
between them, and place a persistent **guide point** — at the hovered point, or
at any distance along the ray between them. Guide points are themselves snap
candidates, so the Move tool can snap a board onto one.

> **STATUS as of 2026-08-03, later the same day: DEFERRED BY ONE ROUND — not
> cancelled, and not in flight.** Cut-aware snap points (follow-up 99) were moved
> ahead of this work; see CLAUDE.md's "next line of work" section for the three
> reasons. Two consequences for whoever picks this design back up:
>
> 1. **§3.1 is out of date and must be rewritten before the plan is executed.** It
>    filters grabbable candidates to *board-owned* points. The selected-board grabs
>    round (shipped 2026-08-03) narrowed that branch to the *selected* board's
>    points, and the cut-points round will widen the same branch to two providers.
>    Merge all of it into one predicate rather than stacking filters — see
>    follow-up 113.
> 2. **Nothing else in this design is known stale**, including the v6 migration
>    argument, the `tapeAnchor` treatment in §4, and the §9 scope cut. Cut points
>    make no schema change and add no document state, so they cannot invalidate any
>    of it.

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

## 3. Widening `SnapOwner` — four reads break silently

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

Four reads in `src/store/store.ts` are affected:

| Line | Today | After the widening, unfixed |
|---|---|---|
| 148 | self-snap guard, `target.owner.id === grabbed.owner.id` | compares a guide id against a board id |
| 150 | `doc.boards.find(b => b.id === grabbed.owner.id)` | a guide-owned grab finds nothing and takes the board-not-found path silently |
| 216 | `updateBoard`'s conditional grab-clear | never matches a guide-owned grab |
| 281 | `deleteBoard`'s conditional grab-clear | never matches a guide-owned grab |

Each must narrow on `owner.type === 'board'` explicitly rather than relying on
`id` being present. Lines 216 and 281 are correct *by accident* after the
widening — a guide-owned value can never be `grabbed` (§3.1) — but they are
still written as though `owner.id` names a board, and an accident that holds
only because of an invariant enforced two modules away is exactly the kind of
thing the next round breaks.

`sameSnapPoint` needs no change: it already compares `owner.type` alongside
`owner.id`.

### 3.1 Move grabs boards; it targets anything

`MoveTool` filters its **grabbable** candidates to board-owned points, and
offers **all** candidates as targets. You snap a board onto a guide; you never
snap a guide onto a board.

This is what makes `grabbed` board-owned by construction, which is in turn what
makes lines 216 and 281 above correct. Stating the rule in one place — the
candidate filter — rather than leaving it implied by four narrowings is the
same division snap-move already used for its self-snap case: the filter makes
the rule true of the UI, the narrowing makes it true of the actions.

A guide point is not itself movable in this round. Repositioning a guide means
deleting it and placing another, which is two clicks for a marker that took
two clicks to create.

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
does not need:

| Action | Clears `grabbed` | Clears `tapeAnchor` |
|---|---|---|
| `undo`, `redo` | yes | yes |
| `replaceDocument` | yes | yes |
| `deleteBoard` (conditional) | yes | yes |
| `updateBoard` (conditional) | yes | yes |
| `removeGuide` (conditional) | n/a — a grab is never guide-owned | **yes** |
| `clearGuides` | n/a | **yes** |
| `setTool` | yes | yes |

`removeGuide` and `clearGuides` are the two new ones, and they are reachable:
the guides list is not disabled while the tape is anchored, so deleting the
guide you anchored on is one click away.

### 4.1 This is why `tapeAnchor` lives in the store

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

One candidate per guide, `owner: { type: 'guide', id }`. `boardSnapPoints` is
untouched, and `pickSnapPoint` is untouched — both tools concatenate the two
providers' output and hand the picker one array.

This is §2.3 discharging exactly what it was written for, and it is worth
noting how little happened: the round that was supposed to justify a
discriminated union added a nine-line function and one union member.

`snapPoints.ts` still imports only `./types` and `./geometry`. A guide point
carries no printed string, so the `formatLength` edge that `cutlist.ts`,
`diagram.ts` and `nesting.ts` all take stays untaken here — the same reasoning
snap-move recorded for the module in the first place.

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
- The four narrowed store reads — a guide-owned `SnapPoint` handed to
  `commitSnapMove` must not be treated as a board.

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
- **Cut-aware snap points** (follow-up 99). Still independent of this round,
  still cheap, still a second provider rather than a picker change. It can land
  before, after or never.
- **Snapping to the origin, to grid intersections or to the ground plane.**
  Unchanged from snap-move's §8 — all are providers, all are cheap, none is
  needed here.
