# Sloyd v1 polish — design

Date: 2026-07-30
Status: approved, not yet implemented

Six items from a manual pass over the shipped v1. None of them change the document
schema, and none of them touch the `units` or `storage` modules. Two of the six are
visual bugs whose remedy is a diagnosis rather than a decision; those are specified as a
protocol to follow, not as a fix to apply.

Two items from the same review pass are deliberately **not** here — the orientation
control and wood grain textures. They are coupled to each other and carry a schema
change, so they get their own spec. See "Deferred to Spec B" at the end.

---

## 1. The grid shimmers for a few seconds after every pan or orbit

**Symptom.** After releasing a pan or an orbit, the grid wiggles and vibrates for a
second or two before settling.

**Not yet diagnosed.** There are two independent contributors visible in the code, and
which one dominates is an empirical question:

- `OrbitControls` runs with `enableDamping` and `dampingFactor={0.12}`
  (`Viewport.tsx:224`). Damping is exponential decay, so at 0.12 the camera keeps
  creeping perceptibly for on the order of a second after the pointer is released.
  Nothing is wrong with the grid during that time — the camera is genuinely still
  moving.
- The `<Grid>` draws 1-inch cells out to `fadeDistance={220}` (`Viewport.tsx:159-170`).
  At that density most distant cells are sub-pixel, which is a textbook moiré
  generator. A slowly creeping camera is exactly the input that turns static moiré into
  visible crawl.

The two compose: damping supplies the slow motion, density supplies the shimmer. That
is why the symptom is "for a few seconds after" rather than "always".

**Protocol.**

1. Reproduce in a real browser, in both perspective and orthographic projection, and
   note whether the motion is a uniform drift (camera) or a localized shimmer in the
   distance (aliasing). Both may be present.
2. Change one variable at a time and re-observe:
   - raise `dampingFactor` toward 0.25–0.3, or set `enableDamping={false}`, to kill the
     post-release creep;
   - lower `fadeDistance`, or raise `cellSize`, or drop `cellThickness`, to kill the
     shimmer.
3. Apply the smallest change that settles it. If damping alone settles it, do not also
   touch the grid.

**Acceptance.** Releasing a pan or an orbit leaves the view visually static within
roughly a third of a second, in both projections, with no crawling in the distance.
Camera motion during a drag must still feel smooth — trading the shimmer for a jerky
orbit is not a fix.

**Note for whoever implements it.** `dampingFactor` is not a free knob: damping is what
makes an orbit feel weighted rather than twitchy. If the honest answer turns out to be
"the damping tail is correct and the grid is what's wrong", fix the grid and leave the
controls alone.

---

## 2. Board names must be unique

**Behavior.** Names are deduplicated by appending ` (n)`: `Board`, `Board (1)`,
`Board (2)`. The number is the smallest free one, not a running counter — deleting
`Board (1)` and adding a board yields `Board (1)` again.

**New module: `src/document/names.ts`.**

```ts
uniqueName(base: string, boards: Board[], excludeId?: string): string
```

A leaf module: it imports only the `Board` type, like `units/length.ts` imports nothing.
That is what makes it worth unit-testing hard, and the naming rules are the kind of
thing that is easy to get subtly wrong.

Algorithm:

1. Build the set of taken names from `boards`, skipping the board whose id is
   `excludeId` (so renaming a board does not collide with itself).
2. If `base` is not taken, return `base` unchanged.
3. Otherwise strip a trailing ` (n)` from `base` to get the stem, and return
   `` `${stem} (${n})` `` for the smallest `n >= 1` that is free.

Step 3's strip is what stops duplicate-of-a-duplicate from growing tails: duplicating
`Leg (1)` gives `Leg (2)`, not `Leg (1) (1)`. Note the asymmetry with step 2 — an
explicit rename to `Leg (1)` is honored when it happens to be free, because the user
typed it.

Comparison is exact and case-sensitive. `leg` and `Leg` are two distinct, individually
identifiable names, and case-folding them would surprise anyone who meant the
distinction. Names are trimmed before comparison and before storage.

**Call sites — all four.** Uniqueness is an invariant, and an invariant enforced at
creation only is one that any imported file can violate:

| Site | Change |
|---|---|
| `store.addBoard` | `uniqueName('Board', boards)` |
| `store.duplicateBoard` | `uniqueName(source.name, boards)` |
| the rename commit (item 3) | `uniqueName(typed, boards, board.id)` |
| `migrateDocument`, after `d.boards.map(validateBoard)` | dedupe the whole list in order, first occurrence wins |

Load-time dedup has to live in `migrateDocument` rather than `validateBoard`, because
`validateBoard` is per-board and cannot see its siblings. It runs on every load path —
open, import, autosave restore — which is precisely the guarantee the versioning
invariant already gives us.

**Behavior change, deliberate.** `duplicateBoard` currently produces `Leg copy`
(`store.ts:133`). It becomes `Leg (1)`. Two naming schemes in one app would be worse
than either one alone.

**Trap to record.** `createBoard` takes a `Partial<Board>` and has no access to the
boards list, so it cannot dedupe and does not try. Dedup is the caller's job. Any future
call site that adds a board without going through `addBoard` or `duplicateBoard` must
call `uniqueName` itself. This is worth a comment on `createBoard`.

---

## 3. Clearing a board's name reverts it

**Behavior.** Clearing the name field and blurring restores the name the board had
before the edit. Nothing is ever stored as an empty string, and no board is
auto-renamed. `Escape` also reverts. `Enter` commits.

**Implementation.** The name input becomes local state that commits on blur or Enter —
the same shape as `DimensionField` — instead of writing to the document on every
keystroke (`Properties.tsx:36-43`).

This is the part that matters, and it is not a stylistic preference. If the field kept
writing per keystroke and then corrected itself on blur, the gesture would have already
taken its undo snapshot by the time the revert landed, leaving an entry on the undo
stack that undoes to nothing — which is exactly the failure mode invariant 4 exists to
prevent (`Ctrl+Z` appears to do nothing). Committing once means an empty field never
touches the document at all: no write, no snapshot, no dead undo entry.

With a single commit per edit there is nothing left to coalesce, so the input's
`beginGesture`/`endGesture` pair goes away with the per-keystroke writes. The commit
path trims the typed value, treats empty-after-trim as a revert, and otherwise passes
the value through `uniqueName(typed, boards, board.id)`.

`Properties` already remounts on selection change via `key={board.id}`
(`Properties.tsx:35`), so the local draft resets when a different board is selected
without any extra bookkeeping.

**Out of scope.** The project-name field in `Toolbar.tsx:25-32` uses the same
per-keystroke-plus-gesture pattern. It is fine as it stands: there is no dedup and no
revert to schedule, so gesture coalescing is the right mechanism there. Leave it.

---

## 4. Origin axis lines

**Behavior.** Three lines through the world origin, solid in the positive direction and
dashed in the negative, so the origin and the sense of each axis are both readable at a
glance. Colors follow the three.js convention, which is what the code already speaks:

- red = X
- green = Y (up)
- blue = Z

Muted rather than saturated primaries, so they sit inside the existing palette instead
of shouting over the wood tones. They extend ±120 inches, matching `SHADOW_EXTENT` —
the same ten-foot working volume the shadow camera already assumes. Finite, not
infinite: an infinite axis would outrun the grid's own fade and read as a stray line
across the sky.

**New file: `src/viewport/OriginAxes.tsx`.** Six line segments (a solid and a dashed
half per axis). Dashed lines require `computeLineDistances()` on the geometry and a
`lineDashedMaterial`; geometries are built in a `useMemo` and disposed on unmount,
following the pattern `BoardMesh.tsx:38-45` already establishes for its edge geometry.
`raycast={() => null}`, explicitly, for the same belt-and-braces reason the shadow plane
carries it.

**The depth problem, which is the real content of this item.** y=0 already holds two
coplanar things — the `<Grid>` and the shadow receiver — and `Viewport.tsx:172-195`
carries a long comment about the `polygonOffset` and `renderOrder` needed to stop them
z-fighting. The X and Z axes land on that same plane and make it three.

`polygonOffset` is a polygon-rasterization feature and does not apply to lines, so the
treatment is different: lift the two ground axes by 1/64" — visually zero at any usable
zoom, but far enough to win the depth test outright — and give them a `renderOrder`
after both the grid and the shadow plane so they draw over the grid lines they cross.

Lifting rather than disabling `depthTest` is deliberate, and it buys correct occlusion
for free: a board resting on the ground spans y=0 to its thickness, so it hides the
axis lines running underneath it. An axis bleeding through the board on top of it would
be worse than no axis at all. The vertical Y axis has no coplanarity problem and needs
no lift; its dashed negative half runs below the ground plane, which is visible from
underneath and harmless.

**Constraint worth knowing up front.** WebGL ignores `linewidth` on native lines — they
are always one pixel regardless of what the material says. Start with native lines; if
one pixel proves too faint against the grid, the escape hatch is drei's `<Line>`
(mesh-based, honors width), not a `linewidth` value that silently does nothing.

**Verified in the browser**, not by unit tests, per the project rule that the r3f
viewport is verified by driving a real browser.

---

## 5. Del deletes the selected board

**Behavior.** With a board selected and focus outside a text field, `Delete` or
`Backspace` deletes it. No selection is a no-op.

**Implementation.** Extends the existing keydown handler in `App.tsx:71-83`, which
already carries the guard this needs — never steal keys from a field the user is typing
in. Modifier-free only, and `preventDefault()` on handling.

Both keys, because the key labeled "delete" on a Mac keyboard is Backspace; supporting
only `Delete` would mean the feature does not exist for a Mac user. The existing
INPUT/SELECT guard is what makes Backspace safe to bind; extend it to TEXTAREA and
`contentEditable` while we are in there, so it stays safe if the app ever grows either.

**Interaction worth noting.** Clicking a part in the parts list leaves focus on that
`<button>` (`PartsList.tsx:16`), not on an input — so Backspace immediately after
selecting from the list correctly deletes. That is the common case working, not an
accident to be guarded against.

---

## 6. The gizmo reads inside-out when the camera orbits past the object

**Symptom.** The arrows on the transform gizmo "invert awkwardly" when the camera comes
around to the opposite side of an object.

**Correction (found during implementation): the premise below was diagnosed against
the wrong file, and the arrows really do flip.** This section originally claimed
nothing reverses direction, citing
`node_modules/three/examples/jsm/controls/TransformControls.js` and its arrows-at-both-
ends `gizmoTranslate`. That file is not what renders — drei's `<TransformControls>`
imports from **`three-stdlib`**
(`node_modules/@react-three/drei/core/TransformControls.js:5`), and three-stdlib's fork
has explicit per-frame flip logic in `TransformControlsGizmo.updateMatrixWorld`
(`node_modules/three-stdlib/controls/TransformControls.js:641-674`, with
`AXIS_HIDE_THRESHOLD`-style constant `AXIS_FLIP_TRESHOLD = 0` at :605): it swaps the
"fwd"/"bwd"-tagged arrow meshes and negates `handle.scale` at a hard
`eye · axis == 0` cutover, with no interpolation. The original report — that the
arrows invert — was literally accurate. The two candidate mechanisms below
(`depthTest`, plane-handle offsets) were consequently not what caused the symptom; see
`.superpowers/sdd/2026-07-30-sloyd-v1-polish/task-8-report.md` for the diagnosis that
found the real cause, and `src/viewport/Gizmo.tsx` for the fix (pin every translate
handle to its "fwd" orientation and hide the "bwd" duplicate, recomposing the group's
matrices after the library's own per-frame update so the correction lands in what
actually renders).

**Two candidate mechanisms (originally proposed, since superseded by the correction
above).**

- **Every gizmo material sets `depthTest: false`** (`TransformControls.js:1200-1214`).
  The gizmo always paints over the board, so the arrow *behind* the board draws in front
  of it. When the camera crosses to the far side, the two arrows on an axis swap actual
  depth with no corresponding change on screen — which reads as the axis snapping
  inside-out. Under orthographic projection there is not even a perspective size cue to
  disambiguate the near arrow from the far one, which fits the report.
- **The plane handles** (`XY`, `YZ`, `XZ`) sit at fixed positive offsets like
  `[0.15, 0.15, 0]` and never migrate to the camera-facing quadrant, so from the far
  side they are buried inside the board.

**Protocol.**

1. Reproduce with a board selected, orbiting slowly past 90° and 180°, in both
   perspective and orthographic. Identify whether the jarring element is the arrows,
   the plane squares, or both.
2. Test the candidates one at a time: enable `depthTest` on the gizmo materials so the
   board occludes what is behind it; separately, hide the negative-direction arrows;
   separately, hide the plane handles.
3. Apply whichever matched, preferring the smallest change. Dragging must still work in
   both directions along every axis — a fix that makes it impossible to pull a board
   toward −X is not a fix.

**Note on why this is a diagnosis and not a decision.** Enabling `depthTest` is
faithful to correct depth but has a real cost: a gizmo swallowed by the large board it
controls is its own annoyance, and it is why three ships the gizmo depth-test-off in the
first place. Hiding the negative arrows removes the ambiguity outright but gives up
half the visible affordance. Which trade is right depends on which mechanism is actually
producing the effect, which is why this gets looked at before it gets changed.

---

## Testing

**Unit tested** (`npm test`):

- `src/document/names.test.ts` — no collision returns the base unchanged; one
  collision; the smallest free number, including reusing a gap; ` (n)` stem stripping so
  a duplicate-of-a-duplicate does not grow tails; `excludeId` so renaming a board does
  not collide with itself; trimming; case sensitivity.
- store tests — `addBoard` names successive boards `Board`, `Board (1)`, `Board (2)`;
  `duplicateBoard` produces `Leg (1)` rather than `Leg copy`; a rename to an existing
  name is deduped.
- document tests — `migrateDocument` deduplicates a file whose boards share a name,
  first occurrence keeping its name.
- `Properties` tests — a rename commits on blur and on Enter; a cleared name reverts and
  leaves the document untouched; `Escape` reverts; crucially, clearing and blurring adds
  **no** entry to the undo stack.
- `App` tests — `Delete` and `Backspace` each delete the selected board; neither does
  anything while focus is in an input; neither does anything with no selection.

**Browser verified** — items 1, 4, and 6, per the project rule that the r3f viewport is
verified by driving a real browser rather than by asserting on mocks. Items 1 and 6 are
both about what happens while and after the camera orbits, so they are reproduced in one
session.

**Typecheck gate** — `npm run build`. `npm test` does not typecheck, so a green suite is
not evidence that anything compiles.

---

## Non-goals

- No schema change. Names are deduplicated in place; no `Board` field is added, and
  `CURRENT_VERSION` stays at 1. Load-time dedup is a normalization in the same family as
  the existing name and material fallbacks in `validateBoard`, not a migration.
- No change to the project-name field in the toolbar (see item 3).
- No change to `units`, `storage`, or the `StorageAdapter` seam.
- Nothing from `docs/follow-ups.md`. Those are tracked separately and none of them fall
  in the code this spec touches, with one exception worth flagging: follow-up 4 (Enter on
  an untouched off-grid `DimensionField` still quantizes) is in `DimensionField`, and
  item 3 above deliberately models the name field on `DimensionField`'s shape without
  modifying it. If the implementer ends up inside that file anyway, follow-up 4 is a
  one-line fix and worth taking — but it is not required by this spec.

---

## Deferred to Spec B

The two remaining review items, which are coupled and carry a schema change:

- **Orientation semantics.** The four-value rotation select is replaced by a two-state
  "grain runs along X / along Z" control, folding away the duplicates. A rectangular box
  has 2-fold symmetry about the vertical axis, so 0° and 180° map it exactly onto itself
  — no pivot choice can distinguish them, and the same holds for 90° and 270°. The
  genuine bug alongside it is that rotation today does not pivot about anything: it
  swaps the extents and leaves the min-corner pinned, so a 24×5½ board appears to jump
  sideways when it turns. This needs `CURRENT_VERSION = 2` with a migration folding
  180→0 and 270→90.
- **Wood grain textures.** Per-face treatment — face grain, edge grain, and end grain
  distinguished — with plywood showing veneer on its faces and visible plies on its
  edges.

They belong together because grain is what makes orientation observable at all: without
directional grain, a two-state orientation control has nothing to show for itself on a
plain box.
