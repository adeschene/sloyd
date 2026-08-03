# Browser verification: cut-aware snap points

Task 6 of the cut-snap-points plan. This round has every `Cut` contribute snap points of
its own — a floor rectangle (9) and the two shoulder lines at its mouth (6) — filtered
through `stockProbe` so only points still touching remaining stock are offered. Design:
`docs/superpowers/specs/2026-08-03-sloyd-cut-snap-points-design.md`, §9.1 of which lists
the four things it says are settled by looking rather than by asserting. Those four are
what this pass is for.

`src/viewport/` has no unit tests by design. `cutSnapPoints`, `stockProbe` and the
`addCut`/`updateCut`/`removeCut` grab-clearing are all covered by unit tests; what is
**only** covered here is whether the points land on the drawn feature, whether the three
existing marker hues survive being asked to sit inside a dado, whether the headline
operation works end to end, and whether `PICK_RADIUS_PX = 12` can tell a floor corner
from the mouth corner a quarter-inch above it.

## How this was driven

Playwright MCP against `npm run dev -- --port 5180`, Chromium at a 1600 × 1000 window
(canvas 1288 × 947), software GL (llvmpipe — follow-up 26a).

**Nothing in this round rests on shader behaviour**, and that is stated rather than left
unsaid because follow-up 26a exists. Every marker is a `MeshBasicMaterial` disc with
`depthTest` and `toneMapped` off, drawn at `renderOrder 11`; no claim below depends on
how a surface is lit, and the one claim that touches shading at all — that the three hues
stay legible on a dado floor — is a contrast judgement about ink the renderer draws
unconditionally, not about a shader edge case. The dado floor's own darkness *is*
lighting-dependent, and is discussed under Step 5.

Method carried forward from the two previous passes, unchanged:

- **The projector is the app's own.** `MoveTool.tsx`'s six-line `project()` was re-run
  against the live r3f camera and `size`, reached through the Vite dev server's module
  graph (`import('/node_modules/.vite/deps/@react-three_fiber.js')` → `_roots`), so it is
  the same camera object the tool picks against. Nothing is re-derived.
- **Every interaction is real `page.mouse` / `page.keyboard` input** — CDP-driven trusted
  events, never `element.dispatchEvent(new PointerEvent(...))`. This session used no
  synthetic dispatch at any point, so unlike the selected-board grabs pass there is no
  mixed-provenance caveat to make (follow-up 115). Form fields in the Properties panel
  were filled by moving the real mouse to the field's bounding box, clicking, and typing.
- **Marker presence is read out of the scene graph**, by walking the live scene for
  meshes at `renderOrder === 11` with `depthTest === false` and reading each one's
  material colour and world position. An empty array is a real assertion of absence.
- **Results are read out of `localStorage['sloyd.autosave.v1']` after autosave settles**
  (~1 s), and the coincidence is recomputed from the *saved* document by re-running
  `snapPointsFor` over it — never judged by eye.

**Which claims come from which source.** Counts (15, 12, 26, 0) and kinds come from the
scene read and from calling `cutSnapPoints`/`snapPointsFor` against the live document;
they cannot come from a screenshot, because only one hover marker renders at a time.
Screenshots carry exactly three kinds of claim: that a marker sits on the drawn feature,
that a hue is legible against a given material, and the specific single absences named
below. This distinction is drawn explicitly because follow-up 108 is the record of a
report that blurred it.

**Every absence claim has a positive control in the same hover session**, so that a
listener which had silently stopped firing could not read as a clean pass. The controls
are named where they occur.

## Fixture

Built through the UI, with the real mouse and keyboard.

- **Side panel** — pine, **upright**, rotation 0°, 24 × 12 × ¾ at `(0, 0, 0)`.
  Upright puts `length` on Y, so extents are `[12, 24, 0.75]`: x ∈ [0,12], y ∈ [0,24],
  z ∈ [0,0.75].
- **Cut** (through the Properties panel's Cuts section) — face `thickness`, from `max`,
  across `width`, offset 8", width ¾", depth ¼". The position axis is therefore `length`
  (Y), so the dado is a horizontal band on the +Z face at y ∈ [8, 8.75], floor at
  z = 0.5.
- **Shelf** — walnut, flat, 23¼ × 11 × ¾ at `(16, 8, -6)`.

`cut-snap-fixture-overview.png` shows the two, the dado clearly drawn across the pine
panel.

**The document was mutated as the pass went on** — the cut's offset was set to 0 and back
to build the rabbet, a second deeper cut was added and later removed, a third board
(*Consumed*) was added and moved twice to get it clear of the others, and the panel's
material was swapped to walnut and then plywood for Step 5. The description above is what
was *built*, not what the final autosave holds; do not try to reproduce "the fixture"
from the saved document at the end of the session.

**The fixture is deliberately not flat-at-the-origin**, for design §6's reason: a
`posture` of `upright` means the local→world mapping is a real permutation rather than
the identity, so a provider that reached for `pointToLocalXYZ` (centre-relative) instead
of `position + local` would put every cut point half a board away. That is the round's
one invisible-to-numbers trap, since the projector, the marker and `commitSnapMove` all
consume the same `snapPointsFor` output and a systematically wrong mapping would satisfy
every numeric check on both sides.

**It does not have it.** `cutSnapPoints(sidePanel)` returned exactly the 15 world
positions computed by hand from the fixture —

```
floor  (z = 0.50):  x ∈ {0, 6, 12} × y ∈ {8, 8.375, 8.75}      9 points
mouth  (z = 0.75):  x ∈ {0, 6, 12} × y ∈ {8, 8.75}             6 points
kinds: 8 corner, 6 edge-mid, 1 face-center
snapPointsFor: 41 = 26 box + 15 cut
```

— and, more to the point, `cut-snap-floor-corner-marker.png` shows the marker for
`(0, 8, 0.5)` sitting on the drawn dado at the panel's left edge, not half a board away.
The screenshot is the check the numbers could not make.

## Step 2 — the marker set, and how the brief's phrasing was read

The brief's Step 2 says to screenshot the dado's markers "with the Move tool armed and
the **shelf** selected". Taken literally that state offers no dado markers at all, and
that is correct rather than a defect: since the selected-board grabs round, the pre-grab
candidate set is `snapPointsFor(selected)` only, so with the Shelf selected the Side
panel contributes nothing. It was checked rather than assumed —

- All **15** of the panel's cut points were projected and hovered one at a time with the
  real mouse. All 15 were on screen; **0** rendered a marker.
  (`cut-snap-shelf-selected-no-markers.png`, cursor parked on the dado floor centre.)
- **Positive control, same session:** hovering the Shelf's own corner `(16, 8, -6)`
  immediately after rendered `#2e9e5b` at `[16, 8, -6]`.

So the dado's marker set was instead screenshotted in the two states that actually offer
it — the Side panel selected (this section) and a live grab held on the Shelf (Step 3) —
and each screenshot below is labelled with which.

**With the Side panel selected**, at 18.49 px/inch, all three kinds on the dado floor,
each confirmed by scene read and by screenshot:

| point | kind | colour | shot |
|---|---|---|---|
| `(0, 8.75, 0.5)` | corner | `#2e9e5b` | `cut-snap-pine-floor-corner.png` |
| `(6, 8.75, 0.5)` | edge-mid | `#22b8d4` | `cut-snap-pine-floor-edgemid.png` |
| `(6, 8.375, 0.5)` | face-center | `#8a5fd0` | `cut-snap-pine-floor-centre.png` |
| `(6, 8.75, 0.75)` | edge-mid (mouth) | `#22b8d4` | `cut-snap-pine-mouth-edgemid.png` |

The first three of those four are the same files cited as the pine row of Step 5's
legibility table — one set of three screenshots serving both claims, not six.

Design §3.2's claim that the floor centre "really is a face centre" reads correctly on
screen: the violet disc sits in the middle of a drawn rectangular floor, which is the
same relationship a board's face centre has to a board's face. Nothing floats.

### The pick radius — the round's real feel risk

Design §9.1 flags this first, and it is the one place this pass has a negative result.

**At the app's default framing — 14.08 px/inch, the camera you get on load — a dado's
floor corner `(0, 8, 0.5)` and its mouth corner `(0, 8, 0.75)` are 3.6 px apart.**
Projected: `(637.3, 394.8)` and `(633.9, 396.0)`, separation `3.64 px`. Both are
`corner`, so both draw the *same green disc*; the marker is ~9 px across, so the two
possible markers overlap almost completely.

Stepped along the segment between them with the real mouse in ½-px increments, reading
the scene graph at each stop, the pick flips between t = 1.5 px and t = 2.0 px — the
perpendicular bisector at 1.80 px, as the arithmetic predicts. **The aim tolerance is
therefore ±1.8 px**, and the failure mode is precisely stated: it is never "nothing
marks". Both candidates are far inside `PICK_RADIUS_PX = 12`, so *something* always
marks, in the right place, in the right colour — just possibly the wrong one of the two,
with nothing on screen to say so. A user who wanted the floor and got the mouth would
seat their shelf ¼" proud and find out at the bench.

Repeated at a detail zoom of **43.25 px/inch** (reached by wheel-zooming with the real
mouse; the panel's 12" width then spans ~520 px): separation **8.46 px**, flip measured
between t = 4 and t = 5, tolerance **±4.2 px**. That is workable. Screenshots
`cut-snap-zoom-floor-corner.png` and `cut-snap-zoom-mouth-corner.png` are the same two
points hovered in turn at that zoom; the markers are visibly at different places, though
they remain the same hue and, from a near-edge-on view, which one is the floor is not
self-evident — the only cue is that the floor corner sits inside the silhouette and the
mouth corner on it.

Separation scales with zoom at roughly 0.26–0.31 px per px/inch for this fixture and
camera angle, so parity with the 12 px radius needs about 45–50 px/inch.

**No constant was changed**, per the brief. The verdict and its shape are in "Defects and
findings" below.

## Step 3 — the headline operation, end to end

With the **Shelf** selected and Move armed:

1. Grabbed the Shelf's end corner `(16, 8, -6)` with a real click at its projection.
   `grabbed = { kind: 'corner', at: [16,8,-6], owner: { type:'board', id: <Shelf> } }`
   (`cut-snap-grabbed-shelf-corner.png`).
2. **Orbited the camera** with a left-drag well past `CLICK_DRAG_SLOP_PX`. The grab was
   unchanged afterwards — same kind, same `at`, same owner.
3. Hovered the Side panel's dado floor corner `(0, 8, 0.5)`. **Two markers on screen at
   once**: the held grab at `[16,8,-6]` and the live hover at `[0,8,0.5]`
   (`cut-snap-grab-plus-target-marker.png`). This is the post-grab branch doing the work
   design §7.1 insists it must — the cut point here is a **target**, on the board that is
   *not* selected, and pre-grab-only wiring would have made the whole operation
   impossible.
4. Clicked.

Read out of `localStorage` after autosave settled:

```
Side panel: [0, 0, 0]      (unchanged)
Shelf:      [16, 8, -6]  →  [0, 8, 0.5]
```

and recomputed from the **saved** document rather than from the delta: re-running
`cutSnapPoints(Side panel)` and `snapPointsFor(Shelf)` over the stored JSON, the Shelf
has exactly **one** snap point at `[0, 8, 0.5]`, which is the dado floor corner's exact
position. Stored as `"0"`, `"8"`, `"0.5"` — no IEEE-754 residue, because the grabbed
offset arithmetic came out exact here, and no 1/16" rounding (invariant 25; the previous
two passes carry the noisy and the off-grid variants of that check).

One `Ctrl+Z` restored `[16, 8, -6]` exactly.

`cut-snap-seated-shelf.png` shows the result: the walnut shelf's end sitting in the pine
panel's dado, shoulder to shoulder. That picture is the point of the whole round — it was
not constructible before this change without nudging.

## Step 4 — the two withheld cases, as absences on screen

### A deeper cut over a shallower one

A second cut was added to the Side panel — same face and from, offset 7½", width 2",
depth ½" — which entirely contains the original ¾"-wide, ¼"-deep dado in both position
and depth.

`cutSnapPoints` then returned **15**, not 30: every one of the first cut's 15 points was
withheld, and the 15 returned are exactly the second cut's (floor at z = 0.25, mouth at
z = 0.75, y ∈ {7.5, 8.5, 9.5}). The first cut's floor no longer exists, so it offers
nothing at all.

On screen, at 55.4 px/inch:

- Hovering the old dado's floor corner `(0, 8, 0.5)` — deep inside the hole, 1½" from the
  nearest surviving candidate — rendered **no marker at all**
  (`cut-snap-overlap-hole-no-marker.png`).
- **Positive control, same session:** hovering the deeper cut's own floor centre
  `(6, 8.5, 0.25)` rendered `#8a5fd0` at that exact position
  (`cut-snap-overlap-deeper-floor-marker.png`).
- Hovering the old floor *centre* `(6, 8.375, 0.5)` picked `(6, 8.5, 0.25)` instead —
  the deeper cut's floor centre, which projects 0.5 px away at that angle. Correct: that
  point is on real drawn material.

### A board its own cuts consumed

A third board, **Consumed** — walnut, flat, 6 × 4 × ¾ — was given two adjacent
full-depth cuts (offset 0 and offset 3, each 3" wide, ¾" deep), which between them remove
all of its stock.

```
cutSnapPoints(Consumed):  0
snapPointsFor(Consumed): 26      (the box lattice, intact)
```

On screen, at 18.28 px/inch, with Consumed selected:

- **All 26 box points were projected and hovered one at a time.** All 26 were on screen;
  all 26 rendered a marker at exactly their own position. Not a sample — every point the
  tool could offer.
- The would-be cut floor centres `(1.5, 14, 12)` and `(4.5, 14, 12)` and the would-be
  mouth point rendered **nothing** (`cut-snap-consumed-ghost-no-cut-marker.png`).
- **Positive control, same session:** the box face centre `(3, 14, 12)`, 1½" away,
  rendered `#8a5fd0` (`cut-snap-consumed-ghost-box-marker.png`, which also shows the
  translucent ghost box and its outline — invariant 21's placeholder — with the violet
  marker sitting on it).

This is design §5's deliberate asymmetry, visible: the ghost is drawn, so its box points
still sit on a drawn feature; nothing at all draws the cut's shoulders, so they are
withheld.

### The rabbet — 12 not 15, and a caveat about what that looks like

With the dado's offset set to 0 (making it a rabbet at the panel's bottom end),
`cutSnapPoints` returned **12**, and the three withheld are exactly the flush-end mouth
row —`(0, 0, 0.75)`, `(6, 0, 0.75)`, `(12, 0, 0.75)`. No `cutLabel` branch, no special
case: design §5's claim that *"is there a shoulder here"* and *"does this point touch
stock"* are the same question holds.

**But the 12-not-15 is not observable on screen, and this is worth recording rather than
glossing.** Hovering each of those three positions *does* render a marker — supplied by
`boardSnapPoints`, not by the cut provider. That is not an accident of this fixture: a
rabbet's flush-end mouth row is always at the board's own min on the position axis, at
the board's own surface on the face axis, and at {min, mid, max} on the across axis — so
all three are box-lattice positions by construction, for every rabbet. See the finding
below for the consequence.

## Step 5 — legibility on a dado floor

The three hues were settled against **lit** faces; the floor of a cut is not one. Checked
on all three materials the earlier rounds used, same dado, same camera:

| material | corner | edge-mid | face-centre |
|---|---|---|---|
| pine | `cut-snap-pine-floor-corner.png` | `cut-snap-pine-floor-edgemid.png` | `cut-snap-pine-floor-centre.png` |
| walnut | `cut-snap-walnut-floor-corner.png` | `cut-snap-walnut-floor-edgemid.png` | `cut-snap-walnut-floor-centre.png` |
| plywood | `cut-snap-plywood-floor-corner.png` | `cut-snap-plywood-floor-edgemid.png` | `cut-snap-plywood-floor-centre.png` |

All nine are legible, and the light ring (`#f5f2ec`) is doing visible work on walnut,
which is the darkest of the three. No hue was retuned, and none needed to be.

**One honest qualification on "in shadow".** A ¼"-deep dado in this renderer is only
mildly darker than the surrounding face — the floor reads as a shaded band, not as a dark
interior — so this check is weaker evidence than the phrase "settled against lit faces"
might suggest it needs to be. The ½"-deep cut built in Step 4 is darker, and the violet
face-centre marker on *its* floor is clearly legible in
`cut-snap-overlap-deeper-floor-marker.png`. Nothing deeper than ½" was checked; see
"What was NOT checked".

## Step 6 — grab clearing, in the UI

Design §7.2 adds `addCut`, `updateCut` and `removeCut` to invariant 24's list, with a
clear that is **precise rather than blanket**. Both directions driven through the
Properties panel with the real mouse:

1. **Shoulder grabbed, its cut deleted → grab drops.** With the Side panel selected,
   grabbed the second cut's mouth corner `(0, 7.5, 0.75)` — a cut-only position, since
   y = 7.5 is not on the board's `{0, 12, 24}` lattice. Scene read confirmed the marker
   and `grabbed` (`cut-snap-shoulder-grabbed.png`). Clicked **Remove cut (dado, offset
   7-1/2")**: `grabbed → null`, and the scene read returned **zero** markers
   (`cut-snap-shoulder-grab-cleared.png`).
2. **Box corner grabbed, a cut added → grab survives.** Grabbed the board corner
   `(0, 0, 0.75)`, then clicked **Add cut**. `grabbed` unchanged — same kind, same `at`,
   same owner — and the marker still drawn at `[0, 0, 0.75]`
   (`cut-snap-box-grab-survives-add-cut.png`). The board now had two cuts; the corner
   genuinely did not move, so the grab genuinely should not drop.

## Step 7 — the console

**0 errors** across the entire session, from the first load through every interaction
above. 93 warnings, all three known kinds and none from app code:
`THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated` (re-emitted on every
geometry/material rebuild, which is why the count is high), `THREE.Clock: This module has
been deprecated`, and llvmpipe's `GPU stall due to ReadPixels` performance messages —
the software-GL renderer reacting to the harness taking screenshots, not the app.

No `releasePointerCapture` error of the kind follow-up 106 records appeared, which is
expected: this session drove no synthetic events at all.

## Defects and findings

### 1. The ¼" pick ambiguity is real at default zoom — MINOR, feel, no code change made

Stated as a number rather than an impression: at the app's default framing (14.08
px/inch) the aim tolerance between a dado's floor corner and its mouth corner is **±1.8
px**, and the two are the same colour. The tool never fails to mark; it marks the wrong
one of two, indistinguishably. It becomes comfortable (±4.2 px) at roughly 43 px/inch and
reaches parity with `PICK_RADIUS_PX` at about 45–50 px/inch.

One more number, because it bounds what any remedy can do: the marker disc is about 9 px
across. At 3.6 px separation the two candidate markers **overlap almost entirely**, so
there is no room at default zoom to render a visible tie-break — highlighting the
alternative candidate would draw it underneath the one already on screen.

**Lowering `PICK_RADIUS_PX` does not fix this**, and that is worth saying because §9.1
suggests retuning the constant as the remedy. The radius governs how far a candidate may
be from the cursor, not how two candidates 3.6 px apart are told apart; any radius large
enough to be aimable at all contains both. The available remedies are elsewhere — a
tie-break the user can see, a modifier to cycle coincident candidates, or simply
accepting that this operation is done zoomed in. All are design decisions, not a constant
edit, so nothing was changed. Recommend a follow-up.

### 2. A rabbet's flush-end mouth points are still offered, by the other provider — MINOR

`cutSnapPoints` correctly withholds all three (12 not 15). `boardSnapPoints` then
supplies the same three positions unconditionally, because a rabbet's flush-end mouth row
always coincides with the board's own box lattice.

The consequence is a governing-constraint one, and it was verified against the code
rather than argued from the picture — the screenshot alone is genuinely ambiguous at this
viewing angle, since the marker sits close to the board's silhouette. `stockProbe` was
called directly on the rabbeted board, in the board's own coordinates:

```
stockProbe(rabbeted)({length: 0,    width: 0,  thickness: 0.75})  →  false
stockProbe(rabbeted)({length: 0,    width: 6,  thickness: 0.75})  →  false
stockProbe(rabbeted)({length: 0,    width: 12, thickness: 0.75})  →  false
stockProbe(rabbeted)({length: 0,    width: 0,  thickness: 0.5 })  →  true    (the floor)
stockProbe(rabbeted)({length: 0.75, width: 0,  thickness: 0.75})  →  true    (the shoulder)
boardSolids(rabbeted) = [ {length:[0.75,24], thickness:[0.5,0.75]},
                          {length:[0,24],    thickness:[0,0.5]}   ]
```

So the point `(0, 0, 0.75)` in world terms has **no stock touching it at all** — the
nearest remaining material along the thickness axis is the rabbet floor, ¼" away — yet a
green corner marker is offered there (`cut-snap-rabbet-flush-end-box-corner.png` shows
the marker at the AABB corner with the rabbet's recess beside it). Design §2 says
a marker must sit on a feature that is actually drawn; the cut provider honours that and
the box provider, which is unfiltered by design, undoes it for this class of point.

This is **not a defect in this round's code** — nothing in the design says
`boardSnapPoints` should be filtered, and §5 gives a good reason it should not be for the
fully-consumed case (the ghost is drawn). It is a question the round surfaced: a
partially-cut board is not a ghost, and there is no ghost drawn at a rabbeted corner.
Recommend a follow-up; do not act on it here.

Two things soften it. The marker's position is only ¼" off the real corner at worst, and
the position is a legal snap target in the sense that the board's AABB corner is a
perfectly meaningful thing to align to. And at default zoom the offer is visually
indistinguishable from the correct one anyway — which is finding 1 again, from the other
side.

### Nothing else

Every other behaviour the design and the brief describe matched what the browser did:
the 15/12/0 counts, the kind assignment, the local→world mapping under a non-identity
posture, the headline operation and its exact coincidence, both withheld cases as
absences with controls, both grab-clearing directions, all nine legibility checks, and a
clean console.

## What was NOT checked

- **Touch and pen input.** Everything was a real *mouse* pointer. `MoveTool`'s
  `pointerId`-tagged `downAt` guard exists for a multi-touch pinch and remains
  unexercised, as after both previous rounds. Follow-up 106's touch half still stands.
- **Corners still have no DOM presence.** Real input semantics are exercised, but the
  *coordinate* the pointer is sent to is computed by projecting a world position, not
  obtained from a locator. If the projector and `MoveTool` were both wrong in the same
  way this pass could not tell — which is why the mapping was validated against a
  rendered marker on the drawn dado before any number was trusted.
- **Design §9's coincident-point colour ambiguity.** §9 records that a cut point can land
  exactly on a box lattice point and be described as a different *kind* by each provider,
  so the hue is decided by `pickSnapPoint`'s depth tie-break, and delegates "does this
  read as flicker" to a browser pass. The canonical case is a rabbet with
  `depth = thickness / 2` (0.375" on ¾ stock); this fixture's ¼" depth does not reach it,
  and it was **not** driven. The rabbet finding above is a *position* coincidence, not
  the kind coincidence §9 means.
- **Cuts on faces other than `thickness`, and `from: 'min'`.** Every cut in this fixture
  was `face: 'thickness'`, `from: 'max'`, `across: 'width'`. The other faces are covered
  by unit tests with hand-written world coordinates; they were not looked at in a
  browser.
- **Rotation 90°.** The fixture exercises a non-identity posture (`upright`) but leaves
  `rotation` at 0. The unit-test fixture covers `rotation === 90`; this pass does not.
- **A cut floor deeper than ½"** as a legibility case — see Step 5's qualification.
- **`updateCut` clearing a grab.** Steps 6 covered `removeCut` (drops) and `addCut`
  (survives). Editing a grabbed shoulder's own cut so the point *moves* was not driven in
  the browser; it is unit-tested.
- **Real GPU rendering.** Software GL (llvmpipe), per follow-up 26a. No finding here
  depends on shader behaviour — see "How this was driven".
- **Production.** Nothing was run against `sloyd.oddbox.tech`. The dev server only, per
  the standing rule: `sloyd.autosave.v1` in a real browser *is* someone's project.

## Files referenced

All screenshots were taken under the filenames cited above and kept out of the repo
(`.playwright-mcp/shots-cut-snap/`, gitignored), the same way the snap-move and
selected-board grabs passes handled theirs — the report cites them by name, the
binaries are not carried in git.

## Re-check after the box-lattice fix

Finding 2 above ends "Recommend a follow-up; do not act on it here." It was acted on, in
the same branch, immediately: `999ca29` filters `boardSnapPoints` through `stockProbe`
too, with an explicit `boardSolids(board).length === 0` exception keeping all 26 points on
a board its own cuts consumed, because the ghost box **is** drawn (invariant 21). Read
finding 2 as **closed by that commit**, not as an open recommendation. Finding 1 — the ¼"
pick ambiguity between a cut's floor corner and its mouth corner at default zoom — is
untouched by the fix and remains open.

This section is a **narrow re-check of that fix only**, not a second pass; nothing above
was re-run. Full detail in
`.superpowers/sdd/2026-08-03-sloyd-cut-snap-points/task-6c-report.md`. Same host, same
harness, same rules: the app's own `project()` against the live camera through the dev
server's module graph, real `page.mouse`/`page.keyboard`/wheel input throughout with no
synthetic dispatch, marker presence read out of the scene graph at `renderOrder === 11`,
counts read from the modules and screenshots carrying only the visual claims.

**Two method differences, both recorded rather than glossed.** The fixture was written
into `localStorage` as JSON and the page reloaded rather than built through the Properties
panel — and then read back out and re-derived through the modules before anything was
shot, which is also what confirmed no cut was dropped on load (the *Consumed* board kept
both of its cuts and `boardSolids` returned `[]`). And a harness trap in the shape of
follow-ups 74/75: the canvas sits 52.8 px below the top of the page and `MoveTool`'s
`cursorOf` subtracts that rect, so a projection is **canvas**-relative while
`page.mouse.move` takes **page** coordinates. Driving the raw projection put every cursor
55 px off and read exactly like a coordinate-mapping defect in this round's code. It was
the harness; adding `rect.top` reconciled the app's pick with the projector everywhere
afterwards.

**Every absence below was gap-measured before it was captioned.** A withheld mouth point
is only `depth` away from the floor point that survives, so at a low enough zoom hovering
it marks a *displaced* marker rather than none. The minimum pixel distance from each
withheld position to **any** offered point was computed with the app's own projector and
required to exceed `PICK_RADIUS_PX = 12` first. The fixture's rabbet is 0.75" deep in 2"
stock for that reason — deep enough for a 15-25 px gap at the zooms used, and still under
half the thickness so that exactly the three flush-end mouth points are withheld. (A
deeper rabbet correctly withholds more: depth 1.0" in 1.5" stock returns 20, because the
board's thickness-mid lattice plane is then inside the removed stock too. Checked and
understood, not filed as a finding.)

Fixture, one document: **Rabbet panel** — pine, upright, 24 × 12 × 2 at `(0,0,0)`, one cut
`thickness`/`max`/`width`, offset **0**, width 3", depth ¾"; **Dado panel** — pine, flat,
24 × 12 × ¾ at `(20,0,-6)`, one cut `thickness`/`max`/`width`, offset 8", width ¾", depth
¼"; **Consumed** — walnut, flat, 6 × 4 × ¾ at `(-14,0,0)`, two `from: 'min'` cuts at
offset 0 and 3, each 3" wide and ¾" deep. Posed rather than flat at the origin, for §6's
reason.

**1. The rabbet's flush end no longer marks.** `boardSnapPoints` returns **23**, and the
three missing points were pinned by value — the 26-point lattice was rebuilt independently
and differenced — as `(0,0,2)` corner, `(6,0,2)` edge-mid, `(12,0,2)` corner: exactly the
flush-end mouth row, and nothing else. `cutSnapPoints` still returns 12. On screen at 17.4
px/inch, with the nearest offered point 15.7 / 16.7 / 18.0 px away, all three hovers
returned **zero markers** — `fix-rabbet-flush-corner-no-marker.png`,
`fix-rabbet-flush-edgemid-no-marker.png`, `fix-rabbet-flush-corner12-no-marker.png` — and
again after a real wheel zoom to 22.4 px/inch (gaps 20-25 px),
`fix-rabbet-zoom-flush-edgemid-no-marker.png`.

**2. Positive control, same session.** The rabbet's *other*, non-flush shoulder still
marks: `(0,3,2)` green (`fix-rabbet-other-shoulder-marker.png`) and `(6,3,2)` cyan
(`fix-rabbet-other-shoulder-edgemid-marker.png`, and at zoom
`fix-rabbet-zoom-other-shoulder-marker.png` — the disc sits on the drawn shoulder line 72
px above the cursor position that produced nothing one hover earlier, same view). Two more
controls bracket the withheld point on its own axis: the floor corner ¾" below it
(`fix-rabbet-floor-corner-marker.png`, `fix-rabbet-zoom-floor-edgemid-marker.png`) and the
board's own lower corner at the same end, still in stock
(`fix-rabbet-flush-end-lower-corner-marker.png`).

**3. The regression check — a plain mid-face dado still offers all 26.** `boardSnapPoints`
returns 26 and `cutSnapPoints` 15. Not a sample: **all 26 were projected and hovered one at
a time**, and all 26 rendered exactly one marker at their own position, none picking a
neighbour. Shot one of each kind plus a cut point: `fix-dado-box-corner-marker.png`,
`fix-dado-box-facecentre-marker.png`, `fix-dado-box-edgemid-marker.png`,
`fix-dado-cut-floor-marker.png`.

**4. The consumed-board ghost keeps all 26 and offers no cut points.**
`boardSolids` → `[]`, `boardSnapPoints` → 26, `cutSnapPoints` → 0. **All 26 hovered
individually**, all 26 marked (`fix-consumed-ghost-box-facecentre-marker.png` shows the
violet disc on the translucent ghost; `fix-consumed-ghost-box-corner-marker.png` a corner).
The two would-be cut floor centres, 73.4 px and 72.0 px from any offered point, rendered
nothing — `fix-consumed-ghost-no-cut-marker.png`,
`fix-consumed-ghost-no-cut-marker-b.png`.

**Console: 0 errors**, and warnings of the same three known kinds listed under Step 7 and
nothing else. (The tool returned 73 warning lines with `all: true` against a
per-navigation header of 8 — session total versus since-last-navigation; the 0-errors
claim holds either way.)

**No defect found, and the re-check's own boundaries.** It exercised the fix and its
immediate neighbourhood only. **No grab was held at any point**, so all four checks
drove only the *pre-grab* branch of `MoveTool`'s candidate memo; the post-grab branch
calls the same changed function, which means the fix now filters **targets** on other
boards too — intended on §2's reading, with no breakage mechanism visible (Step 3's
target above was a `cutSnapPoints` floor corner, untouched by the diff), but undriven
here and worth knowing beside follow-up 110. Not re-run: the headline operation, the
deeper-cut overlap case, grab clearing, the legibility table, and the pick-radius
measurement. Not covered at all: faces other than `thickness`, `rotation: 90`, touch and
pen, a real GPU, production, and a screenshot of the deeper-rabbet (20-point) case. Screenshots for this section live
in `.playwright-mcp/shots-cut-snap-fix/` — a different directory from the pass above, and
gitignored the same way.
