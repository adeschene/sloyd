# Browser verification: cardinal-direction guide points

Task 7 of the cardinal-guides plan. This round gives the Tape tool a **world-axis lock**:
with an anchor set, `X` / `Y` / `Z` locks that world axis, and a typed distance places a
guide that far along it from the anchor — so a guide can be put 3" straight up from a
corner without a second snap point happening to lie in that direction. Negative distances
go the other way. While locked the hovered point is **inert** (it contributes no
direction), a click **re-anchors and keeps the lock** rather than placing a guide, and the
distance box's refusal now carries its **cause** (`no-direction` / `unparseable` /
`degenerate`), which closes follow-up 144. No schema change — `CURRENT_VERSION` stays 6.

`src/viewport/` has no unit tests by design. `towardFor`, `tapeAxisFromKey`, the store's
axis lifecycle and all three error causes with their cures are unit- and RTL-tested; what
is **only** covered here is whether the axis a keystroke names is the world axis a guide
actually lands on at two board postures, whether the focus handoff survives a real second
keystroke, which of two keyboard handlers a key reaches once the box has focus, and how
the locked-but-nothing-typed state reads on screen.

**All 8 numbered checks were run.** Seven passed outright. Check 6 passed for the
*mechanism* and produced the pass's one finding, against a *claim* rather than against the
code: the axis does not outlive a commit, so a gesture stated in design §5.2 and copied
verbatim into two code comments is false as written. **Neither browser-settled constant
was retuned and §9.1's 1" stub was not applied** — see check 8.

## How this was driven

Playwright MCP against `npm run dev -- --port 5188`, Chromium at a 1600 × 1000 window
(canvas 1288 × 947.2, offset 52.8 px below the page top), software GL (llvmpipe —
follow-up 26a). **Against the dev server only. Production was never opened.**
`localStorage` was read at the start and found **empty** (`Object.keys(localStorage)`
returned `[]`), then cleared and the page reloaded before the fixture was built, so
nothing here read or wrote any pre-existing project.

Method carried forward from the guide-points and cut-points passes:

- **The projector is a verbatim transcription of the app's own arithmetic, run against the
  live r3f camera.** `TapeTool`'s `project()` is a closure inside a `useEffect` and is not
  exported, so its six lines were transcribed and re-run against the **live** `camera` and
  `size` objects, reached through the Vite dev server's module graph
  (`import('/node_modules/.vite/deps/@react-three_fiber.js')` → `_roots` →
  `root.store.getState()`). `THREE.Vector3` came from `/node_modules/.vite/deps/three.js`,
  the same instance the app uses.
- **Which point *should* win at a pixel was computed by the app's own picker**, not by
  eye: `pickSnapPoint` and `PICK_RADIUS_PX` were imported from `/src/viewport/snapPick.ts`
  and run over live `snapPointsFor` / `guideSnapPoints` output, so every aim point below
  was confirmed to be the nearest candidate before the mouse moved there. The helper also
  reported every other candidate within the radius, which is how the corners used below
  were chosen.
- **Store identity was verified before any state read was trusted.** `useStore` was
  imported from `/src/store/store.ts`; a real `t` keypress was then driven and the
  imported handle observed to flip `tool` `select → tape`, `Escape` to flip it back, and a
  second `t` to flip it again. A second module instance would have shown a pristine store
  agreeing with itself while describing nothing.
- **Every interaction reported below is real trusted input** — Playwright
  `page.mouse.move` / `page.mouse.click` / `page.keyboard.press` / `locator.click()` /
  `locator.fill()`, all dispatched through CDP. **No synthetic `PointerEvent` or
  `KeyboardEvent` was dispatched at any point in this session.** That includes the fixture:
  both boards' names, dimensions, positions, posture and turn were entered by clicking the
  real fields and typing. `page.evaluate` was used only to *read* state (store, DOM,
  `localStorage`, the scene graph) and once to call `clearGuides()` as a between-check
  reset, which is setup and is not part of any reported result.
- **Guide positions are read out of `localStorage` and compared with hand-derived world
  coordinates**, never judged by eye. The anchor the click actually captured is read back
  from `tapeAnchor.at` and checked to be one of the board's eight hand-derived corners
  first, so the assertion is `guide === anchor + d` on the locked index rather than a guess
  about which corner won.
- **The measuring line and the markers are read out of the live scene graph**, by walking
  it for `CircleGeometry` meshes with `depthTest === false` (recording radius, material
  colour and world position) and for `Line2` objects (recording the first six floats of
  `instanceStart`). Six `Line2` objects are the origin axes and are present in every
  sample; a seventh is the measuring line. An empty result is a real assertion of absence.

### Two harness traps worth recording, in the shape of 74/75/106

- **Autosave lags the store by roughly 200 ms**, so a `localStorage` read taken
  immediately after `Enter` returns the document *without* the guide just placed — and,
  because it still contains the previous one, it looks like a plausible-but-wrong answer
  rather than an obvious failure. Two results in this pass were sampled that way at first
  and read as off-by-one until the store was read beside `localStorage` and the two were
  seen to converge. Every number reported below was taken after the two agreed.
- **A DOM read taken 150 ms after a keystroke can race a React effect.** The
  "a new character clears an unparseable refusal" probe reported the error still present
  at 150 ms and absent when re-read a few seconds later. The behaviour is correct; the
  first sample was simply early. Recorded because the same shape would look like a defect
  in a longer, less-repeated check.

## The fixture

Two boards, built entirely through the panels with real input, deliberately at two
postures and both at positions with no zero coordinate — a flat unrotated board at the
origin cannot distinguish a correct axis mapping from several wrong ones, and a zero
coordinate hides a leak into the wrong slot.

| | Board | Board (1) |
|---|---|---|
| dims (L × W × T) | 24 × 5½ × ¾ | 24 × 5½ × ¾ |
| posture / turn | `flat` / 0° | `upright` / 90° |
| `position` (min-corner) | `[5, 2, 3]` | `[-1.375, 2, -7]` |
| world extents | 24 × 0.75 × 5.5 | 0.75 × 24 × 5.5 |

`Board (1)` was typed in at `X = -13`; the app rewrote it to `-1.375` when posture and
turn changed, which is `reorientedPosition` pivoting the board about its own footprint
(invariant 2) and is correct. The value used in every derivation below is the one read
back out of the document, not the one typed.

The anchor corner used throughout is the **min corner** of each board — `[5, 2, 3]` and
`[-1.375, 2, -7]` — each confirmed by the picker to be the nearest candidate at the pixel
aimed at (2 and 3 candidates respectively fell within `PICK_RADIUS_PX = 12`, and the
intended corner won at distance 0.00 px in both).

---

## Check 1 — each axis, at two board postures — **PASS**

Gesture, driven identically six times: move to the corner's pixel, click to anchor, press
the axis key, press `3`, press `Enter`. Every anchor was read back as exactly the intended
corner. Every guide was read from **both** the store and `localStorage`, and the two
agreed.

### 1a — flat board, anchor `[5, 2, 3]`

| key | expected | placed (`localStorage`) |
|---|---|---|
| `X` | `[8, 2, 3]` | `[8, 2, 3]` ✓ |
| `Y` | `[5, 5, 3]` | `[5, 5, 3]` ✓ |
| `Z` | `[5, 2, 6]` | `[5, 2, 6]` ✓ |

### 1b — upright board turned 90°, anchor `[-1.375, 2, -7]`

| key | expected | placed (`localStorage`) |
|---|---|---|
| `X` | `[1.625, 2, -7]` | `[1.625, 2, -7]` ✓ |
| `Y` | `[-1.375, 5, -7]` | `[-1.375, 5, -7]` ✓ |
| `Z` | `[-1.375, 2, -4]` | `[-1.375, 2, -4]` ✓ |

The posture and turn make no difference, which is the result the check exists to produce:
`towardFor` is `anchor` with `1` added on one world index and never consults
`axisDimensions`, so a board-local mapping bug is not merely absent, it is unreachable —
and 1b is what turns that from a reading of the code into an observation.

**One incidental confirmation of §5.1 fell out of the same runs.** In every one of the six,
`tapeHover` was latched to the anchor corner itself (the anchoring click sets it). On the
ray path that is a zero-length direction and `offsetPoint` refuses it — so if the axis did
not win over the hover, all six of these would have refused with `degenerate` instead of
placing. They placed.

## Check 2 — a negative distance — **PASS**

Anchor `[5, 2, 3]`, `Y`, then `-3`, `Enter`. Placed `[5, -1, 3]` — the opposite side of the
anchor, past the ground plane. The `-` reached the box through the type-anywhere capture
(`canBeginLength` admits it), and the box read `-3` before Enter.

## Check 3 — an off-grid distance, unrounded — **PASS**

Anchor `[5, 2, 3]`, `X`, then `0.01`, `Enter`. Placed `[5.01, 2, 3]`, and read back out of
`localStorage` as `5.01` exactly (`at[0] === 5.01` evaluated `true`; the serialised value
is the string `5.01`). A 1/16" snap would have produced `5` or `5.0625`. This is invariant
25's rule holding for a **fourth** operation — the gizmo rounds what a free drag produced;
a snap move, a ray-placed guide and now an axis-placed guide all touch nothing.

## Check 4 — the two-keystroke focus check — **PASS**

Anchor, `X`, then `3`, then `5`. After the first digit: `tapeTyped === '3'`, the input's
value `'3'`, `document.activeElement` **is** the input, chip reads `X`. After the second:
`tapeTyped === '35'`, input value `'35'`, still focused. A failed focus handoff would have
dropped the `5` and left `3`; this is the only check able to tell those apart.

## Check 5 — `X`/`Y`/`Z` from inside the focused box — **PASS**

Two variants, because `setTapeAxis` **toggles** — pressing the key already locked clears
it, which would look like the second handler failing when it actually worked.

- **From no axis:** anchor, `3` (focus lands), then `z` inside the box → `tapeAxis` goes
  `null → 'z'`, chip appears reading `Z`, box still reads `3`.
- **Changing an existing lock:** anchor, `x` from the canvas, `4` (focus lands), then `y`
  inside the box → `tapeAxis` goes `'x' → 'y'`, chip `X → Y`, box still `4`.
- **And the toggle:** pressing `y` again → `tapeAxis` back to `null`, chip gone.

In all three the box text was **unchanged** — the letter was not inserted, so the handler's
`preventDefault` works. This is the branch no jsdom test can prove: `App`'s window listener
early-returns on `isTextEntry`, so once the box has focus these keys can only be arriving
through `TapeReadout`'s own `onKeyDown`.

## Check 6 — the re-anchor gesture — **PASS for the mechanism, and the pass's one finding**

**The mechanism specified in design §5.2's first bullet works exactly.** From a clean
start: click `[5, 2, 3]` (anchor set), press `Y` (axis `y`), click `[29, 2, 3]` — the
anchor moves to `[29, 2, 3]`, `tapeAxis` is **still** `'y'`, and the guide count is
**unchanged**, so the click re-anchored and placed nothing. Then `3`, `Enter` → guide at
`[29, 5, 3]`, which is that second corner plus 3" on Y.

**The illustration attached to that bullet is false, and the browser is what showed it.**
§5.2 says the payoff is that *"walking a row of corners placing a guide 3" up from each is
click, type, Enter, click, type, Enter"* — one axis press. It is not, because `commit()`
ends with `clearTapeAnchor()`, which drops the axis with the anchor exactly as §3.1's
structural rule says it must. Driven literally, from a document with zero guides:

| step | `tapeAnchor` | `tapeAxis` | guides | error |
|---|---|---|---|---|
| click `[5,2,3]`, press `Y`, type `3` | `[5,2,3]` | `y` | 0 | — |
| `Enter` | `null` | `null` | **1** | — |
| click `[29,2,3]` | `[29,2,3]` | **`null`** | 1 | — |
| type `3`, `Enter` | `[29,2,3]` | `null` | **1** | *That target is on the anchor* |

One guide, not two. The second Enter falls back to the ray path, whose direction is the
latched hover — which is the anchor itself — so `offsetPoint` refuses and the box reports
`degenerate`. **Nothing wrong is written to the document and the refusal names its own
cause**, which is this round's own §7 machinery doing its job on the round's own gap.

Classified narrowly, because "the §5.2 gesture doesn't work" would overstate it: the
mechanism is correct, §3.1 is correct and faithfully implemented, and what is false is one
illustrative sentence that §3.1 contradicts. That sentence had been copied verbatim into
`store.ts`'s `tapeAxis` doc comment and into `store.test.ts`'s `SURVIVES a re-anchor`
comment — follow-up 129's shape exactly, three documents illustrating a rule with a claim
the code makes false. **Both code comments were corrected in this task**; the design text
is left as the historical record and is annotated by follow-up 146. Whether the axis
*should* outlive a commit is a §3.1 amendment and a human decision, filed as follow-up 147
rather than resolved here.

## Check 7 — Escape's four rungs — **PASS**

Rung 1 (`grabbed`) belongs to the Move tool and cannot coexist with tape state, since
`setTool` clears everything; it was exercised separately.

**Move tool:** select a board, `m`, click its corner → `grabbed` true. `Escape` → grab
dropped, tool still `move`. `Escape` → tool `select`.

**Tape, from the canvas** (anchor `[5,2,3]`, axis `x`):

| | `tapeAxis` | `tapeAnchor` | `tool` | readout mounted |
|---|---|---|---|---|
| start | `x` | `[5,2,3]` | tape | yes |
| `Escape` | `null` | `[5,2,3]` | tape | yes |
| `Escape` | `null` | `null` | tape | no |
| `Escape` | `null` | `null` | **select** | no |

**Tape, from inside the focused box** (same start, plus `3` typed so focus is in the
input):

| | `tapeAxis` | `tapeAnchor` | `tool` | box focused |
|---|---|---|---|---|
| start | `x` | `[5,2,3]` | tape | **yes** |
| `Escape` | `null` | `[5,2,3]` | tape | **yes** |
| `Escape` | `null` | `null` | tape | no (unmounted) |
| `Escape` | `null` | `null` | **select** | — |

The second ladder is the one that could not have been proved anywhere else: the first
Escape is handled by `TapeReadout` and **keeps focus in the box**, the second drops the
anchor and blurs, and the third — now that nothing in the box is focused — reaches `App`'s
window listener and leaves the tool. Same shape, different steps, exactly as §6.1 states.

## Check 8 — legibility of the chip, and of the no-line state — **PASS, with one observation; nothing changed**

**The axis chip.** Rendered at the left of the readout row: the letter in `--brass-bright`
on `--graphite-950` with a `--brass-dim` border, `--font-num`, 12 px, semibold. It is the
app's existing "this control is active" idiom (the toolbar's pressed-button treatment), it
reads instantly at full-window scale, and it does not compete with the measured distance
beside it. The hint line under the row also changes from *Type a distance, Enter to place*
to ***Along Y — Enter to place***, so the state is carried twice: once by a badge and once
by a sentence naming the axis. No retune wanted.

**"Locked with nothing typed draws no line" reads as WAITING, not as broken** — recorded
as the finding, and **§9.1's 1" stub was not applied**. Measured rather than eyeballed, by
walking the scene graph at three states with the anchor on `[5,2,3]` and the pointer over
`[29,2,3]`:

| state | measuring line | markers |
|---|---|---|
| anchored, hovering, unlocked | `[5,2,3] → [29,2,3]` | anchor + hover, both full-size green corners |
| anchored, hovering, **locked `Y`** | **none** (only the 6 origin-axis lines) | unchanged — hover marker still drawn |
| locked `Y`, typed `6` | `[5,2,3] → [5,8,3]` | plus the preview marker, `#4f6fd0`, at `[5,8,3]` |

Three things carry the "waiting" reading: the chip appears in the same instant the line
goes, the hint sentence changes to name the axis, and the state is one keystroke long in
practice — typing a single digit produces both a line along the axis and a preview marker
at the end of it, and the marker sits exactly where the guide lands because both come from
the same `towardFor` + `offsetPoint` call.

**The observation, recorded because it is the sharpest thing in this pass and is the
argument the stub would rest on if it is ever wanted:** the line does not merely fail to
appear, it *disappears*. Before the axis key there is a line to the hovered point; pressing
the key removes it. A thing vanishing is a weaker confirmation than a thing appearing, and
the third row above shows why it is nonetheless not ambiguous — the state it moves to is
fully drawn. Also confirmed here is §5.1's other half: the hovered marker **stays** while
locked, saying *this is what you would snap to if you unlocked*, and the line and preview
ignore it entirely.

## Additionally exercised — follow-up 144's closure, live

Not one of the eight, but the round's headline claim, so it was driven rather than
inferred. Anchor, type `3qq` (the `3` seeds the box through the type-anywhere capture; the
letters arrive through the focused input), `Enter`:

- The box marks `invalid` and prints ***Can't read that as a length*** — `unparseable`.
- **A new hover does NOT clear it.** Moving the pointer to `[29,2,3]` changed `tapeHover`
  and left the refusal standing. That is precisely the case follow-up 144 filed as
  knowingly broken under the boolean, and it is the one a boolean could not have fixed.
- **A character change DOES clear it.** One `Backspace` (box `3qq → 3q`) cleared the
  refusal. (Sampled at 150 ms it still read as present — see the harness note above; the
  settled read is `error: null`, `invalid: false`.)
- `degenerate` was also observed live and by name during check 6 — ***That target is on the
  anchor*** — with nothing written to the document.

## Constants

**Neither browser-settled constant in this round's surface was retuned.**

- `PICK_RADIUS_PX = 12` was used as-is; the aim helper confirmed the intended corner won
  at 0.00 px in every reported interaction, with the next-nearest candidate 5.0–6.5 px
  away. Follow-up 123's accepted pick-ambiguity finding is untouched by this round, which
  adds no candidates.
- `SnapMarker`'s `MARKER_PX` / `RING_PX` / `RESTING_PX` and the four hues are unchanged and
  were not re-litigated; the preview marker's colour and size are the type-anywhere round's
  choice, carried forward (follow-up 142 still open and still narrow).
- The chip's styling introduces **no** new colour token — it reuses `--brass-bright`,
  `--brass-dim` and `--graphite-950` — so there is nothing here for a browser pass to
  settle beyond "is it legible", answered above.

## What was NOT checked

Stated plainly rather than left to inference.

- **`no-direction` was not reachable live, and the reason is itself a result.**
  `TapeTool` sets `tapeHover` on the anchoring click and then latches it, so every
  anchored state in this pass had a hover — which makes the ray path's failure mode
  `degenerate` (hover on the anchor) rather than `no-direction` (no hover at all).
  Reaching `no-direction` needs the hover cleared point-precisely while the anchor
  survives — e.g. editing the hovered board so its hovered corner stops existing — which
  was not driven. All three causes and all of their cures, including *an axis key clears a
  `no-direction` refusal*, are covered in `src/App.test.tsx`. Worth recording because §7
  calls `no-direction` ray-path-only; this pass is evidence for how narrow that path is.
- **No touch or pen input.** Follow-up 106's remaining half is still open: every
  interaction here was mouse and keyboard.
- **One window size, one camera, one zoom level.** Nothing about the chip or the readout
  was checked at a small viewport, and no check was repeated at a different zoom. The
  positional results cannot depend on either (they are read from the document, not the
  screen), but the legibility judgement in check 8 is at 1600 × 1000 only.
- **No orthographic-camera pass.** The Orthographic toggle was never pressed.
- **`Escape` while the cut list is open** was not driven here. It is unit-tested
  (`does not lock an axis while the cut list is open` covers the axis key's half), and the
  guard it rests on is `App`'s existing `cutListOpen` early return, unchanged by this
  round.
- **Undo/redo interaction with a live lock** was not driven in the browser. The store
  tests cover that both clear the axis with the anchor.
- **No print/PDF surface is involved**, so follow-ups 70/79/84's standing gap is not
  touched either way.
- **The screenshots taken during this pass are not committed** — `.playwright-mcp/` is
  gitignored — so every visual claim above is written out in prose and backed by a scene-
  graph or DOM read wherever one exists.

## Console

0 errors across the whole session. Three distinct warnings, all pre-existing and none
raised by this round's code: `THREE.Clock: This module has been deprecated`,
`THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated` (the bulk of the log — it
repeats on re-render), and a llvmpipe `GPU stall due to ReadPixels` performance notice from
the software GL stack (follow-up 26a's environment). Nothing new appeared during any check.
