# Sloyd — known follow-ups after v1

Everything here was found during v1's task reviews and the final whole-branch review,
then consciously deferred rather than missed. Nothing in this list blocks v1; it shipped
and is running. Recorded so the next session starts from the real state rather than
rediscovering it.

Ordered by what I would actually do first.

## Worth doing before v2 touches the same code

**1. `loadAutoSaved` rejection has no regression test.** `src/App.tsx`'s restore effect
correctly wraps the await in try/catch with `restored.current = true` in a `finally` —
but no shipped test exercises the rejection path. The existing autosave test in
`App.test.tsx` passes against the pre-fix code too, so it pins nothing. This matters
because the failure mode is severe and silent: if `restored.current` never becomes true,
autosave never arms for the entire session while `SaveIndicator` keeps reading "Saved
locally". A working test body (verified to pass on HEAD and fail pre-fix):

```tsx
it('autosave still arms after loadAutoSaved rejects', async () => {
  vi.useFakeTimers();
  try {
    loadAutoSaved.mockRejectedValue(new Error('boom'));
    render(<App />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    act(() => { useStore.getState().addBoard(); });
    const editedDoc = useStore.getState().doc;
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(autoSave).toHaveBeenCalledWith(editedDoc);
  } finally { vi.useRealTimers(); }
});
```

**2. Several correct fixes are unpinned by tests.** The Add-board focus behaviour, the
import focus-timer clear, and the adopt-external error clear were each verified by
mutation testing during review, but no committed test would catch a regression. If v2
refactors `DimensionField` or `App`'s effects, these break silently.

**3. `pendingLengthFocus` is not reset by `replaceDocument`.** It is store view-state, so
it can survive across tests in files that never mount `Properties`. Harmless today; a
trap once more component tests exist.

## Real but narrow

**4. Enter on an *untouched* off-grid field still quantizes.** Blur is guarded by the
`dirty` ref; Enter is not. With `value = 0.7` the field displays `11/16"`, and pressing
Enter without typing commits `0.6875`. The `parsed === value` guard cannot catch it
because the display text is lossy. This is the same class of bug the blur guard fixed,
and it contradicts the project's rule that stored values are exact and never silently
rewritten — the argument for leaving it was that an explicit keypress is not "silent".
One-line fix: apply the same `!dirty.current` guard to the Enter branch.

**5. `migrateDocument` does not reject `version < 1` or fractional versions.** A document
with `version: 0` or `0.5` passes the gate and is treated as v1. `createDocument` never
emits those, so it only matters for hand-edited or foreign files.

**6. `units` rejects some plausible shop input.** `MIXED_RE` matches exactly one
space-or-hyphen between whole and fraction, so `1  1/2` (double space) and `1 - 1/2`
return `null`. Degrades to a clear rejection, never a wrong number.

**7. `sanitizeFilename` does not guard Windows reserved device names.** A project named
`con`, `prn`, `aux`, `nul`, `com1`… exports as e.g. `con.sloyd`, invalid on Windows.
Only matters for a future desktop build.

**8. The `storage` singleton is imported from the concrete module.** `App.tsx` and
`FileMenu.tsx` both `import { storage } from '../storage/browser'`, and both test files
mock that same concrete path. A desktop build is therefore "a second `StorageAdapter`"
*plus* edits at two import sites and two mock paths. A three-line `src/storage/index.ts`
re-exporting the chosen singleton would make the seam's promise literally true.

## Cosmetic / hygiene

**9. Duplicated keydown guard.** `App.tsx` (undo/redo) and `Viewport.tsx` (camera keys)
each install a window listener opening with a copy-pasted
`tagName === 'INPUT' || 'SELECT'` check. Neither handles `TEXTAREA` or `contenteditable`
— no such element exists today. A shared `isTypingTarget(e)` helper would settle it.

**10. `--alert-bg` token is declared and never referenced,** while `.input.invalid`
hardcodes the same `#2c1c19`. Tokenization left half-done.

**11. `raycast={() => null}` on the shadow receiver** passes R3F's `!== null` gate, so a
pointer handler deliberately added to that mesh later would register and silently never
fire. `raycast={null}` is the idiomatic opt-out.

**12. Orthographic `zoom={12}` is an initial value only.** Toggling to ortho on an empty
document then adding a large board needs a manual `Home` press to frame it.

**13. Untested edge branches:** `loadAutoSaved`'s `getItem`-throws path; the
`nextFuture = future` branch in the store's gesture-coalescing `edit()`; negative
feet-and-inches input (`-2'6"`) in `units`.

**14. `src/smoke.test.ts` is redundant** now that 123 real tests exist.

## From the v1 polish pass

Found during the polish pass that fixed name uniqueness, `NameField`, `Delete`/
`Backspace`, the origin axes, the post-pan/orbit grid shimmer, and the gizmo's
axis-flip. Consciously deferred, not missed.

**15. ~~`dampingFactor = 0.3` has not had a hands-on check.~~ CLOSED — and the
hands-on check is exactly what found the real bug.** It was still shimmering in use.
Damping itself was the cause, not its value: rotate and pan are the two operations
three-stdlib's `OrbitControls.update` routes through the damping accumulator, and dolly
is not — which is why zooming never shimmered while rotating and panning always did.
`enableDamping` is now off. The lesson worth keeping: an analytic argument about "feel"
is not evidence, and the one bracketing experiment that would have caught this
(`enableDamping={false}`) was reasoned about rather than run.

**16. ~~Neither `dampingFactor = 0.3` nor `fadeDistance = 150` was swept to a
minimum.~~ MOOT.** Both values are gone — damping is off and the grid no longer fades
at all.

**17. The gizmo patch machinery is ~90 lines sitting above a 63-line component** in
`src/viewport/Gizmo.tsx`. Extracting it to a sibling module under `src/viewport/`
would restore one responsibility per file. *Partly addressed by 29:* the size-ceiling
arithmetic went straight into `gizmoScale.ts` rather than being added to the pile, so
the file did not grow by the ~90 lines that work would otherwise have cost. The
flip-fix machinery itself is still in `Gizmo.tsx` and is what this item is about.

**18. The gizmo patch's effect dependencies omit drei's other recreation key.** drei
recreates its `TransformControls` instance via a `useMemo` keyed on both the camera
and `explDomElement`; the effect in `Gizmo.tsx` depends on the camera only, so a
change of `events.connected` would silently drop the patch. Same class of bug as the
projection-toggle case that was found and fixed during this pass.

**19. The gizmo patch writes `visible` unconditionally,** discarding the library's own
`showX`/`showY`/`showZ` gating. Latent only — Sloyd never sets those props.

**20. The gizmo patch is coupled to `three-stdlib`'s internal shape,** which is a
transitive dependency under a caret-ranged `@react-three/drei`, so it can move on a
plain `npm install`. It has a shape guard and a latching `try/catch` so it degrades to
library behaviour rather than throwing, but it must be re-verified on any `three` /
`three-stdlib` / `drei` bump.

**21. At the default camera the two positive ground axes are nearly invisible,**
because they run toward and past the camera and leave the frame within a few pixels of
the origin. The code is correct; the default framing just does not show them off. A
default-camera tweak would fix it. Still open, and it constrains `NEGATIVE_OPACITY` in
`OriginAxes.tsx`: since the halves actually on screen by default are the negative ones,
they cannot be dimmed as far as the positive/negative distinction alone would suggest.

**22. `uniqueName`'s next-free-number search is unbounded.** Fine at board-list sizes;
worth a note if it is ever called on unbounded input.

**23. `duplicateBoard` passes `rest` (still carrying `name`) into `createBoard`,**
then immediately overwrites the name with the deduplicated one — a harmless dead
value, since `createBoard` never reads it, but it reads as if the name survives the
call. Destructuring `name` out of `rest` alongside `id` would make the intent obvious
(`src/store/store.ts:133-137`).

**24. The `editing`-cleared-before-`commit()` ordering in `NameField`'s blur handler
is correct but not pinned by any test.** React batches the event handler, so swapping
the two lines would not fail the suite. The untestability is inherent to the
batching, not an oversight.

**25. Modifier handling is asymmetric between the Ctrl+Z branch (ctrl/meta) and the
Delete branch (ctrl/meta/alt) in `src/App.tsx`.** Intentional per shortcut — each
guards against a different accidental trigger — but worth a comment if a third
shortcut is ever added.

## Deliberately out of scope, not defects

Joinery (dados/rabbets) is v2. Cut list, board-feet, and sheet-goods layout are v3.
Multi-select, free-angle rotation, curves, and accounts are unscheduled. The parametric
board model exists specifically to make the first two cheap — see
`docs/superpowers/specs/2026-07-29-sloyd-v1-design.md` for why that beats a mesh kernel.

## From the second polish pass

Found while fixing the grid shimmer, the axis flicker, the grid fade and the
drag-release selection bug.

**24. The grid's density tier is global, not per-fragment.** `gridDensity` picks one
cell size from the pixels-per-inch at the orbit target, but a ground plane spans a range
of depths in a single frame, so the far half of the floor is always denser on screen
than the near half. It is good enough because the floor is bounded and supersampled —
strong far-field aliasing measures 0.31% — but the principled fix is a grid shader that
chooses its tier per fragment from the local derivative, which drei's `<Grid>` does not
do. Revisit only if the floor ever needs to be much larger.

**25. `dpr={[2, 3]}` renders four times the fragments of `dpr=1`.** This is what makes
an unfaded grid viable, and the scene is trivial enough that it does not matter here —
but it is a real cost that would matter if the viewport ever gains post-processing or a
much heavier scene. It also means every line weight in the viewport is now tuned against
a supersampled buffer: `cellThickness`/`sectionThickness` were doubled to compensate,
and the origin axes had to move to drei's mesh-based `<Line>` because native GL lines
ignore `linewidth` and would render at half weight.

**26a. `pow(0.0, 0.0)` in a shader is undefined, and a software renderer will lie
about it.** The grid's first unfaded version used `fadeStrength={0}` and inherited
drei's default `fadeDistance` of 100, so every fragment past 100in from the camera hit
`pow(0.0, 0.0)`. llvmpipe returned 1.0 and the grid looked correctly bounded; real GPUs
returned NaN, the `alpha <= 0.0` discard fired, and the grid became a disc that followed
the camera. Fixed by pushing `fadeDistance` out of range rather than zeroing the
exponent. The general lesson: browser verification on this host runs on software GL, so
anything resting on undefined or precision-sensitive shader behaviour needs a check on
real hardware.

**26. The bounded 20ft floor has a visible hard edge.** Deliberate — an infinite grid
piles into an unreadable haze at the horizon, which is what the old distance fade was
really hiding — but it does mean zooming far out shows the floor ending in space rather
than continuing. If that reads badly, the options are a larger extent (at the aliasing
cost measured above) or fading only the outermost ring, which reintroduces a softer
version of what was just removed.

**27. Two viewport behaviours are verified only by hand.** `BoardMesh` ignores clicks
that travelled more than `CLICK_DRAG_SLOP_PX` (2px), which is what stops a gizmo drag or
a camera orbit from selecting whatever it happened to end over; and a `useFrame` in
`OriginAxes` rewrites `dashScale` every frame to hold the axis dashes at a constant
on-screen length. Both were checked by driving the real app, and the pure maths behind
the second is unit-tested in `screenScale.test.ts`, but the r3f viewport has no unit
tests by design — so a refactor could drop either silently. Dropping the dash scaling in
particular would not look broken immediately; it would reintroduce the flicker only once
the camera got far enough away.

**28. The gizmo's hover highlight is too close to the board's selection colour.**
Reported and consciously skipped as a nit: three-stdlib highlights a hovered axis in
`0xffff00` while a selected board is brass `#c99a4e`, both warm yellows, so it is not
obvious which axis a click will grab. The gizmo materials are already reachable from the
patch in `Gizmo.tsx`, so recolouring the hover state is cheap when it becomes annoying.

**29. ~~The gizmo grows without limit as the camera pulls back.~~ CLOSED — clamped
through `size`, which is an input rather than an output, so the re-bake caveat never
applies.** The maths is in `src/viewport/gizmoScale.ts` (pure, unit-tested); the write
is one line at the top of the existing `updateMatrixWorld` wrapper in `Gizmo.tsx`.

Three things are worth carrying forward:

- **The obvious hook point was the wrong one.** The note below suggested clamping
  `handle.scale` after the library sets it. That works only with an explicit
  recomposition, exactly like the flip fix. Driving `size` *before* `original(force)`
  sidesteps the whole problem: the library computes `handle.scale` from it, so the
  correction is baked normally and there is nothing to recompose. `size` is written on
  the gizmo, not the controls — it is declared on `TransformControlsGizmo`, and although
  `TransformControls` mirrors its own `size` down via a `defineProperty` sync, that sync
  is one more undocumented internal than this needs.
- **A ceiling alone would have been a worse bug, twice over.** Clamping the gizmo's
  world size to a multiple of the board shrinks it *with* the board as the camera pulls
  back, and the invisible picker cones shrink with it — past some distance there is no
  grabbable axis and the board cannot be moved at all. Hence `GIZMO_MIN_SIZE`. Measured
  at the far end (factor 647, the floor engaged): the X picker sits 14px from the gizmo
  centre, a pointer hover there still resolves to axis `X`, and a real-mouse drag moved
  the board from 0" to 131-3/16".

  The second way is subtler and was very nearly shipped. A board-relative cap governs
  *close* range too, not just zoomed-out: the factor at the default framing is only
  43.5, so `0.75 × extent` shrank a 4in cleat's gizmo to 0.72 the moment it was
  selected, and pinned a 3/4in offcut at the floor at every zoom — a change to
  close-range behaviour for a whole class of real parts, which is not what this item
  asked for. `GIZMO_MIN_CAP_INCHES = 7` is the floor on the cap itself, and 7 is not a
  taste call: stock world size is `factor / 7`, so it is exactly the gizmo's own size at
  the default view. Re-measured after the fix: 24in board 1.0, 4in cleat 1.0, 3/4in
  offcut 0.982 — and that same offcut still clamps to the floor once the camera pulls
  back.
- **Past the floor the gizmo is screen-constant again**, at 30% of stock, so in the
  strictest sense it does resume growing in world units beyond that point — just 3.3×
  slower. That is the deliberate trade: the ceiling governs the whole useful range
  (`xScale` measured pinned at exactly 18 = 0.75 × a 24in board, in *both* projections),
  and the floor guarantees usability past it.
- **Freezing `size` during a drag was tried and rejected on evidence.** The argument for
  it was that the board's distance to the camera changes as it moves, so recomputing
  might make the gizmo pulse. It cuts the other way: frozen, the gizmo grows
  screen-constant through the drag and then *snaps* to the clamped value on release.
  Sampled through a real drag in the ceiling's sloped range (not the floor, where a
  freeze does nothing and looks like it works), the per-frame version moves `size`
  continuously 0.848 → 0.705 with a largest single-frame change of 0.0148; the frozen
  version would have held flat and jumped 0.143 at mouse-up, ten times the
  discontinuity. The lesson is the same one item 15 records: the bracketing experiment
  is cheap, and reasoning about "feel" is not evidence.

Verified in the browser in both projections, and the orthographic branch matters more
than it looks: its factor has no distance term at all, so implementing only the
perspective case would have left the toolbar's Orthographic toggle silently unclamped.
26a does not apply — this is CPU-side scale arithmetic, not shader behaviour.

Original note follows.

three-stdlib sizes the
gizmo to stay constant on *screen*, so its world size scales with viewing distance:
`factor = worldPosition.distanceTo(cameraPosition) * min(1.9 * tan(fov*PI/360) / zoom, 7)`
in perspective, `(camera.top - camera.bottom) / camera.zoom` in orthographic, then
`handle.scale.setScalar(factor * size / 7)`
(`node_modules/three-stdlib/controls/TransformControls.js:530-536`). Screen-constant is
the intent, but the consequence is that zoomed out the gizmo dwarfs the board it belongs
to, since the board shrinks on screen while the gizmo does not. It wants a ceiling —
either clamping the gizmo's world size to some multiple of the selected board's extents
(`boardExtents` already gives them), or driving the control's `size` prop down as the
distance grows. Note that `Gizmo.tsx` already wraps the gizmo's `updateMatrixWorld` every
frame, so there is an obvious place to clamp `handle.scale` after the library sets it —
and the same re-bake caveat applies: the correction has to land before the matrices are
composed, or it will silently do nothing (see the round-2 history in that file).

**30. ~~Origin line visibility needs its own checkbox.~~ CLOSED.** Done exactly as
described: `showAxes` beside `showGrid` in `App.tsx`, a second toolbar checkbox labelled
"Origin", `{showAxes && <OriginAxes />}` in `Viewport`. Four tests rather than three —
the three that mirror the grid's, plus one asserting the two toggles drive each other
not at all, which is the actual requirement. `Toolbar.test.tsx`'s renders now go through
a `renderToolbar` helper with defaults, so the next view toggle does not have to touch
every existing test.

Original note follows.

The grid already has one; the axes
should get the same treatment rather than being tied to it, since they answer different
questions ("where is the origin" vs "how big is this"). `showGrid` in `App.tsx` is the
pattern to copy exactly: view state held in `App`, passed to both `Toolbar` and
`Viewport`, deliberately not part of the document so it neither saves nor lands on the
undo stack. `Toolbar.test.tsx` already covers that last property for the grid and the
same three tests should cover the axes.
