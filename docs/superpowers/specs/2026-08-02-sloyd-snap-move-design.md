# Snap-move — design

Point-to-point board placement: grab a corner or midpoint of one board, click a
corner or midpoint of another, and the first board moves so the two points
coincide. A stripped-down version of SketchUp's Move tool with inference
snapping, and the first of four related tools — the tape measure, guide points
and guide lines are named here as non-goals, but the one interface they all
depend on is settled by this round.

Chosen 2026-08-02, after the sheet-nesting round shipped and production caught
up to `master`. Unlike the last five rounds this is not a cut-list descendant:
it is the first work on the viewport's *interaction* surface since the gizmo
size ceiling (follow-up 29), and the first new tool the app has had.

---

## 1. What this adds

One new tool, modal, in the toolbar beside the existing view toggles:

```
[ + Add board ] [ Cut list ] | ↶ ↷ | [ Select ][ Move ] | [ Orthographic ] ☐ Grid ☐ Origin
```

With **Move** active:

1. Hovering anywhere in the viewport marks the single nearest *snap point* —
   a board corner, an edge midpoint or a face centre — within a pixel radius
   of the cursor.
2. Clicking that marker **grabs** it.
3. Hovering elsewhere marks a target the same way; the grabbed point stays
   marked so you can see what you are carrying.
4. Clicking a target **commits**: the grabbed board moves so that the grabbed
   point lands exactly on the target point.

No button is held between the two clicks, so the camera stays fully usable
mid-move — orbit, pan and zoom all work between grabbing and dropping.

### 1.1 Why this is additive rather than a restructure

Three facts about the existing architecture make it cheap, and they are worth
stating because none of them would hold in a general-purpose CAD tool:

- **Every board is an axis-aligned box.** `rotation` is only 0 or 90 about Y
  and `posture` merely names which dimension points up (`axisDimensions`), so a
  board's 26 candidate points are a pure function of `position` and
  `boardExtents(board)`. There is no arbitrary transform to invert, no
  local-to-world quaternion, no oriented bounding box.
- **A snap move is one subtraction.** `position += (target − grabbed)`. That
  goes through the existing `updateBoard`, so undo, autosave, gesture
  coalescing and the reorient rules all apply unchanged.
- **Nothing new is stored.** `CURRENT_VERSION` stays 5. Snap points are derived
  on demand, the same way `buildCutList`, `buildDiagrams` and `buildNesting`
  are derived — there is no cached copy and therefore nothing that can go
  stale.

The work is therefore almost entirely *interaction*: deciding what is under the
cursor, and stopping four existing behaviours from firing while the tool is
active. §5 enumerates all four.

---

## 2. The 26 points, and why the picker never sees a `Board`

### 2.1 What a board offers

| Kind | Count | Where |
|---|---|---|
| `corner` | 8 | the box's corners |
| `edge-mid` | 12 | the midpoint of each edge |
| `face-center` | 6 | the centre of each face |

The board's own volume centre is deliberately **not** a candidate. It is the
one point in the set that floats inside the solid where nothing draws it, so
its marker would appear to hang in mid-air with no feature under it — the
opposite of an inference indicator's job.

Every one of the 26 is distinct for any board with non-zero dimensions, so no
de-duplication step is needed.

### 2.2 `src/document/snapPoints.ts`

Generation is pure and lives under `document`, beside the other pure
derivations (`cuts.ts`, `depthField.ts`, `diagram.ts`, `nesting.ts`). It
imports only `./types` and `./geometry` — no THREE, and unlike `cutlist.ts`,
`diagram.ts` and `nesting.ts` it does **not** reach into `units`: a snap point
carries no printed string, so the `formatLength` boundary those three widened
is not touched here.

```ts
export type SnapKind = 'corner' | 'edge-mid' | 'face-center';

export interface SnapPoint {
  kind: SnapKind;
  /** World position, inches. */
  at: [number, number, number];
  /**
   * Who owns this point. A discriminated union rather than a bare board id,
   * so guide points, guide lines and the tape measure add members here
   * instead of reopening the picker's signature. Today there is one member.
   */
  owner: { type: 'board'; id: string };
}

export function boardSnapPoints(board: Board): SnapPoint[];
```

### 2.3 The picker consumes `SnapPoint[]`, never `Board[]`

This is the one interface decision in the round that outlives the round.

All three named follow-ups produce candidates belonging to no board: a guide
point is a bare position the user placed, a guide line contributes its
endpoints and its intersections with other guides, and the tape measure's
anchor is transient and owned by the tool itself. If the picker's signature
took boards, every one of those would have to reopen it, and the natural
shortcut at that moment — synthesising a fake `Board` to carry a guide point —
would put a lie in the document layer.

Taking `SnapPoint[]` costs nothing today and makes each follow-up a new
*provider* rather than a change to the picker. The same applies to the cut-aware
points deferred in §8: dado shoulders are a second provider over the same board,
not a different picker.

---

## 3. `src/viewport/snapPick.ts` — screen-space selection

```ts
export function pickSnapPoint(
  candidates: SnapPoint[],
  project: (at: [number, number, number]) => { x: number; y: number; depth: number } | null,
  cursor: { x: number; y: number },
  radiusPx: number,
): SnapPoint | null;
```

Nearest candidate whose projected position is within `radiusPx` of the cursor,
in canvas pixels. Ties are broken by smaller `depth` — the candidate nearer the
camera wins.

`project` is a callback rather than a camera, which keeps this module free of
THREE and therefore unit-testable. It returns `null` for anything behind the
camera, which is what culls those candidates; the picker itself never needs to
know what a projection matrix is. The caller (`MoveTool`, §5) builds the
projector from the live camera and canvas size.

Both new modules being pure and testable is deliberate and slightly unusual
here: CLAUDE.md's working agreement is that *"the r3f viewport has no unit tests
by design — verify it by driving a real browser."* That still holds for the
tool's feel. But correctness — which point is nearest, what happens behind the
camera, how ties break — does not need a browser, and extracting it means the
browser pass can be about legibility and feel rather than about arithmetic.

### 3.1 Screen space, not raycast-first

The obvious alternative is to raycast the board under the cursor and offer only
that board's points. It is cheaper and it disambiguates for free, and it is
wrong for a concrete reason: **a corner silhouetted against empty space has no
board under the cursor at all.** Raycast-first would make exactly the corners
that are easiest to see the hardest to hit, which is the reverse of what the
tool is for.

Cost of the chosen approach is 26 projections per board per pointer move. For
any plausible model — a few dozen boards — that is a few hundred multiply-adds
on a pointer event, which is not a budget worth optimising against before it is
measured.

### 3.2 Occluded candidates stay pickable

A candidate hidden behind another board is still picked if it is nearest, and
its marker draws on top (`depthTest={false}`, §6). This is a deliberate choice,
not an oversight: rejecting occluded candidates needs an occlusion raycast per
candidate, and being able to snap to a back corner is more useful than the
occasional surprise of picking one is confusing. It also composes correctly with
§3.1 — the same silhouetted corner that raycast-first would lose is, from some
angles, an occluded one.

---

## 4. The move — one subtraction, deliberately not snapped

```
delta   = target.at − grabbed.at
position = board.position + delta
updateBoard(grabbed.owner.id, { position })
```

`updateBoard` is used unchanged. No new store action is needed for the move
itself, and it earns the whole undo/autosave chain for free.

**The result is not snapped to 1/16".** `Gizmo.tsx` snaps because a free drag
lands on arbitrary numbers and a board should come to rest on a boundary a
person can measure to. Here the point of the operation is that the two points
coincide *exactly*; rounding the result could break the very coincidence the
user just asked for, and would do so silently, by a sixteenth. If both boards
already sit on 1/16" boundaries the delta is exact anyway and the snap would be
a no-op; the only case where it does anything is the case where it does damage.

Reorienting is not triggered: the patch carries `position` only, so
`updateBoard`'s reorient predicate (which fires on `rotation`/`posture`) is not
reached, and `reorientedPosition` is not consulted. That is correct — a snap
move translates, it never turns.

---

## 5. The interaction contract

### 5.1 Tool state lives in the store, beside `selectedId`

```ts
tool: 'select' | 'move';
grabbed: SnapPoint | null;
```

Both are view state: outside the document, outside the undo stack, exactly
`selectedId`'s existing shape.

This departs from `shortcutsSuspended`, which is prop-drilled from `App` with
the stated reasoning that putting one flag into shared state *"to save one prop
would move it into the app's shared state for no gain."* That reasoning does not
reach here. `tool` has four consumers — `Toolbar` (to render the pair),
`Viewport` (to hide the gizmo), `MoveTool` (to listen at all) and `BoardMesh`
(to stop selecting) — sitting at three different depths. Threading one flag to
four places through two levels is the worse trade, and the store already holds
exactly this category of state.

### 5.2 Four existing behaviours must be gated

Each of these fires today and would break the tool. None is hypothetical.

| What | Where | How it breaks | Gate |
|---|---|---|---|
| Board click-to-select | `BoardMesh.tsx:152-167` | The commit click lands on a board having travelled ~0 px, so it passes the `CLICK_DRAG_SLOP_PX` test and selects the target board — the user drops a part and the panel jumps to the wrong one | ignore unless `tool === 'select'` |
| Click-to-deselect | `Viewport.tsx:257`, `onPointerMissed` | Cancelling a grab in empty space also clears the selection; a modal tool must not change selection as a side effect | no-op while `tool === 'move'` |
| The gizmo | `Gizmo.tsx` | Its handles sit over the board whose corner you are trying to grab, and it captures the pointer first | not rendered while `tool === 'move'` |
| Delete / Backspace | `App.tsx` keydown effect | Deletes the board currently being moved, leaving `grabbed` pointing at a board that no longer exists | no-op while `grabbed !== null` |

`OrbitControls` needs **no** gate. A drag that travels more than the 2 px slop
is not a click, so orbit, pan and zoom stay live between the grab and the drop.
That is the whole payoff of click-move-click over press-drag-release, and it is
why the press-drag alternative was rejected.

### 5.3 Click semantics, exhaustively

| State | Cursor over | Result |
|---|---|---|
| idle | a candidate | grab it |
| idle | nothing | nothing — **does not deselect** |
| grabbed | a candidate on another board | commit; select the moved board; stay in Move |
| grabbed | a candidate on the grabbed board | not reachable — same-board candidates are excluded from the target set while grabbed (§5.4) |
| grabbed | nothing | cancel the grab |
| either | — | `Escape`: cancel the grab if grabbed, otherwise leave the tool |

After a commit the tool stays active, matching SketchUp. The moved board is
selected so the Properties panel shows what just moved.

### 5.4 Same-board targets are excluded while grabbed

Snapping a board's corner onto its own opposite corner is a legal subtraction —
it translates the board by its own length — but it is never what a person
means, and it makes the board leap by a distance with no relationship to
anything else in the model. While `grabbed` is set, candidates whose
`owner.id` matches the grabbed board's are not offered, so the case cannot be
clicked rather than being clicked and then ignored. Ineligible candidates draw
no marker, which is what makes the exclusion legible instead of a dead click.

### 5.5 Where the events come from

`MoveTool` attaches `pointerdown` / `pointermove` / `pointerup` to
`gl.domElement`. Canvas-relative pixels are exactly what `pickSnapPoint` wants,
and going to the DOM avoids the alternative — an invisible full-screen plane
existing only to make R3F raycast empty space, which would then have to be
excluded from every other hit test in the scene.

Click-versus-drag uses the same rule and the same threshold `BoardMesh` already
applies: the pointer-down position is recorded, and the release counts as a
click only if it travelled no more than `CLICK_DRAG_SLOP_PX`. That constant
moves out of `BoardMesh.tsx` into a shared module so both read one value; a
second copy is the drift shape follow-up 64 already recorded once.

`Escape`, `M` and the Delete guard are keyboard, so they need a **`window`**
listener — and CLAUDE.md's standing rule is that every one of those must take
the cut-list open flag explicitly, because `inert` cannot touch a window
listener. This round adds **no new listener**: all three bindings go inside
`App`'s existing keydown effect, which already early-returns on `cutListOpen` at
its top.

That is cheaper than a second listener, and it is also the correct behaviour
rather than merely an economical one. Pressing Escape while reading the cut list
must close the sheet and leave any grab behind it untouched, which is exactly
what the existing guard produces. A separate listener would have had to
re-derive the same rule and could drift from it.

### 5.6 Hover state is committed on change, not per event

`pointermove` fires far more often than the picked candidate changes. The picked
candidate is held in a ref and written to React state only when its identity
(`owner.id` + `kind` + position) differs from what is already there — the same
"re-evaluate continuously, commit only on change" pattern `AdaptiveGrid` uses
for grid tiers, and for the same reason.

---

## 6. What is drawn

One marker at the hovered candidate, plus a second, persistent marker at the
grabbed point while a grab is in progress. Nothing else: no field of dots on the
hovered board, and no ghost preview of where the board would land.

- **Screen-constant size.** The marker holds a fixed pixel size via the existing
  `screenPixelsPerInch` helper, so it stays legible from any distance — the same
  helper the grid tier ladder already uses.
- **Drawn on top.** `depthTest={false}` with a render order after the boards, so
  an occluded candidate's marker is visible. This is what makes §3.2's decision
  usable rather than merely permitted.
- **A thin light ring around each marker**, because the markers must read against
  both the near-white ground and walnut's dark brown. A flat fill legible on one
  is not reliably legible on the other.

### 6.1 Colour names the kind, and these three are off-palette on purpose

| Kind | Colour |
|---|---|
| `corner` | `#2e9e5b` — green |
| `edge-mid` | `#22b8d4` — cyan |
| `face-center` | `#8a5fd0` — violet |

CLAUDE.md records brass (`#c99a4e`) as *"the one live colour in the app,"* and
these three break that deliberately, with the user's explicit approval. The
reasoning: an inference marker is transient chrome, not part of the model, and
it has one job — telling you *which kind of point* you are about to snap to,
before you commit. Shape cannot carry that at ~10 px, which is the size the
marker has to be to sit on a corner without hiding it. Hue can.

They are chosen to be off-palette while still sitting with it: all three are
cool and saturated against a palette that is entirely warm and desaturated
(ground `#e6e3dd`, grid `#c6c1b8`/`#958f84`, brass `#c99a4e`), so they read as
*not part of the model* rather than as a clashing member of it. The hues are
spread far enough apart to stay mutually distinct, and they echo SketchUp's own
endpoint/midpoint convention closely enough that a SketchUp user reads them
without a legend — muted well below SketchUp's pure primaries, which would look
like error states here.

All four values (three colours, one ring) are browser-settled constants in the
sense of follow-up 60, not test-settled: they are named exports, verified
against pine, walnut and plywood on the app's own ground, and re-tunable
without touching any geometry.

### 6.2 Cursor

The canvas cursor becomes a crosshair while `tool === 'move'`, so the tool's
state is visible without looking at the toolbar.

### 6.3 The pick radius

`PICK_RADIUS_PX`, starting at 12 and settled in the browser. Too small and
corners feel slippery; too large and adjacent candidates on a small part fight
each other. This is explicitly a feel constant — §7.1.

---

## 7. Testing

**`snapPoints.test.ts`**
- 26 points, all distinct, for a plain board.
- Correct world positions pinned across all six `posture` × `rotation`
  combinations — the mapping goes through `boardExtents`, so this is really a
  check that the round did not reimplement `axisDimensions` by hand.
- Every point's `owner` carries the board's id.
- Corners agree with `position` and `position + boardExtents` on every axis.

**`snapPick.test.ts`**
- Nearest within the radius wins.
- Everything outside the radius yields `null`.
- A candidate the projector rejects (behind the camera) is never returned, even
  when it would otherwise be nearest.
- Two candidates at equal screen distance: the one with smaller `depth` wins.
- An empty candidate list yields `null`.

**Typecheck.** `npm run build`. `npm test` does not typecheck; a green suite
proves nothing about `tsc`.

### 7.1 What a test cannot settle here

`PICK_RADIUS_PX`, the three marker colours, the ring, and the marker's pixel
size are all judgements about what a person can see and hit. Follow-ups 60, 64,
68 and 80 record four separate occasions in this repo where a constant shipped
with a plausible prose justification that did not reproduce under review. So:
these are settled by rendering them, against pine, walnut and plywood, at near
and far zoom — and the browser report records the comparison, not an argument.

### 7.2 Browser verification

Per the repo's rule for viewport work. The pass must check, at minimum:

- Hovering a corner, an edge midpoint and a face centre each mark with the
  right colour, on all three materials.
- A corner silhouetted against empty space is pickable (§3.1's whole
  justification).
- An occluded back corner is pickable and its marker draws on top (§3.2).
- Orbiting between the grab and the drop leaves the grab intact.
- A committed move lands the two points exactly coincident — read the two
  boards' `position` values out of the store, do not judge by eye.
- One `Ctrl+Z` reverts a snap move completely.
- Each of §5.2's four gates: clicking a board mid-move does not select it,
  clicking empty space does not deselect, the gizmo is absent, and Delete does
  nothing while grabbed.
- Escape cancels a grab; Escape with the cut list open closes the sheet and
  leaves any grab alone (§5.5).

Note the standing hardware caveat (follow-up 26a): this host runs software GL.
Nothing in this round rests on undefined shader behaviour — the markers are
plain materials — so that caveat is recorded rather than blocking.

---

## 8. Non-goals

Each of these was looked at and deferred, with a reason.

- **Cut-aware snap points.** A dado's shoulders are real corners a woodworker
  would expect to snap to, and `boardSolids` already yields them. Deferred at
  the user's explicit direction to keep v1 from overcomplicating. §2.3 is what
  makes it cheap when it lands: a second provider over the same board, not a
  change to the picker.
- **Free movement.** Away from a candidate the board does not move at all, and
  the second click cancels. Free-hand positioning remains the gizmo's job.
  Projecting the cursor onto the ground plane, or onto whatever face is under
  it, is what SketchUp actually does and is meaningfully more machinery — a
  ray/plane intersection, a rule for what happens when the cursor points at the
  sky, and a live preview to make the result legible before committing.
- **Axis inference and locking.** SketchUp constrains a move to the red/green/
  blue axis when you drag near one, and locks it with an arrow key. Nothing here
  needs it, because there is no free movement to constrain.
- **A ghost preview of the landing position.** Rejected with the user: it costs a
  second render of the board's geometry, and with snap-targets-only the result
  is fully determined by the marker already under the cursor.
- **Multi-select move.** The store holds a single `selectedId`; moving several
  parts at once is a selection-model change, not a tool change.
- **Snapping to the origin, to grid intersections, or to the ground plane.**
  All are `SnapPoint` providers and all are cheap under §2.3, but none is
  needed to place one board against another.
- **The tape measure, guide points and guide lines.** Named by the user as the
  intended follow-ups and deliberately not designed here. Guides persist, so
  they *will* need a schema bump (v6) and a `guides` array beside `boards` and
  `stock`; the tape measure probably needs none. This round's only obligation
  to them is §2.3's interface, which it discharges.
