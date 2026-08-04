# Browser verification: the tape measure and guide points

Task 10 of the guide-points plan. This round adds a **Tape** tool (`T`, or the toolbar
button): click a snap point to anchor, hover a second to read the distance in a readout
overlay, then either click to place a persistent **guide point** there, or type a length
into the readout and press Enter to place one that far along the anchor→hover ray.
Guides are drawn always in a smaller ringless "resting" marker, grow to the full marker
when hovered, are snappable by the Move tool, are gated by a **Guides** checkbox, and are
listed and removable in a **Guides** panel. Schema **v6**.

`src/viewport/` has no unit tests by design. `offsetPoint`, `guideSnapPoints`, the store's
guide actions and the two anchor prohibitions are all unit-tested (`npm test`: 768 passed
across 33 files, run at the end of this pass on the unchanged tree); what is
**only** covered here is whether the fourth marker hue is legible and distinct, whether the
resting/hovered distinction reads, whether the measured line and readout appear, whether
the placed coordinates are exact rather than snapped, whether guides really are Move
targets but never Move sources, and whether the anchor survives the interactions the unit
tests cannot see the readout during.

The brief's 19 numbered checks (1, 1b, 2–19) were all run. **No defect was found.**
**Neither browser-settled constant was retuned** — see "Constants" below for the evidence
that each holds.

## How this was driven

Playwright MCP against the already-running `npm run dev -- --port 5180`, Chromium at a
1600 × 1000 window (canvas 1288 × 947), software GL (llvmpipe — follow-up 26a).
**Against the dev server only. Production was never opened**, and `localStorage` was
cleared and the page reloaded before the fixture was built, so nothing here read or wrote
any pre-existing project.

Method carried forward from the two previous passes:

- **The projector is the app's own arithmetic against the live r3f camera.** `TapeTool.tsx`'s
  `project()` is a closure inside a `useEffect` and is not exported, so — as in the
  cut-points pass — its six lines were transcribed verbatim and re-run against the **live**
  camera and `size` objects, reached through the Vite dev server's module graph
  (`import('/node_modules/.vite/deps/@react-three_fiber.js')` → `_roots` → `root.store.getState()`).
  `THREE.Vector3` came from `/node_modules/.vite/deps/three.js`, the same instance the app
  uses. Nothing about the projection was re-derived from first principles.
- **Which point *should* win at a pixel was computed by the app's own picker**, not by eye:
  `pickSnapPoint` and `PICK_RADIUS_PX` were imported from `/src/viewport/snapPick.ts` and run
  over `snapPointsFor`/`guideSnapPoints` output taken from the live document, so every aim
  point below was confirmed to be the nearest candidate before the mouse was moved there.
- **Store identity was verified before a single state read was trusted.** `useStore` was
  imported from `/src/store/store.ts`; a real `T` keypress was then driven and the imported
  handle observed to flip `tool` from `select` to `tape`, and `Escape` to flip it back. A
  second module instance would have shown a pristine store agreeing with itself while
  describing nothing.
- **Every interaction is real trusted input** — Playwright `page.mouse` / `page.keyboard` /
  `locator.click()`, all of which dispatch through CDP. **No synthetic `PointerEvent` was
  dispatched at any point in this session.** That includes the fixture build: names,
  dimensions, positions, postures, materials and the dado were all entered by clicking the
  real fields and typing.
- **Marker presence is read out of the live scene graph**, by walking the scene for meshes
  with `depthTest === false` at `renderOrder` 10 or 11 and reading each one's material colour,
  circle radius and world position. A full-size marker is the pair `(ring r = 6.5, disc r = 4.5)`;
  a resting guide is a lone `r = 3` disc with no ring. An empty array is a real assertion of
  absence.
- **Every absence claim has a positive control in the same hover session**, named where it
  occurs, so a listener that had silently stopped firing could not read as a clean pass.
- **Every coordinate claim is read out of `localStorage['sloyd.autosave.v1']`** after autosave
  settles (~1 s), parsed as JSON — never judged by eye. The Guides panel *displays* rounded
  values (`formatLength`), which is correct and is exactly why the stored document is the
  source for these claims.
- **Two size claims are pixel-counted rather than eyeballed** (check 1b), by cropping the
  saved PNG and counting pixels matching the marker hue and the ring colour.

### Two standing bounds, restated rather than rediscovered

- **Follow-up 26a.** This host runs software GL (llvmpipe, no GPU), which returns `1.0` for
  `pow(0.0, 0.0)` where real hardware returns `NaN`. Nothing in this round is shader-adjacent:
  every marker is a `MeshBasicMaterial` disc with `depthTest` and `toneMapped` off, and the
  measuring line is drei's mesh-based `<Line>` with `toneMapped` off. No claim below depends
  on how a surface is lit. The one judgement that touches shading at all — that the four hues
  stay legible on walnut and plywood — is a contrast judgement about ink the renderer draws
  unconditionally.
- **Follow-up 106.** Mouse and keyboard were exercised for real. **Touch and pen were not**,
  and OS-level input timing and multi-pointer pointer-capture go unexercised regardless of
  what was done with the mouse.

## Fixture

Built through the UI with real mouse and keyboard, from an empty document after clearing
`localStorage`.

- **Side panel** — **plywood**, upright, rotation 0°, 24 × 12 × ¾ at `(0, 0, 0)`.
  Upright puts `length` on Y, so extents are `[12, 24, 0.75]`: x ∈ [0,12], y ∈ [0,24],
  z ∈ [0,0.75].
- **Cut** (Properties → Cuts) — face `thickness`, from `max`, across `width`, offset 8",
  width ¾", depth ¼". Position axis is `length` (Y), so the dado is a horizontal band on
  the +Z face at y ∈ [8, 8.75], **floor at z = 0.5**, mouth at z = 0.75.
  `cutSnapPoints` returned **15** and `snapPointsFor` **41** = 26 box + 15 cut.
- **Shelf** — **walnut**, flat, 11 × **5.3** × ¾ at `(16, 8, -6)`. The `5.3` width is
  deliberate: it puts the board's z-midpoints at `-3.35`, which is **not** on the 1/16"
  grid, and is what check 6 aims at.
- **Rail** — **pine**, on-edge, 18 × 3 × ¾ at `(-14, 0, 2)`.

`guide-points-fixture-overview.png` shows the three, with the dado clearly drawn across
the plywood panel and the empty Guides panel below Properties.

Three materials on purpose: check 1 has to be judged on the near-white ground, on walnut
and on plywood, and pine came free as the third.

**The document was mutated as the pass went on** — eleven guides were placed and some
removed, the Rail was moved onto a guide and undone, a fourth board was added by check 19
and deleted, and the Shelf was finally seated into the dado by check 17. The description
above is what was *built*, not what the final autosave holds.

## Checks 2, 3 — anchor, hover, line, and a plain second click

**Check 2 — PASS.** Tape armed from the toolbar button; anchor clicked at the panel corner
`(0, 0, 0.75)`, then the pointer moved to the Shelf corner `(16, 8, -6)`. Store read:
`tapeAnchor.at = [0,0,0.75]`, `tapeHover.at = [16,8,-6]`, readout label **`19-1/8"`**.
Hand-computed distance is `hypot(16, 8, 6.75) = 19.1197"`, which is `19-1/8"` at the
document's 1/16" precision — so the readout is right, not merely plausible.
`guide-tape-anchor-hover-line.png` shows both green corner markers, the readout overlay at
the canvas's bottom-right with its distance input, and the measuring line running between
them **through** the panel (it is drawn with `depthTest` off, so it stays visible where it
passes behind geometry).

**`computeLineDistances` was not needed, and that is a code fact rather than a test result.**
`TapeTool.tsx` uses drei's `<Line>` **solid**, not dashed. `computeLineDistances` is a method
of `THREE.Line`, not of `BufferGeometry`, so the brief's geometry-ref spelling could not have
worked in any case; because the line is solid, nothing needs the distances at all. The
screenshot confirms a solid line renders.

**Check 3 — PASS.** A second click on the same target placed a guide.
`localStorage['sloyd.autosave.v1']` afterwards held `guides: [{ id: …, at: [16, 8, -6] }]`
and `version: 6`; the anchor and hover both cleared; the Guides panel showed one row,
`16", 8", -6"`, with its `×`.

## Check 18 — coincident candidates (design §10), run immediately after check 3

Check 3's guide sits at `(16, 8, -6)`, which is **exactly** the Shelf's own box corner, so
two candidates occupy one pixel at identical depth.

**Observed: the board corner wins, every time, and it does not flicker.**

- Six re-hovers, each preceded by moving the cursor well away and back with a 1–2 px jitter
  in the aim point: **6/6** produced `tapeHover.kind === 'corner'`, `owner.type === 'board'`,
  and a full-size `#2e9e5b` marker.
- Eight samples over two seconds with the cursor **stationary**: the marker set was
  byte-identical every time — `#4f6fd0:r3 | #f5f2ec:r6.5 | #2e9e5b:r4.5`. **No flicker.**

That is what design §10 predicts and accepts: `snapPointsFor` output is concatenated before
`guideSnapPoints`, both candidates project to the same pixel at the same depth, and
`pickSnapPoint`'s depth tie-break leaves the first-found winner standing. It is arbitrary in
the sense that nothing *states* the rule, but it is stable in practice, so the follow-up 120
trigger (visible flicker → add a deterministic ordering rule) did **not** fire.

One consequence worth recording because it is invisible in the numbers: the resting guide
disc (r = 3) is drawn *underneath* the full-size board marker (r = 4.5), so a guide placed
exactly on a board point is completely hidden by the marker of the point it sits on while
that point is hovered. Nothing is wrong — they are the same position — but it means a
screenshot of that pixel cannot distinguish the two.

## Check 1 — the fourth marker colour

**PASS. `SNAP_COLORS.guide = '#4f6fd0'` holds and was NOT retuned.**

**A limit of the medium, stated rather than papered over: at most three hues can render in
one frame.** Each tool draws one anchor marker and one hover marker; resting guides draw
always. So the four-way comparison below is **four labelled frames**, each pairing the guide
blue at *full size* with one of the other three on a named material, not one frame with four
markers in it. Two of the three pairings are the ones that matter (blue vs violet is the
closest, blue vs cyan the second closest); green is far from all of them.

| Frame | Ground | Pairing | File |
|---|---|---|---|
| A | plywood face + near-white ground | corner `#2e9e5b` + edge-mid `#22b8d4` + three resting guides `#4f6fd0` | `guide-color-plywood-green-cyan-blue.png` |
| B | plywood face | face-centre `#8a5fd0` (full) + guide `#4f6fd0` (full) | `guide-hue-plywood-violet-blue.png` |
| C | walnut top face | corner `#2e9e5b` (full) + guide `#4f6fd0` (full) + two resting guides | `guide-hue-walnut-green-blue.png` |
| D | pine face | edge-mid `#22b8d4` (full) + guide `#4f6fd0` (full) | `guide-hue-pine-cyan-blue.png` |

Findings from looking at them:

- **Legible on all four grounds.** The near-white ground (`#e6e3dd`), plywood, walnut (the
  darkest surface in the app) and pine all leave the blue disc plainly visible. On walnut it
  is the hardest case — a mid-dark blue on mid-dark brown — and the light ring is what carries
  it at full size; at resting size (ringless) it is quieter but still unambiguous. Frame C
  shows both states of blue on walnut in one image.
- **Distinct from violet, which is the pair that could have failed.** Frame B puts
  `#4f6fd0` and `#8a5fd0` side by side at identical size on identical material. They read as
  blue and purple, not as two shades of one thing. This is the one comparison a theory
  argument could not settle, and it is settled.
- **Distinct from cyan and green** by a wide margin (frames A and D).
- **Still reads as chrome, not as model.** All four remain cool and saturated against a
  palette that is entirely warm and desaturated, so the guide colour does not break the
  premise the other three rest on.

## Check 1b — resting versus hovered

**PASS. `RESTING_PX = 6` holds and was NOT retuned.**

Judged on a guide at `(0, 6, 0.75)` — placed by check 4's typed offset, so it is **not**
coincident with any board lattice point (nearest other candidate: 35.3 px away). That
matters: the first attempt used a guide that *was* coincident with a board face-centre, and
hovering it correctly picked the **board** point and grew a violet marker, which would have
made a false 1b result. Recorded because it is the kind of fixture error that looks like a
pass.

- `guide-1b-resting-zoom.png` — cursor parked well away: a small ringless blue dot.
- `guide-1b-hovered-zoom.png` — same guide, cursor on it: a larger blue disc with the light
  ring.

Both are 80 × 80 px crops of the same region of two full-page screenshots, upscaled 4× with
nearest-neighbour for the write-up. Pixel counts over the un-upscaled crops:

```
resting:  28 px of guide blue,   0 px of ring
hovered:  67 px of guide blue,  33 px of ring
```

which matches `π·3² ≈ 28` and `π·4.5² ≈ 64` — i.e. the growth is real and is exactly the
size change the code intends, not an impression.

**Judging "quiet enough".** `RESTING_PX`'s own comment sets the bar at *"a dozen guides do
not read as noise"*, so the judgement was made at a dozen rather than at whatever the pass
happened to accumulate. `guide-resting-density-12-guides.png` is the whole viewport in Select
mode with **twelve** guides placed and **all twelve on screen** (confirmed by projecting each
marker's world position and checking it falls inside the canvas, not by counting dots in the
image). They read as small blue scaffolding dots, plainly present and plainly secondary to
the boards; they do not compete with the model or with the grid.
`guide-resting-density-8-guides.png` is the same judgement earlier in the pass at eight.
**Judging "big enough to aim at":** aiming is governed by
`PICK_RADIUS_PX = 12`, not by the marker, so the marker only has to be findable by eye — and
at 6 px on all four grounds it is. Both halves of the constant's obligation hold, so it stays
at 6.

**One caveat on the pixel counts.** The first attempt at these two crops used
`page.screenshot({ clip })` taken ~500 ms after the hover and returned *identical* pixel
counts for both states — the clipped capture had raced the frame. The numbers above come from
full-page captures taken after a 1 s settle and cropped afterwards. Anyone re-running this
should not trust a clipped screenshot taken immediately after a hover.

## Checks 4, 5 — typed distances

Measured span: the panel's left edge, corner `(0,0,0.75)` → corner `(0,24,0.75)`, readout
**`24"`** (exact). In each case the pointer then **left the canvas** to reach the readout
input, which is the path `TapeTool`'s hover latch exists for; the store was read at typing
time and `tapeHover` was still `[0,24,0.75]`, so the latch held. `guide-typed-distance-entry.png`
shows the entry state.

| Typed | Expected | Stored in `localStorage` | |
|---|---|---|---|
| `6"` | between the two points | `[0, 6, 0.75]` | **PASS** (check 4) |
| `30"` | past the target, same ray | `[0, 30, 0.75]` | **PASS** (check 5) |
| `-6"` | backward from the anchor | `[0, -6, 0.75]` | **PASS** (check 5) |

All three are exactly `anchor + k·(target − anchor)` for `k = 0.25`, `1.25` and `-0.25`.

## Check 6 — exact coincidence, not rounded to 1/16"

**PASS.** The Shelf's `5.3"` width puts its +Y face centre at `(21.5, 8.75, -3.35)`;
`-3.35 / 0.0625 = -53.6`, so that coordinate is **not** a multiple of 1/16".

A guide placed there by a plain second click stored **`[21.5, 8.75, -3.35]`** — the target's
exact value, un-snapped. The Guides panel displays it as `21-1/2", 8-3/4", -3-3/8"`, which is
`formatLength` doing its job and is precisely why this check reads the document rather than
the panel.

Two further guides placed later by typed offsets across skew spans stored
`[20.504415374316316, 8.75, -3.829690774193047]` and
`[-8.081636457007136, 2.0136060761678563, 2.75]` — full double precision, no rounding
anywhere. Invariant 25's rule (a snap result is the exact coincidence, never the gizmo's
1/16") reaches this second tool intact.

## Check 7 — the zero-length refusal

**PASS.** Anchored at `(0,0,0.75)`; with the pointer still there the hover *is* the anchor,
and the readout correctly showed **`0"`**. `5"` typed into the input and Enter pressed:

- guide count **6 before, 6 after** — nothing placed;
- `tapeAnchor` still `[0,0,0.75]` — the anchor survives, so the user can move and retry;
- the input carried the `invalid` class (`input tape-readout-input invalid`);
- no guide has a non-finite coordinate, and the serialised guides contain no `null`
  (which is what a `NaN` becomes in `JSON.stringify`).

`guide-zero-length-refusal.png`. This is `offsetPoint`'s zero-direction guard doing the
thing its comment says it exists for, reached the way a user would actually reach it.

## Check 8 — guides are Move targets

**PASS.** Rail selected, Move armed, its corner `(-14, 0, 2)` grabbed (store:
`grabbed.at = [-14,0,2]`). Pointer moved to the guide at `(0, 30, 0.75)`: the scene showed a
full-size marker at that position in **`#4f6fd0`** — i.e. the winning candidate was the
**guide**, of `kind: 'guide'`, not some board point that happened to be nearby.
`guide-move-grab-onto-guide.png`.

On commit, the Rail's stored position became exactly **`[0, 30, 0.75]`**, which is
`[-14,0,2] + ([0,30,0.75] − [-14,0,2])`. Exact coincidence, read from `localStorage`.
`Ctrl+Z` restored `[-14, 0, 2]`.

## Check 9 — a guide cannot be grabbed

**PASS.** Move armed, Rail selected, **nothing grabbed**. Pointer moved onto the guide at
`(0, -6, 0.75)` — isolated, no board candidate near it. Scene read: the only marker meshes
present were the **eight resting guide discs** (`r = 3`, no rings). No full-size marker, no
ring, `grabbed` still `null`. `guide-move-no-grab-on-guide-no-marker.png`.

**Positive control, same hover session:** moving to the selected Rail's own corner
`(-14, 0, 2)` immediately after added the `r = 6.5` ring plus an `r = 4.5` `#2e9e5b` disc. So
the listener was alive and the absence above is a real absence.

## Check 10 — the Guides checkbox hides *and* withholds

**PASS**, both halves.

- **Hides.** With the checkbox off, the scene marker walk returned `[]` — all eight resting
  discs gone. `guide-checkbox-off-hidden.png`.
- **Withholds.** Still with it off: Move armed, the Rail's corner grabbed (`grabbed` true),
  pointer moved onto the known guide position `(0, 30, 0.75)`. The only full-size marker in
  the scene was the grabbed point's own; nothing rendered at the guide.
  `guide-checkbox-off-no-candidate.png`.
- **Positive control, same session:** moving on to a board corner `(0, 24, 0.75)` produced a
  full-size `#2e9e5b` marker there.

## Check 11 — the four gates, in Tape mode

**PASS**, all four. Shelf selected throughout, so a gate failure would have been visible as
`selectedId` changing.

| Gate | How it was driven | Result |
|---|---|---|
| No board selection on the tool's clicks | anchor click landed on the **Rail**, commit click on the **Side panel** | `selectedId` stayed the Shelf for both |
| No deselect on an empty-space click | click at (200, 900), empty ground | `selectedId` unchanged |
| No gizmo | scene object-type walk | Select mode: `TransformControlsGizmo` + `TransformControlsPlane` present, 72 meshes. Tape mode, **same board still selected**: both absent, 22 meshes |
| Delete does not delete while anchored | `Delete` then `Backspace` with an anchor live | 3 boards before, 3 after; anchor survived |

Two of these four rows are absence claims, and **both have a positive control**:

- *Gizmo.* The Select-mode reading is the control — it is what makes the Tape-mode absence
  mean something. (A first attempt at this check read `0` in *both* modes because it sampled
  200 ms after the selection, before the gizmo mounted; the numbers above come from a re-run
  with a proper settle.)
- *Delete.* "Nothing was deleted" is worthless unless Delete deletes at all under this
  harness, so the state was rebuilt (Tape armed, Shelf selected, anchor at `(-14,0,2)`) and
  driven twice. **With the anchor live:** `Delete` → 3 boards, anchor intact. **Then one
  `Escape` to drop the anchor only** — same tool (`tape`), same `selectedId`, same focus,
  nothing else changed — and `Delete` again → **2 boards, the Shelf gone**. `Ctrl+Z` restored
  all three. So the gate is the anchor and nothing else, and the first reading was a real
  refusal rather than a dead listener.

`guide-gate-gizmo-select-mode.png` / `guide-gate-no-gizmo-tape-mode.png`.

## Check 12 — the cut-list Escape interaction

**PASS.** Anchored at `(-14, 0, 2)`; **Cut list** opened → `.cutlist-overlay` present,
`.app-shell` carrying `inert`, `tapeAnchor` still `[-14,0,2]`
(`guide-cutlist-open-anchor-held.png`). `Escape` pressed → overlay gone, `tapeAnchor` still
`[-14,0,2]`, `tool` still `tape`.

This is `App`'s existing keydown effect early-returning on `cutListOpen` above the Escape
ladder — the sheet consumed the key and the anchor behind it was untouched, exactly as the
snap-move round's correction to its own §5.5 intended.

## Check 13 — undo

**PASS**, both halves.

- **After placing a guide.** 10 guides → placed one at `(12, 24, 0.75)` → 11 → one `Ctrl+Z`
  → 10, with the new id gone and the other ten present in the same order. One guide removed,
  nothing else.
- **After Clear all.** 10 guides → **Clear all** → 0, and the panel showed
  *"No guides. Use the Tape tool to place one."* → one `Ctrl+Z` → all **10 restored, same
  ids, same order** (compared as a serialised id list, not by count).

**Also exercised, though not on the brief's list:** a single row's `×` button. 10 → 9, the
right one removed, and one `Ctrl+Z` restored the exact list. `guide-panel-list.png`.

## Checks 15, 16, 17 — the dado, which is what this round and the cut-points round unlock together

**Check 15 — PASS, and the marker is on the drawn feature.** Anchored at the panel's box
corner `(0, 0, 0.75)`, then hovered the **inside corner where the dado floor meets its
shoulder** at `(0, 8, 0.5)`. Store: `tapeHover.at = [0,8,0.5]`, readout **`8"`**
(hand-computed `hypot(0, 8, 0.25) = 8.0039"` → `8"` at 1/16). So the tape is reading
`snapPointsFor`, not `boardSnapPoints`; a `boardSnapPoints`-only candidate memo would have
offered nothing there at all.

`guide-tape-to-dado-shoulder-clip-x2.png` is the check the numbers cannot make: the green
marker sits precisely in the notch of the drawn dado at the panel's left edge — not half a
board away, which is what the local→world trap would have produced.

**Follow-up 123's ambiguity, measured again on this fixture.** At the default framing
(14.76 px/inch at that point) the floor corner `(0,8,0.5)` and the mouth corner `(0,8,0.75)`
project **3.09 px** apart — consistent with 123's recorded 3.6 px. Zooming to 23.58 px/inch
gave 5.16 px, and to **36.53 px/inch gave 8.55 px**, which is where the aim was taken. So the
remedy really is zoom, as 123 concluded.

**Check 16 — PASS, and it was the floor corner.** A plain second click at that zoom stored a
guide at exactly **`[0, 8, 0.5]`** — the dado **floor** corner, not the mouth corner at
`z = 0.75`. Stating which one was got, as the brief asks. `guide-on-dado-shoulder.png`.

**Check 17 — PASS, with one honest qualification.** Shelf selected, Move armed, its end
corner `(16, 8, -6)` grabbed; zoomed in on the dado again before aiming; clicked the guide
position. The Shelf's stored position became exactly **`[0, 8, 0.5]`**, which seats its end
into the dado floor: extents become x ∈ [0,11], y ∈ [8,8.75] (the dado's own ¾" band),
z ∈ [0.5, 5.8]. `guide-seat-shelf-seated.png` shows the shelf sitting in the dado, and the
Properties panel reading `0"`, `8"`, `1/2"`.

**The qualification, and it is the point of recording check 18's result:** the marker that
rendered at the commit was **`#2e9e5b`**, not `#4f6fd0` — so the candidate that actually won
was the **board's own dado floor corner**, which is at the identical position, not the guide.
The result is the same to the last bit (identical position ⇒ identical delta), but check 17
therefore does **not** independently demonstrate a guide being used as a Move target; check 8
does, and there the winning marker was unambiguously blue.

**Did the guide add anything here?** For this operation, **no** — the shoulder was already
directly snappable since the cut-points round, and the guide landed on top of it. What the
guide adds is the case the shoulder cannot cover: a position that is not a feature of
anything (checks 4–6), which is what the typed-offset path exists for. Worth being plain
about, because "seat a shelf in a dado" is not by itself an argument for guides.

## Check 19 — the two anchor prohibitions, in the real app

**PASS**, both, and — the part the unit tests cannot see — **the readout kept working
afterwards**.

- **Selecting a different board.** Anchored at `(-14, 0, 2)` with the Shelf selected, then
  clicked **Side panel** in the parts list. `selectedId` changed; `tapeAnchor` stayed
  `[-14, 0, 2]`; `tool` stayed `tape`. Hovering `(0, 24, 0.75)` then produced a live readout of
  **`27-13/16"`** — hand-computed `hypot(14, 24, 1.25) = 27.813"`. So the measurement was still
  a working measurement, not just a surviving field.
- **+ Add board.** With the same anchor still held, **+ Add board** created a fourth board and
  selected it. `tapeAnchor` still `[-14, 0, 2]`; hovering the same target again read
  **`27-13/16"`**. `guide-anchor-survives-add-board.png`. (The extra board was deleted
  afterwards to restore the fixture.)

This is design §4.2 holding: `tapeAnchor` is deliberately absent from the two selection-based
clears, because the tape measures *between* boards and a selection change is not a reason to
throw the measurement away.

## The `.viewport-stack` resize — done, since an earlier review flagged it as one-size-only

The round wrapped the viewport and the readout in a new `.viewport-stack`, and it had been
verified at a single window size. Three sizes were exercised here:

| Window | canvas / stack | tape pick at `(0,0,0.75)` |
|---|---|---|
| 1100 × 700 | 788 × 599, stack identical | resolved to `[0,0,0.75]` |
| 1920 × 1080 | 1608 × 1027, stack identical | resolved to `[0,0,0.75]` |
| 1600 × 1000 | 1288 × 947, stack identical | (baseline) |

At every size the stack's box is exactly the canvas's box, so
`.workspace > :first-child { flex: 1; min-width: 0 }` is sizing the wrapper the way it used to
size the Viewport — the flex-shrink path holds. At 1100 × 700 the readout's bounding box was
measured against the stack's and found **fully inside** it (right 772 ≤ 788, bottom 669 ≤ 685,
left 649 ≥ 0), so the overlay does not escape the viewport or slide under the sidebar at a
narrow width. `guide-resize-1100x700.png`, `guide-resize-1920x1080.png`.

## Check 14 — the console

**PASS: 0 errors** across the whole session (139 messages, 136 warnings, 0 errors), read with
`all: true` so the count spans the fixture build and every check.

The warnings are of exactly three kinds, and two of them are the known bound:

1. `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
2. `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.`
   — repeated, once per shadow-map (re)initialisation, which is why the raw count is high:
   every resize and every renderer re-init emits it again.
3. Four `GL Driver Message (OpenGL, Performance …): GPU stall due to ReadPixels`, ending with
   *"(this message will no longer repeat)"*. These are **llvmpipe** complaining about the
   screenshot capture itself — follow-up 26a's environment, not the app — and they are
   attributed to a `localhost:5199` origin, i.e. a browser session that predates this one.
   **Only the `localhost:5180` entries belong to this pass.** Stated because CLAUDE.md's
   standing phrasing is "two known three.js deprecation warnings" and a reader counting three
   kinds here should know what the third is.

## Constants

Both browser-settled constants (follow-up 60) were confirmed and **neither was changed**:

- **`SNAP_COLORS.guide = '#4f6fd0'`** — see check 1. Legible on the near-white ground, on
  plywood, on walnut and on pine; distinct from `#2e9e5b`, `#22b8d4` and — the pair that could
  have failed — `#8a5fd0`.
- **`RESTING_PX = 6`** — see check 1b. The resting/hovered growth reads unmistakably
  (28 px → 67 px of ink, plus a ring appearing); eight simultaneous guides read as quiet
  scaffolding rather than noise; and aiming is bounded by `PICK_RADIUS_PX = 12`, not by the
  marker, so 6 px only has to be findable, which it is.

Consequently `src/viewport/SnapMarker.tsx` is **unchanged** by this pass.

## Defects and findings

**No defect was found.** Nineteen checks (plus 1b), all pass.

Three things are worth carrying forward as observations rather than defects:

1. **A guide placed exactly on a board point is invisible as a guide while that point is
   hovered** — the r = 3 resting disc is entirely covered by the r = 4.5 hovered disc, and the
   hue shown is the *board* point's. This is check 18's accepted arbitrariness seen from the
   rendering side. It is correct behaviour (the two are the same position, so the move is the
   same either way), but it means the marker's hue does not tell you a guide is there.
2. **Check 17 does not independently prove guide-as-Move-target**, for the reason above; check
   8 does. Anyone reading 17 as the proof would be reading more into it than it shows.
3. **A clipped screenshot taken immediately after a hover can race the frame.** Two clipped
   captures ~500 ms apart returned identical pixels for two genuinely different states. Full
   captures after a 1 s settle, cropped afterwards, were reliable. This is a harness note in
   the shape of follow-ups 74/75/106, not an app finding.

## What was NOT checked

Stated plainly, per follow-up 108.

- **Touch and pen input** (follow-up 106's remaining half). Mouse and keyboard were real
  trusted CDP input throughout; nothing here says anything about a stylus, a finger, or
  multi-pointer pointer-capture during a tape measurement.
- **Real hardware GL** (follow-up 26a). Nothing in this round is shader-adjacent, so this is
  a stated bound rather than a suspected gap — but it is still true that no claim here was
  seen on a GPU.
- **Print** — the readout and the Guides panel were not exercised under `@media print`, and no
  print-to-PDF render was attempted (this host's Playwright still exposes no `pdf()` —
  follow-ups 70, 79, 84, 94).
- **Orthographic camera.** Every check was run under the default perspective camera. The
  Orthographic toggle was never pressed, so `screenPixelsPerInch`'s orthographic branch and
  marker sizing under it are unexercised here.
- **A guide at extreme distance or behind the camera.** `project()`'s `z < -1 || z > 1`
  rejection was never driven for a guide specifically.
- **Import/export round-tripping of `guides`.** The v6 document was read out of autosave many
  times, but no file was exported and re-imported, and no v5 file was opened to exercise the
  v5→v6 migration step in the browser. Both are unit-tested; neither was seen in the app.
- **The point-precise anchor and hover clearing — this round's own invariant-24 work — was
  never driven in the app.** Commits `7562a35`, `3910200` and `e907999` put `tapeAnchor` and
  `tapeHover` on invariant 24 point-precisely: an anchor drops when `updateBoard` or
  `addCut`/`updateCut`/`removeCut` destroys the feature underneath it, and survives when it
  does not. This pass drove the *prohibitions* (check 19 — the anchor surviving a selection
  change and **+ Add board**) but **not the clears**: nothing here edited a board dimension or
  a cut while anchored. That behaviour is unit-tested and is outside the brief's 19 checks,
  but it is named here rather than left silent, because the standard this report is held to is
  follow-up 108's.
- **More than a dozen guides.** Twelve on screen at once is what was judged (and eight
  earlier); nothing here says how the resting markers read at fifty.
- **The Guides panel's scroll behaviour** with a list long enough to overflow, and its
  interaction with the cut list's `inert` shell.

## Files referenced

Screenshots are working artifacts and are not committed (the repo has never tracked the
previous rounds' PNGs either); the filenames below are the ones written to the repo root
during this pass.

```
guide-points-fixture-overview.png
guide-tape-anchor-hover-line.png
guide-typed-distance-entry.png
guide-zero-length-refusal.png
guide-color-plywood-green-cyan-blue.png
guide-hue-plywood-violet-blue.png
guide-hue-walnut-green-blue.png
guide-hue-pine-cyan-blue.png
guide-1b-resting-zoom.png
guide-1b-hovered-zoom.png
guide-resting-density-8-guides.png
guide-resting-density-12-guides.png
guide-move-no-grab-on-guide-no-marker.png
guide-move-grab-onto-guide.png
guide-checkbox-off-hidden.png
guide-checkbox-off-no-candidate.png
guide-gate-gizmo-select-mode.png
guide-gate-no-gizmo-tape-mode.png
guide-cutlist-open-anchor-held.png
guide-anchor-survives-add-board.png
guide-tape-to-dado-shoulder.png
guide-tape-to-dado-shoulder-clip-x2.png
guide-on-dado-shoulder.png
guide-seat-shelf-target.png
guide-seat-shelf-seated.png
guide-panel-list.png
guide-resize-1100x700.png
guide-resize-1920x1080.png
```
