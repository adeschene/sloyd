# Browser verification: snap-move

Task 9 of the snap-move plan. This round added a SketchUp-style Move tool: hover a
board's corner/edge-midpoint/face-centre to see a coloured marker, click to grab it,
click a point on another board to move the grabbed board so the two points coincide
exactly. Nothing in `MoveTool.tsx`, `SnapMarker.tsx` or `snapPick.ts` had been driven in
a real browser before this pass — everything below was checked by rendering the page,
per this repo's standing rule that the r3f viewport is verified by driving a browser,
not by asserting on mocks.

## How this was driven

Playwright MCP against `npm run dev -- --port 5199` (backgrounded), Chromium, software
GL (llvmpipe — follow-up 26a). That follow-up records `pow(0.0, 0.0)` returning `1.0`
here where real hardware returns `NaN`, which once hid a real grid bug. It does not
apply to this round: every marker is `MeshBasicMaterial` with `depthTest`/`toneMapped`
off, no shader math of that shape is involved, and nothing below rests on it — noted
for completeness, not as a caveat that weakens any finding here.

**Board corners have no DOM presence and no accessibility node** — they are geometry in
a WebGL canvas. Every hover/grab/drop/orbit in this report was driven by dispatching
synthetic `PointerEvent`/`WheelEvent`s at specific canvas-relative pixel coordinates
found by taking a screenshot, cropping and zooming it with Pillow to locate a corner
precisely, then dispatching at that pixel and re-screenshotting to confirm a marker
actually appeared there. This is slower than clicking a DOM node but it is the only way
to hit an exact 3D point from outside the page.

**One harness limitation surfaced and is recorded here rather than silently worked
around:** synthetic `PointerEvent`s do not go through the browser's real pointer-capture
machinery, so `OrbitControls`' `releasePointerCapture` call on `pointerup` throws
(`NotFoundError: ... No active pointer with the given id is found`), which occasionally
left `OrbitControls`' internal drag state confused across a *second*, differently-typed
synthetic pointer event and produced an extra, unintended camera rotation. This is a
property of dispatching raw events from outside the page, not a defect in the app —
real mouse/touch input always carries capture semantics. Every finding below was
re-verified against a clean, unconfused camera state before being recorded.

## Fixture

A prior, crashed attempt at this task had already built a fixture and left it in
`localStorage` when this session started (along with 18 stray PNGs in the repo root,
which predate this session and were not touched). The fixture matched the brief
exactly and was reused for Steps 1–3 before being cleared for the mechanical tests in
Steps 4–6, which need precisely known, well-separated positions rather than an
artist-placed layout:

- **Board** — pine, flat, 24×5-1/2×3/4, at `(0,0,0)`.
- **Board (1)** — walnut, on-edge, 24×5-1/2×3/4, at `(40,0,0)`.
- **Board (2)** — plywood, upright, 24×5-1/2×3/4, at `(80,0,0)`.
- **Board (3)** — maple, flat, 24×5-1/2×3/4, at `(80,0,3)`, with one cut (a 3/4"-wide,
  3/8"-deep dado into the thickness face, 6" from the length min end, across the width).

`fixture-overview.png` in the shots directory shows the four parts: pine and the
dado'd maple flat on the ground, walnut standing on edge, plywood standing upright,
with maple's base visually close to plywood's — see the occlusion check below for what
that proximity was used for.

## Step 2: marker colours and legibility

Hovered a corner, an edge midpoint and a face centre on the walnut board (chosen because
CLAUDE.md records the ring — `#f5f2ec` — as existing specifically because a flat fill
is not reliably legible on dark wood):

- Corner → green `#2e9e5b` disc with the light ring. (`hover-walnut-corner-green-crop.png`)
- Edge midpoint → cyan `#22b8d4`. (`hover-walnut-edgemid-cyan-crop.png`)
- Face centre → violet `#8a5fd0`. (`hover-walnut-facecenter-violet-crop.png`)

All three read clearly against walnut's dark grain; the ring is doing exactly the job
CLAUDE.md says it does. The same corner colour was also confirmed on pine
(`corner-marker-on-pine.png`) and on plywood (`silhouetted-corner-plywood.png`) — legible
on both light woods with no ring-related regression.

**No marker at a board's volume centre.** `src/document/snapPoints.ts`'s
`boardSnapPoints` enumerates the 3×3×3 lattice of `{min, mid, max}` per axis and
explicitly `continue`s the one case where all three axes are `mid` (the volume centre)
— so there is no 27th candidate to ever produce a marker there, by construction, not by
convention. Hovering the interior of a board (necessarily behind its own visible face)
only ever picks the nearest of the 26 real candidates — confirmed by never observing a
fourth colour or an unexplained marker anywhere during this pass.

**Marker holds its screen size across zoom.** Measured the rendered marker's pixel
diameter by scanning a screenshot region for `#2e9e5b`-adjacent pixels before and after
zooming the camera in with synthetic `wheel` events (the boards visibly grew ~2× larger
on screen): **7–8px both before and after** (`zoom-near.png`, `zoom-check.png`). The
`screenPixelsPerInch`-driven constant-screen-size behaviour documented in
`SnapMarker.tsx` holds.

## Step 3: the two picking decisions

**A corner silhouetted against empty space is pickable.** Hovered the topmost corner of
the upright plywood board (Board 2), which sits well above and away from every other
board with only the ground grid behind it — a clean silhouette case, §3.1's exact
justification. The green marker appeared precisely there (`silhouetted-corner-plywood.png`).

**An occluded corner is pickable, and its marker draws on top.** The original fixture's
plywood/maple proximity did not produce genuine 3D occlusion on inspection (there was a
visible gap between them), so this was constructed deliberately: Board 2 (plywood,
upright) was temporarily repositioned to `x=8` so its footprint fell entirely inside
pine Board's footprint (pine: `x∈[0,24], z∈[0,5.5]`; plywood at `x=8`: `x∈[8,13.5],
z∈[0,0.75]` ⊂ pine's). Both share `y∈[0, 0.75]`, so pine's top face sits directly between
the camera and plywood's bottom corner along the view ray. Hovering exactly at that
corner's projected screen position showed the green corner marker drawn cleanly on top
of pine's solid surface — a marker where no plywood geometry is visible at all
(`occluded-corner-confirmed.png`, with `occlusion-setup.png` showing the constructed
overlap and `corner-marker-on-pine.png`/earlier crops showing the surrounding context).
This matches `pickSnapPoint`'s documented behaviour (screen-space nearest-candidate,
no raycast, `depthTest: false` on the marker) exactly — the pick is not merely
possible, it is visibly usable. Board 2 was returned to `x=80` immediately after.

## Step 4: the move itself

All mechanical checks below were done on a clean two-board setup — "Board" (pine,
flat, at `(0,0,0)`) and "Board (1)" (pine, flat, at `(30,0,15)`) — chosen after the
original four-board fixture's boards proved too close together on screen for some of
these checks to stay unambiguous (see the note on the withheld-candidate mechanic
below).

**Coincidence, read from `localStorage`, not by eye.** Grabbed Board's corner at its own
position (a zero-offset corner, i.e. `(0,0,0)`), then clicked Board (1)'s top-back
corner. Read `localStorage['sloyd.autosave.v1']` after the move settled:

```
Board:    position [0, 0, 0]  →  moved to  [40, 5.5, 0]
Board (1): position [40, 0, 0]  (unchanged; posture on-edge, extents [24, 5.5, 0.75])
```

(This was the four-board-fixture run, before switching to the two-board setup — pine
grabbed at its own min-corner, walnut's top corner target computed from its own lattice
as `xs=[40,52,64], ys=[0,2.75,5.5], zs=[0,0.375,0.75]` → corner `(i=0,j=2,k=0) =
(40, 0+5.5, 0+0) = (40, 5.5, 0)`.) Pine's new position **`[40, 5.5, 0]`** equals that
target to full precision — both integers, no residual. A second, independent commit on
the clean two-board setup (grab Board's corner at `(0,0,0)`, drop onto Board (1)'s
corner, itself at `(30,0,15)`) produced:

```
Board:    position [0, 0, 0]  →  moved to  [30, 0, 15]
Board (1): position [30, 0, 15]  (unchanged)
```

Exact match again, to full precision, in a scenario with no shared axis values at all
between the two boards' original positions — ruling out an accidental coincidence in
the first case.

**Not rounded to 1/16".** Set Board (1)'s Y to `0.01` (a decimal, off the 1/16"
= 0.0625 grid, per `parseLength`'s documented acceptance of plain decimals). Grabbed
Board's corner at its own position `(0,0,0)` and dropped it onto Board (1)'s
now-off-grid corner. Result:

```
Board:    position [0, 0, 0]  →  moved to  [30, 0.010000000000000009, 15]
Board (1): position [30, 0.01, 15]  (unchanged)
```

`0.010000000000000009` is IEEE-754 float noise from the corner-offset arithmetic
(the grabbed offset was exactly zero, so the new position is `target + 0`, and `0.01`
itself is not exact in binary), not a snap to any grid — 1/16" would have landed on
`0` exactly. The landed value is **not** rounded to 1/16", confirmed by the actual
stored number, not by inspection of the display (which — per invariant 5's display
rounds/stored is exact rule — showed `0"` in the Properties panel the whole time).

**One `Ctrl+Z` reverts the whole move.** After each of the commits above, a single
`Ctrl+Z` restored the moved board to its pre-grab position exactly (verified via
`localStorage` again, not shown board-by-board above for brevity — each revert
reproduced the pre-move position and dimensions bit-for-bit).

**Orbiting between grab and drop leaves the grab intact.** Grabbed Board's corner,
then dragged a synthetic pointer sequence across the canvas (down/move/move/up on a
second `pointerId`) to orbit the camera through a large angle — `grabbed-before-orbit.png`
vs. `after-orbit.png` show the view changing from a normal 3/4 perspective to a near
edge-on angle. The grabbed marker (green dot) is visible in both, at the correct
reprojected screen position in the new view. A subsequent click on another board's
corner (in a follow-up, cleanly-isolated repeat of this same check, to route around the
pointer-capture harness issue noted above) committed the move successfully, confirming
the grab was never silently dropped by the orbit.

**Grabbed and hover markers are both visible while carrying.** `hover_check3`-era
screenshots show two markers on screen simultaneously — the persistent grabbed marker
on the origin board and a second, independent hover marker tracking the live cursor
position over the other board — both green in that instance, both clearly separate
discs.

**Hovering the grabbed board itself offers no markers.** With Board (1) grabbed at one
of its own corners, hovering a *different* corner of that same board produced no
second marker (`no-marker-own-board.png` shows only the one grabbed-corner marker, even
with the cursor sitting directly over another of that board's own candidate points).
This matches `MoveTool.tsx`'s `candidates` memo, which filters out `p.owner.id ===
grabbed.owner.id` — the grabbed board's own points are not offered at all, not merely
suppressed at render time.

**A note on why the four-board fixture was abandoned for these particular checks:**
an early off-grid attempt on the original fixture (walnut moved to `y=0.01`, sitting
0.01" from a differently-postured board's coincident corner) produced an ambiguous
double-grab — because both boards' corresponding corners projected to the same screen
pixel, a second click at that pixel could legitimately hit either board depending on
depth tie-breaking, and did hit the "wrong" one relative to what was intended. This is
correct, documented `pickSnapPoint` behaviour (nearest-on-screen, ties broken by depth)
working exactly as designed — not a bug — but it makes a test case built entirely on
0.01"-separated coincident points a poor choice for demonstrating that specific
mechanic unambiguously. The two-board, tens-of-inches-apart setup removed the ambiguity
and re-confirmed identical results.

## Step 5: the four gates

All four checked against a live document with a board selected (via the parts-list,
which is a separate affordance from clicking in the viewport and remains active in
either tool — confirmed as expected, not a gate violation, since `commitSnapMove` also
deliberately sets `selectedId` to the moved board's id per `store.ts` so a completed
move shows its result, distinct from "clicking a board doesn't select it").

- **Clicking a board (in the viewport) does not select it while Move is active.**
  Clicked squarely on a board's face (not a snap point) while a *different* board was
  selected; the Properties panel's displayed board never changed.
- **Clicking empty space does not deselect.** Clicked open grid with a board selected;
  Properties still showed that board afterward.
- **The gizmo is absent while Move is active, and returns on Escape.** `gate-no-gizmo.png`
  shows a selected board with no `TransformControls` handles visible while Move is the
  active tool; `gizmo-back-after-escape.png` (after one `Escape` with no grab held)
  shows the tool switched back to Select and the gizmo's arrows/planes reappeared on
  the same board.
- **Delete is a no-op while carrying, and works normally otherwise.** With a corner
  grabbed, `Delete` left both boards in `localStorage` unchanged and the grab marker
  still held (`after-delete-noop.png`). With the grab released and Move tool exited
  (Select tool, a board selected, nothing grabbed), the same `Delete` key removed the
  board from `localStorage` immediately; one `Ctrl+Z` restored it.

## Step 6: keyboard and the cut-list/modal interaction

- **`M` toggles the tool.** Pressed with focus on `body` (not a text field): first press
  switched the Toolbar's "Move" button to pressed state; second press switched it back
  to "Select".
- **`m` in a text field does not enter the tool.** Typed `m` with focus in the
  project-name field: the character was inserted into the field's text (`Untitledm`)
  and the Toolbar stayed on "Select" — `isTextEntry`'s `INPUT` check is doing its job.
- **The cut list / Escape interaction, §5.5's specific requirement.** Grabbed a corner,
  confirmed the marker was held (`grab-before-cutlist.png`), opened the cut list, then
  pressed `Escape` once: the sheet closed and **the grab marker was still visible**
  immediately after (`cutlist-closed-grab-held.png`) — App's `cutListOpen` guard runs
  *before* the grab/tool Escape logic, so CutList's own Escape handler (which only
  closes the sheet) fires instead of App's. A **second** `Escape` (sheet now closed) was
  then checked not just visually — the marker looked unchanged, which is ambiguous by
  itself (a lingering *hover* marker at the same screen position looks identical to a
  *grabbed* one) — but a diagnostic click on a different board's corner afterward
  neither committed nor moved the originally-grabbed board, which is only possible if
  the second `Escape` had in fact called `cancelGrab()`. Confirmed via `App.tsx`'s own
  logic (`if (grabbed) { cancelGrab() } else if (tool !== 'select') { setTool('select')
  }`) and by this behavioural check, not by screenshot alone.
- **Cursor is `crosshair` while the tool is active.** `getComputedStyle(canvas).cursor`
  read `"crosshair"` with Move active.

## Step 7: constants

`PICK_RADIUS_PX` (12), `MARKER_PX` (9), `RING_PX` (2) and the four colours
(`#2e9e5b`/`#22b8d4`/`#8a5fd0`/`#f5f2ec`) were all exercised across pine, walnut and
plywood, at normal and zoomed-in camera distances, and against both a silhouetted and
an occluded corner. None needed retuning — every marker was legible, easy to land a
synthetic pointer on, and held its size correctly. **All four are recorded as
verified, unchanged**, not merely assumed correct because no one complained.

## What could NOT be checked on this host

- **Real pointer/touch input.** Every interaction here was a synthetic `PointerEvent`
  dispatched directly on the canvas element from outside the page. This is necessary
  because board corners have no DOM presence to target, but it means real capture
  semantics, real multi-touch, and real OS-level input timing were never exercised —
  only their approximation. The one harness artifact this produced (a confused
  `OrbitControls` drag state after a failed `releasePointerCapture`) is called out
  above and was worked around, not silently absorbed into a finding.
- **A precise, independent re-derivation of the camera's screen projection** was
  attempted early in this pass (to compute exact corner pixel coordinates
  analytically) and abandoned after producing self-contradictory results — likely an
  error in reproducing three.js's camera-specific `lookAt` argument order, not
  investigated further once the crop-and-zoom-a-screenshot approach proved reliable
  and cheaper. This does not weaken any finding above (every hover was confirmed by a
  screenshot showing the correct marker, not assumed from the projection math), but it
  means no independent numeric check of the projection itself exists in this report.
- **Real GPU rendering.** Per follow-up 26a, this host runs software GL (llvmpipe).
  Recorded as a standing caveat per the task brief; it does not affect this round's
  findings because nothing here depends on undefined or precision-sensitive shader
  behaviour (every marker is `MeshBasicMaterial`).

## Defects found

**None.** Every behaviour described in the task brief and CLAUDE.md's description of
this round matched what was observed. The one anomaly encountered (a confused camera
orbit after a synthetic multi-pointer sequence) was root-caused to the test harness's
lack of real pointer-capture semantics, not to application code, and did not recur once
worked around.

## Files referenced

Screenshots referenced above live in
`.superpowers/sdd/2026-08-02-sloyd-snap-move/shots/` (gitignored via `.superpowers/` in
`.gitignore` — not part of this commit).
