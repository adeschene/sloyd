# Browser verification: only the selected board can be grabbed

Task 5 of the selected-board grabs plan. This round narrows the Move tool's **grab**
candidates to the currently selected board's snap points, leaves the **target** set
alone, drops a live grab whenever the selection moves off the grabbed board, refuses a
commit whose grabbed board is not the selected one, and shows a *Select a part to move*
hint when Move is armed with nothing selected. Design:
`docs/superpowers/specs/2026-08-03-sloyd-selected-board-grabs-design.md`.

`src/viewport/` has no unit tests by design, so **this pass is the only verification
`MoveTool.tsx`'s candidate memo gets**. The store half (the `edit()`/`selectBoard`
clearing and `commitSnapMove`'s mismatch guard) is covered by unit tests in
`src/store/store.test.ts`; everything below is about what the tool actually does in a
browser.

## How this was driven

Playwright MCP against `npm run dev -- --port 5199`, Chromium, software GL (llvmpipe —
follow-up 26a). Nothing in this round rests on shader behaviour: every marker is
`MeshBasicMaterial` with `depthTest`/`toneMapped` off, and no claim below depends on how
a surface is shaded. Noted for completeness, not as a caveat that weakens a finding.

Two things about the method differ from the snap-move round's pass
(`docs/browser-verification-snap-move.md`), and both are improvements worth stating
because they are what makes the negative claims below credible:

1. **The projector is the app's own, not a re-derivation.** The snap-move pass located
   corners by screenshotting, cropping and zooming, and explicitly abandoned an attempt
   to compute pixel coordinates analytically (follow-up 106). That attempt failed
   because it *reimplemented* the projection. This pass instead reaches the live r3f
   root (`import('/node_modules/.vite/deps/@react-three_fiber.js')` → `_roots`, served
   by the Vite dev server, so it is the same module instance the app is using) and runs
   the exact six lines of `MoveTool.tsx`'s own `project()` against the same camera and
   the same `size`. A mismatch with what the tool computes is impossible by
   construction. It was validated before being trusted: projecting Board's corner
   `(0, 0.75, 5.5)`, moving the pointer to that pixel, and confirming a marker rendered
   at exactly that world position (`fixture-A-selected-corner-marker.png`).

2. **Interactions are real OS-level input, not synthetic `PointerEvent`s.** Every
   hover, click and keypress backing a result below was driven with Playwright's
   `page.mouse` / `page.keyboard`, i.e. CDP-driven trusted input with real
   pointer-capture semantics — not `element.dispatchEvent(new PointerEvent(...))`. This
   removes the specific harness artifact follow-up 106 records (`OrbitControls`'
   `releasePointerCapture` throwing on a synthetic `pointerup`). See "What was NOT
   checked" for the part of 106 that still stands: corners still have no DOM presence,
   so the *coordinate* still comes from the projector rather than from a locator.

   Stated precisely, because a blanket claim over a mixed pass is exactly the defect
   follow-up 108 records: this session *began* with synthetic dispatch, and Steps 3 and 5
   were first driven that way. On review, every one of those checks was **re-driven end
   to end with `page.mouse`** — the projector validation, both shared-point hovers and
   their screenshots, both ownership commits, the A-only/B-only probes and the off-grid
   `0.01` commit — and the screenshots cited below were re-taken under real input and
   re-scanned. The numbers in this report are the real-input run. The synthetic run
   produced identical results and is not relied on anywhere; the one thing it did produce
   is the console error discussed under Step 8.

**Marker presence is read two ways, and neither is "by eye".**

- **Scene-graph read.** The rendered markers are found by walking the live
  `scene` for meshes at `renderOrder === 11` with `depthTest === false` — i.e. what
  `SnapMarker.tsx` actually mounted — and reading each one's material colour and its
  group's world position. This gives *which* point is marked and *what kind* it is, and
  an empty array is a real assertion of absence.
- **Pixel scan.** Screenshots are scanned in Python for the three marker hues
  (`#2e9e5b` corner, `#22b8d4` edge-mid, `#8a5fd0` face-centre, tolerance ±8/channel)
  across the whole canvas region. This is the independent check that the scene-graph
  read corresponds to ink on screen, and it is what makes "no marker anywhere" mean
  something.

Board positions are read out of `localStorage['sloyd.autosave.v1']` **after autosave
settles** (~1s), never judged by eye. Autosave is debounced, which is worth stating
because an immediate read after a commit still shows the pre-move document.

## Fixture

Built through the UI — *+ Add board* twice, then the Properties panel's X / Z /
Material fields:

- **Board** ("A") — pine, flat, 24 × 5-1/2 × 3/4, at `(0, 0, 0)`.
  Extents `[24, 0.75, 5.5]`, so it occupies x∈[0,24], y∈[0,0.75], z∈[0,5.5].
- **Board (1)** ("B") — walnut, flat, 24 × 5-1/2 × 3/4, at `(24, 0, -2.75)`.
  Extents `[24, 0.75, 5.5]`, so it occupies x∈[24,48], y∈[0,0.75], z∈[-2.75,2.75].

`fixture-overview.png` shows the two, pine on the left, walnut running away to the
right.

**The shared point is `P = (24, 0, 0)`, and the fixture is deliberately built so that
the marker at `P` discriminates its owner by colour.** Read out of `boardSnapPoints`
for each board:

| board | kind of `P` | marker colour |
|---|---|---|
| Board (A) | `corner` | green `#2e9e5b` |
| Board (1) (B) | `edge-mid` | cyan `#22b8d4` |

That asymmetry matters. A green disc with A selected and a green disc with B selected
would be *pixel-identical* — colour encodes kind, not owner — so two screenshots of a
shared corner would have proved nothing about which board the marker names. Offsetting
B by 2-3/4" in Z makes `P` land on the midpoint of one of B's edges instead of on a
corner, so the hue at one fixed pixel **is** ownership evidence. The numeric check
(which board's `position` changes) is still the primary evidence; this just gives the
visual check something to say.

Two more points are used throughout:

- **A-only:** `(0, 0.75, 5.5)` — a corner of A, 24" from B's nearest candidate.
- **B-only:** `(48, 0.75, 2.75)` — a corner of B, 24" from A's nearest candidate.

## Step 3 — the restricted grab set

**Same pixel, two selections, two different owners.** `P` projects to client pixel
`(563.3, 480.1)`. The mouse was moved there with each board selected in turn, via the
parts list:

| selection | marker at `P` (scene read) | whole-canvas marker pixels (screenshot scan) |
|---|---|---|
| Board (A) | `#2e9e5b` @ `[24, 0, 0]` — A's corner | corner **51**, edge-mid 0, face-centre 0 |
| Board (1) (B) | `#22b8d4` @ `[24, 0, 0]` — B's edge midpoint | corner 0, edge-mid **51**, face-centre 0 |

Shots: `shared-point-A-selected-green-corner.png`,
`shared-point-B-selected-cyan-edgemid.png`. Exactly one marker's worth of ink in each
(51 px of one hue, zero of the other two), at the same coordinate, in the other's
colour.

**And the ownership claim, read numerically — which board actually moves.** The marker
colour is corroboration; this is the evidence.

*B selected*, grab `P`, drop on A's corner `(0, 0.75, 5.5)`:

```
grabbed: { kind: 'edge-mid', at: [24,0,0], owner: Board (1) }
Board:     [0, 0, 0]      →  [0, 0, 0]          (unchanged)
Board (1): [24, 0, -2.75] →  [0, 0.75, 2.75]    (moved by exactly [-24, 0.75, 5.5])
```

One `Ctrl+Z` restored `[24, 0, -2.75]` exactly. Then *A selected*, grab the same pixel,
drop on B's corner `(48, 0.75, 2.75)`:

```
grabbed: { kind: 'corner', at: [24,0,0], owner: Board }
Board:     [0, 0, 0]      →  [24, 0.75, 2.75]   (moved by exactly [24, 0.75, 2.75])
Board (1): [24, 0, -2.75] →  [24, 0, -2.75]     (unchanged)
```

Same world point, same screen pixel, opposite board moved — decided by the selection,
which is the whole of the round's claim.

**The pre-fix behaviour was not re-driven.** Doing so would mean reverting `src/`, which
this task does not touch. That the tie-break used to decide is the design's diagnosis
(§1) and is what the store unit tests and the candidate memo's own comment record; this
report verifies the post-fix behaviour only, and says so rather than implying an A/B.

## Step 5 — the memo's dependency list, and the unrestricted target set

Design §5 names the dep list as invariant 15's exact failure mode, with the symptom
"markers still drawn on the *previously* selected board while `selectedId` is correct."
Driven directly, in both directions, with the selection changed through the parts list:

| hovered point | A selected | B selected |
|---|---|---|
| A-only `(0, 0.75, 5.5)` | `#2e9e5b` @ `[0,0.75,5.5]` | **no marker** |
| B-only `(48, 0.75, 2.75)` | **no marker** | `#2e9e5b` @ `[48,0.75,2.75]` |
| shared `P` | `#2e9e5b` (A's corner) | `#22b8d4` (B's edge-mid) |

The offered set follows the selection both ways, with no remount involved. The A-selected /
B-only cell was also checked by pixel scan with the mouse parked exactly on that corner:
**zero marker-coloured pixels anywhere in the canvas**, all three hues
(`A-selected-hovering-B-only-point-no-marker.png`).

**The target set is unrestricted, and a move lands exactly.** In both commits in Step 3
the drop point belonged to the *other* board and was offered normally: with A grabbed,
hovering B's corner produced two markers on screen at once (the held grab at
`[24,0,0]` and the live hover at `[48,0.75,2.75]`), and the click committed. This is
design §3 working as written — restrict the grab, leave the target alone.

**Not rounded to 1/16" (invariant 25).** B's Y was set to `0.01` through the Properties
panel (a plain decimal, off the 0.0625 grid), A was grabbed at its own zero-offset
corner `(0,0,0)`, and dropped on B's now-off-grid corner `(48, 0.01, 2.75)`:

```
Board:     [0, 0, 0]        →  [48, 0.01, 2.75]
Board (1): [24, 0.01, -2.75]   (unchanged)
```

The stored Y is `0.01`, read out of `localStorage` — a 1/16" snap would have produced
`0` exactly. (No IEEE-754 residue appears here because the grabbed offset was exactly
zero, so the landed position is `target + 0` with `0.01` copied through unchanged; the
snap-move round's pass recorded the noisy variant of the same check.)

## Step 4 — the empty state

Deselected by clicking empty grid in Select mode, then armed Move with `M`:

- **The hint renders.** Exactly one element with text `Select a part to move`, class
  `toolbar-hint`, sitting beside the tool pair. The **Move button stays enabled** —
  visible in `empty-state-toolbar-hint.png` / `empty-state-toolbar-hint-crop.png`, which
  show it still pressed and interactive.
- **Nothing is markable, exhaustively.** All **52** candidate points (26 per board ×
  2 boards) were projected and hovered one at a time with the real mouse. All 52 were on
  screen; **0 markers** were rendered across the entire sweep. This is not "hovered a few
  places and saw nothing" — it is every point the tool could possibly offer.
- **Nothing is grabbable.** Five of those 52 were then clicked (a corner, a face centre
  and an edge midpoint, spread across both boards). After each: `grabbed` still `null`,
  and `selectedId` still `null` — so the clicks also confirm the click-to-select gate is
  not quietly re-armed by the empty state.

## Step 6 — the three grab-drop paths

Each starts with A selected and A's corner `(0,0,0)` grabbed, confirmed in the store
before the action.

1. **Select B in the parts list.** `grabbed` → `null`, `selectedId` → B. A subsequent
   click at `P` then started a **new** grab of B's own edge midpoint — which is correct,
   not a leftover: with B selected, B's points are the offered set. The discriminating
   read is positional, and both boards were unchanged (`[0,0,0]` and `[24,0,-2.75]`).
2. **+ Add board.** `grabbed` → `null`, `selectedId` → the new *Board (2)*. This is the
   `edit()` selection-callback path design §6.1 exists for — a toolbar button nothing
   gates in Move mode. No board moved. (Undone afterwards.)
3. **Duplicate A.** `grabbed` → `null`, `selectedId` → the duplicate. No board moved.
   (Undone afterwards.)

**And the tool still works normally afterwards.** After all three, on a clean reload:
select A, grab `(0,0,0)`, drop on B's corner `(48, 0.75, 2.75)` → A at `[48, 0.75, 2.75]`,
B unchanged, one `Ctrl+Z` back to `[0,0,0]`.

## Step 7 — the four snap-move gates, unchanged by this round

Regression check, not new ground.

- **No gizmo in Move mode.** Walking the scene for `TransformControls*` objects:
  **0** while Move is active, **3** after `Escape` returns to Select with the same board
  selected.
- **A click on a board does not select it in Move mode.** Clicked a point on A's top
  face at client `(391.9, 405.5)` — measured **32.6 px** from the nearest candidate's
  projection, comfortably outside `PICK_RADIUS_PX` (12), so it is a face click and not a
  near-miss on a snap point — while B was selected. `selectedId` unchanged.
- **A click in empty space does not deselect.** Clicked open grid at `(150, 200)` with B
  selected; `selectedId` unchanged.
- **Delete/Backspace do not delete the board being carried.** With A's corner grabbed,
  `Delete` then `Backspace`: both boards still present in `localStorage`, and the grab
  still held after each.
- **`Escape` backs out one level at a time.** First press: `grabbed` → `null`, `tool`
  still `move`. Second press: `tool` → `select`, selection untouched.
- **Cut list `Escape`.** Grabbed A's corner, opened the cut list (grab intact while the
  sheet was open), pressed `Escape` once: the sheet closed **and the grab was still
  held**. A second `Escape` (sheet now closed) cancelled the grab. This is §5.5's
  requirement, unchanged.

## Step 8 — the console

On a **clean reload** followed by a full real-mouse grab → commit → undo cycle:
**0 errors**. Warnings are the two known three.js deprecations
(`THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated`, `THREE.Clock: This module
has been deprecated`) plus llvmpipe's `GPU stall due to ReadPixels` performance messages,
which are the software-GL renderer reacting to the harness taking screenshots, not the
app.

**One error was produced earlier in the session and is recorded rather than swept up:**
`NotFoundError: Failed to execute 'releasePointerCapture' ... No active pointer with the
given id is found`, raised inside drei's `OrbitControls` `onPointerUp`. Its stack traces
through `eval` — it came from the synthetic-`PointerEvent` phase of the session (an early
attempt at deselecting from injected script), before the pass switched to real
`page.mouse` input and re-drove Steps 3 and 5 under it. It is exactly the artifact
follow-up 106 describes, reproduced here, root-caused to the harness, and not present in
any real-input run.

## What was NOT checked

- **Touch and pen input.** Everything was a real *mouse* pointer. `MoveTool`'s
  `pointerId`-tagged `downAt` guard exists specifically for a multi-touch pinch, and
  that path remains unexercised — as it was after the snap-move round. Follow-up 106's
  touch half stands.
- **Corners still have no DOM presence.** Real input semantics are now exercised, but
  the *coordinate* the pointer is sent to is still computed by projecting a world
  position, not obtained from a locator or an accessibility node. If the projector and
  `MoveTool` were both wrong in the same way, this pass could not tell — that is why the
  projector was validated against a rendered marker before being trusted, and why every
  marker claim is backed by the scene read and, in the load-bearing cases, by a pixel
  scan of a screenshot.
- **The pre-fix behaviour.** Not re-driven; see Step 3.
- **Real GPU rendering.** Software GL (llvmpipe), per follow-up 26a. No finding here
  depends on shader behaviour.
- **More than two boards sharing one point.** The fixture is the two-board case the
  design describes. Three coincident points (two of them on unselected boards) would
  still reduce to "only the selected board's points are offered", but it was not driven.
- **A grab surviving a camera orbit** was not re-checked; it is unchanged by this round
  and was verified in the snap-move pass.
- **Marker colour legibility across materials** was not re-checked either — unchanged by
  this round, and covered by the snap-move report (including its follow-up 108
  correction). This pass used pine and walnut only, and claims nothing about plywood.

## Defects found

**None.** Every behaviour the design and the task brief describe matched what the browser
did. The single console error encountered was root-caused to this session's own synthetic
event dispatch and does not occur under real input.

## Files referenced

Screenshots and the console dump live in
`.superpowers/sdd/2026-08-03-sloyd-selected-board-grabs/shots/` (gitignored via
`.superpowers/` — not part of this commit).
