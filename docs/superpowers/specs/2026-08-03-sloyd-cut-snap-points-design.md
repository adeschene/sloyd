# Cut-aware snap points — design

**Date:** 2026-08-03
**Status:** approved, not yet implemented
**Follow-up closed:** 99
**Schema:** unchanged — `CURRENT_VERSION` stays 5

---

## 1. What this adds

A dado's shoulders become snap points.

Today the Move tool offers a board's 26 box-lattice points and nothing else, so
the operation the tool most obviously exists for — cut a dado in a side panel,
then seat the shelf in it — cannot be done exactly. The point you aim at is the
inside corner where the dado floor meets its shoulder, and it is not on offer,
so you snap to a face centre and nudge. Follow-up 99 already called that corner
*"arguably the single most useful point on a joined board"*.

This round has every cut **define** up to 15 points — its floor rectangle (9)
and the two shoulder lines at its mouth (6) — of which it **offers** those that
still touch remaining stock (§5). A plain dado offers all 15. A rabbet offers
12, because its flush end has no shoulder; that falls out of the filter with no
special case, and is the cleanest evidence the filter is doing real work.

It is deliberately the cheap round before the expensive one. The tape measure,
guide points and guide lines were chosen a day earlier and already have a
design (`2026-08-03-sloyd-guide-points-design.md`) and a committed plan; they
were moved back one place because guides are the *workaround* for the absence
of this feature, and shipping the general-purpose workaround first teaches
people to reach for it and costs the signal about what guides actually need to
cover. Guides also need schema **v6**, a `guides` array, a placement tool, a
visibility toggle, a list and a migration step. This round needs none of that.

### 1.1 What it does not touch

- **No schema change.** Cut points derive from `cuts`, already stored since v4.
  Rolling this round back costs nothing but the points.
- **No new `SnapKind`, and `SnapMarker.tsx` is unchanged.** See §4.
- **No change to `pickSnapPoint`.** This is a second *provider* over the same
  board, which is exactly what the snap-move design's §2.3 built `SnapPoint[]`
  for. The picker never sees a `Board` and still never needs to.
- **No new tool, no new UI surface, no new document state, no new store field.**

---

## 2. The governing constraint

**A marker must sit on a feature that is actually drawn.**

This is not a new rule invented for this round. It is written twice already in
the repo, and it decides both of the questions follow-up 99 says the brainstorm
has to settle:

- The snap-move design's §2.1 excludes the board's volume centre because it
  *"floats inside the solid where nothing draws it"* — a marker there would hang
  in mid-air with no feature under it, which is the opposite of an inference
  indicator's job.
- Invariant 16 is the same rule for edges: `boardEdges` exists, rather than
  per-solid `EdgesGeometry`, because the canonical dado leaves three abutting
  solids across a *continuous* uncut face and per-solid edges draw seams there
  that correspond to no real feature.

Applied here it rules out three tempting shortcuts:

- **Deriving from `boardSolids`.** The snap-move design's §8 says
  *"`boardSolids` already yields them"*, and that phrasing pulls toward it. But
  invariant 16 already litigated this exact geometry: the solids' corners
  include phantom seam corners at 6 and 6¾ on a board whose bottom face is
  continuous. Solid corners are not the shape's corners.
- **Reusing `boardSnapPoints`' 3×3×3 rule verbatim on the cut's box.** The cut's
  mouth is an *opening*: its face centre and the edge midpoints spanning it hang
  in void.
- **Offering points unconditionally.** Two cuts can overlap, and the shallower
  one's floor may no longer exist. See §5.

---

## 3. The up-to-15 points a cut defines

This section is about what a cut **defines**. What it **offers** is that set
minus whatever §5's filter withholds — always 15 for a plain dado, 12 for a
rabbet, fewer where cuts overlap. Nothing downstream may treat 15 as a count it
can rely on.

Work in the cut's own box, `cutRegion(board, cut)`, and name its three axes:

| Name | Which axis | Span |
|---|---|---|
| *face* | `cut.face` — the depth axis | `depth` in from the surface named by `cut.from` |
| *across* | `cut.across` | the full board dimension — that is what makes it a through-cut |
| *pos* | `positionAxisOf(face, across)` | `[offset, offset + width]` |

Two rectangles, at the two ends of the *face* axis:

**Floor** — the plane `depth` in from the surface. All nine combinations:

| *pos* | *across* | Count | Kind |
|---|---|---|---|
| min/max | min/max | 4 | `corner` |
| mid | min/max | 2 | `edge-mid` |
| min/max | mid | 2 | `edge-mid` |
| mid | mid | 1 | `face-center` |

**Mouth** — the plane at the board's own surface. Only the two shoulder lines:

| *pos* | *across* | Count | Kind |
|---|---|---|---|
| min/max | min/max | 4 | `corner` |
| min/max | mid | 2 | `edge-mid` |

`pos = mid` is **dropped at the mouth**: it spans the opening, so those three
points (including the mouth's face centre) sit in the hole rather than on wood.
That is the volume-centre exclusion applied one dimension down.

```
section through a dado, looking along `across`:

  ────────x────x────x────────   <- MOUTH: 2 corners + 1 shoulder mid
          │         │              (x3 along `across` = 6)
          x────x────x           <- FLOOR: 2 corners + 1 mid
                                   (x3 along `across` = 9)
```

### 3.1 The kind rule transfers; it just applies in the plane

Follow-up 99 records the worry that `boardSnapPoints`' rule — *count the axes
sitting at `mid`, and the count names the kind* — does not transfer, because a
shoulder corner belongs to the cut rather than to the board's box. It does
transfer, applied within the rectangle: count the mids among the **two in-plane
axes** (*pos* and *across*). Zero is a corner, one an edge midpoint, two a face
centre. The *face* axis never contributes a mid, because a mid-depth point sits
on the shoulder wall rather than on either rectangle — see §9.

This is what makes the existing three colours cover all 15 with no change to
`SnapMarker.tsx`.

### 3.2 The floor centre really is a face centre

`face-center` for the floor's middle point is not a stretch to reuse a colour.
The dado floor is a real drawn face, and its centre is the centre of that face —
the same relationship a board's face centre has to a board's face. Nothing
floats.

### 3.3 A degenerate cut contributes nothing

`face === across` leaves no position axis to measure `offset`/`width` along.
`cutRegion` already guards this by returning a zero-width region; the provider
guards it by returning no points for such a cut. As with `cutRegion`, this must
not lean on `document.ts`'s validator dropping the cut on load: a `Board` built
directly — a test, a future creation path — can reach the provider without
going through the validator, and making the function total here means a future
refactor of *where* validation runs cannot break it from a distance.

### 3.4 The owner stays `{ type: 'board', id }`

A shoulder belongs to its board. Nothing about a cut point needs a new
`SnapOwner` member, and two guards depend on the current one:
`commitSnapMove`'s `grabbed.owner.id !== selectedId` refusal, and `MoveTool`'s
`p.owner.id !== grabbed.owner.id` target filter. Both keep working unchanged,
which is why grabbing a shoulder and dropping onto the same board's own box
corner is excluded for free.

---

## 4. No fourth `SnapKind`

Colour encodes *which kind of point*, and after this round it still does: a
floor corner is green like a board corner, a shoulder-line midpoint cyan like a
board edge midpoint, the dado floor's centre violet.

A fourth kind for cut-owned points was considered and rejected. It would import
a browser-settling obligation — a new off-palette hue, cool and saturated,
mutually distinct from the three existing ones and legible against pine, walnut
and plywood, per follow-up 60's process — to encode something the user is
already looking at. *Which feature* is carried by **where the marker sits**;
*which kind* is what hue is for, and splitting `corner` into two colours by
owner would weaken a mapping already verified in a browser.

Distinguishing by shape instead was also rejected, against a finding the
snap-move design already recorded: at the ~9 px a marker must be to sit on a
corner without hiding it, shape cannot carry a distinction. That is precisely
why hue was chosen in the first place (§6.1 of that design).

---

## 5. `stockProbe` — one rule for every floater

`cuts.ts` gains one export:

```ts
/** Whether a point in the board's own space touches any remaining stock. */
export function stockProbe(board: Board): (p: Point) => boolean;
```

It builds the cell grid **once** per board — the same `grid(board)` that
`boardSolids` and `boardEdges` already share — and returns a closure. A point is
offered iff at least one cell touching it is filled.

For each dimension, take every cell index whose *closed* span contains the
coordinate: one index when the coordinate falls in a cell's interior, two when
it lands exactly on a split plane. Then the point touches stock iff any
combination of those indices is a filled cell. This is `boardEdges`' four-cell
test generalised from a segment to a point — up to eight cells rather than four
— and it is the same shape of rule for the same reason.

Both floater cases fall out of it, rather than needing a rule each:

- **A board its own cuts consumed entirely.** No cell is filled, so no cut point
  is offered. Its 26 **box** points stay, and that asymmetry is deliberate
  rather than inconsistent: invariant 21 has `BoardMesh` draw a translucent
  ghost box at the AABB in exactly this case, so the box points still sit on a
  drawn feature while nothing at all draws the cut's shoulders.
- **A floor corner a deeper or overlapping cut has since removed.** The cells
  under it are empty, so the point is withheld. This case is reachable today —
  it is the same two-cuts-that-jointly-remove-stock shape as follow-ups 48/49.
- **A rabbet's flush end, which has no shoulder.** With `offset === 0` the mouth
  points at the position-min end sit over the cut's own cell, so all three are
  withheld and the rabbet offers 12. This is worth stating because it is the
  case that would otherwise tempt someone to branch the provider on `cutLabel`:
  a rabbet needs no special case at all, because *"is there a shoulder here"*
  and *"does this point touch stock"* are the same question.

**A board with no cuts never builds a grid.** The provider returns early on an
empty `cuts` array, so joinery still costs nothing at all for the boards that do
not use it — the same guarantee `boardSolids` makes in its first line.

### 5.1 The box lattice is filtered too — added after the browser pass

This section was written as though the filter applied only to cut-owned points.
The browser pass proved that incomplete, and the finding is worth stating in
full because it is the round's own governing constraint failing on the oldest
code in the feature.

**A rabbet's flush-end mouth positions are also board box-lattice points.** With
`offset === 0` the cut reaches the board's own end, so the three positions
`cutSnapPoints` correctly withholds are, by construction, corners and an edge
midpoint of the board's box. `boardSnapPoints` never consulted `cuts`, so it
offered them anyway — markers sitting a quarter-inch out in the air, exactly
what §2 says must not happen. Verified rather than argued: `stockProbe` returns
`false` for all three, and `boardSolids` puts the nearest remaining stock ¼"
away.

This predates the round — it has been true of every rabbet since joinery
shipped, and it shipped to production with snap-move. It is fixed here anyway,
because a constraint that holds only in the new provider is not the constraint
this design claims.

So `boardSnapPoints` filters through the same probe, with **one exception,
which is the same one §5 already made**: when `boardSolids` is empty, all 26
box points stay. The ghost box at the AABB *is* drawn (invariant 21), so its
points sit on a drawn feature; nothing draws a consumed board's shoulders. The
exception is written as an explicit `boardSolids(board).length === 0` check
rather than inferred from the filtered set coming back empty — those two
conditions are not equivalent (a board could have every box point in removed
stock while stock remains in its middle), and the explicit one is the rule this
paragraph states.

The zero-cost guarantee is preserved by the same early return: a board with no
cuts is not filtered and builds no grid.

---

## 6. Local→world, and the trap in it

Cut points are the first snap points where posture and rotation actually matter.
The box lattice is posture-agnostic because `boardExtents` has already folded
posture and rotation in; a cut is defined in part-local `length`/`width`/
`thickness`, so the provider must map local→world itself:

```
world[axis] = board.position[axis] + local[axisDimensions(board)[axis]]
```

`position` is the min-corner (invariant 2), which is what makes that a bare
addition.

**Neither existing helper does this, and both look like they do.**
`pointToLocalXYZ` (in `cuts.ts`) and `solidWorldBox` both return coordinates
relative to the **board's centre**, because `BoardMesh` puts a `<group>` at
`boardCenter(board)` and hangs every solid inside it. Reaching for
`pointToLocalXYZ` here and forgetting the group offset produces points off by
half the board — which looks entirely plausible in a screenshot, and is why §8's
fixture is specified the way it is.

The mapping lives in `snapPoints.ts` rather than in `geometry.ts`: it needs
`cuts.ts`'s `Point` type, and `geometry.ts` sits *below* `cuts.ts`, so it cannot
import it. `snapPoints.ts` therefore gains a `./cuts` import alongside its
existing `./types` and `./geometry`. It still does **not** import `../units` —
a snap point carries no printed string, so that boundary (widened by
`cutlist.ts`, `diagram.ts` and `nesting.ts`) stays untouched here.

---

## 7. Wiring

### 7.1 One expression, both branches

`snapPoints.ts` exports the union:

```ts
export function snapPointsFor(board: Board): SnapPoint[] {
  return [...boardSnapPoints(board), ...cutSnapPoints(board)];
}
```

`MoveTool`'s memo calls it in **both** branches:

```ts
const candidates = useMemo(() => {
  if (grabbed) {
    return boards.flatMap(snapPointsFor).filter((p) => p.owner.id !== grabbed.owner.id);
  }
  const selected = boards.find((b) => b.id === selectedId);
  return selected ? snapPointsFor(selected) : [];
}, [boards, grabbed, selectedId]);
```

**The post-grab branch is not optional.** CLAUDE.md's roadmap text describes
this round as extending *"the pre-grab branch"* to "the selected board's points,
from both providers", and read alone that would ship the feature half-working:
the headline operation is grabbing a corner **on the shelf** and clicking the
dado shoulder **on the side panel**, so the cut point is a *target*, on the
non-selected board. Pre-grab only and the operation this round exists for does
not work; post-grab only and a shoulder cannot be grabbed. Both.

One function rather than two concatenations, so the branches cannot drift —
follow-up 113's rule (two expressions that agree today are two places for a
future rule to disagree), applied before it can bite rather than after.

No new memo and no dependency-list change: `cuts` rides inside `boards`, which
is already a dependency. Invariant 15's failure mode is not reachable here, and
adding a second memo — which would need its own hand-written dependency list —
is exactly what invariant 21 records as the wrong move.

### 7.2 Invariant 24 gains three names

`addCut`, `updateCut` and `removeCut` can now destroy the feature under a live
grab. They are deliberately routed *around* `updateBoard` (invariant 2: a cut
changes no extent, so reorienting on a cut change would be a no-op pivot), so
they do not inherit its conditional clear. Today that is harmless, because a
grab can only hold a box-lattice point. The moment a shoulder is grabbable,
`removeCut` can delete the point being carried and `updateCut` can move it, and
`commitSnapMove` would then apply a delta derived from a position that describes
nothing — invariant 24's own stated test.

The clear is **precise rather than blanket**: after the edit, keep the grab iff
the grabbed point is still among that board's snap points.

```ts
// in each of the three, after computing the edited board:
if (
  get().grabbed?.owner.id === boardId &&
  !snapPointsFor(next).some((p) => sameSnapPoint(p, get().grabbed!))
) set({ grabbed: null });
```

- Holding a box corner and editing a cut on the same board → the grab
  **survives**, because the corner genuinely did not move.
- Holding the shoulder you just edited or deleted → the grab **drops**.
- A cut edit on a different board → untouched, per invariant 24's existing
  conditional shape.

Exact `===` on the three coordinates is the right comparison here for invariant
18's reason: both sides are produced by the same arithmetic from the same stored
values, so an unmoved point holds identical doubles. Nothing computes a
difference on the way in.

**`sameSnapPoint` moves** from `viewport/snapPick.ts` into
`document/snapPoints.ts`, because the store cannot import `viewport`.
`snapPick.ts` imports it from `document` instead — one home, not a re-export,
so there is no second name for it to be found under.

---

## 8. Testing

Unit-testable in full: this is pure arithmetic over a document, and no part of
it needs a browser to be *correct* (though parts of it need one to be *good* —
§9.1).

**The fixture is the test.** Every geometry case uses a board at **non-zero
`position`**, with **`posture !== 'flat'`** and **`rotation === 90`**, and
hand-written expected world coordinates. A flat, unrotated board at the origin
passes with a completely wrong local→world mapping — every axis is the identity
there. This round's slot in the plan-supplied-code chain (follow-ups 64, 68
twice, 80, 87, 88, 107, 118) is most likely to be exactly this: a fixture that
cannot fail.

| Case | Asserts |
|---|---|
| Canonical dado, posed board | all 15 world positions, by hand |
| Same | 8 `corner`, 6 `edge-mid`, 1 `face-center` |
| Rabbet (`offset === 0`) | **12**, and the three withheld are exactly the flush-end mouth row — a rabbet has one shoulder, and no `cutLabel` branch is needed to know it |
| Rabbet with `depth === thickness / 2` | a cut point coincides with a board lattice point and is **not** de-duplicated (§9) |
| Deeper cut over a shallower one | the shallower's covered floor points are withheld |
| Two cuts jointly consuming the board | `cutSnapPoints` is `[]`; `snapPointsFor` is exactly the 26 box points |
| Board with no cuts | `snapPointsFor` deep-equals `boardSnapPoints`, 26 points |
| Degenerate cut (`face === across`) | contributes nothing |
| `stockProbe` on a split plane | a point on a boundary between a filled and an empty cell is offered |

Store tests for §7.2: grab a shoulder then `removeCut` → cleared; grab a box
corner then `addCut` on the same board → **survives**; grab, then a cut edit on
another board → survives.

`npm run build` is the typecheck gate; `npm test` does not typecheck.

---

## 9. Non-goals

Each looked at and declined, with the reason, so none has to be re-derived.

- **No points on the shoulder walls.** A mid-depth point on the wall face sits
  on real drawn material, so the governing constraint does not exclude it — it
  is excluded on clutter grounds instead. A wall is legible from the floor and
  mouth points already bounding it, and adding a third rectangle per cut would
  worsen §9.1's real risk to buy a point nobody aims at.
- **No de-duplication against the box lattice.** A cut point can land exactly on
  a board lattice point — a rabbet with `depth = thickness / 2` puts its flush
  floor corner precisely on the board's own edge midpoint, for instance. Both
  candidates carry the same position and the same owner, so they produce the
  **identical delta**, and that is the whole of the argument: the move is the
  same whichever one `pickSnapPoint`'s depth tie-break returns, exactly as the
  selected-board grabs round argued for coincident *targets*.

  **The two can differ in `kind`, and therefore in marker colour**, which the
  delta argument does not cover and which is recorded rather than hidden: in the
  example above the cut provider calls it a `corner` (no in-plane mids) while the
  box lattice calls it an `edge-mid` (the thickness axis sits at mid), so the
  hue you see is decided by the tie-break. Both descriptions are true of the
  same position, the marker sits in the right place either way, and the move is
  unaffected — but if a browser pass finds this reads as flicker, the fix is a
  deterministic ordering rule, not a de-duplication step.
- **No fourth `SnapKind` and no marker change.** §4.
- **No cut points in the cut list or the diagrams.** Those derive from `cuts`
  independently and are unaffected.
- **The tape measure, guide points and guide lines are still next.** When that
  round starts, its plan needs a revision pass first: the guide-points design's
  §3.1 filters grabbable candidates to *board-owned* points, the selected-board
  grabs round subsumed that with a narrower rule, and this round widens the same
  branch again. Merge them into **one** predicate in the pre-grab branch rather
  than stacking filters — follow-up 113.

### 9.1 Browser obligations, not test obligations

In the sense of follow-up 60: these are settled by looking, and no test should
be written to pin a number chosen here.

**Settled by the browser pass, and accepted with the user rather than fixed:**
at the default camera (14.08 px/inch, measured) a dado's floor corner and its
mouth corner project **3.6 px** apart — closer than the 9 px marker is wide, so
the two discs overlap and, both being `corner`, they are the same colour. The
pick never fails; it silently returns the wrong one of two, and the result is
¼" out. Aim tolerance is ±1.8 px at that zoom, ±4.2 px at 43 px/inch, and
parity with `PICK_RADIUS_PX = 12` needs roughly 45-50 px/inch. **Retuning the
radius cannot fix this** — any radius large enough to aim with contains both
candidates. The remedy is zoom, which is what anyone aiming at a ¼" feature
would do anyway. Recorded as a follow-up with these numbers rather than
addressed by shrinking the point set.

- **Clustering against the pick radius.** Cut points sit far tighter than the
  box lattice — a ¾"-wide, ¼"-deep dado's floor corner and mouth corner are ¼"
  apart, a few pixels at working zoom — and `PICK_RADIUS_PX = 12` is already
  flagged in §6.3 of the snap-move design for exactly this failure mode
  (*"adjacent candidates on a small part fight each other"*). Check it at
  working zoom on a real dado before deciding anything; retune the constant, not
  the point set, if it needs retuning.
- **Marker legibility inside a dado.** The floor sits in shadow, and the three
  hues were settled against lit faces of pine, walnut and plywood, not against a
  shadowed interior.
- **The headline operation, end to end.** Seat a shelf into a side panel's dado
  and read the resulting coincidence out of `localStorage` rather than judging
  it by eye — the method the snap-move and selected-board grabs passes both
  used. Drive it with real `page.mouse` input and project through the app's own
  `project()` against the live camera, per follow-up 115.
- **The withheld cases are visible, not merely absent.** Construct the
  overlapping-cuts board and the consumed board and confirm on screen that no
  marker appears in the hole and none on the ghost.
