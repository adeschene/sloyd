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

**Status:** closed — superseded: boot reads `storage.openLibrary()` (never-throws contract; App.tsx's restore comment names the replacement), not `loadAutoSaved`. (triaged 2026-10-16)

**2. Several correct fixes are unpinned by tests.** The Add-board focus behaviour, the
import focus-timer clear, and the adopt-external error clear were each verified by
mutation testing during review, but no committed test would catch a regression. If v2
refactors `DimensionField` or `App`'s effects, these break silently.

**Status:** closed 2026-10-16 (follow-ups 4): Add board's one-shot Length focus pinned in Properties.test.tsx (consume and focus each mutated), and the import picker's fallback-timer clear pinned with a 500 ms file read — the existing test read its file in a microtask, so dropping the clear never failed it. (triaged 2026-10-16; updated by follow-ups 4)

**3. `pendingLengthFocus` is not reset by `replaceDocument`.** It is store view-state, so
it can survive across tests in files that never mount `Properties`. Harmless today; a
trap once more component tests exist.

**Status:** closed 2026-10-16 (follow-ups 3): `replaceDocument` resets `pendingLengthFocus`; pinned. (triaged 2026-10-16; updated by follow-ups 3)

## Real but narrow

**4. Enter on an *untouched* off-grid field still quantizes.** Blur is guarded by the
`dirty` ref; Enter is not. With `value = 0.7` the field displays `11/16"`, and pressing
Enter without typing commits `0.6875`. The `parsed === value` guard cannot catch it
because the display text is lossy. This is the same class of bug the blur guard fixed,
and it contradicts the project's rule that stored values are exact and never silently
rewritten — the argument for leaving it was that an explicit keypress is not "silent".
One-line fix: apply the same `!dirty.current` guard to the Enter branch.

**Status:** closed — fixed: Enter carries the `dirty` guard (DimensionField.tsx); pinned by `does not commit on Enter for an untouched value off the 1/16" grid`. (triaged 2026-10-16)

**5. ~~`migrateDocument` does not reject `version < 1` or fractional versions.~~
CLOSED — folded into the v2 schema work, since it sits inside the version gate that
work was already editing.** The gate now rejects `version < 1` and non-integer
versions with a clear `DocumentError` before any migration step runs.

**Status:** closed. (triaged 2026-10-16)

**6. `units` rejects some plausible shop input.** `MIXED_RE` matches exactly one
space-or-hyphen between whole and fraction, so `1  1/2` (double space) and `1 - 1/2`
return `null`. Degrades to a clear rejection, never a wrong number.

**Status:** closed 2026-10-16 (follow-ups 4): `MIXED_RE` takes spaces around its separator (`1  1/2`, `1 - 1/2`, `1- 1/2"`), still ONE hyphen (`1--1/2` refused); an over-loose mutation is red. (triaged 2026-10-16; updated by follow-ups 4)

**7. `sanitizeFilename` does not guard Windows reserved device names.** A project named
`con`, `prn`, `aux`, `nul`, `com1`… exports as e.g. `con.sloyd`, invalid on Windows.
Only matters for a future desktop build.

**Status:** open (latent, desktop builds only): `sanitizeFilename` has no reserved-device-name guard. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 (follow-ups 5): `sanitizeFilename` gives a device name (CON, PRN, AUX, NUL, COM0-9, LPT0-9 — Microsoft's list includes the 0s —, any case, after cleaning) a `-project` suffix (`con-project.sloyd`); `console`, `com10`, `con table` untouched. Pinned in `browser.test.ts` (mutated: an unanchored pattern reds 3; `[1-9]` reds the two 0 cases).

**8. The `storage` singleton is imported from the concrete module.** `App.tsx` and
`FileMenu.tsx` both `import { storage } from '../storage/browser'`, and both test files
mock that same concrete path. A desktop build is therefore "a second `StorageAdapter`"
*plus* edits at two import sites and two mock paths. A three-line `src/storage/index.ts`
re-exporting the chosen singleton would make the seam's promise literally true.

**Status:** open (hygiene): no `storage/index.ts`; about 13 sites import `./storage/browser` directly. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): `src/storage/index.ts` is the seam's one import site; every module and test outside `storage/` imports and mocks `./storage` (14 files). `storage/seam.test.ts` scans `src/` and fails on any `storage/browser` import outside `storage/` (mutated: one direct import reds it).

## Cosmetic / hygiene

**9. Duplicated keydown guard.** `App.tsx` (undo/redo) and `Viewport.tsx` (camera keys)
each install a window listener opening with a copy-pasted
`tagName === 'INPUT' || 'SELECT'` check. Neither handles `TEXTAREA` or `contenteditable`
— no such element exists today. A shared `isTypingTarget(e)` helper would settle it.

**Status:** closed 2026-10-16 (follow-ups 3): one `isTextEntry` (`src/textEntry.ts`) for App and the viewport's camera keys; pinned. (triaged 2026-10-16; updated by follow-ups 3)

**10. `--alert-bg` token is declared and never referenced,** while `.input.invalid`
hardcodes the same `#2c1c19`. Tokenization left half-done.

**Status:** closed — fixed: `.input.invalid` reads `var(--alert-bg)`. (triaged 2026-10-16)

**11. `raycast={() => null}` on the shadow receiver** passes R3F's `!== null` gate, so a
pointer handler deliberately added to that mesh later would register and silently never
fire. `raycast={null}` is the idiomatic opt-out.

**Status:** closed 2026-10-16 (follow-ups 3) — the named remedy REJECTED after measuring: R3F does gate on `raycast !== null`, but three's `Raycaster.intersectObject` calls `object.raycast()` unconditionally, so `raycast={null}` would throw on any direct scene raycast; `() => null` stays, and Viewport's comment that overstated it now says this. (triaged 2026-10-16; updated by follow-ups 3)

**12. Orthographic `zoom={12}` is an initial value only.** Toggling to ortho on an empty
document then adding a large board needs a manual `Home` press to frame it.

**Status:** open (cosmetic): a projection swap re-frames now, but an EMPTY document's ortho swap still keeps `zoom={12}` (`frame()` returns early with no bounds). (triaged 2026-10-16)
**Status:** CLOSED by decision 2026-10-17 (follow-ups 6): not ortho-specific — adding a part never re-frames the view in EITHER projection (a large first board in perspective needs Home too), and with nothing to frame the swap has nothing to fit. Home/F frame on demand; a frame-on-first-part rule would be a new behaviour, not this fix.

**13. Untested edge branches:** `loadAutoSaved`'s `getItem`-throws path; the
`nextFuture = future` branch in the store's gesture-coalescing `edit()`; negative
feet-and-inches input (`-2'6"`) in `units`.

**Status:** closed 2026-10-16 (follow-ups 4): negative feet-and-inches (`-2'6"`, `-2'`, `-2' 6-1/2"`) and a throwing autosave read (null, `available` false) pinned and mutated. The third branch, edit()'s `nextFuture = future`, is indistinguishable since fu 208 (a gesture's first edit empties `future` and redo is refused mid-gesture), so a test of it could not fail. (triaged 2026-10-16; updated by follow-ups 4)

**14. `src/smoke.test.ts` is redundant** now that 123 real tests exist.

**Status:** closed 2026-10-16 (follow-ups 3): `src/smoke.test.ts` removed. (triaged 2026-10-16; updated by follow-ups 3)

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

**Status:** closed. (triaged 2026-10-16)

**16. ~~Neither `dampingFactor = 0.3` nor `fadeDistance = 150` was swept to a
minimum.~~ MOOT.** Both values are gone — damping is off and the grid no longer fades
at all.

**Status:** closed (moot). (triaged 2026-10-16)

**17. The gizmo patch machinery is ~90 lines sitting above a 63-line component** in
`src/viewport/Gizmo.tsx`. Extracting it to a sibling module under `src/viewport/`
would restore one responsibility per file. *Partly addressed by 29:* the size-ceiling
arithmetic went straight into `gizmoScale.ts` rather than being added to the pile, so
the file did not grow by the ~90 lines that work would otherwise have cost. The
flip-fix machinery itself is still in `Gizmo.tsx` and is what this item is about.

**Status:** open (hygiene, not small): the patch machinery is still in Gizmo.tsx. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): the flip-fix patch (`stabilizeTranslateGizmo`, its internals types and constants) moved verbatim to `src/viewport/gizmoPatch.ts`; Gizmo.tsx is the component (214 lines). As a plain module it is now unit-tested (fu 19).

**18. The gizmo patch's effect dependencies omit drei's other recreation key.** drei
recreates its `TransformControls` instance via a `useMemo` keyed on both the camera
and `explDomElement`; the effect in `Gizmo.tsx` depends on the camera only, so a
change of `events.connected` would silently drop the patch. Same class of bug as the
projection-toggle case that was found and fixed during this pass.

**Status:** closed 2026-10-16 (follow-ups 3): the patch effect depends on drei's event target too (`events.connected || gl.domElement`); stable today, so no behaviour change (gizmo checked live). (triaged 2026-10-16; updated by follow-ups 3)

**19. The gizmo patch writes `visible` unconditionally,** discarding the library's own
`showX`/`showY`/`showZ` gating. Latent only — Sloyd never sets those props.

**Status:** open (latent): `visible` still written unconditionally; Sloyd still never sets showX/Y/Z. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): the patch honours `showX`/`showY`/`showZ` (`controls[`show${axis}`] !== false`). `gizmoPatch.test.ts` drives the per-frame body on a three-stdlib-shaped stand-in: one un-mirrored fwd arrow per axis, an end-on axis hidden, a hidden axis kept hidden, unset flags shown (four mutations, all red).

**20. The gizmo patch is coupled to `three-stdlib`'s internal shape,** which is a
transitive dependency under a caret-ranged `@react-three/drei`, so it can move on a
plain `npm install`. It has a shape guard and a latching `try/catch` so it degrades to
library behaviour rather than throwing, but it must be re-verified on any `three` /
`three-stdlib` / `drei` bump.

**Status:** record-only (standing caution: re-verify the patch on any drei/three-stdlib bump; drei is caret-ranged). (triaged 2026-10-16)

**21. At the default camera the two positive ground axes are nearly invisible,**
because they run toward and past the camera and leave the frame within a few pixels of
the origin. The code is correct; the default framing just does not show them off. A
default-camera tweak would fix it. Still open, and it constrains `NEGATIVE_OPACITY` in
`OriginAxes.tsx`: since the halves actually on screen by default are the negative ones,
they cannot be dimmed as far as the positive/negative distinction alone would suggest.

**Status:** open (cosmetic; real hardware): the default camera is unchanged. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the positive ground axes are clearly visible at the default camera.

**22. `uniqueName`'s next-free-number search is unbounded.** Fine at board-list sizes;
worth a note if it is ever called on unbounded input.

**Status:** record-only (bounded by |taken|+1). (triaged 2026-10-16)

**23. `duplicateBoard` passes `rest` (still carrying `name`) into `createBoard`,**
then immediately overwrites the name with the deduplicated one — a harmless dead
value, since `createBoard` never reads it, but it reads as if the name survives the
call. Destructuring `name` out of `rest` alongside `id` would make the intent obvious
(`src/store/store.ts:133-137`).

**Status:** closed 2026-10-16 (follow-ups 3): `copyBoard` passes the copy's name to `createBoard`. (triaged 2026-10-16; updated by follow-ups 3)

**24. The `editing`-cleared-before-`commit()` ordering in `NameField`'s blur handler
is correct but not pinned by any test.** React batches the event handler, so swapping
the two lines would not fail the suite. The untestability is inherent to the
batching, not an oversight.

**Status:** record-only (untestable by nature, per its own text). This is the FIRST of two entries numbered 24. (triaged 2026-10-16)

**25. Modifier handling is asymmetric between the Ctrl+Z branch (ctrl/meta) and the
Delete branch (ctrl/meta/alt) in `src/App.tsx`.** Intentional per shortcut — each
guards against a different accidental trigger — but worth a comment if a third
shortcut is ever added.

**Status:** record-only (intentional; each shortcut branch now carries its own modifier comment). This is the FIRST of two entries numbered 25. (triaged 2026-10-16)

## Deliberately out of scope, not defects

Joinery (dados/rabbets) is the next spec, with its own version label after v3 —
v2 turned out to be orientation and grain and v3 turned out to be posture and
part-local grain, neither of them joinery; the v3 spec's non-goals section settles
that naming for good. Cut list, board-feet, and sheet-goods layout come after
joinery. Multi-select, free-angle rotation, curves, and accounts are unscheduled.
The parametric board model exists specifically to make the first two cheap — see
`docs/superpowers/specs/2026-07-29-sloyd-v1-design.md` for why that beats a mesh
kernel.

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

**Status:** record-only (design record). This is the SECOND entry numbered 24. (triaged 2026-10-16)

**25. `dpr={[2, 3]}` renders four times the fragments of `dpr=1`.** This is what makes
an unfaded grid viable, and the scene is trivial enough that it does not matter here —
but it is a real cost that would matter if the viewport ever gains post-processing or a
much heavier scene. It also means every line weight in the viewport is now tuned against
a supersampled buffer: `cellThickness`/`sectionThickness` were doubled to compensate,
and the origin axes had to move to drei's mesh-based `<Line>` because native GL lines
ignore `linewidth` and would render at half weight.

**Status:** record-only (cost record). This is the SECOND entry numbered 25. (triaged 2026-10-16)

**26a. `pow(0.0, 0.0)` in a shader is undefined, and a software renderer will lie
about it.** The grid's first unfaded version used `fadeStrength={0}` and inherited
drei's default `fadeDistance` of 100, so every fragment past 100in from the camera hit
`pow(0.0, 0.0)`. llvmpipe returned 1.0 and the grid looked correctly bounded; real GPUs
returned NaN, the `alpha <= 0.0` discard fired, and the grid became a disc that followed
the camera. Fixed by pushing `fadeDistance` out of range rather than zeroing the
exponent. The general lesson: browser verification on this host runs on software GL, so
anything resting on undefined or precision-sensitive shader behaviour needs a check on
real hardware.

**Status:** open (owed to the user: real hardware, CLAUDE.md's 26a). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the grid is a bounded plane at every view.

**26. The bounded 20ft floor has a visible hard edge.** Deliberate — an infinite grid
piles into an unreadable haze at the horizon, which is what the old distance fade was
really hiding — but it does mean zooming far out shows the floor ending in space rather
than continuing. If that reads badly, the options are a larger extent (at the aliasing
cost measured above) or fading only the outermost ring, which reintroduces a softer
version of what was just removed.

**Status:** record-only (deliberate). (triaged 2026-10-16)

**27. Two viewport behaviours are verified only by hand.** `BoardMesh` ignores clicks
that travelled more than `CLICK_DRAG_SLOP_PX` (2px), which is what stops a gizmo drag or
a camera orbit from selecting whatever it happened to end over; and a `useFrame` in
`OriginAxes` rewrites `dashScale` every frame to hold the axis dashes at a constant
on-screen length. Both were checked by driving the real app, and the pure maths behind
the second is unit-tested in `screenScale.test.ts`, but the r3f viewport has no unit
tests by design — so a refactor could drop either silently. Dropping the dash scaling in
particular would not look broken immediately; it would reintroduce the flicker only once
the camera got far enough away.

**Status:** open (test gap; viewport has no unit tests by design): the click-drag slop gate and the per-frame dash scale are still hand-verified only. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): the shared pure half is pinned — `pointer.test.ts` (the 2 px slop, click vs drag either side of it, a pair's second click keeping the first's verdict, cleanup; three mutations red). Whether BoardMesh/MoveTool/TapeTool and OriginAxes still CALL it stays hand-verified: the r3f viewport has no unit tests by design, and `dashScaleForScreenPeriod`'s maths was already tested.

**28. The gizmo's hover highlight is too close to the board's selection colour.**
Reported and consciously skipped as a nit: three-stdlib highlights a hovered axis in
`0xffff00` while a selected board is brass `#c99a4e`, both warm yellows, so it is not
obvious which axis a click will grab. The gizmo materials are already reachable from the
patch in `Gizmo.tsx`, so recolouring the hover state is cheap when it becomes annoying.

**Status:** open (cosmetic, real hardware): no hover recolour yet. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the hovered axis is unmistakable (others fade, a line runs along it), not confusable with the brass selection.

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

**Status:** closed. (triaged 2026-10-16)

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

**Status:** closed. (triaged 2026-10-16)

## From v2

Found while shipping two-state grain orientation, the schema v2 migration, the
reorient-pivot fix, and wood grain textures. Consciously deferred, not missed.

**31. `BoardMesh` rebuilds all six grain materials whenever `kind` changes, and
`faceGrainKinds`/`axisDimensions` are recomputed every render rather than memoised.**
Updated for v3: `standing` is now `posture`, and the geometry half of this item is
narrower than it was — `facePlans` is now called only inside `boardUVs`, which the
`geometry` memo (keyed on `boardUVSignature`, see invariant 15) already gates, so it
no longer runs on every render. What's still unmemoised in `src/viewport/BoardMesh.tsx`:
`kinds = faceGrainKinds(board)` (line 69) and `axisDimensions` via `boardExtents`/
`boardCenter` (lines 36-37) both still run every render. Cheap today at real
board-list sizes, but it is redone on every render of every board, not just on the
changes that actually affect it (rotation, posture, grain, material, dimensions). A
`useMemo` keyed on those fields would make the cost match the actual invalidation.

**Status:** open (perf hygiene, code-sized): `boardExtents`/`boardCenter`/`faceGrainKinds` still run unmemoised per render in BoardMesh. (triaged 2026-10-16)
**Status:** CLOSED by measurement 2026-10-17 (follow-ups 6): `boardExtents` + `boardCenter` + `faceGrainKinds` cost ~0.7 µs per render (node, 200k iterations) — about what a `useMemo` costs itself; and the materials are keyed per slot (`${i}-${kind}-${faded}`), so a kind change remounts only that slot, not all six. No change.

**32. ~~`grainTexture`'s `hash()` and `seededRandom()` are pure, DOM-free functions that
could have had cheap unit tests without a canvas.~~ CLOSED in v3.** Both moved to
`src/viewport/grainLog.ts` — the module `grainTexture.ts` now imports them from — and
are unit-tested there alongside the rest of the log maths.

**Status:** closed. (triaged 2026-10-16)

**33. End-grain rings share one drawn centre across every board. Still open —
checked against the v3 log rewrite, which did not change this.** `woodEnd` in
`grainTexture.ts` still fixes `pith` (`cx`/`cy`) as a constant in canvas space rather
than deriving it from the seed, and the end texture is still cached per
`family:kind` — not per board — so every wood board's end grain is the same drawn
texture, sharing one implied ring centre. `grainLog.ts`'s `bandRadius` now supplies
the radii themselves, but nothing in the v3 work touched where the centre comes
from. Visually fine per board since only a small window of a much larger circle is
ever visible, but it means no two boards' end grain can look like they came from
different trees.

**Status:** open (cosmetic, not small): the pith is a canvas constant and the texture cache is keyed `family:kind`. (triaged 2026-10-16)

**34. The grain constants (streak counts, alpha ranges, tile sizes) have not been
tuned on real hardware.** They were chosen and screenshotted on this host's software GL
(llvmpipe, no GPU) — see 26a on why that is not sufficient by itself for anything visual
— so the aesthetic judgement (does it read as wood at actual viewing distance, is the
end-grain ring density right) is still open pending a check on real hardware.

**Status:** open (owed to the user: grain constants judged on real hardware). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): grain reads as wood on real hardware.

**35. `loadAutoSaved`'s catch swallows the schema-too-new case exactly like a corrupt-JSON
one, and only v2 makes that reachable.** `src/storage/browser.ts` catches everything —
including `DocumentError('…saved by a newer version…')`, the same error the *import*
path surfaces to the user in a clear dialog — and returns `null`. `App.tsx` only calls
`replaceDocument` when `loadAutoSaved` resolves non-null, so the stale-but-too-new
localStorage entry survives the failed load itself. It does not survive what happens
next: the user sees an empty document with no explanation, `SaveIndicator` keeps
reporting "Saved locally" throughout (it has no idea a load ever failed), and the first
edit fires the debounced `autoSave` over the very entry that could not be read — gone,
with no way to recover it. Reachable when a rollback to the v1 image follows a v2
autosave, or when a stale cached build and a fresh one alternate on the same origin —
narrow, but v2 is the first
schema bump that makes it possible at all, and every future bump reopens it. Fix shape:
branch on `err instanceof DocumentError` in the catch and surface "this project was saved
by a newer version of Sloyd" (the import dialog's own copy is the model) instead of
silently starting clean; a corrupt-JSON `SyntaxError` still degrades to `null` the way it
does today.

**Status:** closed 2026-10-16 (follow-ups 3): `storage.readProject` returns the document or why it cannot be opened (a newer version's `DocumentError` in its own words; `UNREADABLE_PROJECT` for a missing or non-JSON key); `openProject` asks for the reason only on failure and returns it; the project menu closes on a row click as before and, on a failure, reopens on that row with the message, focus on the caret. Checked live with a version-999 project. The boot fallback to another project is still silent; the menu now explains the skipped one when it is clicked. (triaged 2026-10-16; updated by follow-ups 3)

## From v3

Found while shipping posture, part-local grain, schema v3, and log-derived grain
textures. Consciously deferred, not missed.

**36. ~~A `DimensionField` display-staleness bug, found during the browser gate.~~
CLOSED in the post-v3 fixes pass.** A Position field that keeps focus across an
external change could show stale text after blur while the document itself was
correct. Root cause (in `src/panels/DimensionField.tsx`): the field's
`useEffect(() => { if (!editing.current) setText(...) }, [value, precision])` only
re-syncs the displayed text when the effect re-runs, which happens on a `value` or
`precision` change — not when `editing.current` flips from true to false on blur. If
an external write landed while the field was focused, and nothing changed `value`
afterward, the field showed stale text indefinitely even though the store was
correct; reselecting the part (forcing a remount) immediately showed the right value.
**The scope turned out to be broader than first written up here: this was never
specific to a posture/turn change** — the `[value, precision]` deps just don't fire
again once focus leaves, so *any* external change that lands while the field has
focus and is otherwise untouched triggers it, orientation changes were only the
scenario that happened to expose it first. Predates v3 — the underlying
`reorientedPosition` wiring was introduced in `68b7422`, well before the v3 branch —
v3's Step 2 pivot check just happened to be what exposed it. Fixed in `42df2ea`: the
blur handler's untouched branch (`!dirty.current`) now resyncs the display from
`value` instead of just returning, without committing — committing an untouched
field is what invariant 5 forbids for the unrelated reason of not overwriting exact
values with display-rounded ones. See invariant 5 for the shared shape with
`NameField` below. (This entry previously pointed at two screenshots under
`.superpowers/sdd/2026-07-31-sloyd-v3/screenshots/`; that directory was deleted when
the v3 branch merged and no longer exists.)

**Status:** closed. (triaged 2026-10-16)

**37. `Math.abs(k) % half` in `grainTexture.ts`'s `woodCut` maps `k = 0` to the same
seed bucket as the two edge bands (`k = -half` and `k = +half`), a three-way
collision where a pair was intended.** The centre band ends up sharing its width,
alpha and harmonics with both edge bands instead of getting its own. No effect on the
seam invariant (14) — the edge bands still match each other, which is all that
property requires — and the centre band is spatially far from the edges, so it reads
as cosmetic. A distinct seed for `k === 0` is the fix, worth doing the next time this
file is touched.

**Status:** record-only (the user's ruling, 2026-10-16): a distinct centre seed was made and rendered before/after on the dev server — in the edge texture the new centre band CROSSES its neighbour, which real rings never do — so it was reverted, and the user closed the entry keeping today's texture. (triaged 2026-10-16; updated by follow-ups 3)

**38. The "no board misses the cathedral arch" guarantee in `grainTiling.ts`'s face
tile size (6in) was worked out for boards around 5-1/2in wide.** Much narrower boards
could still land a per-board UV offset that misses the arch region entirely. The
formula is in the code comment (`TILES.wood.face`'s v-size); revisit if narrow stock
becomes common. **The missing number (found in the final v3 review): the cathedral
region spans 25% of the v-tile, so the guarantee needs `W/6 ≥ 0.75`** — a board
narrower than about 4-1/2in can miss the arch region entirely, depending on its
id-derived offset. A 1-1/2in leg sees only 25% of the tile. Not obviously worth
fixing on its own: narrow stock is often straight-grained anyway, so missing the
arch there is physically defensible, not just a numerical gap.

**Status:** record-only (calibration record). (triaged 2026-10-16)

**39. The grain constants introduced or changed in v3 (wobble amplitude, the face
v-tile size, band width/alpha ranges) have not been judged on real hardware.** Same
caveat as follow-up 34, now covering the ring maths too — chosen and screenshotted on
this host's software GL (llvmpipe, no GPU; see 26a). The final aesthetic call — does
it read as wood at actual viewing distance — is the user's, on real hardware.

**Status:** open (owed to the user: v3 grain constants on real hardware). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the v3 grain and end-grain rings read as wood on real hardware.

**40. `DIMENSION_ORDER` in `src/document/geometry.ts` is exported mutable** (not
`readonly` or `as const`), though it is now the single source every board's geometry
flows through — `axisDimensions`, `boardExtents`, and `grainTiling.ts`'s `ranks` all
read it. Nothing in the codebase mutates it today; the risk is purely that nothing
stops a future caller from doing so.

**Status:** closed 2026-10-16 (follow-ups 3): `DIMENSION_ORDER` is `readonly Dimension[]`; nothing mutated it (a compile, not a test, holds it). (triaged 2026-10-16; updated by follow-ups 3)

**41. ~~`validateBoard`'s posture and grain fallback branches have no unit test, and
`createBoard`'s `grain` default is unasserted.~~ CLOSED in the final v3 review pass.**
Every migration test hands `validateBoard` an already-legal posture, so changing the
`'flat'` fallback (or the `grain` fallback) would break nothing in the suite today —
which matters because that exact fallback is what invariant 11's migration-ordering
argument rests on. Direct tests now exist in `src/document/document.test.ts`
(`validateBoard posture and grain fallbacks`) covering an unrecognised or missing
`posture`/`grain`, plus `createBoard`'s `grain` default, independent of the migration
path. `src/panels/Properties.test.tsx` also gained display-binding coverage for
Posture, Turn and Grain — setting a board's orientation directly on the store and
asserting the select's `value`, which is what would catch a control that commits
correctly but displays wrong after an undo or a selection change.

**Status:** closed. (triaged 2026-10-16)

**42. The `FIT` scale argument on large end faces is calibrated for a ~5-1/2in end,
and degrades linearly with face size.** `grainTiling.ts`'s `FIT` puts exactly one ring
pattern across an end face whatever its size — right for a typical ~5-1/2in end
(~0.27in per ring, plausible softwood spacing), but on an end-grain cutting board's
broad face (18 × 12) the same one-ring-set stretches to roughly 0.9in per ring, which
reads as coarse. The alternative is worse: concentric rings cannot tile without a hard
discontinuity mid-face, so `FIT` stays — this is recording the calibration, not
proposing a fix. Revisit if end-grain cutting-board-scale parts become common.

**Status:** record-only (calibration record; no fix proposed). (triaged 2026-10-16)

**43. A v2 file with its `version` field hand-edited to `3` skips the v2→v3 migration
step entirely, and `standing` silently becomes `posture: 'flat'`.** `migrateDocument`
only runs `addPostureToV3` when `d.version < 3` — a file whose `version` says `3` but
whose boards still carry the v2 `standing` boolean instead of `posture` goes straight to
`validateBoard`, which has no idea what `standing` means, drops it as an unknown key,
and falls `posture` back to `'flat'` (see follow-up 41's now-tested fallback). A board
saved standing up quietly lies down, with no error and no warning. Reachable only by
hand-editing the version field — user error, not a defect in the migration chain
itself — but it is exactly the boundary invariant 11's (and follow-up 41's) migration-
ordering argument describes: the chain protects every version transition it knows it is
making, and nothing more. Worth writing down as the edge of what the chain covers, not
worth defending against — there is no way to distinguish a genuinely-empty v3 board from
a mislabeled v2 one once the version number itself is wrong.

**Status:** record-only (the migration chain's edge; not worth defending against). (triaged 2026-10-16)

**44. ~~Plywood with `grain: 'thickness'` stacked its plies across the board's width
instead of its thickness.~~ CLOSED in the final v3 review pass.** `grainTiling.ts`'s
`ranks()` promoted the grain dimension to rank 0 for every material, on the
justification that "the fallback order still puts thickness last" — true for `grain`
`'length'` and `'width'`, false for `grain: 'thickness'`, where thickness itself was
the one being promoted. Traced case: `plywood`, `grain: 'thickness'`, flat, unrotated,
24 × 5.5 × 0.75 — the `+X` edge face ended up with `swap = true`, handing the ply
stack's `FIT` axis to the board's 5.5in width instead of its 0.75in thickness; on
screen, the narrow edge of a plywood sheet showed five plies running the length of the
board. Reachable in two clicks (Material → Plywood, Runs → Through thickness). Fixed by
scoping the grain-first rank to solid wood only — `ranks()` now uses `DIMENSION_ORDER`
unmodified whenever `grainFamily(board.material) !== 'wood'`, because a sheet's ply
construction is a property of the sheet, not of the figure on its face, and does not
rotate with the grain. `src/viewport/grainTiling.test.ts` gained the `grain: 'thickness'`
plywood case (asserting `swap === false` and that the tiled axis carries the width, not
the thickness — the two grain values already covered, `length` and `width`, were
re-verified unchanged).

**This fix over-corrected — see follow-up 46 in the post-v3 section below.** Scoping
the grain-first rank to solid wood only also made sheet goods ignore `board.grain`
entirely, which removed the veneer rotation on plywood's face along with the bug.

**Status:** closed. (triaged 2026-10-16)

## From the post-v3 fixes pass

Two bugs found in use after v3 shipped, plus one component checked and found clean.
Consciously not deferred — closed in the same session they were found, per the
project's policy against deferring latent bugs.

**45. ~~`NameField` always committed on blur, so an untouched blur wrote the stale
local text back over any name that changed externally while the field had focus.~~
CLOSED.** Same defect shape as follow-up 36's `DimensionField` bug (see invariant 5),
but a different consequence: `DimensionField`'s untouched-blur bug only left the
*display* stale, because its guard already skipped committing when `!dirty.current`.
`NameField` had no `dirty` guard at all — its `onBlur` called `commit()`
unconditionally — so an untouched blur after an external rename (undo, import, a
future rename-from-elsewhere) landed *wrote the stale local text back over the store*,
because `commit()` sets the displayed text from `onCommit`'s return value regardless
of whether anything was actually typed. A silent write, not just a stale display.
**Latent in production**, because the only path that renames a board today is
`NameField`'s own commit (`Properties.tsx:46`) — import and migration replace the
whole document object, which unmounts and remounts the panel rather than racing this
effect. Closed anyway per the working agreement on latent bugs, since the desktop
storage seam and any future rename-from-elsewhere path would hit it for real. Fixed in
`92025ac`: mirrors `DimensionField` exactly — a `dirty` ref set in `onChange`, blur
resyncing from `value` without committing when `!dirty.current`, `Enter` guarded the
same way, and `dirty` cleared on both `commit()`'s revert and normal-commit paths. See
invariant 9 for the write-vs-display distinction.

**Status:** closed. (triaged 2026-10-16)

**46. ~~Plywood's grain control stopped changing anything visible.~~ CLOSED.** A
regression from follow-up 44's own fix (`fe4deed`). That commit was solving a real
bug — plywood with `grain: 'thickness'` stacked its plies across the board's *width*
instead of its true thickness — by making `ranks()` ignore `board.grain` entirely for
sheet goods and always use the unmodified `[length, width, thickness]` order. That
also removed the veneer-rotation behaviour the grain control exists to provide on
plywood's broad face: after `fe4deed`, no `grain` value changed anything visible on a
sheet good. The two requirements are both real and were treated as one problem when
they are two: thickness must always rank last for a sheet good (the ply stack is a
property of the sheet, not of the figure on its face), but the *other two* dimensions
still need the grain promoted among them, the same as solid wood, so the veneer figure
turns. Fixed in `770f764`: `ranks()` for a sheet good now produces
`[grain, the other non-thickness dimension, 'thickness']` — thickness pinned last,
grain promoted among what's left. Because `'thickness'` is a meaningless grain value
for a sheet good (plywood's grain is its face-veneer direction, always in the sheet
plane), it is no longer offered in the Properties panel for plywood/MDF,
`validateBoard` normalises it away on load (a normalisation, not a migration —
`CURRENT_VERSION` stayed 3), and `store.updateBoard` resets it in the same edit when a
material patch switches a board to a sheet good, so the panel is never asked to render
a `<select>` holding a value it has no matching `<option>` for. A follow-up commit
(`eb0590a`) then made `grainTiling.ts`'s `ranks()` total on its own — it no longer
returns `-1` for an out-of-band `grain: 'thickness'` on a sheet good reached by
constructing a `Board` directly rather than through the validator — so a future
refactor that moves where validation happens cannot silently reopen this by
rearranging things `ranks()` was quietly depending on.

**Status:** closed. (triaged 2026-10-16)

**47. The toolbar's project-name field is the remaining component that reads/writes
document state through an `<input>` and had not been checked against the
`DimensionField`/`NameField` display-staleness shape (invariant 5) — now checked, and
found clean.** `Toolbar.tsx`'s project-name `<input>` (`aria-label="Project name"`) is
a plain controlled input bound directly to `s.doc.name` — `value={name}`,
`onChange={(e) => setDocumentName(e.target.value)}` — with no local `text` state, no
`dirty` ref, and no adopt-external-changes effect to skip in the first place. Every
keystroke writes straight to the store; there is nothing held locally that could go
stale, because there is no local draft at all. `onFocus`/`onBlur` only wrap
`beginGesture()`/`endGesture()` for undo coalescing and touch no display state.
Left open rather than closed: this is a recorded finding, not a fix, and it is worth
rechecking if this field is ever changed to buffer input locally (e.g. to debounce
keystrokes rewriting the store on every keystroke) — the staleness shape only exists
where a component keeps its own copy of the value.

**Status:** record-only (a finding that the toolbar name field is clean: still a plain controlled input). (triaged 2026-10-16)

## From joinery

Six items, all found during joinery's task reviews and recorded rather than fixed.
Items 48 and 53 are the ones with user-visible consequences; the rest are hygiene.

**48 and 49 are CLOSED** — both by the same placeholder render, exactly as 48 predicted
("the second is probably better — it also covers any future path that reaches an empty
solid set"). `BoardMesh` now falls back to one translucent ghost box at the board's own
AABB whenever `boardSolids` returns `[]`. Both original entries are kept verbatim below,
because the two routes to the state remain reachable — the fix makes the state legible
and recoverable rather than unreachable.

What the fix actually needed, beyond the ledger's own sketch:

- **A wireframe would have closed only half of it.** 48 asked for the part to stay
  *selectable*, and `THREE.Line` raycasting only registers hits within
  `raycaster.params.Line.threshold` (1 world unit — here, 1 inch) of a drawn line. An
  outline-only placeholder leaves the board's whole interior dead to the pointer, so
  the ghost has to be a real mesh. Verified by clicking the middle of a ghost face, not
  its edge. To be precise about what this buys: it is viewport *parity* — a part you
  can see should be clickable, as everywhere else in the app — not the sole route back.
  Recovery was never actually blocked, since the parts list selects a consumed board by
  id and Ctrl+Z reverts the edit; the defect was that the part was invisible, not that
  it was unreachable.
- **`boardEdges` returns nothing in this state**, so the ghost supplies its own outline
  from its box. That is not an oversight in `boardEdges` — its rule draws a segment
  only where filled and empty cells meet, and here every cell is empty, so drawing
  nothing is the rule working correctly on a board with no stock.
- **The fallback rides in the existing `geometries` memo** rather than a new one. A
  second memo would have needed its own hand-written dependency list, which is
  precisely invariant 15's failure mode; riding along inherits both the
  `boardUVSignature` key (which already covers `cuts`) and the existing disposal
  effect.
- **One plain material, not the six grain materials** — per-face grain describes how
  stock was sawn, and this board has no stock left. `depthWrite` is off so a part with
  no stock never occludes one that has some, and the ghost neither casts nor receives
  shadows.
- **`GHOST_OPACITY` is browser-settled by comparison, not derived.** 0.1 was actually
  rendered and rejected — against this app's near-white ground the grid reads straight
  through it and the ghost collapses to outline-only, defeating the fill. 0.22 keeps a
  discernible body. Recorded in the same spirit as `MAX_ASPECT`/`MAX_HEIGHT`
  (follow-up 60): a constant a screenshot settles, not a test. The honest bound is two
  values on one background in one browser, not a sweep.

  This bullet is also the round's own brush with the lesson at 64/68/80. Its first
  draft claimed the low value "was invisible against it" — a provenance for 0.22 that
  had never been rendered, since 0.22 was written straight into the first edit. Review
  caught it, and the fix was to *run the comparison* rather than to soften the wording.
  Sixth instance of the shape; the first one caught in a doc rather than in code.

Verified in a real browser, both routes, before and after: 49 by seeding two adjacent
full-depth cuts on a 24" board (the ledger's own numbers) and confirming the board drew
nothing at all; 48 by shrinking a board's *length* through the Dimensions field until a
surviving cut spanned it. After the fix each renders a ghost, click-selects from the
middle of its face, and recovers in-session — removing the offending cut brings the
solid board straight back, with no reload.

**Deliberately NOT done: no guard was added to dimension writes.** That was 48's other
candidate. The placeholder subsumes it, and adding both would mean two mechanisms for
one state — the second of which would also have to refuse a dimension edit the user has
every right to make, since the cut is the thing that no longer fits, not the dimension.

The two original entries follow, unchanged.

**48. Shrinking a board's dimensions can store a cut that removes the whole board.**
The Cuts section refuses a cut whose depth, offset and width together remove all the
stock (`CutRow`'s `wouldRemoveAll` guard). But the *Dimensions* fields write through
`updateBoard`, which never meets that guard, so shrinking a board's thickness below an
existing cut's depth — or its length below a full-width cut — reaches the same illegal
state from the other side. `boardSolids` then correctly returns `[]`, the board renders
nothing and cannot be clicked, and it still sits in the parts list showing its
dimensions. On the next load `validateCuts` drops the offending cut and the board comes
back whole, so nothing is permanently lost — but in-session the part is invisible and
there is no obvious way to get it back. Two candidate fixes, not yet chosen: run the
same guard on dimension writes, or have `BoardMesh` render a placeholder (a wireframe
of the board's AABB, say) whenever `boardSolids` is empty, so the part stays selectable
and the situation is legible. The second is probably better — it also covers any future
path that reaches an empty solid set.

**Status:** closed (the "48 and 49 are CLOSED" note above). (triaged 2026-10-16)

**49. `boardSolids` returning `[]` is reachable through two individually-legal cuts.**
`validateCuts`'s full-removal guard is per-cut, so two cuts that each leave stock but
jointly remove everything (`offset 0, width 12, depth 3/4` plus `offset 12, width 12,
depth 3/4` on a 24" board) both survive load. This is the same end state as 48 by a
different route, and the same placeholder fix would cover it. Documented and tested in
`cuts.ts` as correct behaviour rather than left to be discovered.

**Status:** closed (the "48 and 49 are CLOSED" note above). (triaged 2026-10-16)

**50. The merge in `boardSolids` is not proven maximal.** `mergeAlong` runs once per
axis in `DIMENSION_ORDER`, which is deterministic and always correct — every merge
unions two abutting boxes with identical other-spans, so disjointness and total coverage
are preserved — but it is not proven to produce the fewest possible solids. A residual
missed merge costs draw calls, never correctness, and edge lines come from the grid
(invariant 16) so it cannot show up as a visible seam either. Left alone deliberately;
if it is ever revisited, the thing to measure is solid count on a realistic multi-cut
part, not the algorithm's elegance.

**Status:** record-only (deliberate; `boardSolids` is now `pocketCells`, the merge unchanged). (triaged 2026-10-16)

**51. Cut ids share the `b_` prefix with board ids.** `addCut` mints ids with the same
`nextId()` counter the boards use, which is what guarantees uniqueness within a board
and matches how `validateCuts` re-mints on load. The prefix is now just cosmetically
misleading. Grepped when it was introduced: nothing depends on the prefix.

**Status:** open (cosmetic): `nextId` still mints `b_` for every kind of id; ids are opaque and nothing reads the prefix. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 (follow-ups 5): `nextId` mints `id_…`, a prefix naming no kind (threading a kind through 33 call sites and `takeId`'s generic repair was judged not worth it for an opaque id); files keep the ids they were minted with. `ids.test.ts`; seen live (`sloyd.project.id_…`).

**52. `DimensionField`'s new `min`/`max` props have no direct unit tests.** They are
exercised indirectly through the Cuts panel tests (offset 0 must be accepted, depth past
the board must be refused), but `DimensionField.test.tsx` itself does not cover them —
including the specific reason `min` exists rather than reusing `allowNegative`, which is
that `min={0}` must still refuse a negative. This is the "correct but untested" shape
that the top of this file warns about.

**Status:** closed — fixed: DimensionField.test.tsx tests min/max refusal directly (`still refuses a whole mm over a difference max, and a value under a difference min`, `accepts a value equal to a difference MIN …`). (triaged 2026-10-16)

**53. The offset field is the one edit path that does not maintain `offset + width
<= posDim`.** `src/panels/Properties.tsx` gives the offset field `max={posDim}`,
while the width field enforces the pair with `max={posDim - cut.offset}` and
`repositionForAxes` enforces it on face/across changes. Raising offset alone
leaves the pair inconsistent, with two visible consequences: the width field
becomes unsatisfiable until offset is lowered (its `max` is 0, and with no `min`
prop a value of 0 is refused too), and `cutLabel` reports "dado" for a cut that
renders flush with the end. Verified round-trip: `offset 23, width 6` on a 24"
board renders identically before and after save/load — the loader clamps width
to 1 and the same cell is removed — but the label flips dado→rabbet. `offset =
24` removes nothing, and the cut row silently disappears after a reload. No
geometry divergence and nothing the user can see is lost mid-session, which is
why this is Minor. The natural fix is the same shape as `repositionForAxes`:
clamp the *pair* when either member changes.

**Status:** closed 2026-10-16 (follow-ups 3): the offset field's max is `posDim - width`, so the pair is refused from either field — refused, not clamped (DimensionField's rule; the entry's named clamp was not adopted). Imperial and metric tests; red before the fix; checked live. (triaged 2026-10-16; updated by follow-ups 3)

Also worth recording, since it is a lesson rather than a defect: **seven of joinery's
defects were in code the plan supplied verbatim**, not in transcription. In the order
they surfaced:

1. `cutRegion` threw on a cut naming the same dimension twice (`face === across`),
   because it wrote the `across` key and then overwrote it with `face`, leaving a
   dimension undefined.
2. `boardEdges` emitted one segment per cell, so a cut anywhere fragmented the edge
   lines on faces it never touched.
3. `cutLabel` compared floats with `===` on a value the validator's clamp produces by
   subtraction — wrong about 2.8% of the time at realistic board sizes.
4. A UV test asserted a global minimum over all six faces, two of which cannot move;
   the assertion was unsatisfiable for *any* correct implementation.
5. A second UV test meant to pin the `FIT` rule passed under a mutation implementing
   the exact bug it existed to catch.
6. `updateCut`/`removeCut` had no early return, so an unknown id still pushed a no-op
   undo entry and cleared the redo stack.
7. The panel's offset field inherited `DimensionField`'s `parsed <= 0` rejection, so it
   refused `0` — the one value that makes a rabbet, and which the plan's own tests
   required.

An eighth was introduced by a *fix* rather than by the plan (`repositionForAxes` reset
values unconditionally, discarding legal user input), and a ninth was pre-existing and
merely adjacent (`duplicateBoard` shared the source's `cuts` by reference). Separately,
a test comment claimed merge coverage the test did not have — true of the code's
description rather than the code.

Every one was caught by the same two rules: implementers were told to fix the code
rather than the expectation, and to **stop and escalate** if they concluded an
expectation was itself wrong. Number 4 is the case that proves the second rule earns
its keep — the implementer stopped, was right, and the plan was the thing that changed.
Plan text is not more trustworthy than hand-written code just because it is in a plan;
if anything it is less, because it was never executed before being written down.

## From the cut list

Five items, of which **56 and 58 are now closed** by the branch's final review pass —
see each entry. The three that remain are the "correct but untested" shape this file
exists to catch before a refactor breaks it silently, plus one hardcoded colour.

The original preamble here said "nothing is user-visible today", and that was wrong
about 56: it was filed as an accessibility gap (no focus trap, no initial focus), and
the containment it described missing was also what let **Tab walk out of the sheet
into `NameField`, the project-name field and the `DimensionField`s and edit the
document silently** — a data defect, not an aria one, reached with the keyboard alone.
Worth remembering as a shape: an item filed under the heading it was noticed from can
be the same defect as one under a heading nobody was looking at.

**54. One drift between `rowKey` and `groupKey` is uncovered: a field in the group key
that is not in the row key.** A row's key and its group's key are two separately
hand-written `|`-joined field lists that both begin with `material` and formatted
`thickness`. The entry originally claimed the pair was wholly untested; that overstates
it, and the review that filed it corrected itself. What the existing tests *do* catch:
the `it.each` split tests fail immediately if either key drops `material` or
`thickness`, because two boards differing only in that field would then collapse into
one row. And reordering `rowKey`'s fields is harmless — the key is an opaque identity
string, not a parse target, and the sort's `localeCompare` tiebreak only needs it to be
total.

The genuinely uncovered case is narrower: **adding a field to `groupKey` that is not
also in `rowKey`.** Two boards alike in everything the row key sees but differing in
the new field would then land in two groups while sharing one row — the row is created
under the first group and the second group is created empty, so the sheet renders an
`<section>` with a heading and no rows under it. Nothing today asserts that a rendered
group is non-empty. The cheap fix is still to derive the group key as a prefix of the
row key rather than writing it twice; the cheaper interim one is a test asserting every
group has at least one row.

**Status:** closed 2026-10-16 (follow-ups 4): `groupFields` (cutlist.ts) is the group key AND the row key's prefix, so no field can split a group from its rows; a test asserts every group has a row and every board is counted once. Mutated (a field in the group key only) — red. (triaged 2026-10-16; updated by follow-ups 4)

**55. A row's exact numbers are a representative, not a consensus.** `CutListRow`
carries raw `length`/`width`/`thickness` floats alongside its formatted `dims` string,
and those floats come from whichever board landed in the row *first*. That is correct
by construction — the row collapsed because everything in it prints identically, and
identical-printing is the only guarantee, not identical floats. But it means a consumer
that compares two rows' raw numbers for equality, or sums them expecting exactness, is
reading a number that only represents the group to within display precision. Nothing
consumes them today (`CutList.tsx` renders `dims` and never touches the floats), which
is exactly why this needs writing down before something does. See invariant 18 for the
rule the floats are downstream of. `CutListGroup.thickness` is the same representative
and now carries the same caveat in its doc comment — it originally had a bare
"Exact inches", which is how a consumer would have found the caveat only on whichever
field happened to be documented more carefully.

**Status:** record-only. (triaged 2026-10-16)

**55a. The same representative rule reaches one printed word, and there it is
visible.** A row's setup lines come from the first board too, and the row's cuts really
are numerically identical — `cutSignature` is exact, so every *number* on the line is
right for every part in the row. The *label* is not. `cutLabel` decides
dado-versus-rabbet by testing the cut against that board's **exact** dimensions, while
the row collapsed at **display** precision: two boards 24" and 24.02" long share a row,
and a cut at `offset 23.25, width 0.75` is flush with the end of the first but 0.02"
short on the second, so the sheet prints "rabbet" for a part that is strictly a dado.
Left as is deliberately, as a judgement rather than a deferral — at the precision the
sheet is printed to, 0.02" of remaining stock is not a shoulder anyone will cut, and the
representative's word is the more useful one at the bench. The alternative, computing
the label per board and splitting the row when they disagree, would split a row over a
difference no saw can hold, which is exactly what invariant 18 rules out for dimensions.
Recorded here and in a comment at the `setup:` line so a future reader who notices the
mismatch finds it decided rather than missed.

**Status:** record-only (the user's ruling, reaffirmed at fu 200's family). (triaged 2026-10-16)

**56. CLOSED — the cut-list modal had no focus trap and no initial-focus management.**
Closed in the branch's final review pass, and closed as a *data* defect rather than the
accessibility nicety it was filed as: Tab out of the sheet reached `NameField`, the
project-name field and the `DimensionField`s, all of which commit on change or blur, so
a keyboard user silently edited the document while reading a sheet that shows no
selection. The fix is not the "cycle Tab within it" this entry proposed. Everything but
the overlay now lives in one `.app-shell` wrapper carrying the `inert` attribute while
the sheet is open, which removes the whole subtree from the tab order, from hit-testing
and from the accessibility tree at once — no hand-rolled cycler, and nothing to keep in
sync with a future focusable control. The sheet takes focus on mount (`tabIndex={-1}`
plus a ref), and `App` restores focus to whatever opened it on close, captured at open
time because `inert` blurs the opener before the modal's mount effect runs. Note the
half-closure this replaced: Delete/Backspace was already guarded in `App`, so the
keyboard hazard was known and only the pointer half of it had been believed. Original
entry follows.

**56 (original).** Opening
the sheet leaves focus on the toolbar button that opened it, and Tab walks straight out
of the dialog into the toolbar and panels behind it, which are visually covered and
functionally still there. Escape-to-close works and is tested, and the sheet is
`role="dialog"`, so the accessible name and the exit are right — it is the containment
that is missing. Low urgency for a single-user shop tool driven mostly by mouse, but
it is the one part of the panel that a screen-reader user would find genuinely
confusing, and the fix (focus the sheet on mount, cycle Tab within it) is small.

**Status:** closed. (triaged 2026-10-16)

**57. The overlay scrim is a hardcoded colour, not a token.** `.cutlist-overlay` uses
`rgba(12, 14, 16, 0.72)` directly because `:root` defines no scrim or alpha-surface
custom property — there has never been a second overlay to justify one. The print
block's `#fff`/`#ccc`/`#999` are deliberately outside the token system (ink on paper is
not the screen palette) and should stay that way; the scrim is the one value that
*should* be a token the moment a second overlay exists. Brief-origin, kept verbatim,
recorded rather than quietly changed.

**Status:** closed 2026-10-16 (follow-ups 3): one `--scrim` token for both overlays (checked live: the same colour). (triaged 2026-10-16; updated by follow-ups 3)

**58. CLOSED — `body` kept its dark background under `@media print`.** Closed in the
branch's final review pass by exactly the one-line `body { background: #fff; }` this
entry called for, added to the existing print block; the same pass added `.cutlist-empty`
to that block's colour reset, which was grey-on-white for the same reason and had not
been noticed because the empty sheet is the one state nobody prints. Original entry
follows.

**58 (original).** Verified in the browser:
in print media the toolbar, viewport and panels are correctly hidden and the sheet is
black on white with no buttons, but `body` still computes to `rgb(20, 22, 25)`. Browsers
omit background colours when printing by default, so the normal path prints clean — the
screenshots confirm it. With "Background graphics" enabled, though, the area of the page
below the (short) sheet prints as a solid dark block, which on a real printer is a lot of
ink for nothing. A one-line `body { background: #fff; }` inside the existing print block
closes it. Left alone here only because the task that found it was documentation and
verification, with a standing instruction not to touch `src/` without a defect to fix —
this is cosmetic and conditional, not a defect, but it is worth doing next time
`styles.css` is open.

Items **48 and 49 remain open and are unaffected by the cut list.** Both are about
`boardSolids` returning `[]` — a board whose cuts remove all of its stock renders as
nothing. The cut list reports the *stock* a part is made from, which such a board still
has, so it appears on the sheet with correct dimensions and setup lines even while it is
invisible in the viewport. The sheet is arguably the one place the part is currently
still legible, but that is a coincidence of what the cut list reports, not a fix, and
the placeholder-render fix those two items call for is still the right one.

**Status:** closed. (triaged 2026-10-16)

## From the cut list diagrams

Design in `docs/superpowers/specs/2026-08-01-sloyd-cut-list-diagrams-design.md`, plan
in `docs/superpowers/plans/2026-08-01-sloyd-cut-list-diagrams.md`. Verified by driving
a real browser (Playwright, the only tooling that works on this host — see **26a**);
what was checked and what was deferred is recorded per item below, not asserted as a
blanket "verified".

**59. Depth labels collide when two cuts sit close together on one view — CLOSED,
2026-08-01, by the label layout round.** Design in
`docs/superpowers/specs/2026-08-01-sloyd-diagram-label-layout-design.md`. All three
folded-in instances (two dados ¾" apart, a cut at `offset: 0`, and the narrow-drawn
board carrying a 41-unit label on a 6-unit run) are closed. The browser sweep
(`docs/diagram-overlap-sweep.js`) is now **ALL CLEAN: 8 geometries, 0 issues**, at a
re-derived `TOL = 0.1` (see amended item 65).

The fix addressed the diagnosis this entry itself stated — *"nothing measures the
width of the string being placed"* — rather than spec §5's named symptom, and that
distinction splits cleanly into what closed **by construction** versus what needed
**arithmetic**:

- **By construction: cross-cut collisions.** Every number a cut owns now lives in
  that cut's own stacked leader row (`ROW` units tall, one row per cut, in
  `PartDiagram.tsx`), so two different cuts' labels are vertically separated by a
  fixed offset with no arithmetic involved and nothing to get wrong — they cannot
  collide with each other regardless of string length. This is also why depth moved
  off the outline entirely, not only to escape the collision: depth runs
  *perpendicular* to the view, so centring it on its band was never spatially
  meaningful in the first place. Placing it beside the band, in the row, is honest
  about that; the collision was the symptom that surfaced a placement that was wrong
  on its own terms.
- **By arithmetic: within-row collisions.** The only labels that can still collide
  are the up-to-three sharing one row — offset, width, depth — and those are settled
  by `packRow` (`src/panels/diagramLabels.ts`), which measures each label's width via
  `labelWidth` (character count × `CHAR_W`, a monospace advance) and runs in two
  phases, in that order: labels **cascade right**, in board order, during the
  left-to-right sweep (each pushed clear of the one before it); only THEN, if the
  row's total still overflows `max`, does the whole row **shift left** as one, which
  is what preserves every gap. The row overflows into the gutter, rather than crossing
  the board, only if it genuinely cannot fit even after that shift. See follow-up 71
  for a worked case where the left-shift phase fires and a label ends up left of the
  band it names — accepted drafting behaviour, not a bug, but worth reading before
  assuming the cascade is the whole story.
- **A run-fusion defect found along the way, also fixed.** Adjacent leader-row runs
  (the offset run and the band run) were collinear with identical stroke, so they read
  as one line from the board's edge to the cut's far side — making the offset label
  look like it measured edge-to-far-side. Found by a human looking at a rendered
  diagram, not by the sweep (which only reads `<text>`). Fixed with end ticks
  (`TICK`) at each run boundary.

`getComputedTextLength()`, the obvious way to measure a label, returns 0 under jsdom
— which is why `labelWidth` is arithmetic (character count × a measured constant)
rather than a DOM measurement, and why the packer is unit-testable at all. See
`docs/superpowers/specs/2026-08-01-sloyd-diagram-label-layout-design.md` §2 for the
`--font-num` measurement this rests on, and the new invariant in `CLAUDE.md` for why
that constant has exactly one home.

**Status:** closed. (triaged 2026-10-16)

### The diagnosis, stated once — 2026-08-01, from a measured sweep

**Every `<text>` in `PartDiagram.tsx` is positioned by geometry alone and nothing
anywhere measures the width of the string being placed. SVG text has extent; the code
treats it as a point.** Each label is centred on a computed run — the offset run, the
band, the outline — and no code compares the run's length to the label's. That single
sentence generates every instance above and every one below, which is why this is one
entry and not six.

The sharpened rule, from the measurements: **a label overflows whenever its run is
shorter than the label is wide.** `offset: 0` is just the case where the run is zero
long. That framing also explains why some suspicious geometries pass — they pass by
luck, not by design (see `5 min-width` below, which clears by under a unit).

Measured with `docs/diagram-overlap-sweep.js` (item **65**) against a real browser and
real `getBBox()` values, not estimated character widths — the instrument matters here,
because this feature has twice been wrong about layout from the wrong one (item 64).
Seven geometries, four pass, three fail:

| case | drawn width | verdict | what breaks |
|---|---|---|---|
| `1 baseline` — one dado, 24"×5½" | 1000 | **pass** | — (calibration control) |
| `2 two-close` — two dados ¾" apart | 420 | **FAIL** | the two `3/8" deep` labels overlap |
| `3 offset-zero` — cut at `offset: 0` | 1000 | **FAIL** | `0"`×`1/8"` overlap; three labels reach to x = −46 |
| `4 flush-max` — rabbet flush at the max end | 1000 | **pass** | — |
| `5 min-width` — edge groove, `drawnH` floored | 125 | **pass** | — (by ~0.7 units; see below) |
| `6 narrow-drawn` — 24"×100-15/16" panel | 125 | **FAIL** | `6"`×`3/4"` overlap; depth label 15 units left of the board |
| `7 many-cuts` — five spread dados | 1000 | **pass** | — |

**Case 6 is new and is the one to read.** It is not about a cut near an edge: the board
is drawn narrow because the *shrink* branch fires and `MIN_WIDTH` floors `drawnH` to
125. At that width a ¾" cut on a 24" board gets a run of 3.9 units, widened to
`MIN_FEATURE = 6`, carrying a 41-unit `3/4"` label — a label seven times its own run.
Any part wider than about 40% of its length reaches this branch, so a shelf or a panel
gets there, not an exotic input.

**Case 5 passes by luck and should be read as a near-miss, not a clean result.** Its
runs happen to be ~41.7 units against ~41-unit labels. Same `drawnH = 125` as case 6;
different cut proportions. A slightly longer label (`11/16"`, `1-1/4"`) would fail it.

**Two hypotheses this sweep DISPROVED**, recorded because they look plausible and would
otherwise be re-proposed: a depth label on a cut flush at the max end does *not* collide
with the overall-width label (they occupy different vertical bands), and a long
`vLabel` does *not* overflow the 90-unit `RIGHT` gutter — because the width label now
tracks `fit.offsetX + fit.drawnH` rather than the nominal `DRAW_WIDTH`, which was fixed
in the same session's final review pass.

**One universal, sub-pixel, and deliberately not fixed:** every near-side depth label's
glyph box starts at y = −0.6, six tenths of a unit above the viewBox, because it sits at
`TOP − 8 = 18` with a box 23.68 tall. That is ascent padding, not visible ink. It is the
reason the sweep needs a 1-unit tolerance, and calibrating that tolerance is what makes
the baseline pass.

**None of this is a regression.** All three failures were live in the build deployed on
2026-08-01, and follow-up 59 was shipped open by an explicit decision — the prose setup
lines above each drawing carry the correct numbers regardless. New instances of an
already-accepted root cause are the same decision, not new breakage.

**What a refinement round should weigh.** The fix named in spec §5 — fold the depth
label into the stacked leader row — closes case 2 but *not* cases 3 and 6, because those
are leader labels colliding with each other and with the board's own edge. A fix that
addresses the stated diagnosis rather than the first symptom has to reckon with label
width somewhere: measuring text (`getComputedTextLength`, or HTML labels the browser
lays out), or a layout that cannot collide by construction (one label per stacked row,
left-aligned at a fixed x rather than centred on its run), or leader lines with
callouts. That is a design question, which is why this is a round and not a patch.

**59a. Pagination outcome, recorded.** Spec §7 named "does a drawn row survive a
printed page break" as a browser-verification item; it was checked (task 6's check 9)
but the outcome had gone unrecorded here. Checked against a real PDF, backgrounds
suppressed: the page break landed cleanly between two rows — the 24"×24" panel's row
and the following `24" × 5-1/2"` board's row — with no drawn diagram split across the
boundary and no row's text separated from its own figure. **PASS**, confirming
`break-inside: avoid` holds on both `.cutlist-row` and `.cutlist-diagram`.

**Status:** record-only. (triaged 2026-10-16)

**60. `MAX_ASPECT` (8), `MAX_HEIGHT` (420) and `MIN_WIDTH` are browser-settled, not
test-settled — amended 2026-08-01, the label layout round's Task 6.** The unit tests
pin `fitView`'s *behaviour* — that a sliver clamps, that a tall drawing shrinks
uniformly and centres — but nothing in the suite asserts that the result is
*readable*, because readability is a browser judgement, not a computable property.
The original pass exercised the two extremes named in the plan (a 96" rail against
`MAX_ASPECT`, a 24" square panel against `MAX_HEIGHT`); this round's Task 6 went back
to the browser with the label layout in place and looked at three geometries:

- `MAX_ASPECT`: a 96" × 3-1/2" rail draws 1000×125, the mid-span dado clearly visible.
- `MAX_HEIGHT`: a 24" square panel draws a centred 420×420 square, not squashed — and
  the two ¾"-apart dados that used to fail (follow-up 59's "two-close" case) now read
  as separate, which is the case this round exists to fix.
- `MIN_WIDTH`: a 24" × 100-15/16" panel draws 125×420, tight but legible, with the
  label row starting exactly at the board's left edge (the `fit.offsetX` binding from
  Task 5).

`MIN_FEATURE = 6` was also exercised in the same pass: the rail's ¾" dado draws at
true scale (7.8 units), the narrow-drawn panel's widens from 3.9 to 6, and both are
visible. **No constant was changed** — this is the plan's named legitimate outcome,
not an omission, so no code review was dispatched for this task. That is still a
judgement call recorded here, not a proof: a future part with more extreme
proportions, or a screen/print size this pass did not check, could still call the same
constants into question, and they stay named exports in `diagramScale.ts` for exactly
that reason.

**Status:** record-only (browser-settled by decision). (triaged 2026-10-16)

**61. §2's "one view per `(face, across)` pair, not per face" non-goal was checked
against the panel, not just against `diagram.ts`'s tests, and it holds — the case it
protects against cannot currently be reached through the UI.** The concern is a cut
naming the same dimension for both `face` and `across`, which has no position axis to
draw against; `diagram.ts` handles it defensively (`if (cut.face === cut.across)
continue`) for a document built or imported from outside the panel. In the panel
itself, `Properties.tsx`'s `setFace` already swaps `across` away from the new `face`
whenever they'd collide (`across = face === cut.across ? positionAxisOf(face,
cut.face) : cut.across`), so a person using the Cuts section cannot construct the
degenerate cut in the first place. Reads as a non-goal that survived verification, not
a bug: the browser check confirmed the *panel* path is already closed, which is what
makes `diagram.ts`'s own guard belt-and-suspenders rather than load-bearing today.

**Status:** closed — superseded by the per-face diagrams round (views keyed per face). (triaged 2026-10-16)

**62. `band()` has no ordering guard on its `Span` argument — CLOSED, 2026-08-01, the
label layout round's Task 2.** A `Span` with `[max, min]` instead of `[min, max]`
would have produced a negative `width`, which the `width < MIN_FEATURE` branch would
then silently re-centre as if it were a legitimate narrow cut, drawing a
plausible-looking band in the wrong place with no error. Closed opportunistically,
not because a real caller reached it — Task 2 was already editing `band()` to clamp a
widened band inside the outline, and adding the ordering guard while the function was
open cost nothing extra. Every current producer of a `Span` reaching `band()` is still
`cutRegion`, which always emits min-then-max, so this was latent rather than live even
before the fix; the guard exists for a future hand-built `Span` that skips
`cutRegion`'s contract.

**Status:** closed. (triaged 2026-10-16)

**63. `DiagramCut.v`, `DiagramCut.kind`, and `DiagramFit.sy` are carried but unused by
their only consumer — amended 2026-08-01.** `v` is redundant by construction — every
band in the current layout spans the view's full height, so nothing consumes the
explicit span — and `kind` (`'dado' | 'rabbet'`, from `cutLabel`) is computed and
attached but never read by the renderer. `PartDiagram` uses `drawnV` and `sx` (via
`band`); `sy` is exported and tested but never read there either — it is the third
member of the same family. The label layout round removed
`.cutlist-diagram-depth` (the depth label moved into the leader row and lost its own
class), so this entry's wording has been checked against the current code and still
describes it accurately: the three unused fields are unchanged by the round. Not dead
weight in the sense of being pointless: `DiagramView`/`DiagramCut` are `diagram.ts`'s
own exported shape and `DiagramFit` is `diagramScale.ts`'s, all tested directly and
independently of `PartDiagram`, and a future caller (or a future renderer variant)
reading `kind` to label a band "dado" vs "rabbet" directly, or `sy` to document/assert
non-uniform scaling, is a plausible next use rather than a hypothetical one. Left as
is — trimming any of the three would save nothing `PartDiagram` currently needs and
would narrow a tested, documented shape for no behavioural gain.

**Status:** record-only (left as is; since then `v` and `sy` ARE read by PartDiagram — only `kind` is unread). (triaged 2026-10-16)

**64. Task 4's layout constants were wrong as the plan supplied them — a lesson,
same shape as joinery's "seven defects were in code the plan supplied verbatim."**
The first leader row's label overlapped the outline (and, on a view with a far-side
cut, the far depth label too), because the plan's spacing arithmetic never accounted
for actual font metrics. Caught in review, not in the browser pass — fixed with a
named `GAP` constant and a wider `ROW`, and guarded afterward by a numeric-coordinate
test asserting the leader stack starts below the outline and the far label with
margin to spare. Recorded beside the joinery lesson because it is the same failure
shape recurring in a different feature: a plan's code is not more trustworthy than
hand-written code, and this is the cut list diagrams' one entry in that ledger.

**A second plan-supplied defect, found in the final review pass — and a deeper one.**
`fitView` (`diagramScale.ts`) clamps `drawnV` from below for a short board
(`MAX_ASPECT`) and from above for a tall one (`MAX_HEIGHT`), but nothing clamped
`drawnH` after the shrink branch handling a *tall* board ran — a board with `h = 0.75,
v = 24` (a full-length groove in a board's edge: `face: 'width', across: 'length'`
gives `along: 'thickness'`, ordinary joinery, not a pathological input) drew `drawnH =
13.12` against a `MIN_FEATURE = 6` band, i.e. a single cut band 45.7% of the entire
drawn board width. Fixed with a `MIN_WIDTH` floor, symmetric with `MAX_ASPECT`, applied
before `offsetX` is computed so centring stays correct; guarded by tests pinning
`drawnH === MIN_WIDTH`, the resulting non-uniform scale, and that centring still holds.
This is deeper than the first entry above: `MIN_FEATURE` and `MAX_ASPECT` both exist in
the same plan specifically as guards against extremes, so the missing `drawnH` floor
is a gap in the plan's own stated reasoning, not a typo or an overlooked font metric.
Neither the unit tests (which never called `fitView` with `h < v`'s inverse case at
this ratio) nor the browser pass (which checked the two extremes the plan named, per
follow-up 60, but not this one) reached the path. Two plan-supplied defects in one
feature is the point worth recording: a plan's own stated guards are not proof it
checked every direction they imply.

**Status:** record-only (lesson). (triaged 2026-10-16)

**65. `docs/diagram-overlap-sweep.js` — the text-collision harness. Not a defect; the
artifact a refinement round starts from.** A browser-pasteable diagnostic that reads
real `getBBox()` values off rendered diagrams and asserts three predicates per figure:
pairwise overlap between every `<text>` in the same SVG, any text outside the viewBox,
and any depth or leader label reaching left of the board's own edge. It produced the
table in item **59** and it is how that table gets re-checked after any layout change.

**It lives in `docs/` deliberately** — neither `tsc -b` nor vitest looks there, so it
adds nothing to the build or the typecheck. It is not a unit test and should not
become one: `getBBox()` returns zeros under jsdom, so this class of defect is only
observable in a real browser. That is precisely why it went unnoticed through a full
TDD pass, two task reviews and a whole-branch review.

To run it: open the cut list with the parts on screen, set the Diagrams toggle to
**All parts** if cut-free rows matter, and evaluate `sweepDiagrams()`. An empty
`issues` array is a pass.

**Amended 2026-08-01, the label layout round: `TOL` re-derived from 1 to 0.1.** The
original `1` was picked to swallow the 0.6-unit ascent padding described below without
independent measurement of how much margin that left. Task 5 re-ran the sweep
baseline-only (no other geometry, so nothing could hide a bad tolerance behind a real
pass) and measured directly: the worst overhang past any viewBox edge came out at
exactly `0.00`, and the smallest edge clearance measured was `5.83` units. `0.1` is
derived from that headroom, not picked to make the suite pass — it still swallows the
ascent padding with room to spare, and it is tight enough to flag a real regression
that `1` would have hidden. The **calibrate before you conclude** instruction stands
unchanged: if `TOP` or `LABEL_SIZE` changes, re-run the baseline-only measurement and
re-derive `TOL` again rather than reusing `0.1` on faith.

**And keep a passing case in any geometry set you drive it with** — `1 baseline` is
there to prove the harness can still say "pass", which is the only thing that makes a
FAIL mean anything.

The seven geometries described in item 59's table were joined by an eighth in Task 4
(a board dadoed from both sides in the same face, exercising the near/far distinction
in one drawing) — all eight are now pinned as unit tests in addition to being
sweep-checked in the browser, and the round's final browser pass ran the full eight
and came back **ALL CLEAN: 0 issues** at `TOL = 0.1`. They are seeded by writing a
document straight to `localStorage` under `sloyd.autosave.v1` and reloading, which is
faster and more repeatable than building parts through the UI.

**Status:** record-only (harness). (triaged 2026-10-16)

## From the label layout round

Design in `docs/superpowers/specs/2026-08-01-sloyd-diagram-label-layout-design.md`.
Closes follow-up 59; amends 60, 63 and 65; closes 62 opportunistically. New entries
below.

**66. `LABEL_EM` is an upper bound taken from one machine's monospace resolution —
recorded as a bounded risk, not a universal constant.** `--font-num` measured a
≈12.03 units/glyph advance at font-size 20 in a real browser on this host (two
independent probes, 12.042 and 12.029), for digits, punctuation and mixed strings
alike; `CHAR_W = LABEL_SIZE * LABEL_EM = 12.4` bounds that from above with **0.358**
units/glyph of headroom against the higher of the two probes. That headroom is this
machine's number, not a proof about every monospace stack `--font-num` could resolve to
elsewhere. The failure direction is asymmetric and deliberately favours the safe side:
if a browser's `--font-num` face is *wider* than 12.4 units/glyph, `labelWidth`
under-counts and `packRow` under-spaces — labels **crowd**, they do not **pile up**,
because `packRow` still pushes each label right of the one before it in order; nothing
in the algorithm can make labels overlap by less spacing than computed, only by more
than needed. The sweep (item 65) is exactly the instrument that would catch a real
crowding case on a different machine — this is recorded so a future "labels look a
little tight in Chrome on Windows" report is read as this risk landing, not as a new
defect.

**Status:** record-only (bounded risk; `LABEL_EM` unchanged). (triaged 2026-10-16)

**67. `packRow`'s lower bound is now `fit.offsetX`, narrowing its left-shift headroom
— latent, not live.** Task 5's fix (binding both `packRow` call sites' minimum to the
board's own left edge rather than the viewBox's) closed a real P3 (an offset label
drifting left of the board it annotates), but it also means a row that overflows can
shift left only as far as `fit.offsetX`, not all the way to the viewBox origin. Today
that headroom is never exhausted: `fit.offsetX <= 437.5` against `viewW >= 1090`
leaves roughly 652 units of gutter to the right, so no observed row has come close to
needing the old, wider left-shift range. Unreachable today rather than deferred, in
the same spirit as follow-ups 62 and 63: a small pure function whose contract a future
caller could violate without reading it first, this time by feeding `packRow` a wider
label set or a narrower board than any case this round exercised.

**Status:** record-only (latent headroom note; nothing to fix). (triaged 2026-10-16)

**68. LESSON — this round produced the THIRD and FOURTH instances of plan-supplied
code being wrong; follow-up 64 already records the first two.** The pattern across all
four, stated once because it is now established rather than coincidental: **a guard
written for one direction, and a test written to the guard rather than to the
requirement.**

- *(3)* The `vx` clamp positioning the overall-width label satisfied the viewBox
  bound — the label stayed inside `0..viewW` — **by violating the outline it existed
  to protect**: on a 240" × 100-15/16" board it placed the label 33.3 units to the
  *left* of the outline's right edge, drawn across the figure it was meant to sit
  beside. The plan's own test blessed this, because it asserted only the viewBox
  bound and never checked the label's position relative to the outline — a test
  written to the guard, not to the requirement the guard was supposed to serve. Fixed
  by a human ruling, not by relaxing the clamp: grow the viewBox
  (`viewW = max(VIEW_W, right + 12 + vw)`) so the label always sits at `right + 12`
  and is never pulled left at all.
- *(4)* The leader row's two runs (the offset run and the band run) were drawn as
  adjacent, collinear lines with identical stroke, so they visually fused into one
  line — a guard against *overlapping labels* that said nothing about *whether the
  lines a reader's eye follows still mean what they claim to*. The offset label ended
  up looking like it measured from the board's edge to the cut's *far* side, not its
  near side, because there was no visual break where one run's meaning ended and the
  next began. Fixed with end ticks (`TICK`) at each run boundary — found by a human
  looking at the rendered diagram, not by any guard, review, or test (see item 69).

Read beside follow-up 64: two features now, four instances, one shape. A plan's code
is not more trustworthy than hand-written code, and a test that asserts the guard's
own bound proves the guard fires — it does not prove the guard protects the thing it
was written for.

**Status:** record-only (lesson). (triaged 2026-10-16)

**69. What the sweep's green does and does not mean — recorded so a future clean run
is not over-trusted.** `docs/diagram-overlap-sweep.js` collects only `<text>` elements
and checks their bounding boxes for overlap, viewBox escape, and left-of-edge
placement. The run-fusion defect (item 68, instance 4) involved no text at all — two
`<line>` elements reading as one — so it was invisible to the sweep by construction,
regardless of tolerance. It was equally invisible to the eight unit tests (which pin
coordinates, not visual continuity) and to three code reviews across the round. It was
found by a human looking at a rendered diagram. **"Sweep clean" means no text
collides; it does not mean the drawing reads correctly.** Anything about a diagram
that a person perceives through relationships between *lines*, not just where *text*
sits, needs the same browser-eyes verification the sweep was built to reduce, not
replace.

**Status:** record-only. (triaged 2026-10-16)

**70. NOT verified this round: an actual print-to-PDF render.** The Playwright MCP on
this host exposes no `pdf()` call, so no PDF was produced or inspected. What *was*
checked, and is not a substitute claim for a print pass: the `@media print` block in
`styles.css` contains no rule touching the diagram's `font-family` or leader
`stroke` — `.cutlist-diagram-overall` and `.cutlist-diagram-leader text` set only
`font-family` outside the print block and nothing overrides it inside;
`.cutlist-diagram-leader line`'s stroke likewise inherits — so both properties carry through to
print unchanged rather than silently reverting to a proportional face or a different
stroke. Pagination (a drawn row surviving a page break) was verified in the previous
round and is recorded at item 59a; it was **not** re-checked this round, and the reason
is the same tooling limitation named above — the Playwright MCP on this host exposes no
`pdf()` call, so there was no way to produce a fresh render to check it against, not
because this round's changes leave page-break behaviour untouched. That second claim
would in fact be false: `TOP` went 26→4, `FAR` (22) was deleted, and `viewW` can now grow
past the nominal `DRAW_WIDTH + RIGHT` — every diagram's rendered height changed (roughly
40 units shorter from the `TOP`/`FAR` change alone), and a grown `viewW` changes rendered
pixel height again under `height: auto`. Page breaks would therefore very likely land in
different places than the 59a run recorded. What is true, and is the actual reason this
was not re-verified as a defect risk: `break-inside: avoid` on `.cutlist-row` and
`.cutlist-diagram` is untouched by this round's `src/` changes and very likely still
holds — but that is an expectation carried over from 59a, not a fresh verification. Do
not read either fact as "the print output was checked" — it was not.

**Status:** open (owed to the user: a real print, CLAUDE.md's 70/79/84). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 by the user's real print: "A real print looks good, although the cut list should probably try to start new sections on new pages because right now the way it splits things up across pages is very messy". The page-splitting is fu 383.

**71. `packRow`'s left-shift phase is real, reachable, and pulls a label away from the
band it names — recorded from a final-review re-derivation, open rather than fixed.**
`packRow` runs two phases, not one: labels cascade right in board order during the
sweep, and only then, if the row still overflows `max`, does the whole row shift left as
one. Case 6 (item 59's table, and spec §9's worked walkthrough) never reaches the
left-shift phase — its row (642 units) fits comfortably under `viewW` (1090) — so every
existing worked example in `CLAUDE.md`, this file, and the design spec described only
the cascade-right phase, which reads as the whole story if you have not derived a case
where the second phase fires. It does fire. Worked here, re-derived in the final review
pass and checked against the code rather than assumed: sweep case **4** (`flush-max`, a ¾"
rabbet at `offset: 23.25` on a 24"×5½" board). The band draws at 968.75–1000. The row's
natural (post-cascade) extent is 1136.8 units wide against `viewW = 1090`, so the whole
row shifts left by 38.8 units to fit — and the `3/4"` label, which the cascade had
already pushed right to sit beside the band, ends up spanning 920.8–970.4: mostly to the
LEFT of the band it names.

This is accepted drafting behaviour, not a defect — it was looked at in a browser during
this round and reads correctly there, and `packRow`'s contract never promised a label
stays right of its own band, only that labels within a row do not overlap each other and
the row stays inside `[min, max]` where it can. But it is worth being honest about what
it costs: of spec §3's four goals, goal 3 ("the numbers stay spatially attached to the
geometry they describe") is at its weakest exactly here — a label can end up on the
visually wrong side of the feature it names, once a row runs long enough to trigger the
second phase. **No test asserts attachment.** The eight geometry tests in
`PartDiagram.test.tsx` assert non-overlap and viewBox containment; those are both real
properties and neither one is "does this label still read as belonging to this
geometry," which is what goal 3 actually asks for and what a human has to judge. Recorded
as an open follow-up rather than silently treated as covered by the existing test
layers.

**Status:** open (test gap; judgement): the left-shift phase remains and no test bounds a label's distance from its band. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 (follow-ups 5): the left-shift phase stays (accepted drafting behaviour); sweep case 4 now asserts the shifted `3/4"` label still REACHES its band (`PartDiagram.test.tsx`; mutated: a 40-unit over-shift reds it, 930.4 < 968.75).

## From the per-face diagrams round

Design in `docs/superpowers/specs/2026-08-01-sloyd-per-face-diagrams-design.md`.
**Supersedes the `(face, across)` view key from the cut list diagrams (follow-up 61)**
— views are now keyed on `(face, from)`, one per physical face-and-side, and follow-up
61's premise (a face can legitimately produce two figures) no longer applies: a face
now produces at most one figure regardless of how many differently-oriented cuts it
carries.

**72. The `(face, across)` key fragmented a single face into two figures — found by
driving a real browser with a twelve-cut board, not by reading code.** A 24"×12" board
with rabbets on all four edges of both faces plus crossing shallow dados on both faces
— twelve cuts, ordinary casework joinery — produced exactly two diagrams, both headed
"Thickness face," each showing one of the two crossing dados and neither showing the
other. The same physical face was drawn twice, in two different orientations and two
different aspect ratios, each telling half the truth: near and far bands from the two
faces coincided at the same position with only hatch-versus-dash to separate them,
leader rows came in identical pairs, and the actual joint — where the two centre dados
cross — appeared in neither figure. This was not reachable by inspecting `diagram.ts`
in isolation; the fragmentation is a property of what a *board* with crossing joinery on
one face looks like once drawn, which only a rendered board with genuinely
perpendicular cuts on the same face exposes. `boardSolids` already handled the crossing
correctly in 3D — this was a presentation failure, not a model one (design §1). Closed
by re-keying on `(face, from)` and computing a depth field (design §4) that classifies
the crossing as its own kind of cell (maximum depth, `crossing: true`) — emitted as
per-cell rects with no merge step, since the `<pattern>` hatch already renders adjacent
equal-depth cells as one continuous region.

**Status:** closed (views keyed `(face, from)`). (triaged 2026-10-16)

**73. `hasFar`, `DiagramCut.side`, and the far-side dash were retired one round after
being added — not a regression.** The dashed leader line and the near/far hatch
distinction were added in the label layout round as the replacement encoding for
near/far after depth moved off the outline. Splitting diagram views on `from` (follow-up
72's fix) means every view now shows exactly one side of one face, so there is nothing
left for a second encoding to distinguish within a single drawing — the near/far
question is answered by which figure you're looking at, not by a mark inside it. A
reviewer checking this round should confirm the fields and the dash are **gone**, not
that they survived; their removal is the point, not an oversight.

**Status:** record-only (retired on purpose). (triaged 2026-10-16)

**74. `getBBox()` ignores an element's own transform — a standing trap for anyone
extending the sweep harness.** The rotated leader columns (design §7) rotate their
`<text>` elements `rotate(-90)` for labels running along the vertical axis.
`getBBox()` on such an element returns the box in the element's **local**, untransformed
coordinate system — it does not compose the element's own transform, let alone the
chain up to the SVG root. Measured directly: a rotated label reported **120.29 × 23.68**
against a true on-screen box of **14 × 71.13** — width and height not merely wrong but
roughly swapped and scaled, because the reported box is the label's box *before*
rotation, read as if it still applied to the untransformed frame. Any future harness
code (or any code anywhere that calls `getBBox()` on rotated content) must compose the
element's computed transform (its CTM relative to the SVG root) with the raw box before
trusting the numbers — `getBBox()` alone is only correct for unrotated elements, which is
every element this codebase drew before this round.

**Status:** record-only (harness trap). (triaged 2026-10-16)

**75. HARNESS LESSON, not a defect: the fix for follow-up 74 was itself written
backwards on the first attempt, and it produced false failures rather than an obvious
crash.** The correct composition order is `svgInv.multiply(elCTM)` — the element's CTM
expressed in the SVG's own coordinate space. The first attempt wrote
`elCTM.multiply(svgInv)`, the operands swapped. For every *untransformed* element this
is the identity matrix, so the horizontal (non-rotated) control label read correctly and
passed sanity-checking — only the rotated labels were wrong, and wrong in a way that
looked like a real defect rather than an instrument bug: they reported an x-coordinate
of **-4043** in a viewBox only **1141** units wide, producing false FAIL results on all
four figures carrying a rotated column. The tell that caught it was not a failing
assertion — the harness ran and produced output — it was sanity-checking an absurd
number (a label sitting nearly 4000 units left of a ~1000-unit board) against the
element's own attributes, which made no sense for any real geometry. **The lesson: an
instrument needs a control that can distinguish "the instrument is broken" from "the
thing being measured is broken."** A rotated-vs-unrotated pair of controls is exactly
that — the unrotated control kept reading correctly throughout, which is what made the
backwards multiply detectable at all rather than simply producing plausible-looking
wrong numbers everywhere.

**Status:** record-only (lesson). (triaged 2026-10-16)

**76. NEGATIVE BROWSER FINDING, recorded honestly: hatch versus cross-hatch is not
reliably distinguishable at screen size.** Same category as follow-up 60
(browser-settled, not test-settled). Design §7 chose two fills — hatch for an ordinary
cut region, cross-hatch for a crossing whose covering cuts' depths differ — specifically
to avoid an unbounded fill-per-depth scheme. The browser sweep confirmed the *mechanism*
works end to end (one figure showed a genuine cross-hatch region and the legend line
"crossing: 1/4" deep governs"; a second figure with equal-depth crossing cuts correctly
showed neither), but also showed that a person looking at the rendered SVG at normal
screen size is not reliably picking the fill pattern apart — **the legend line is
carrying the information, not the fill.** The two-fills decision may be worth revisiting
with this evidence: a bolder visual distinction (a different stroke weight or colour on
the crossing's outline, rather than a second hatch density) might carry the distinction
the fill alone does not. Recorded as evidence for a future design decision, not as a
defect to fix now — the legend line means the sheet is not wrong, only that the fill by
itself is not pulling its weight.

**Status:** record-only (the legend carries it). (triaged 2026-10-16)

**77. Sheet length rises with view count — real but mild, confirming design §10.** The
twelve-cut worst case (follow-up 72's board) now draws **2 figures at 1122px** combined,
against roughly **299px** for a simple cut-free part. A ten-part sheet carrying a mix of
plain and heavily-joined parts measured at **4654px total**. Long, but not impractical —
scrolling a sheet, not paginating past a reasonable print length. Design §10 flagged
view count as a risk worth a browser look before calling the round done; this is that
look, and the risk is confirmed real but mild rather than disproved or escalated.

**Status:** record-only (mild, confirmed). (triaged 2026-10-16)

**78. `boundaries()`'s exact-equality dedup can leave an invisible extra cell —
benign, recorded next to invariant 18's reasoning.** `depthField.ts`'s `boundaries()`
collects cell-boundary coordinates in a `Set<number>`, which dedupes only on exact
bit-equality. Two cuts whose shared edge is computed by different arithmetic (say,
`2.9 + 3.1` versus a stored `6`) would not dedupe, producing an extra sliver cell a few
ULPs wide next to its neighbour. The consequence is benign, not a wrong picture: the
sliver carries the same covering cuts and the same depth as the cell beside it, and the
SVG hatch pattern (anchored to the drawing, not to each rect — design §4) makes two
adjacent equal-depth cells visually indistinguishable. So this is an invisible extra
array entry, not a rendering defect. Recorded here rather than fixed because nothing
in the current cut-construction path (the panel only ever writes cut boundaries as
plain stored numbers, never as a sum) reaches the case that would produce it — the same
"latent, not live" shape as follow-ups 62 and 67.

**Status:** open (latent, benign): `boundaries()` still dedups by exact equality (depthField.ts); the sliver it allows is invisible. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 (follow-ups 5): `boundaries()` merges boundaries within `BOUNDARY_EPS` 1e-9 (inv 22), the lower standing for both and `extent` always standing. Measured first: the sliver was not merely invisible — covered by BOTH cuts, at different depths it was marked `crossing`. Two tests, each branch mutated.

**79. Print-to-PDF is still not verified on this host.** Carried forward again, not
re-promised: the Playwright MCP available here exposes no `pdf()` call, so no PDF was
produced or inspected for the rotated leader columns, the depth field's fills, or the
crossing legend. This is the same tooling limitation recorded at follow-up 70
(the label layout round) and it applies unchanged to this round's renderer changes.

**Status:** open (owed to the user: a real print). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 by the user's real print ("looks good"; see fu 70's last Status). The page-splitting is fu 383.

**80. LESSON — this round produced a fifth instance of a plan-supplied constant being
wrong, and a stale justification for it in the same report.** Follow-up 64 records the
first two instances (both in the cut list diagrams round); follow-up 68 records a third
and fourth (the label layout round), naming the shared shape: **a guard written for one
direction, and a test written to the guard rather than to the requirement.** This round
adds a fifth: Task 6's `COL = 39` — the width reserved for a rotated leader column —
replaced the plan's literal `COL = 26`, and the task report's recorded justification for
39 did not reproduce when the final reviewer checked it: reverting to `26` and re-running
the task's own 25 tests, all 25 still passed. The derivation behind `39` is sound (it
comes from the measured glyph-height constant — `diagramLabels.ts`'s `23.68`, documented
in that file's own comment on `LABEL_ASCENT`/`LABEL_DESCENT` — plus margin), but
the constant had shipped **unguarded** — nothing in the test suite actually depended on
its value being large enough, so a wrong number and a right number were indistinguishable
to the suite. This is why the fix round that followed added a real guard (text-vs-outline
and text-vs-line checks, not just text-vs-text and text-vs-viewBox) rather than trusting
the report's arithmetic on its own. Read together, follow-ups 64, 68 and 80 are five
instances across three different rounds of the same failure shape — plan-supplied code
and plan-supplied justifications are not more trustworthy than hand-written ones, and a
green suite proves a guard fires, not that it protects the thing it was written for.

**Status:** record-only (lesson). (triaged 2026-10-16)

## From the board-feet round

Design in `docs/superpowers/specs/2026-08-01-sloyd-board-feet-design.md`. Adds board
feet (solid stock) and square feet (sheet goods) to the cut list, per row and per group,
closing the first half of the cut list's §7 non-goal.

**81. The print-block gap that landed is a genuinely new wrinkle on follow-up 58, not a
restatement of it — enumerating the selector was necessary but not sufficient.**
Follow-up 58 recorded the cut list's print block leaving text unreadably grey- or
brass-on-white the first time this modal shipped print styling at all; the fix then was
to enumerate every text-bearing selector into a `color: #000` list under `@media print`.
Task 3 of this round did exactly that — it added `.cutlist-stock` (the new row-total
cell) and `.cutlist-subtotal-label` (the new group-subtotal label) to that same
enumerated list, and both were reviewed as correct at the time, by both the task's own
self-review and a subsequent task review. The defect survived both: `.cutlist-subtotal
.cutlist-stock` (the group-subtotal *number*, not its label) carries a two-class screen
rule, `color: var(--brass)` (specificity 0,2,0), and the print block's enumerated
`.cutlist-stock` override is only one class (specificity 0,1,0). A less specific rule
later in source order still loses to a more specific rule earlier in it — the print
block's own cascade position doesn't help when the thing it's trying to beat outranks it
on selector weight, not just on order. The result: every row total printed correctly
black, but the group subtotal — the number most likely to be the one actually read at
the bench, since it's what you'd tell a lumber yard — kept printing brass on a page that
was supposed to be ink on white. It was caught by task 4's own browser pass (rendering
`@media print`, screenshotting, and reading the image), not by either prior review,
because neither review rendered the page — both read the diff, and the diff looked
complete. Closed in a follow-up commit (`a54a086`) by adding a matching two-class
override, `.cutlist-subtotal .cutlist-stock { color: #000; }`, to the print block
alongside its other post-enumeration overrides — verified twice, by
`getComputedStyle(...).color` returning `rgb(0, 0, 0)` under `media: 'print'` and by
looking at the rendered screenshot. **The lesson for future print-block edits to this
modal: enumerating a selector is the right first move, but it is not proof the override
wins — only a render (or a computed-style check under print media) proves the cascade
actually resolves the way the enumeration assumed it would.** Follow-up 58 taught "list
every text-bearing selector"; this teaches "then check the list actually outranks
whatever it's overriding," which a purely textual review of the CSS diff has no way to
catch, because both rules were plainly present and legible in the file — the failure
was in their relative specificity, not their existence.

**Status:** closed (`a54a086`: the two-class print override). (triaged 2026-10-16)

**82. The third instance of the 55/55a representative-row shape, resolved the *other*
way — recorded here because a future reader who "fixes" the discrepancy will be
reversing a deliberate decision, not restoring an oversight.** Follow-ups 55/55a
(cut list round) record that a row's printed *dimensions* are representative — two
boards belong on one row when they print identically, not when they are bit-identical —
and that this is correct because a display-precision difference costs nothing at the
bench. Board feet breaks that symmetry on purpose rather than inheriting it: per design
§2, `buildCutList` accumulates each board's *exact* volume into `row.stockInches` and
`group.stockInches` as its existing grouping loop visits each board, not `qty ×` the
representative board's volume. The visible, expected consequence: a row printing
`2 × 24" × 5-1/2"` at `1.38 bd ft` will not, in general, satisfy `1.38 == 2 ×
formatBoardFeet(24 × 5.5 × 0.75)` to the eye doing that arithmetic on the sheet, because
the two 24"-printing boards are very rarely bit-identical in stored length. This is
correct, not a bug: rounding the total to make the sheet self-consistent was considered
and rejected in the design specifically because it would make the *purchasing* number
wrong, which is the one number on this sheet whose entire job is being exact. Verified
on the seeded browser document (task 4): the Pine row totals (`1.36 bd ft`, `1.38 bd ft`)
and subtotal (`2.73 bd ft`) matched the design's precomputed numbers exactly, and no
discrepancy was visible in this particular seed only because the four seeded boards
happen to be bit-identical within each row — the divergence this entry describes needs a
seed like follow-up 55's (two boards a fraction of an inch apart) to actually show on
screen, which was out of scope for this round's seed and is recorded here rather than
demonstrated. A second, related consequence: the printed *group subtotals* do not
necessarily sum to the same number as adding the printed *row* totals together, for
the identical reason. Each printed figure is independently rounded to two decimals,
while the subtotal is computed from unrounded accumulated values. Example from the
spec's own mockup: rows print `1.38` and `1.36` (which sum visibly to `2.74`), but the
group subtotal prints `2.73` — correctly, because the true total is `393.75 / 144 =
2.734375`. This is correct, not a bug, by the same argument as the row-to-total
discrepancy: rounding the subtotal to make the sheet internally self-consistent was
rejected in the design because it would make the purchasing number wrong.

**Status:** record-only (decision). (triaged 2026-10-16)

**83. What `formatBoardFeet`/`formatSquareFeet` deliberately do not do — recorded so a
future request to add any of these reads as a re-proposal, not a gap.** No rounding up
to a whole or a yard's typical sale unit (design §5: "the true number, let the user
round" — the reverse isn't recoverable). No waste factor (design §8: a per-user
purchasing preference, and a trivial mental multiply on a number now printed for them —
adding it needs a settings surface this app doesn't have). No user-configurable
precision: both formatters are fixed at two decimal places regardless of the document's
`units.precision`, because that field is a fractional-inch *denominator* (16 means
sixteenths) and feeding it to a decimal-volume formatter would be a category error that
happens to typecheck (design §5). No document-wide grand total (design §3: pine and
walnut board feet sum to a real number but not a useful one, and board feet and square
feet can't be summed at all).

**Status:** record-only (non-goals). (triaged 2026-10-16)

**84. The browser pass used media emulation, not a real PDF render — same tooling
limitation as follow-ups 70 and 79, applies unchanged here.** `page.emulateMedia({
media: 'print' })` plus a full-page screenshot is what this host's Playwright can do;
it exposes no `pdf()` call, so no PDF was produced or inspected for the new row-total
column or the new subtotal line. What *was* verified directly: the on-screen (screen
media) totals matched the design's precomputed numbers exactly (Pine rows `1.36 bd ft`
/ `1.38 bd ft`, subtotal `2.73 bd ft`; Plywood row and subtotal both `5.00 sq ft`), the
new fourth grid column right-aligned cleanly against the existing three without
colliding with the multi-name list (`Leg 1, Leg 2`), and — after the follow-up 81 fix —
both row and subtotal figures render `rgb(0, 0, 0)` under print media by
`getComputedStyle`, matching what the screenshot showed by eye.

**Status:** open (owed to the user: a real print). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 by the user's real print (see fu 70's last Status).

## From the sheet-nesting round

Design in `docs/superpowers/specs/2026-08-02-sloyd-sheet-nesting-design.md`. Adds a
sheet count and an SVG layout per sheet to the cut list's sheet-goods groups, closing
the cut list's last §7 non-goal — nesting is no longer deferred.

**85. Shelf first-fit-decreasing packs a few percent looser than a maxrects packer, and
that is the design's choice, not a shortfall found afterward.** A shop breaks a sheet
down on a table saw or a track saw and every cut runs edge to edge; a maxrects layout
routinely produces placements — an L-shaped remainder needing a cut that stops in the
middle of the sheet — that are denser on paper and uncuttable on a saw. Shelf packing
was picked *because* it corresponds to how the material is actually broken down, not
because it was the simpler option available. The loss is bounded by the sort putting
like heights together before packing begins (design §4, §7).

**Status:** record-only (design choice; fu 269 measures before optimising). (triaged 2026-10-16)

**86. What `buildNesting` deliberately does not do, carrying follow-up 83's rule
forward from board feet to sheets.** No offcut or remnant tracking — "you'll have a
96×11 strip left over" is a real want and a different feature, needing a notion of
inventory the document doesn't have. No waste factor and no rounding up — the count is
what the layout actually consumes; a user who wants a spare sheet can buy one, and a
tool that pads the number silently is lying about a purchasing figure, the same
argument follow-up 83 already made for board feet. No solid-stock cut optimisation —
nesting parts along an 8-foot board is a 1D problem with its own answer, and board feet
is what this app says about solid stock. No hand-rearranging of a layout — it is a
derived drawing, not a document, and making it editable would put geometry state
outside the document (invariant 1). No mixed sheet sizes within one material — one
`SheetStock` per material entry; "some of my plywood is 5×5" belongs to the
custom-materials round's own document-level sizing, not a list bolted on here.

**Status:** record-only (non-goals). (triaged 2026-10-16)

**87. The sixth instance of the plan-supplied-justification lesson (follow-ups 64, 68,
80) and the first one caught by a mutation sweep rather than by eye.** The plan's own
prose asserted that reverting the fits-test's epsilon comparison to an exact `<=` would
fail "this [test] and nothing else." That was false: the fixture it pointed at was four
24" parts on a 96" sheet, and `24 × 4 = 96` is exactly representable in binary
floating point, so the fixture never touched `EPS` at all — it passed identically with
or without the tolerance. A 15,298-case sweep (every 1/16" and 1/64" up to 96", against
kerfs of 0, 1/8", 1/16" and 3/32") confirmed the epsilon comparison and the exact one
are bit-identical across the entire fractional-inch input space, because sixteenths and
sixty-fourths are dyadic rationals and sums of dyadic rationals are exact in binary
float. `EPS` is still load-bearing, but only because `parseLength` also accepts plain
decimal entry and millimetres (divided by 25.4, which is not exact in binary) — fifteen
6.4"-decimal parts summed on one shelf land at `96.00000000000001"` in IEEE 754, a hair
over the sheet, and only the epsilon keeps the fifteenth part off a second shelf.
Closed by replacing the mischaracterized fixture's comment (it now pins coordinates for
the kerf test, nothing more) and adding the real epsilon fixture, confirmed by mutation
(deleting `EPS` fails the new test and only the new test).

**Status:** closed — fixed: `tolerates float error from decimal-inch summation, not sixteenths` (nesting.test.ts). (triaged 2026-10-16)

**88. The guillotine-cuttability test could not fail, and no fixture alone could have
fixed it — the bound had to stop being self-derived.** The property the whole algorithm
exists to guarantee (§4 of the design) is that every part's across-sheet interval falls
inside exactly one shelf band. The first version of that test derived each band's upper
bound from the very parts placed inside it — so a part that spilled past the shelf it
rode on simply grew that shelf's recorded band to match, and the assertion that the
part fell "inside" its band was true by construction regardless of whether the packer's
own height guard (`placeOn`'s `fits(f.h, shelf.h)`) was doing anything at all. Deleting
that guard — the sole line in the packer enforcing guillotine cuttability — left the
task's full test file at 19/19 green. Fixed by bounding each part against the *next*
band's start (or the sheet edge for the last band) instead of a bound the parts under
test produced, plus a dedicated MDF fixture (a 90×10 rail opening a shelf, a 30×4 stick
whose flipped orientation is 4×30 tall) that fails without the guard and passes with
it.

**Status:** closed — fixed: `places every part inside exactly one disjoint shelf band`, `does not stand a part taller than the shelf it would ride` (nesting.test.ts). (triaged 2026-10-16)

**89. A pure derivation gained a `throw` during the round's first review-fix pass, and
that was itself a defect — fixed by collapsing two paths into one rather than trusting
the throw to never fire.** `buildNesting` is called by `buildCutList` on every render
of the cut list, with no cache and no error boundary. An early fix added a `throw` for
the case where a standalone pre-check ("does this part fit *some* empty sheet") and the
later placement attempt disagreed — meant as a safety net, it would instead have
blanked the entire cut list for the single most ordinary unplaceable case, an oversized
part, which `UnplaceablePart` already exists to report as one line. The actual fix
removed the throw and the separate pre-check together: try existing sheets, then try
exactly one fresh sheet, and let *that* attempt's own result decide placed versus
unplaceable — there is now only one `placeOn` call deciding the outcome, so there is
nothing left for a second predicate to diverge from.

**Status:** closed — fixed: the throw is gone; `records a part too big for any sheet without opening one`. (triaged 2026-10-16)

**90. Task 7's `SheetLayout.tsx` formatted a placed part's dimensions from raw floats,
so the same board could print two different strings on one sheet.** The cut-list row
for a board prints `formatLength(board.length, precision) × formatLength(board.width,
precision)` — a fraction, e.g. `23-1/2"`. The layout component, reading the packer's
placed `w`/`h` directly, printed the unformatted float instead (`23.5"`), and for a
board `footprintsOf` turned 90° to fit the sheet, `w`/`h` are swapped relative to
`length`/`width` — so a turned part's layout label could also read `24" × 48"` against
the row's `48" × 24"` for the identical board. Fixed by moving `dims` into
`PlacedPart` itself, formatted once in `nesting.ts` from the board's own `length` and
`width` (never re-derived from the placed, possibly-swapped `w`/`h`), the same shape
`UnplaceablePart.dims` already used. `SheetLayout.tsx` now formats nothing, matching
`CutList.tsx` and `PartDiagram.tsx`.

**Status:** closed — fixed: `PlacedPart.dims` formatted in nesting.ts; `formats a placed part's dims, not the raw float`. (triaged 2026-10-16)

**91. A label-centring finding filed MINOR was, on inspection, load-bearing: the old
baseline placed ink past the very budget `fitLabel` had just checked against.** The
original arithmetic centred a label at `cy + LABEL_ASCENT / 2`. `fitLabel` measures a
label's box as `LABEL_ASCENT + LABEL_DESCENT` (25 units) and checks that box against
the rectangle; the correct baseline for centring that box on `cy` is
`cy + (LABEL_ASCENT - LABEL_DESCENT) / 2`. With `LABEL_ASCENT = 19` and
`LABEL_DESCENT = 6`, the old formula placed the baseline 3 units lower than the box
`fitLabel` had measured — meaning a label `fitLabel` reported as fitting could have its
descenders extend 3 units past the rectangle it was measured against. No case in this
round's fixtures actually overflowed visibly, which is why the finding read as
cosmetic; the mechanism is not cosmetic, because it is exactly the shape that would let
`fitLabel`'s tier decision silently disagree with what renders. Fixed to
`cy + (LABEL_ASCENT - LABEL_DESCENT) / 2`.

**Status:** closed — fixed (SheetLayout's baseline). (triaged 2026-10-16)

**92. Two deferred minors, left open rather than fixed, because neither has a known
failure case yet.** First: in `nesting.ts` the formatted-dims expression
(`` `${formatLength(board.length, precision)} × ${formatLength(board.width,
precision)}` ``) appears verbatim in two places — the placed-part path inside `put()`
and the unplaceable-part path — with nothing pinning that the two stay in agreement if
one is ever edited without the other. Second: nothing on a rendered sheet says "turned"
in words — `PlacedPart.turned` exists in the data and is asserted in tests, but
`SheetLayout.tsx` never prints it, so a reader looking at a near-square part's
rectangle cannot tell a 90° turn from a simple transposition of the printed dimensions.
The ambiguity is bounded twice over, not just once. It is real only near a 1:1 aspect
ratio — it vanishes as a part's length and width diverge — and it is only reachable
under `rotate: 'free'` (MDF) in the first place: `footprintsOf` returns exactly one
footprint under `rotate: 'grain'` (plywood), so the packer itself never turns a plywood
part — the only way a plywood part's grain runs across the sheet is the orientation the
cut-list row already states. Which is presumably why no reviewer flagged it as blocking.

**CLOSED 2026-08-31, both halves.**

The first is structural rather than tested: the expression is now `formatDims(length,
width, precision)`, one home, called by all **three** sites — the placed part, the
unplaceable part, and the sheet-stock label, which this entry did not name but is the same
expression over a `SheetStock`. It takes two numbers rather than a `Board` precisely so
that third caller can share it. There is no test, and that is the point: two spellings that
must agree needed one pinning them, one spelling does not.

The second is a **word on the dimension line** — a turned part reads `23" × 24" turned`,
and its key-list entry reads `1. Cleat — 5" × 6" turned`. Four things were decided rather
than fallen into:

- **The word rides on `PlacedPart.dims`, not on a panel-side concatenation, and that is
  invariant 19 rather than tidiness.** `SheetLayout` hands `[name, dims]` to `fitLabel` and
  then draws those same two strings; concatenating in the panel would measure one string
  and draw a longer one, and every unit test would still pass, because the tests assert the
  arithmetic and not the render.
- **Appended, never a transposition.** `dims` keeps printing `length × width`, so the pair
  on the sheet still matches the cut-list row for the same board. The existing test that
  pins that now also asserts the string does **not** contain the swapped pair — a whole-string
  `toBe` would go on passing if a future edit swapped the numbers and kept the suffix.
- **Never on an unplaceable part.** It fit no sheet in any allowed orientation, so it was
  never placed and has no orientation to report.
- **A symbol was considered and rejected**, and the browser pass is what would have caught
  it: a glyph outside the `--font-num` monospace stack advances differently, and invariant
  19's whole arithmetic dies silently on that. Measured instead — ASCII letters, digits, `"`
  and the non-ASCII `×` all advance 12.0345 at the applied 20px, against `CHAR_W`'s 12.4, an
  over-estimate in the safe direction.

The cost, accepted rather than hidden: seven more characters means a turned part reaches a
smaller label tier sooner than an unturned one. Verified live at all three tiers —
`docs/browser-verification-turned-label.md`, which also carries the per-glyph advance table
and the overflow measurements. Mutation: never appending (2 red), always appending (3 red),
and transposing inside `formatDims` (7 red).

**Status:** closed. (triaged 2026-10-16)

**93. The Task 8 browser pass found no defects, and specifically re-checked the exact
selector shape that broke twice before.** Follow-up 81's defect — a more specific
two-class screen rule outranking a correctly-enumerated single-class print override —
was the standing worry named going into this round's own print verification, since this
round adds its own new print-affected classes (`.cutlist-layout-count`,
`.cutlist-layout-head`, `.cutlist-unplaceable`, `.cutlist-layout-key`). `getComputedStyle`
under `emulateMedia({ media: 'print' })` returned `rgb(0, 0, 0)` for all four, and for
`.cutlist-subtotal .cutlist-stock` itself — the identical two-class selector that broke
in follow-up 81 — confirming that round's fix still holds now that a sheet-goods
group's print block has more content beneath it. The SVG fills were checked too, but
came back deliberately mixed, not uniformly black: `.cutlist-layout-sheet`'s stroke and
the layout `<svg>`'s own fill are `rgb(0, 0, 0)`, while `.cutlist-layout-part`'s fill is
`rgb(255, 255, 255)` — white, on purpose, because a part label sits on top of its
rectangle and black-on-black would make the label unreadable. See
`docs/browser-verification-sheet-nesting.md`'s print check for the full set. No
print-colour defect was found; the styles.css comment near the `@media print` block
already names follow-ups 58 and 81 and this pass confirmed that reasoning holds
rendered, rather than surfacing a new instance.

**Status:** record-only. (triaged 2026-10-16)

**94. What the Task 8 pass did not check, carried forward rather than newly
discovered.** A real print-to-PDF render remains unverified — this host's Playwright
exposes no `pdf()`, so `emulateMedia` plus a screenshot is the closest available check,
the same standing gap follow-ups 70, 79 and 84 already record for the diagrams and
board-feet rounds. A sheet dense enough to need three or more shelves was not exercised
in the browser fixture (it produced at most two shelves per sheet) — the packing
*algorithm*'s behaviour at that density is unit-tested, but its on-screen *rendering*
at that density was not eyeballed. Real (non-software) GL was not exercised either,
though it is not applicable here: `SheetLayout`/`buildNesting` touch no shader or
WebGL path, so invariant 26a's warning does not reach this round's own code.

**Status:** open (owed to the user: a real print, with 70/79/84). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 by the user's real print (see fu 70's last Status). The page-splitting is fu 383.

**95. An unplaceable part is counted in square feet but not in sheets.**
`cutlist.ts`'s grouping loop adds every board's own `stockInchesOf` to `group.stockInches`
unconditionally, before `buildNesting` ever runs — a sheet-goods group's square-footage
subtotal reflects every board in the group, placed or not. `buildNesting` opens a sheet
only when a part actually lands on it (see `nesting.ts`'s fresh-sheet gate), so a part
that fits no sheet in any orientation adds to the square-foot total but never to
`sheets.length`. A group heading can therefore read `0 sheets (96" × 48")` beside a
nonzero square-foot figure — two purchasing numbers with different scope printed on one
line. Mitigated in practice because `CutList.tsx` prints the unplaceable-parts naming
line immediately below the heading, so a reader sees *why* the sheet count reads low
right next to the number that does — but the two numbers themselves still disagree on
what they're counting.

**Status:** closed 2026-10-16 (follow-ups 3): the subtotal stays its rows' sum (every part); the sheet count now says what it leaves out — `0 sheets (96" × 48"), not counting 1 part too big for one`. Checked live. (triaged 2026-10-16; updated by follow-ups 3)

**96. `fitLabel`'s terminal `index` tier has no height check.** `src/panels/
diagramLabels.ts:147` returns `'index'` unconditionally as the last case in the
tier ladder, with no comparison against `boxH` the way the `'full'` and `'name'` tiers
above it both have. A part narrow enough to fail the `'name'` tier's width check but
whose rectangle is also short (both dimensions small — a small square-ish offcut) gets
a 25-unit-tall label (`LABEL_ASCENT + LABEL_DESCENT`, see follow-up 91) drawn inside a
rectangle nothing has confirmed is tall enough to hold it. The browser pass covered ten
parts down to a 3"-wide `Back Cleat` on a 96" sheet (`docs/browser-verification-
sheet-nesting.md`), which clears comfortably; this is the residual below that width,
and specifically the height axis the width-only fixtures never exercised — the same
defect class `fitLabel` exists to close for the other two tiers, left open on the one
tier that has no fallback beneath it.

**Status:** closed 2026-10-16 (fu 96, the user's rulings): a part whose rectangle cannot hold even its index number (`holdsIndex`, diagramLabels.ts, measured as `fitLabel`'s tiers) draws no number inside; the number sits in a row just outside the drawing's nearer long edge, packed by `packRow` on measured boxes, with a leader from the part's near edge, and keeps its key entry. The user chose the number beside the part, then accepted a long leader for a part packed in a sheet's interior (it may cross another part) over a waste-space placement rule. A drawing with no callouts is unchanged. Checked live: a sheet's edge cleats, a 1×2 board strip, an interior cleat. Real print owed with 70/79/84. (triaged 2026-10-16; updated by fu 96)

**97. CLOSED 2026-08-31, together with 131 — `takeId` in `document.ts`.** The repair is the
one `validateCuts` already had, given a name and two more callers: the first occurrence of an
id keeps it, later duplicates are re-minted. `validateBoard` now takes the document's `seen`
set, `validateGuides` keeps its own, and `validateCuts` lost its inline copy so the rule has
one home rather than three. Invariant 33 carries the detail.

Three things worth knowing that the entry below does not say:

- **It is a threaded set, not a `dedupeIds` pass beside `dedupeNames`.** The symmetry is
  tempting and wrong. A *name* needs a replacement computed FROM its siblings, which is why
  `dedupeNames` cannot live inside `validateBoard`; an *id* needs nothing from them but "is
  this taken", which a set answers as it goes. A second pass would mean `validateBoard` mints
  an id that the pass may then overwrite — two deciders for one field.
- **Re-minting is safe because of a schema property, and that property is worth stating so it
  can be checked later:** nothing inside a document references a board or guide id. A future
  field that points at a board BY ID would turn this single expression into a two-pass
  rewrite.
- **No creation-time half, unlike invariant 8's four places.** `nextId` is a monotonic counter
  and Import replaces a document rather than merging into one, so load is the only place two
  ids can collide.

**Four mutations, all caught**, which is the point of doing them rather than trusting a green:
`takeId` returning `raw` unconditionally (4 red), `seen.add` deleted (4 red), re-minting
everything (9 red — including the test written specifically to catch this over-fix, since
distinctness alone cannot), and cut ids sharing one document-wide set instead of per-board
(3 red).

The original entry follows unedited.

**Status:** closed. (triaged 2026-10-16)

**97. Board `id` uniqueness is newly load-bearing but never enforced.**
`buildNesting`'s sort tiebreak (`a.id.localeCompare(b.id)` in `nesting.ts`) and
`SheetLayout.tsx`'s `<g key={p.boardId}>` both now depend on every board in a document
having a distinct `id` — the tiebreak needs it for a total order, the React key needs it
to avoid two siblings sharing a key. Nothing enforces that. `validateBoard` mints an id
(`nextId()`) only when `b.id` is missing or not a non-empty string; two boards that both
arrive with `id: "a"` both keep `"a"` — there is no id equivalent of `dedupeNames`
(invariant 8), which is called on every load specifically to fix this failure shape for
*names*. A hand-edited or badly-merged file with duplicate ids would give
`buildNesting` a non-total sort (so an unstable layout that can reorder between renders)
plus a React duplicate-key console warning from `SheetLayout`. Pre-existing gap in
`validateBoard`, newly depended upon by this round rather than introduced by it — the
obvious fix is to give `id` the same dedupe-on-load treatment invariant 8 already gives
`name`.

**Status:** closed (the note above: `takeId`). This is the SECOND entry numbered 97. (triaged 2026-10-16)

**98. There is no UI for editing `stock.kerf`, and the default's error is
asymmetric.** `stock.kerf` is migrated, defaulted, validated (`document.ts`) and used
by the packer (`nesting.ts`), and it is undoable like any other document field — but
nothing in `Toolbar.tsx` or `Properties.tsx` lets a user change it. Changing it means
hand-editing the saved JSON. This was deliberate, not an oversight: a kerf control
belongs with the settings surface a future custom-materials round will need anyway, and
adding one here would have meant a store action plus a toolbar or preferences panel
that nothing else in this round required — the fix is small when someone wants it
(a `setKerf` store action and a field), which is exactly why it was safe to defer rather
than build speculatively. The error direction is worth saying out loud rather than
leaving as an unstated risk: the `0.125` default UNDER-counts for a shop running a
1/4" CNC router or any wider kerf, so the sheet count comes out low and the user buys
too little material, with no way to correct it short of hand-editing the file.
Over-counting — a thin-kerf blade or a track saw, where the true kerf is narrower than
the default — is harmless, since it only ever buys a spare sheet. An under-count is the
direction that costs a trip back to the yard mid-project.

**Status:** closed 2026-10-16 (follow-ups 4): a Saw kerf field in the cut list header (beside Layouts; the entry's settings-surface idea set aside because the Materials dialog's save plan is unrelated to it) writes `setKerf`, one undoable edit, refused outside [0, 1) in the store (the loader defaults anything else), field max 1/2". The header now wraps between controls. Checked live: four 48 × 24 panels, 4 sheets at 1/8", 1 at 0; Buying follows. (triaged 2026-10-16; updated by follow-ups 4)

## From the snap-move round

Design in `docs/superpowers/specs/2026-08-02-sloyd-snap-move-design.md`. Adds a
SketchUp-style Move tool: grab a corner, edge midpoint or face centre of one board,
click one on another, and the first board moves so the two points coincide exactly.
The first work on the viewport's *interaction* surface since the gizmo size ceiling
(follow-up 29), and the first round in six that is not a cut-list descendant.

**Numbering note.** This round starts at 99, not 95, and the gap is worth explaining
because two planning documents said otherwise. 95-98 were added to the sheet-nesting
section *after* CLAUDE.md's "the sheet-nesting round added 85-94" line was written, by
the final-review and post-merge passes (`316204d`, `7594473`), and that line was never
updated — so anything working from CLAUDE.md's count rather than from this file would
have collided with four existing entries. This file is the authority on its own
numbering; CLAUDE.md's two "85-94" references were corrected to 85-98 in the same
commit that added this section.

**99. ~~Cut shoulders are not snap points.~~ CLOSED — 2026-08-03, by the cut-aware snap
points round.** Design in
`docs/superpowers/specs/2026-08-03-sloyd-cut-snap-points-design.md`; browser pass in
`docs/browser-verification-cut-snap-points.md`. It landed exactly as the original entry
below predicted — as a second *provider*, `cutSnapPoints(board)`, with `pickSnapPoint`
untouched and never seeing a `Board` — which is the strongest evidence the snap-move
design's §2.3 `SnapPoint[]` seam was the right shape.

What the round decided, against what this entry asked:

- **Which points a cut contributes.** A cut **defines** up to 15 and **offers** those
  that still touch remaining stock. The 15 are two rectangles at the two ends of the cut's
  depth axis: the **floor** rectangle, all nine combinations of `{min, mid, max}` on the
  position and across axes, and the **mouth** — the plane at the board's own surface —
  contributing only its two shoulder lines, six points. The mouth's middle row is dropped
  because it spans the *opening*, so those three (its face centre among them) would sit in
  the hole rather than on wood: the snap-move design's volume-centre exclusion applied one
  dimension down. A plain dado offers all 15; **a rabbet offers 12**, because its flush end
  has no shoulder — and that falls out of the stock filter with no `cutLabel` branch at
  all, because *"is there a shoulder here"* and *"does this point touch stock"* turn out to
  be the same question.
- **The kind question, resolved by reusing the existing three.** This entry recorded the
  worry that `boardSnapPoints`' rule — count the axes sitting at `mid`, and the count names
  the kind — would not transfer. It does transfer; it just applies *within the rectangle*,
  counting mids among the two in-plane axes only. Zero is a corner, one an edge midpoint,
  two a face centre; the depth axis never contributes a mid, because a mid-depth point sits
  on the shoulder wall rather than on either rectangle (follow-up 119). So all 15 are
  covered by the three `SnapKind`s that already existed, `SnapMarker.tsx` is unchanged, and
  no fourth off-palette hue had to be browser-settled (follow-up 121). The floor's centre
  is not a stretched reuse of violet either: the dado floor is a real drawn face and its
  centre is the centre of that face.
- **Both of the entry's open questions, answered by one rule.** `cuts.ts` gained
  `stockProbe(board)`, which builds the existing cell grid once and returns a predicate:
  does a point in the board's own space touch any remaining stock? It is `boardEdges`'
  four-cell configuration test generalised from a segment to a point — up to eight cells —
  with *closed* spans, so a point landing exactly on a split plane sees both sides. A
  board its own cuts consumed offers **no** cut points, because no cell is filled; a floor
  corner a deeper cut has since removed is withheld for the same reason; the rabbet's
  flush end likewise. The asymmetry this entry asked about — a consumed board keeps all 26
  of its **box** points — is deliberate rather than inconsistent: invariant 21 has
  `BoardMesh` draw a translucent ghost box at the AABB in exactly that case, so the box
  points still sit on a drawn feature, while nothing at all draws a consumed board's
  shoulders.
- **No schema change** (`CURRENT_VERSION` stays 5), no new tool, no new store field, no new
  UI surface. The round did add one thing this entry did not anticipate: `boardSnapPoints`
  is now filtered through the same probe — see follow-up 122, which is the round's most
  interesting finding and closes a defect that predates it.

Original entry follows, unchanged.

A dado's shoulders are real corners a
woodworker would expect to snap to — the inside corner where a shelf's dado meets its
face is arguably the single most useful point on a joined board — and `boardSolids`
already yields them, so nothing has to be computed that this app does not compute
today. Deferred at the user's explicit direction to keep v1 small, which is the whole
reason `boardSnapPoints` takes a `Board` and produces the box's 26 lattice points
rather than reading `cuts` at all. It is cheap when it lands, and cheap in a specific
way worth stating so a future implementer does not reach for the wrong seam: it is a
second *provider* over the same board, a function returning `SnapPoint[]` that
`MoveTool` concatenates onto `boardSnapPoints`' output — not a change to
`pickSnapPoint`, which never sees a `Board` and never needs to. See the design's §2.3.

**Status:** closed. (triaged 2026-10-16)

**100. No free movement, and the second click cancels rather than dropping.** Away
from a candidate the board does not move at all; a click in empty space with a grab
held cancels the grab. Free-hand positioning stays the gizmo's job, which is why the
two tools are a modal pair rather than one tool that does both. Projecting the cursor
onto the ground plane, or onto whatever face happens to be under it, is what SketchUp
actually does and is meaningfully more machinery than it looks: a ray/plane
intersection, a rule for what happens when the cursor points at the sky and there is
no plane to hit, and — because the result would no longer be determined by a marker
already on screen — a live preview to make the landing position legible before
committing. Three pieces of work, none of which the snap-targets-only tool needs.

**Status:** record-only (decision). (triaged 2026-10-16)

**101. No axis inference and no axis locking**, because there is no free movement to
constrain. SketchUp constrains a move to the red/green/blue axis when the drag runs
near one and locks it with an arrow key; both exist to make an otherwise-unconstrained
drag land somewhere predictable. Here the landing position is a point the user clicked,
so there is nothing for a constraint to add. This entry is recorded rather than left
unsaid because "SketchUp has axis locking and this doesn't" reads as a missing feature
until you notice it is downstream of 100 — it becomes worth building the moment free
movement does, and not before.

**Status:** record-only (decision). (triaged 2026-10-16)

**102. No ghost preview of the landing position.** Rejected with the user rather than
skipped: with snap-targets-only, the result is fully determined by the marker already
sitting under the cursor, so a preview would restate information the screen is already
showing. It also costs a second render of the board's geometry — the same meshes, the
same `boardUVs` work, at a second transform — for a frame that is discarded on every
pointer move. If 100 ever lands, this one lands with it: a free move genuinely is not
legible without a preview, which is why the two are recorded as one decision made
twice rather than as two independent deferrals.

**Status:** record-only (decision). (triaged 2026-10-16)

**103. Single-board moves only.** The store holds one `selectedId`, and the grab holds
one `SnapPoint` whose `owner` names one board. Moving several parts at once is a
selection-model change — a set of ids, a rule for what the parts list shows, a rule for
what the Properties panel shows when two parts disagree — not a tool change.
`commitSnapMove` would need almost nothing new (it already applies a delta rather than
an absolute position, so it would loop), which is precisely why this is filed as
depending on selection rather than on the tool.

**Status:** closed — superseded: multi-select and group moves (`selectedIds`, `moveGroupTo`). (triaged 2026-10-16)

**104. Occluded candidates are pickable on purpose.** A candidate hidden behind another
board is still picked if it is nearest on screen, and its marker draws on top
(`depthTest={false}`). Recorded because it is exactly the kind of decision a later
reader would otherwise read as an oversight and "fix." Rejecting occluded candidates
costs an occlusion raycast *per candidate per pointer move*, and it would be wrong even
if it were free: it composes badly with §3.1's whole justification, because from some
camera angles the silhouetted corner that screen-space picking exists to make reachable
*is* the occluded one. Task 9 confirmed the case is not merely permitted but usable —
an upright plywood board's bottom corner, deliberately buried inside a pine board's
footprint, picked cleanly with its marker drawn over pine's solid surface.

**Status:** record-only (decision). (triaged 2026-10-16)

**105. The tape measure, guide points and guide lines.** Named by the user as the
intended follow-ups to this round and deliberately not designed here. Guides persist —
a guide point the user placed is a fact about the project, not a derivation — so they
will need a schema bump (v6) and a `guides` array beside `boards` and `stock`, which
makes them the first thing since the sheet-nesting round to touch the migration chain.
The tape measure probably needs none: its anchor is transient and owned by the tool.
This round's only obligation to all three was §2.3's `SnapOwner` union, which it
discharged — a discriminated union rather than a bare board id, so each of the three
adds a member and a provider instead of reopening the picker's signature. The
alternative the union exists to prevent is worth naming: with a bare id, the cheapest
way to carry a guide point through the picker would be to synthesise a fake `Board` for
it, which would put a lie in the document layer.

**Status:** closed (fu 130: the tape and guide points shipped; guide lines set aside). (triaged 2026-10-16)

**106. HARNESS ENTRY, in the shape of follow-ups 74 and 75: everything Task 9 drove was
a synthetic `PointerEvent`, and that is a real bound on what the pass proves.** Board
corners have no DOM presence and no accessibility node — they are geometry inside a
WebGL canvas — so every hover, grab, drop and orbit in
`docs/browser-verification-snap-move.md` was dispatched at a canvas-relative pixel
coordinate found by screenshotting, cropping and zooming to locate the corner, then
re-screenshotting to confirm a marker actually appeared there. That is the only way to
hit an exact 3D point from outside the page, and it means real pointer-capture
semantics, real touch input and real OS-level input timing were never exercised, only
approximated. It surfaced once as an artifact rather than staying theoretical:
`OrbitControls`' `releasePointerCapture` throws on a synthetic `pointerup`
(`NotFoundError: No active pointer with the given id is found`), which occasionally
left its internal drag state confused across a second, differently-typed synthetic
event and produced an unintended camera rotation. Root-caused to the harness, worked
around, and every finding re-verified against a clean camera state — not silently
absorbed into a result. Separately, an attempt to re-derive the camera's screen
projection analytically (to compute corner pixel coordinates without screenshots) was
abandoned after producing self-contradictory results, most likely an error reproducing
three.js's `lookAt` argument order. That weakens nothing above — every hover was
confirmed by a screenshot showing the correct marker, never assumed from projection
maths — but it means no independent numeric check of the projection exists.

**Status:** open (owed to the user: a touch/pen input pass; the other half closed by 115). (triaged 2026-10-16)

**107. LESSON — the seventh instance of the plan-supplied-code chain (follow-ups 64, 68
twice, 80, 87, 88), and the cleanest example yet of the working agreement doing its
job.** The plan's Task 3 test file contained a case asserting that a committed snap move
clears the grab and selects the board it moved. It failed. The reason was in the
fixture, not the assertion: `twoBoards()` creates two fresh boards, which share a
default `position`, so grabbing a corner of one and dropping it on the corresponding
corner of the other produced a delta of exactly zero — and `commitSnapMove`'s zero-delta
guard correctly took the no-op path instead of the path under test. Its three sibling
tests all carried the `updateBoard` line moving the second board off the first; this one
had been written without it. What makes this worth recording is not the defect, which is
small, but the response: the implementer stopped and escalated rather than editing the
assertion to match what the code did, which is exactly what joinery's lesson asked for
("fix the code rather than the expectation, and escalate when you believe the
expectation is itself wrong") — here the third possibility, a wrong *setup* under a
correct expectation, which neither the code nor the assertion would have revealed.
Closed by fixing the plan (`1110d32`), not the test's expectation.

**Status:** record-only (lesson). (triaged 2026-10-16)

**108. LESSON — Task 9's verification report claimed broader marker coverage than it had
actually checked, and the fix was to take the missing screenshots rather than to narrow
the prose.** The report's colour-legibility paragraph read broadly enough to imply all
three marker kinds had been verified on all three materials. In fact only corner/green
had been hovered on pine, walnut and plywood; edge-midpoint/cyan and face-centre/violet
had only ever been checked on walnut. Caught in review, closed by hovering an edge
midpoint and a face centre on a pine board and a plywood board — four boards, one at a
time at the world origin, camera switched to **Orthographic** for that pass specifically
because it makes the corner-parallelogram arithmetic used to locate an interior point
exact rather than perspective-approximate (a face centre has no board edge to anchor a
crop against). The direction of the fix is the point. Narrowing the sentence to match
what had been done would have been cheaper, would have left the report honest, and would
have been the worse outcome: the claim was worth making, so the work to earn it was
worth doing. A verification report is the artifact everything downstream trusts about a
surface no test covers, which makes an overclaim in one strictly more expensive than an
overclaim anywhere else in this repo. See `docs/browser-verification-snap-move.md`,
where both the original paragraph and its correction are left in place rather than
rewritten into a clean claim — the correction is the record.

**Status:** record-only (lesson). (triaged 2026-10-16)

## From the selected-board grabs round

**109. NON-GOAL — no click-to-select in Move mode, and this is the decision that keeps
the tool modal.** The round narrows grab candidates to the selected board, which makes
"how do I choose the board to move?" a real question; the answer is the **parts list**,
or selecting before switching to Move (design §4). Re-enabling board click-to-select
while nothing is grabbed was considered and rejected for two reasons worth reading
before proposing it again. First, it costs the rule *a modal tool must not change the
selection as a side effect* — the rule would become *…except while nothing is grabbed*,
which is a rule with a mode inside it. Second, it introduces a new ambiguity of exactly
the kind this round exists to remove: a click on a board face can also be a click within
`PICK_RADIUS_PX` of one of that board's snap points, so one gesture would mean two
things depending on sub-pixel distance. Consecutive moves of one board already need no
trip to the parts list — `commitSnapMove` selects the board it just moved.

**Status:** record-only (non-goal). (triaged 2026-10-16)

**110. NON-GOAL — the TARGET set is deliberately not restricted, and "restrict targets
too, for symmetry" is the obvious wrong next step.** Design §3: two coincident *target*
points produce the identical delta, so which one `pickSnapPoint` returns is
unobservable — the board lands in the same place either way. Two coincident *grab*
points name two different boards, and the choice moves one of them. The ambiguity is
only harmful on one side. Restricting targets as well would be actively wrong rather
than merely redundant: the board being moved is by definition the selected one, so a
selected-only target set would leave nothing to snap **to**. Verified in the browser —
with A grabbed, B's points are offered as targets and the move lands exactly.

**Status:** record-only (non-goal). (triaged 2026-10-16)

**111. NON-GOAL — still one board per gesture.** Multi-board moves remain a
selection-model change (a multi-selection, and a rule for what a grabbed point means
when it belongs to one member of a set), not a tool change. Carried forward unchanged
from follow-up 103; this round narrows what a *single* selection offers and does not
touch how many things can be selected.

**Status:** closed — superseded: multi-select group moves. (triaged 2026-10-16)

**112. NON-GOAL — no change to the gizmo or to any of the four gates the snap-move round
installed.** The gizmo is still absent in Move mode, board click-to-select is still off,
`onPointerMissed` deselect is still gated, and Delete/Backspace still refuse while a
point is carried. All four were re-driven as a regression check
(`docs/browser-verification-selected-board-grabs.md`, Step 7) rather than assumed, and
all four hold. No schema change either — `CURRENT_VERSION` stays 5, so a rollback past
this round costs the behaviour and nothing else.

**Status:** record-only (non-goal). (triaged 2026-10-16)

**113. COMPOSITION — the guide-points design's §3.1 filter is SUBSUMED by this round's,
and whichever ships second must merge them into one expression rather than stacking two.**
`2026-08-03-sloyd-guide-points-design.md` §3.1 (specced, not implemented) filters
grabbable candidates to **board-owned** points, so a guide can be snapped *to* but never
*from*. This round's rule — grabbable candidates are the **selected board's** points —
already implies it: points owned by the selected board are board-owned by construction.
When guides land, the correct shape is a single predicate in `MoveTool`'s no-grab branch,
not a board-owned filter chained onto a selected-board lookup. Two filters that agree
today are two places for a future rule to disagree, and the second one would be dead code
that reads as load-bearing. Note the branch structure this has to live in: the memo is
deliberately *two sets rather than one set with a filter* (pre-grab and post-grab), and
§3.1's rule belongs only to the pre-grab branch.

**Status:** record-only (composition; 125 closed by 132). (triaged 2026-10-16)

**114. The browser pass found NO defect, and that sentence is the whole finding.**
`docs/browser-verification-selected-board-grabs.md` records what was checked — the same
pixel marking A's corner or B's edge midpoint depending only on the selection, the
*positions* of both boards read out of `localStorage` to say which board actually moved,
all 52 candidate points hovered with nothing selected for zero markers, the three
grab-drop paths, the four gates, and a clean console. Nothing came back wrong. This entry
exists so the section is not read as though it had findings it did not have (follow-up
108's lesson, applied to the shape of the record rather than to a single paragraph).
What the pass could *not* check is listed in the report's own "What was NOT checked"
section, and the two gaps worth carrying are touch/pen input and the fact that the
pre-fix behaviour was not re-driven (that would require reverting `src/`, which the
verification task does not touch — the diagnosis rests on design §1 and the store unit
tests).

**Status:** record-only. (triaged 2026-10-16)

**115. HARNESS — follow-up 106 is now HALF closed, and the half that closed is worth
copying into the next viewport round.** 106 recorded that every interaction the snap-move
pass drove was a synthetic `PointerEvent` at a screenshot-located pixel, with two
consequences: real pointer-capture/touch/OS input timing were never exercised, and an
attempt to compute corner pixel coordinates analytically was abandoned after producing
self-contradictory results. Both were addressed here, neither by cleverness:

- **Coordinates.** Rather than re-deriving the projection (which is what failed before —
  most likely a `lookAt` argument-order error), this pass reached the live r3f root
  through the Vite dev server's own module graph (`import('/node_modules/.vite/deps/
  @react-three_fiber.js')` → `_roots`, the same module instance the app is running) and
  ran the exact six lines of `MoveTool.tsx`'s `project()` against the same camera and
  `size`. A disagreement with the tool's own arithmetic is impossible by construction,
  and the projector was validated against a rendered marker before anything rested on it.
  The same route gives read access to the app's store and to `boardSnapPoints`, which is
  what made "hover all 52 candidates and assert zero markers" cheap enough to actually do.
- **Input.** Playwright's `page.mouse`/`page.keyboard` (CDP-driven, trusted, with real
  pointer capture) replaced `dispatchEvent(new PointerEvent(...))`. The synthetic phase
  reproduced 106's exact artifact — drei's `OrbitControls` throwing `NotFoundError:
  releasePointerCapture` — and that error's stack traces through `eval`, i.e. through the
  injected script, which is what identifies it as the harness rather than the app. Under
  real input the console is clean. Worth recording exactly how that switch happened,
  because it is 108's lesson recurring one level up: the pass *started* synthetic, the
  report's first draft claimed real input for all of it, and review caught that the
  round's central evidence (the two ownership commits and both shared-point hovers) was
  in the synthetic half. It was closed by **re-driving those checks under real input and
  re-taking their screenshots**, not by narrowing the sentence — same direction as 108,
  applied to a claim about method rather than about coverage.

**What did NOT close:** touch and pen. `MoveTool`'s `pointerId`-tagged `downAt` guard
exists for a multi-touch pinch and is still unexercised by any pass. And corners still
have no DOM presence — the pointer goes to a *computed* coordinate, so the projector
being validated against a rendered marker is what stands in for a locator, not a
substitute for one.

**Status:** record-only (harness; the open half is 106). (triaged 2026-10-16)

**116. Marker colour encodes KIND, not owner — which is why the fixture was built with a
shared point that is a corner of one board and an edge midpoint of the other.** Worth
recording as a verification-design note, because the obvious fixture (two boards sharing
a corner) makes the marker useless as evidence: a green disc with A selected and a green
disc with B selected are pixel-identical, so two screenshots of it would show a change
in nothing. Offsetting the second board so the shared world point lands on the *midpoint
of one of its edges* makes the hue at one fixed pixel discriminate the owner, which turns
a screenshot into evidence instead of an illustration. The numeric read (which board's
`position` changed) is still primary; this is what let the visual check say anything at
all. The general shape: when an indicator's colour encodes a property other than the one
under test, build the fixture so the two cases differ in the property the indicator
*does* encode.

**Status:** record-only. (triaged 2026-10-16)

**117. The toolbar hint has NO unit test, and that is a decision rather than a gap in
coverage.** `panels/` is the one layer above `document` this repo does unit-test with
RTL (`Properties.test.tsx`, `App.test.tsx`), so "it's a viewport, we drive a browser"
does not excuse it the way it excuses `MoveTool.tsx` — the hint is a `panels/` component
and an RTL assertion on it would be cheap. It was still assigned to the browser pass
(design §8), for a reason worth stating: what the hint has to get right is not *that a
string renders when a store flag is set* — that is one line of JSX and a test of it
would restate the implementation — but that the state it names is genuinely inert, i.e.
that with nothing selected no point anywhere is markable or grabbable. That claim cannot
be made in jsdom at all: it needs the r3f scene, the projection and a pointer. The
browser pass made it exhaustively (all 52 candidates hovered, zero markers, five clicked,
zero grabs) and screenshotted the hint alongside. An RTL test would have added a second,
weaker check of the easy half. If the hint later grows conditions — a different string
per state, or a dependence on something beyond `tool && !selectedId` — that reasoning
expires and it should get one.

**Status:** closed — superseded: the hint lives in ViewportControls and is tested (`shows "Select a part to move" in the Move tool exactly while nothing is selected`). (triaged 2026-10-16)

**118. LESSON — a review finding whose justification did not reproduce, and the FIRST in
this chain sourced from a reviewer rather than from a plan.** Follow-ups 64, 68 (twice),
80, 87, 88 and 107 are all instances of plan-supplied code or a plan-supplied
justification being wrong. This one has the same shape from a different direction: the
whole-branch review asked for a new store test on the grounds that mutating `edit()`'s

```
dropGrab = selection !== undefined && heldGrab !== null && heldGrab.owner.id !== nextSelectedId
```

to drop the id comparison "passes all 668 tests today" — i.e. that the narrow half of the
condition, the exact thing Task 1's implementer escalated about, was unpinned. It is not.
Applying that mutation and running `npx vitest run src/store/store.test.ts` fails
`keeps a grab when some other board is deleted` — `1 failed | 68 passed` — because
`twoBoards()` leaves `a` selected, so `deleteBoard(b.id)` takes `wasSelected === false`
and its selection callback returns the still-selected `a.id`; the correct code compares
`a.id === a.id` and keeps the grab, the mutation drops it. The *other* half is pinned
too, and by a different test: mutating away `selection !== undefined` instead fails
`keeps a grab when some other board is edited` (`1 failed | 68 passed`), because
`updateBoard` on a board that is not the grabbed one carries no callback at all. Both
were confirmed by applying each mutation, running the file, and restoring — the suite
returns `69 passed` in that file, 668 overall.

So no test was added; a duplicate of an existing assertion would have been the worse
outcome in a repo that has two entries (87, 88) about tests that could not fail. What was
added instead is a comment on the existing deleted-board test naming *which* half of the
condition it pins and which sibling pins the other — because the reason it was proposed
as missing is that nothing in the file said what it was for — plus two sharper assertions
on it (`selectedId` and the grab's owner id, rather than a bare `not.toBeNull()`). The
transferable point is the same one the chain has been making since 64, now with the
source generalised: **a claim that a mutation survives the suite is a claim about a
command's output, and it is cheap to run.** The reviewer was working under instructions
not to run the suite, which makes reasoning the only option available to them and makes
running it the reader's job — not a criticism of the review, but the reason a finding of
this shape gets verified before it gets implemented.

**Status:** record-only (lesson). (triaged 2026-10-16)

## From the cut-aware snap points round

Design in `docs/superpowers/specs/2026-08-03-sloyd-cut-snap-points-design.md`, browser
pass in `docs/browser-verification-cut-snap-points.md` (which carries a second,
narrower "Re-check after the box-lattice fix" section appended to it). Every `Cut` now
contributes snap points of its own — a floor rectangle and the two shoulder lines at its
mouth — filtered through `stockProbe` so only points still touching remaining stock are
offered. Follow-up **99 is closed** by it, in place above. No schema change:
`CURRENT_VERSION` stays 5.

**119. NON-GOAL — no points on the shoulder walls, and this one is excluded on clutter
grounds rather than by the governing constraint.** Worth stating precisely, because the
rest of the round's exclusions all come from *a marker must sit on a feature that is
actually drawn* and this one does not. A mid-depth point on a cut's shoulder wall sits on
real drawn material; the constraint would permit it. It is declined anyway: the wall is
already legible from the floor and mouth points bounding it, and a third rectangle per cut
would add five more points to a cluster that design §9.1 already identifies as the round's
real feel risk (follow-up 123). Buying a point nobody aims at by worsening the ambiguity
between the two points everybody aims at is the wrong trade. The mechanical consequence is
what keeps §3.1's kind rule simple: because no point ever sits at mid-depth, the depth axis
never contributes a `mid`, so counting mids among the two *in-plane* axes is the whole rule
and the three existing `SnapKind`s cover all 15.

**Status:** record-only (non-goal). (triaged 2026-10-16)

**120. NON-GOAL — no de-duplication against the box lattice, and the subtlety is in the
COLOUR rather than in the move.** A cut point can land exactly on a board lattice point: a
rabbet with `depth = thickness / 2` puts its flush floor corner precisely on the board's
own edge midpoint. Both candidates carry the same position *and the same owner*, so they
produce the identical delta — the board lands in the same place whichever one
`pickSnapPoint`'s depth tie-break returns, which is exactly the argument follow-up 110
already made for coincident *targets*. That is the whole of the case for doing nothing.

What the delta argument does not cover, recorded rather than hidden: **the two coincident
candidates can differ in `kind`, and therefore in marker hue.** In the example above the
cut provider calls the point a `corner` (no in-plane mids) while the box lattice calls it
an `edge-mid` (the thickness axis sits at mid), so the colour you see is decided by the
tie-break. Both descriptions are true of the same position, the marker sits in the right
place either way, and the move is unaffected. If a future browser pass finds this reads as
flicker, **the fix is a deterministic ordering rule, not a de-duplication step** — the two
points are not redundant, they are two true descriptions with different names. This case
was **not driven in a browser**: the pass's fixture used a ¼"-deep cut, which never reaches
`depth = thickness / 2`. See follow-up 124, and note carefully that the rabbet finding at
follow-up 122 is a *position* coincidence, a different thing from the *kind* coincidence
this entry is about.

**Status:** record-only (non-goal). (triaged 2026-10-16)

**121. NON-GOAL — no fourth `SnapKind`, and `SnapMarker.tsx` is unchanged.** A cut-owned
kind was considered and rejected. Hue encodes *which kind of point*, and it still does
after this round: a floor corner is green like a board corner, a shoulder-line midpoint
cyan like a board edge midpoint, the dado floor's centre violet. A fourth kind would import
a browser-settling obligation — a new off-palette hue, cool and saturated, mutually
distinct from the three existing ones and legible against pine, walnut and plywood, per
follow-up 60's process — in order to encode something the user is already looking at:
*which feature* is carried by **where the marker sits**. Splitting `corner` into two
colours by owner would weaken a mapping already verified in a browser to buy a distinction
the position already makes. Distinguishing by shape instead was rejected against a finding
the snap-move design already recorded: at the ~9 px a marker must be to sit on a corner
without hiding it, shape cannot carry a distinction, which is why hue was chosen in the
first place. The browser pass re-checked all three hues on a *cut floor* — which is shaded
rather than lit, the condition they were never settled against — on pine, walnut and
plywood, nine checks, and retuned nothing.

**Status:** record-only (non-goal). (triaged 2026-10-16)

**122. The round's own governing constraint was failing on the OLDEST code in the feature,
and the browser pass is what found it — CLOSED in-branch by `999ca29`, design §5.1.** This
is the most interesting entry in the section, and its shape is worth more than its size.

The round was designed as though the stock filter applied only to cut-owned points. It
does not suffice there. **A rabbet's flush-end mouth positions are also board box-lattice
points**: with `offset === 0` the cut reaches the board's own end, so the three positions
`cutSnapPoints` correctly withholds are, by construction, two corners and an edge midpoint
of the board's box — for *every* rabbet, not as an accident of one fixture.
`boardSnapPoints` never consulted `cuts`, so it offered them anyway, and the marker hung a
quarter-inch out in the air over removed stock. That is precisely what design §2 says must
not happen.

Verified against the code rather than argued from the picture, because the screenshot at
that viewing angle is genuinely ambiguous: `stockProbe` on the rabbeted board returned
`false` for all three positions, and `boardSolids` put the nearest remaining material ¼"
away. The pass's own finding 2 recommended a follow-up and explicitly declined to act; the
user adjudicated it **fix now**, it became Task 6b, and the design gained §5.1.

Three things about the fix are load-bearing:

- **It predates the round and it shipped to production with snap-move.** It has been true
  of every rabbet since joinery landed. It was fixed here anyway, on the grounds that a
  constraint holding only in the new provider is not the constraint the design claims.
- **The consumed-board exception survives, and is written explicitly.** When
  `boardSolids(board).length === 0`, all 26 box points stay, because the ghost box at the
  AABB *is* drawn (invariant 21). The check is a literal `boardSolids(board).length === 0`
  rather than being inferred from the filtered set coming back empty — those two conditions
  are **not** equivalent (a board could have every box point in removed stock while stock
  remains in its middle), and the explicit one is the rule the design actually states. See
  follow-up 128 for what is not pinned about that distinction.
- **The zero-cost guarantee is preserved** by the same early return `boardSolids` makes in
  its first line: a board with no cuts is not filtered and builds no grid.

Re-checked in a browser (`999ca29`, then the report's appended section): `boardSnapPoints`
returns **23** on the rabbeted panel, the three missing pinned by value against an
independently rebuilt lattice, all three hovers returning zero markers with the nearest
offered point 15-25 px away — gap-measured against `PICK_RADIUS_PX` *before* each absence
was captioned, so a withheld point could not read as absent merely because a surviving
neighbour was inside the radius. Positive controls in the same session on the rabbet's
other, non-flush shoulder; a plain mid-face dado still offering all 26, every one hovered
individually; the consumed ghost still offering all 26 and no cut points.

**Status:** closed. (triaged 2026-10-16)

**123. The ¼" pick ambiguity at default zoom is REAL, MEASURED, and ACCEPTED with the user
rather than fixed.** Design §9.1 flagged clustering against `PICK_RADIUS_PX` as the
round's one genuine feel risk and asked for it to be checked at working zoom. It was, and
this is the pass's negative result. The numbers, because an impression would be useless
here:

- At the app's **default framing — 14.08 px/inch, the camera you get on load** — a dado's
  floor corner `(0, 8, 0.5)` and its mouth corner `(0, 8, 0.75)` project **3.6 px** apart
  (`(637.3, 394.8)` and `(633.9, 396.0)`, separation `3.64 px`). Both are `corner`, so both
  draw the **same green disc**.
- The marker is **~9 px across**, so at that separation the two possible markers overlap
  almost entirely. There is no room to render a visible tie-break: highlighting the
  alternative candidate would draw it underneath the one already on screen.
- Stepped along the segment between them with real mouse input in ½-px increments, reading
  the scene graph at each stop, the pick flips between t = 1.5 and t = 2.0 px — the
  perpendicular bisector at 1.80, as the arithmetic predicts. **Aim tolerance ±1.8 px.**
- At a detail zoom of **43.25 px/inch**: separation **8.46 px**, tolerance **±4.2 px**.
  Workable. Separation scales at roughly 0.26-0.31 px per px/inch for that fixture and
  camera angle, so **parity with `PICK_RADIUS_PX = 12` needs about 45-50 px/inch**.

The failure mode is precisely stated, and it is not the obvious one: it is never "nothing
marks". Both candidates sit far inside the pick radius, so *something* always marks, in the
right place, in the right colour — just possibly the wrong one of the two, with nothing on
screen to say so. A user who wanted the floor and got the mouth seats their shelf ¼" proud
and finds out at the bench.

**No radius can fix this, and that is worth saying because §9.1 itself proposed retuning
the constant as the remedy.** The radius governs how far a candidate may be from the
cursor, not how two candidates 3.6 px apart are told apart; any radius large enough to be
aimable at all contains both. The real remedies are all design decisions rather than
constant edits — a tie-break the user can see, a modifier key to cycle coincident
candidates, or accepting that this operation is done zoomed in, which is what anyone aiming
at a ¼" feature would do anyway. **The user adjudicated this as ACCEPT: follow-up only, no
code change.** The point set was not shrunk to work around it either; the numbers above are
the record so a future round can start from them rather than re-measuring.

**Status:** record-only (accepted by the user). (triaged 2026-10-16)

**124. What the two browser passes did NOT check.** Collected from both reports so the
gaps are in one place rather than split across a pass and its re-check.

- **The post-grab (target) branch was never driven under a held grab in the re-check.** The
  main pass drove it and it is the whole point of the headline operation (Step 3: grab the
  shelf's corner, orbit, click the panel's dado floor corner, exact coincidence read back
  out of `localStorage`). But the box-lattice fix of follow-up 122 landed *after* that, and
  the re-check held no grab at any point — so all four of its checks exercised only the
  pre-grab branch. The fix changes `boardSnapPoints`, which both branches call through
  `snapPointsFor`, which means it now filters **targets** on other boards too. That is
  intended on design §2's reading and no breakage mechanism is visible (Step 3's target was
  a `cutSnapPoints` floor corner, untouched by the diff), but it is undriven, and worth
  knowing beside follow-up 110.
- **Touch and pen.** Every interaction was a real *mouse* pointer — real `page.mouse` and
  `page.keyboard` throughout, no synthetic dispatch at any point, so unlike the
  selected-board grabs pass there is no mixed-provenance caveat. But `MoveTool`'s
  `pointerId`-tagged `downAt` guard exists for a multi-touch pinch and remains unexercised
  after three rounds. Follow-up 106's touch half still stands.
- **`rotation === 90`.** The fixture exercises a non-identity *posture* (`upright`), which
  is what makes the local→world mapping a real permutation rather than the identity and is
  the trap design §6 was written around, but it leaves `rotation` at 0. The unit-test
  fixture covers `rotation === 90` with hand-derived world coordinates; no browser pass
  does.
- **Faces other than `thickness`, and `from: 'min'`.** Every cut in the main fixture was
  `face: 'thickness'`, `from: 'max'`, `across: 'width'` (the re-check's consumed board used
  `from: 'min'`). The other faces are unit-tested with hand-written world coordinates; they
  were not looked at in a browser.
- **Design §9's coincident-KIND case** — a rabbet with `depth = thickness / 2`. Neither
  pass reached it; the fixtures were ¼" and ¾" deep. See follow-up 120, and do not read
  follow-up 122's rabbet finding as covering it: that is a *position* coincidence between
  two providers, not a *kind* disagreement about one position.
- **A cut floor deeper than ½" as a legibility case**, and no screenshot of the deeper
  rabbet's 20-point case (depth 1.0" in 1.5" stock correctly withholds more, because the
  board's own thickness-mid lattice plane is then inside the removed stock — checked and
  understood, not shot).
- **`updateCut` clearing a grab in the UI.** Step 6 drove `removeCut` (drops) and `addCut`
  (survives); editing a grabbed shoulder's own cut so the point *moves* is unit-tested
  only.
- **A real GPU.** Software GL (llvmpipe), per follow-up 26a. Stated rather than left unsaid:
  nothing in this round rests on shader behaviour — every marker is a `MeshBasicMaterial`
  disc with `depthTest` and `toneMapped` off at `renderOrder 11` — and the one claim that
  touches shading at all (that the three hues stay legible on a dado floor) is a contrast
  judgement about ink the renderer draws unconditionally.
- **Production.** The dev server only, per the standing rule: `sloyd.autosave.v1` in a real
  browser *is* someone's project.

**Status:** record-only (its owed items are 106, 26a and 70/79/84). (triaged 2026-10-16)

**125. COMPOSITION — follow-up 113's branch now has a THIRD contributor, and the guides
round's plan still needs its revision pass before it starts.** The guide-points design's
§3.1 filters grabbable candidates to *board-owned* points; the selected-board grabs round
subsumed that with a narrower rule (grabbable candidates are the **selected** board's
points, which are board-owned by construction); this round widens the same branch again
(the selected board's points **from both providers**, via `snapPointsFor`). 113 already
said whichever ships second must merge them into **one** predicate rather than stack
filters, because two expressions that agree today are two places for a future rule to
disagree and the redundant one would be dead code reading as load-bearing. Guides land
third into that branch, not second, which makes the instruction more pressing rather than
less. Two things about the shape it has to fit: the memo is deliberately *two sets rather
than one set with a filter* (pre-grab and post-grab), §3.1's rule belongs only to the
pre-grab branch, and guides will introduce the first category of point that is deliberately
**never** grabbable — a different kind of change to make against a settled filter than
against a moving one. This round applied 113's own rule to itself pre-emptively rather than
after the fact: `snapPointsFor` is one exported function called in both branches, not two
concatenations that could drift.

**Status:** closed (by 132). (triaged 2026-10-16)

**126. LESSON — a test whose title names a property nothing in the suite pins. The newest
link in the chain (follow-ups 64, 68 twice, 80, 87, 88, 107, 118), and the first sourced
from a title rather than from a plan's code or a reviewer's premise.** Task 6b's suite
contains a case titled with the parenthetical **"(fast path, no grid built)"**. It pins
neither half of that: deleting `boardSnapPoints`' no-cuts early return leaves the suite
green. Re-run rather than reasoned about, per follow-up 118's rule that a claim a mutation
survives is a claim about a command's output and is cheap to check — with the early return
removed, `npx vitest run src/document/snapPoints.test.ts` returns **38 passed**, unchanged.
An identical result is what you would expect (a board with no cuts has an all-filled grid,
so the filter withholds nothing), which is the point: the title asserts a *performance*
property — that no grid arithmetic runs
at all — and the assertion checks an output that is the same either way. Nothing here is
broken; the fast path exists and is correct. What is wrong is a test title claiming
coverage the test does not provide, which is the exact currency this chain trades in, and
the cheapest honest fixes are the two the chain always points at: drop the parenthetical,
or leave it and comment that the fast path itself is unpinned. Deferred, not done. A real
pin would need to observe the grid *not* being built — a spy on the private `grid()`, which
is unexported on purpose — so the correct resolution is probably the honest title rather
than the machinery.

**Status:** open (hygiene, code-sized): the title `leaves all 26 for a board with no cuts (fast path, no grid built)` still names a property nothing pins. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): the title is now `leaves all 26 for a board with no cuts`, with a comment that the no-cuts early return is a performance path its output cannot reveal (unpinned on purpose).

**127. Two grab-clearing cases the store tests do not reach.** Both minor, both deferred
with the reasoning rather than dropped, because `dropGrabIfGone`'s precision is the whole
point of design §7.2 and these are the two edges of it.

- **`addCut`'s post-`edit()` placement is load-bearing but untested.** The helper must run
  *after* the edit, because a newly added cut can overlap an older cut's shoulder and
  remove those points through `stockProbe` — calling it before `edit()` there would be a
  real defect. Both `addCut` tests grab a **box** corner, which survives either way, so the
  ordering mutation is invisible at that call site. It is caught at two of the three call
  sites, not three.
- **A grab on cut A's shoulder surviving an unrelated edit to cut B on the same board** is
  reasoned correct and unpinned. It is the case that distinguishes point-precise clearing
  from board-precise clearing on a *multi-cut* board, which is the direction the rule is
  most likely to be simplified in by someone who does not know why it is narrow.

**Status:** closed 2026-10-16 (follow-ups 4): both edges pinned in store.test.ts — an older cut's shoulder that a newly ADDED deeper cut consumes drops the grab (addCut judges after its edit), and a grab on cut A's point survives an edit to cut B. Mutated: judgeHeld before edit, and a board-precise clear in updateCut — each red. (triaged 2026-10-16; updated by follow-ups 4)

**128. Three hygiene minors carried out of the reviews.** None affects behaviour; all three
are recorded so a later reader does not re-derive them.

- **The de-duplication test sits in the wrong `describe`.** It lives under
  `describe('cutSnapPoints')` but exercises `snapPointsFor` — it is about the *union* of the
  two providers, which is the only place a coincidence can be observed at all.
- **Two type assertions rest on facts the assertion itself cannot enforce.** In
  `pointsOfCut`, the `as unknown as Point` cast makes the `face === across` guard
  load-bearing for **type** safety as well as for arithmetic (a degenerate cut would set
  only two of three `Dimension` keys), which is worth a half-sentence in the guard's own
  comment. In `boardSnapPoints`, `const local = {} as Point` relies on `axisDimensions`
  returning a full permutation of the three dimensions — true today, and unenforceable
  through the assertion.
- **Nothing discriminates §5.1's explicit `boardSolids(board).length === 0` check from the
  inferred form it forbids.** Rewriting the exception as "the filtered set came back empty"
  passes 38/38. The two conditions genuinely differ, but the case that separates them is
  §5.1's own hypothetical — a board with every box point in removed stock while stock
  remains in its middle — which has to be constructed deliberately. The explicit check is
  the rule the design states, and it is kept for that reason rather than because a test
  demands it.

**Status:** open (hygiene): all three minors still stand. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): the de-dup test moved under `describe('snapPointsFor')`; the `face === across` guard's comment now says it carries the `as unknown as Point` cast; `const local = {} as Point` is commented as resting on `axisFrame` being a full permutation. The third minor (§5.1's explicit check) is record-only, as the entry argued.

**129. LESSON — three documents illustrated `dropGrabIfGone`'s rule with a claim the
round's own Task 6b had already made false, and the seam between the two tasks is exactly
why no per-task review caught it.** `dropGrabIfGone`'s doc comment, design §7.2's bullet
list and CLAUDE.md's invariant 24 all said a box corner **survives** a cut edit on the same
board "because the corner genuinely did not move" — true when Task 4 wrote it, since
`boardSnapPoints` at that point never consulted `cuts` at all. Task 6b, landed several
commits later to close follow-up 122, made `boardSnapPoints` filter its 26 box-lattice
points through `stockProbe` — so a cut edited to consume a corner's own stock (a rabbet
pulled flush with that end, reachable through the Cuts panel by typing `offset: 0`) now
removes that corner from `snapPointsFor`'s output, and `dropGrabIfGone` correctly drops the
grab. The **behaviour is right**: the stock is gone, nothing draws there, and committing
would apply a delta derived from a position describing nothing. The **prose was wrong**,
in three places, because each was written against `dropGrabIfGone`'s own logic — which
never changed and is still correct — rather than against what `boardSnapPoints` actually
offers, which did.

This is not a new instance of the plan-supplied-code chain (64, 68 twice, 80, 87, 88, 107,
118, 126): nothing here is a defect in code, and nothing a per-task review of either task
could have caught. Task 4's review had no way to know a later task would narrow
`boardSnapPoints`' output; Task 6b's review (the one that produced follow-up 122) was about
whether the filter was applied everywhere it needed to be, not about whether an earlier
task's comment still held once it was. The over-claim was only visible from outside both
tasks, holding Task 4's illustration next to Task 6b's filter at once — which is what a
final whole-branch review is for and what a per-task review structurally cannot do. Found
and fixed there: the general rule in all three places ("the grab survives iff the point is
still among that board's snap points") was already correct and is left alone; only the
illustrative clause changed, to name both the common case (a mid-face dado survives) and
the case Task 6b introduced (a flush cut consumes the corner and the grab drops), rather
than asserting only the first as if the second could not occur. A store test pins the
second half directly, alongside the existing test for the first (both in
`src/store/store.test.ts`, `describe('the Move tool')`).

**Status:** record-only (lesson; the behaviour is pinned). (triaged 2026-10-16)

## From the guide-points round

**130. NON-GOALS — design §9, and follow-up 105 is CLOSED for two of the three things it
named.** The user asked for a tape measure, guide points and guide lines when they asked
for the Move tool. The first two shipped. **Guide lines were dropped**, at the user's
direction mid-brainstorm, and the reason is recorded rather than left as an absence: a
segment drawn between two guide points is redundant with the points themselves. Its only
new contribution would have been its own midpoint as a candidate, and that is already
reachable — anchor on one end and type half the measured distance, which is the tool's
central gesture rather than a workaround. Removing it also collapsed the schema to one
shape, dropped a line renderer, and made line-line intersections — the case `SnapOwner`
would have had to grow a two-owner member for — not arise at all.

The rest of §9, each looked at and deferred with a reason:

- **Semi-infinite construction lines** (axis-parallel, bounded to `SCENE_EXTENT` the way
  the grid is) — the user's original mental model, set aside with guide lines and on the
  same judgement: points with typed offsets may simply be enough in practice. **Still
  open**, and the one item here most likely to be re-proposed. **NARROWED, not closed, by
  the cardinal guides round (2026-08-04)** — read this bullet with 145's shipped note. That
  round answers half of what this bullet's motivation was, *reach along an axis from one
  feature*, and provides no line at all: a lock places a point, and while it is locked with
  nothing typed the viewport deliberately draws **nothing** rather than a semi-infinite
  axis line, precisely because that line is this item and is out of that round's scope
  (design §8). So the judgement above is now half-tested rather than untested: typed
  offsets are enough as a *mechanism*, and what remains genuinely open here is the line as
  a **visual** — something to sight along and to snap other things to at positions nobody
  typed. The browser pass found the no-line state reads as *waiting* rather than *broken*,
  which is the evidence that this item is still a want rather than a gap.
  **Status:** shipped by the construction-lines round (2026-10-29; schema 31; deployed 2026-10-30, `fb1e133`, `index-zJyvpYf3.js`): axis-parallel lines placed with Tape + axis lock + Enter, drawn `±SCENE_EXTENT`, snapped along and at crossings, listed and removed from the Guides list. The residue is 578–582 below.
- **Moving or editing an existing guide.** Delete and re-place. A guide is two clicks to
  create; a drag-to-reposition gesture would need its own tool mode, its own gates and a
  decision about undo coalescing. A guide also has **no name** and no rename field — its
  position is what identifies it, and inventing a naming scheme would drag in
  `uniqueName`, invariant 8's four-place enforcement and a field, for a marker whose only
  job is to be somewhere.
- **Guides in the cut list, the nesting or the board-feet totals.** A guide is an
  annotation, not stock. Nothing on the printed sheet changes because one exists.
- **Guides as Move-tool grab sources.** You snap a board onto a guide; you never snap a
  guide onto a board. See 132 for why this needed no filter to be true.
- **No selection model for guides** (design §7). No `selectedGuideId`, no Delete-key
  path, nothing touching `selectedId` — the list exists to remove guides, and adding
  selection would mean deciding what a selected guide shows in a properties panel that is
  a panel for boards. This also sidesteps invariant 21's trap rather than meeting it in a
  browser: click-the-guide-in-the-viewport is a known-bad hit target, because
  `THREE.Line`/marker raycasting registers a hit only within an inch of what is drawn and
  a guide's marker is far smaller than a board.

**Status:** open by decision (semi-infinite construction lines: ask before assuming they are wanted; real hardware). (triaged 2026-10-16)
**Status:** construction lines SHIPPED (deployed 2026-10-30, `fb1e133`, schema 31; residue fu 578–582); the entry's other non-goals stay open by decision.

**131. CLOSED 2026-08-31 with 97, which is exactly how this entry asked to be closed.** It
said enforcing guide ids while leaving boards unenforced would be the inconsistent
half-measure, so both were left to whichever round closed 97 — and one round closed both,
with `validateCuts`' rule extracted as `takeId` and shared by all three. The one distinction
this entry's own reasoning implies and the fix preserves: a guide with **no** id is still
DROPPED rather than minted, because that is malformed data under `validateGuides`' stated
rule, while a duplicate is a well-formed guide wearing a taken label. Invariant 33.

The original entry follows unedited.

**Status:** closed. (triaged 2026-10-16)

**131. Guide ids are not deduplicated, and this is a knowing choice.** `validateGuides`
keeps a guide whose `at` is three finite numbers and whose `id` is a non-empty string, and
drops anything else — `validateCuts`' rule and its reason, that a saved document must
always open, with dropping the only available repair because a guide has no
nearest-legal-value to clamp toward. What it does *not* do is enforce uniqueness. Follow-up
97 records that board `id` uniqueness became load-bearing in the sheet-nesting round while
never being enforced the way `dedupeNames` enforces names; guides inherit exactly that
exposure — a duplicate id would make `removeGuide` delete two rows at once and hand React
two identical keys. Enforcing it for guides while leaving boards unenforced would be the
inconsistent half-measure, so both are left to whichever round closes 97.

**Status:** closed (the note above: `takeId`). This is the SECOND entry numbered 131. (triaged 2026-10-16)

**132. Follow-up 125 is CLOSED, and by a document rather than by code — which is why a
reader looking for the merged predicate will not find one.** 125 asked whoever shipped
second to merge the guide-points design's §3.1 board-owned candidate filter with the
selected-board grabs round's narrower rule into **one** predicate, rather than stacking two
filters that agree today and become two places for a future rule to disagree. There was
nothing to merge. `MoveTool`'s pre-grab branch is already *the selected board's* points,
and those are board-owned by construction, so §3.1's filter would have been dead code
reading as load-bearing — follow-ups 113 and 125's own shape, arriving as the thing they
warned about rather than as the thing they asked for. **The resolution was to write no
filter at all**, and §3.1 was rewritten during the design's revision pass to say so.

Recorded explicitly because the absence is indistinguishable from an oversight: the
pre-grab branch in `MoveTool.tsx` carries only a comment where 125 might lead someone to
expect a predicate. Guides join the **post-grab** branch only, beside `showGuides`, with
`guides`/`showGuides` added to the dependency list *beside* the existing `selectedId` —
dropping it there is invariant 15's failure mode and would have looked like it worked.

**Status:** record-only. (triaged 2026-10-16)

**133. Follow-up 120 gained a REACHABLE instance, at zero separation rather than 3.6 px —
and it came out stable, with the mechanism confirmed in code rather than inferred from the
screenshots.** 120 records that two coincident candidates can differ in *kind*, so the
marker's hue is decided by `pickSnapPoint`'s depth tie-break; 123 records the ¼" case at
3.6 px. Placing a guide **on a board corner** — the obvious thing to do with the tool, and
check 3 of the browser pass — puts two candidates at *identical* world positions from then
on. Screen distance ties, NDC depth ties, and the tie-break is fully degenerate.

**Accepted, not fixed**, because only one observable thing is arbitrary. Pre-grab in Move
mode a guide is not a candidate at all (132), so there is nothing to tie. Post-grab and in
Tape mode the two candidates are at the same position, so whichever wins yields the
identical delta or the identical measurement — the board lands in the same place, the tape
reads the same number. Only the **hue** is arbitrary: guide blue or corner green.

Task 10's check 18 aimed at exactly this and found the outcome **fully stable** — 6/6
re-hovers and 8/8 stationary samples all returned the board corner, so 120's flicker
trigger never fired. The reviewer then confirmed the *mechanism* rather than accepting the
sample: `TapeTool` concatenates `boards.flatMap(snapPointsFor)` **before**
`guideSnapPoints(guides)`, and `pickSnapPoint` keeps the first candidate found at equal
depth (`distSq < bestDistSq || projected.depth < bestDepth` — an exact depth tie fails
both), so the winner is deterministic for a fixed candidate order. **Scoped to one `boards`
ordering**: nothing pins that order across a document edit, so this is stability under an
unchanged candidate list, not a guarantee. If it ever does read as flicker, the fix is a
deterministic ordering rule — which is what 120 already names — and **not** a
de-duplication step, which would delete a real candidate.

**Status:** record-only (accepted). (triaged 2026-10-16)

**134. THE `grabbed` / `tapeAnchor` ASYMMETRY AT `updateBoard`, named here and in CLAUDE.md
invariant 24 because it is a documentation trap in both directions.** After this round the
two tape fields are cleared **point-precisely** at `updateBoard` — they route through
`dropHeldIfGone(id)` after the edit, so a rename keeps them and a Length or Posture change
drops them. `grabbed` keeps its **board-precise** clause, so renaming the grabbed board
cancels the grab.

This was deferred **because it is shipped Move-tool behaviour from two rounds back, not
because the argument fails to reach it.** The argument reaches it exactly: `updateBoard` is
the only rename path (there is no `renameBoard`), and `{ name }`, `{ material }` and
`{ grain }` move no point at all. The tape's version of that defect was worse and is what
forced the fix — nulling `tapeAnchor` nulls the latched hover through `TapeTool`'s anchor
effect, which unmounts the readout, so a rename destroyed the whole measurement — while a
cancelled grab merely costs one click.

The mechanism matters for anyone tidying either rule into the other, and both directions
are silent:

- `updateBoard`'s board-precise `grabbed` clause fires **before** `dropHeldIfGone(id)` at
  the bottom of the same action, and pre-empts it. That pre-emption is exactly what made
  `tapeAnchor`'s old clause a no-op over the survival test sitting underneath it. So
  **deleting the `grabbed` clause would silently convert `grabbed` to point-precise** — a
  behaviour change with no diff at the survival test.
- Conversely, **adding a board-precise clause back for either tape field would silently
  re-break the rename case**, and the store tests that catch it are the two "keeps"
  cases (`keeps a latched hover when the hovered board is only RENAMED`, and the anchor's
  mirror), not the "drops" cases, which pass either way.

**Status:** record-only (invariant 24 makes `grabbed` board-precise at `updateBoard` on purpose). (triaged 2026-10-16)

**135. `BoardSnapPoint` replaced eight remembered checks with one type — and what it does
NOT cover is worth knowing before the next held-point field is added.** Widening `SnapOwner`
with a `guide` member is the round's single most dangerous edit, because both members carry
an `id: string`, so every existing `owner.id` read keeps typechecking while quietly meaning
something else. Eight reads in `store.ts` assume `owner.id` names a board (enumerated in
design §3's table and pointed at from `grabbed`'s own declaration — not restated here,
which is how a count goes stale). Seven of them are correct only because `MoveTool` never
offers a guide as a grab source, which is an invariant enforced two modules away and
exactly the kind of accident the next round breaks.

The answer was `BoardSnapPoint = SnapPoint & { owner: { type: 'board'; id: string } }`,
with `boardSnapPoints`/`cutSnapPoints`/`snapPointsFor` annotated as returning it,
`pickSnapPoint` made generic in the candidate type, and `grabbed`/`grabSnapPoint` typed to
it. That is **compile-time** enforcement of a rule that was previously remembered, and the
whole-branch review confirmed it is real rather than decorative: the providers construct
`owner` with a narrowed literal, so tsc holds the property the eight reads depend on. One
consequence is a *win* rather than a gap — the "a guide-owned grab must be declined" store
test was **deleted**, because that state cannot be constructed in TypeScript at all
(follow-up 118's shape). Do not add a runtime `if (grabbed.owner.type !== 'board')` guard
to `commitSnapMove` to make it writable again.

Its limits, all three verified against the code rather than argued:

- **`pickSnapPoint`'s generic is currently unrealized.** Both call sites pass a
  union-typed array (each tool's memo has branches of different element type), so `T` never
  resolves to `BoardSnapPoint` anywhere in the repo today. It is kept because it is free and
  correct — do not read it as load-bearing for anything that compiles now.
- **One runtime narrowing survives on the grab path, and it is not vestigial**:
  `commitSnapMove`'s self-snap guard tests `target.owner.type === 'board'` because the
  *target* genuinely can be a guide, and without it a guide whose id collided with the
  grabbed board's would read as a self-snap and the move would be silently refused.
- **A field typed `SnapPoint` pays in runtime tests, and that is the price of being able
  to hold a guide.** `tapeAnchor` and `tapeHover` are deliberately the wide type — the
  difference between them and `grabbed` *is* the documentation of which can hold a guide —
  and they cost five `owner.type` tests: `heldOnBoard` inside `dropHeldIfGone`, two in
  `deleteBoard`, two in `removeGuide`. A future held-point field typed `SnapPoint` inherits
  that, and the type buys it nothing.

**Status:** record-only. (triaged 2026-10-16)

**136. Neither browser-settled constant was retuned, and the evidence for each is
different.** Both are follow-up 60 constants — judgements a test cannot make — and Task 10
carried the obligation the code comments assign it. `src/viewport/SnapMarker.tsx` is
**unchanged** by the pass.

- **`SNAP_COLORS.guide = '#4f6fd0'`** (the fourth off-palette hue, added because a guide is
  not a corner, an edge midpoint or a face centre — see 121, which *rejected* a fourth kind
  for cut points on the opposite side of the same rule). Check 1: legible on the near-white
  ground, on plywood, on walnut and on pine, and distinct from all three existing hues
  including the pair that could have failed, `#8a5fd0` violet, shot side by side at
  identical size on one plywood face.
- **`RESTING_PX = 6`** (design §5.2's resting variant, the one place this round touches
  `SnapMarker`'s geometry rather than its palette). Two halves, judged separately. *Quiet
  enough*: judged at **twelve** simultaneous on-screen guides, which is the bar
  `RESTING_PX`' own comment sets, rather than at whatever the pass happened to accumulate —
  though at one camera framing, not at every zoom. *Big enough to aim at*: aiming is bounded
  by `PICK_RADIUS_PX = 12`, not by the marker, so 6 px only has to be findable by eye, which
  **check 8** (grab onto a resting guide, hit first attempt) and **check 1b**'s hovered frame
  each demonstrate directly. Check 9 is deliberately *not* cited: its control hovers a board
  corner, and board points have no resting representation at all — see 141.

**Status:** record-only. (triaged 2026-10-16)

**137. Task 10's three self-flagged concerns.** The implementer raised all three unprompted;
none was found by review, and the first is the most likely thing in the report to misread.

- **Check 17 does not independently prove guide-as-Move-target.** Its winning candidate was
  the board's dado shoulder, not the guide — the Shelf still landed at exactly
  `[0, 8, 0.5]` because the two positions are identical, so the *check* passes and its
  assertion is true, but the guide is not what it demonstrates. **Check 8 is the one that
  does**, and it was pixel-verified by the reviewer (54 px of exact `#4f6fd0` with a ring =
  a full-size guide marker).
- **A guide placed exactly on a board point is invisible AS A GUIDE while that point is
  hovered.** The `r = 3` resting disc sits entirely under the `r = 4.5` hovered disc, and
  the hue shown is the board point's. Correct behaviour, and design §10's arbitrariness
  (133) seen from the render side rather than the pick side: the marker's hue cannot tell
  you a guide is there. What can is the resting marker *before* the pick.
- **A harness note in the shape of 74/75/106.** A clipped `page.screenshot({ clip })` taken
  ~500 ms after a hover raced the frame and returned pixel-identical crops for two
  genuinely different states. Full-page captures after a 1 s settle, cropped offline, were
  reliable. Anyone re-running check 1b should use the latter.

**Status:** record-only. (triaged 2026-10-16)

**138. What the browser pass did NOT check**, collected so the gaps sit in one place.
Touch and pen (follow-up 106's remaining half — every interaction was real
`page.mouse`/`page.keyboard`, so there is no synthetic-dispatch caveat this time, but
`pointerId`-tagged `downAt` still goes unexercised after four rounds); real hardware GL
(26a); print and print-to-PDF (70/79/84); the orthographic camera; export/import and the
v5→v6 migration **in the browser** (both are unit-tested); `TapeTool.tsx`'s **own**
`showGuides` gate on its candidate memo, which is independent of `MoveTool`'s and was
closed as a report omission rather than driven — check 10 drove only the Move branch; and
this round's own point-precise anchor/hover clearing at
`updateBoard`/`addCut`/`updateCut`/`removeCut`, which is unit-tested thoroughly but never
driven in the app.

**Status:** record-only (its owed items are 106, 26a and 70/79/84). (triaged 2026-10-16)

**139. Two store tests cannot fail, and they are honest empty slots rather than false
ones.** `src/store/store.test.ts:1104` and `:1314` each assert a held-point field is `null`
after a cut edit made with nothing held — and both fields were already `null`. They pin the
*behaviour* their titles claim (a cut edit with nothing held leaves the fields alone) and
deliberately make **no** performance claim about `dropHeldIfGone`'s guard-first cheap path,
which is follow-up 126's lesson applied at the point of writing rather than after. **Do not
"strengthen" them with an ESM spy on the private grid builder** — that was weighed and
rejected, for 126's own reason: the correct resolution of an unpinnable performance claim is
an honest title, not machinery. The guard-first shape is verified by reading it.

**Status:** record-only (honest empty slots; their titles claim nothing). (triaged 2026-10-16)

**140. A PRE-EXISTING test flake, newly diagnosed — not this round's, and not a merge
blocker.** `src/document/depthField.agreement.test.ts` > *"rabbets on all four edges plus
crossing dados"* **times out at 5000 ms** roughly **1 run in 4** (about 3 failures in ~20
runs on this branch). It is not asserting wrong; it is the heaviest geometry in that
fixture set — four rabbets plus crossing dados is the most cell-splitting case — and the
file already burns ~6.6 s for 6 tests in isolation, so the per-test 5 s ceiling is close
under load. This VPS ran many parallel agents all session.

**Confirmed pre-existing, twice over.** `git diff 3b7c15d..HEAD` over `depthField.ts`,
`depthField.agreement.test.ts`, `cuts.ts` and `geometry.ts` is **empty** — the code under
test is byte-identical to master. And the full suite was run four times on master (699
tests): run 1 failed with the same test and the same timeout, runs 2-4 passed. The same
1-in-4 rate.

Recorded with its own correction, because an earlier note in the execution ledger claimed
this was controller-caused (a `pkill -f` self-match) and **that was wrong** — it was offered
before the failing test had been captured, and the failure recurred with no `pkill` near it.
A separate note recording "seven consecutive clean runs" was luck inside the rate, not
evidence of stability. **Named remedy**: raise `testTimeout` for that one file, or split the
heaviest geometry into its own case. Neither was done here; this round changed no code that
file touches.

**CLOSED 2026-08-31, by NEITHER named remedy — and that is the entry's own lesson.** Both
remedies treat the case as legitimately expensive geometry that needs more room. It is not.
The two probe helpers each called `boardSolids(board)` **on every invocation**, for a board
that does not change inside a case: 21 cells × 2 reads plus a 96 × 48 converse sweep is
**4,650 calls** returning the same six regions. `boardSolids` is pure, so hoisting it to one
call per case changes what the test COSTS and nothing about what it CHECKS.

Measured inside a full-suite run, which is the contended condition the flake needs — a
standalone run of the file never reproduced it:

| | heaviest case | share of the 5,000 ms ceiling |
|---|---|---|
| before | 1,549–1,690 ms | 31–34% |
| after | 11–19 ms | 0.2–0.4% |

**Reported honestly: the timeout itself was NOT reproduced this session.** Eleven full-suite
runs on the unmodified file all passed, which is consistent with a rate quoted at ~1 in 4 on
a day with many parallel agents and is not evidence the flake is imaginary. What is
established is the mechanism, measured directly, and about a hundredfold of headroom where
there was three. No `testTimeout` was added: a per-file ceiling is what you reach for when
the work is irreducible, and pinning one here would preserve the waste and hide the cause.

**The test was mutated afterward, because a hoist that quietly broke the assertions would
also be fast and green** — and invariant 20 records that this very file's first version
passed with the cover step broken. Four mutations of `depthField.ts`, all caught: `Math.min`
for `Math.max` (3 red), every depth shaved by 1/64 — a right-coverage, wrong-number mutation
of exactly the kind invariant 20 warns a coverage-only test would miss (6 red), dropping
cells covered by a single cut (6 red), and emitting a cell everywhere (6 red). `depthField.ts`
itself is untouched by this round.

**The portable part.** A remedy written into this ledger is a hypothesis recorded at
diagnosis time, not a prescription — the same standing caution the ledger already applies to
code and justifications supplied by a plan, a spec or a reviewer, turned on the ledger
itself. Both remedies here were reasonable when written and would have worked, in the sense
that the suite would have gone green; neither would have found that the test was doing
4,650× the work it needed to. **Measure before adopting the remedy an entry names.**

**Status:** closed. (triaged 2026-10-16)

**141. LESSON — the plan-supplied-code chain gained FOUR instances in one round, plus a
fifth from a brief-supplied COMMENT, and three fixtures that passed for the wrong reason.
Two of the three shared one root cause. This is the largest single-round addition the chain
has taken (64, 68 twice, 80, 87, 88, 107, 118, 126), and the two things that make this
round's instances distinctive are worth more than the count.**

**The first was caught before execution, by re-reading the plan against the code — not by
running it.** The plan's revision pass, done immediately before Task 1 against the merged
result of the two rounds that had landed since the design was written, found Task 2 Step 7
wrong on the page. It never reached code, so the ledger gives it no ordinal and neither does
this entry; it is the cheapest catch in the whole chain and the only one in it that cost
nothing but a read. It is also the argument for the revision pass itself, which follow-up
125 had demanded and which every prior link in this chain would have been cheaper for.

The three that did reach code:

- **TENTH — the brief's inline grab guard does not compile.** `hit.owner.type === 'board'`
  as an inline test does **not** narrow `hit`: `SnapPoint` is an interface whose `owner` is
  the union, so narrowing the *property* does not narrow the *value*. Fixed with a
  module-local type predicate, `isBoardOwned`.
- **ELEVENTH — the brief's "drops the anchor on undo and on redo" test could not pass.**
  Its `anchorOn()` helper re-armed via `addBoard()`, whose `edit()` wipes `future`, so
  `redo()` early-returned and never ran its body. The implementer fixed the **fixture** and
  left both assertions byte-for-byte, and explicitly declined the tempting wrong fix
  (clearing on redo's early-return path — nothing moved there, and it would diverge from
  `grabbed`). That task also caught its own first two prohibition mutations passing because
  they were **unreachable** rather than survived, and re-ran with faithful ones — follow-up
  126's lesson applied self-critically, mid-task.
- **TWELFTH — the brief's Step 1b was unimplementable.** It said to call
  `computeLineDistances()` on the geometry via a ref. That method is on `THREE.Line`, not on
  `BufferGeometry` (one hit in `@types/three`), so the spelling as written would have thrown
  at runtime — and this host's software GL would not have shown it. Notable for *how* it was
  settled: the implementer spent **zero attempts** on the brief's spelling and instead proved
  it wrong from the type definitions, the reviewer independently verified both halves, and
  the fix was to follow the pattern `OriginAxes.tsx` had already settled (drei's `<Line>`,
  which calls the method itself and sidesteps the `<line>`-versus-SVG-`line` JSX trap the same
  step had budgeted an attempt for).

**The ninth link in the separate plan-supplied-JUSTIFICATION chain, and the second sourced
from a brief-supplied comment rather than from plan code**: `store.ts`'s anchor-clearing doc
comment, supplied verbatim by the brief, claimed all seven anchor-clearing actions cleared
**unconditionally**. Four clear only when the *anchor's own* owner is affected — so a live
anchor implies nothing about the *target* being current, and a latched `tapeHover` could
outlive the feature under it by a reachable path (anchor on A, hover B, leave the canvas,
edit B's Length). This was taken to the user as a plan conflict and ruled **FIX**,
point-precisely; blanket clearing was explicitly rejected because it would destroy the latch,
which is the whole reason the field is in the store.

**And the round's own sharpest lesson, from three fixtures that passed for the wrong reason
— two of them sharing one root cause.** The eleventh instance above is the first
(brief-supplied). The other two were **self-inflicted**, and both were the same mistake:

> `boardSnapPoints(board)[0]` is the **min corner**, which *is* `board.position`. A
> `{ length: 48 }` change never moves it.

A test named *"drops a latched hover when the HOVERED board is edited"* had been passing
only because the clause under test was board-precise; the moment the clause became
point-precise the test failed, and **the fixture was wrong, not the code**. The identical
repair then rippled into exactly one Task 5 anchor test, *"drops the anchor when its own
board moves"*, for the identical reason. Both were fixed at the fixture with the assertions
left byte-for-byte, and both gained a mirror "keeps" case — the surviving-corner case for
the hover, the rename case for the anchor — because the "drops" direction passes under
either rule and only the "keeps" direction discriminates. The rest of the anchor block was
**audited rather than assumed**, and the audit was spot-checked by the reviewer.

Stated as a rule, because it is more general than these two tests: **the most obvious point
to grab in a fixture is the one point that survives the edit you are testing.** A fixture
that reaches for index 0 of a point provider is reaching for the corner most likely to be
invariant under the very change the test exists to detect.

**Status:** record-only (lesson). (triaged 2026-10-16)

## From the type-anywhere round

**142. A guide hovered as the TAPE'S TARGET draws the same size and the same hue as the
typed preview beside it, and the browser pass took the easier case.** The preview marker is
`SNAP_COLORS.guide` at full `MARKER_PX`, and both choices are defended: it will *become* a
guide, so colouring it as the kind of point it was measured *from* would say something false
about the thing being placed, and a resting size (`RESTING_PX`) would say "already placed"
about a point that is not. But a guide can itself be a snap target — that is the whole of
follow-up 137's chain-a-measurement case — and when it is, the hovered marker and the
preview marker are two full-size discs in one colour, distinguished only by position. The
verification pass hovered a board corner (green against blue-violet), which is the case that
cannot show this. Nothing here is a defect: the two markers are never at the same place
(a zero-length ray is refused, and a typed distance equal to the measured one puts the
preview exactly on the target, where one disc covering another is the honest picture). It
narrows the round's existing legibility deferral rather than adding to it — the open
question is only whether *which is which* reads without thinking, and it is a browser
question, in the sense of follow-up 60. Cheapest remedies if it ever needs one, in order:
drop the preview's ring, or draw the hovered marker resting-sized while a preview exists.

**Status:** open (owed to the user's eye: a guide hovered as the tape's target vs the typed preview). (triaged 2026-10-16)

**143. `tapeTyped`'s anchor-loss clear is owned by a PANEL EFFECT, not by the store, so the
field outlives the anchor by one render — and the correctness of that rests on
`TapeReadout` being unconditionally mounted.** `setTool` clears `tapeTyped` in the store
beside the three held points, but the *other* way an anchor goes — `clearTapeAnchor`,
`undo`, `redo`, `replaceDocument`, `removeGuide`, `deleteBoard`, `dropHeldIfGone` — clears
only the anchor, and the text is reset by `TapeReadout`'s own `useEffect` keyed on
`[anchor]`. This is deliberate and it is the right home: a fresh anchor starts a fresh
measurement, which is a statement about the *entry*, and the store has no business holding
a rule about what a text box should say. It was checked rather than assumed — `App` renders
`<TapeReadout />` unconditionally inside `.viewport-stack`, so the effect always exists to
run even though the component returns `null` without an anchor (its hooks run above that
early return, which is what makes this work at all). But that is a **coupling**, not a
property: mounting the readout conditionally — `{tool === 'tape' && <TapeReadout />}`, which
looks like an obvious tidy given it renders nothing otherwise — would leave a stale number
in the store across a tool round-trip, visible the next time an anchor was set.

**The append fix in the same round is what turns this coupling from benign into
consequential, and that is why this entry reads sharper than it did when it was written.**
While the capture REPLACED, a stale `tapeTyped` surviving an anchor loss was harmlessly
overwritten by the next keystroke — the failure was one frame of a wrong number in a box
that then corrected itself. The capture now APPENDS, so a stale value is CONCATENATED: the
user types `5` against a fresh anchor and gets `35`, a number they never typed, which
parses cleanly and places a guide 30 inches from where they meant. Nothing breaks today —
the mount is unconditional — but the consequence of breaking it went from cosmetic to a
silently wrong placement, which is the class of defect this app's whole document-is-truth
rule exists to avoid. Two things
would close it if it ever bites: clear `tapeTyped` beside every `tapeAnchor: null` in the
store (rejected today — it puts a fact about a text box into seven store actions), or keep
the mount unconditional and say so where it is written. The second is what is in place.

**Status:** closed (the unconditional mount is stated where it is written, App.tsx). (triaged 2026-10-16)

**144. CLOSED by the cardinal guides round (2026-08-04).** `error` now carries its cause —
`type TapeError = 'no-direction' | 'unparseable' | 'degenerate' | null` in
`TapeReadout.tsx` — and the single over-wide effect split into two, one keyed on `[text]`
clearing only `unparseable` and one keyed on `[hovered, axis]` clearing only
`no-direction` and `degenerate`. Three things about the closure are worth carrying
forward. **The cause names shifted** from the remedy this entry proposed: `no-target`
became `no-direction` and `zero-length` became `degenerate`, because with an axis lock the
question stopped being *is there a target* and became *is there a direction*, which a
target is now only one of two ways to supply. **The axis is what made the fix stop being
cosmetic**, exactly as this entry's own last paragraph half-predicted: pressing X after a
`no-direction` refusal genuinely cures it, and under the boolean the red would have
survived until Enter proved otherwise — a cure a hover cannot express and a boolean cannot
distinguish. And **the cause is now printed**, which this entry asked whoever picked it up
to consider: `ERROR_TEXT` renders one short line in the hint's own slot
(*Hover a point, or press X / Y / Z* — *Can't read that as a length* — *That target is on
the anchor*), replacing the hint rather than stacking under it so the box does not change
height when a commit is refused. Both halves were driven in a real browser: a new hover
leaves an unparseable number marked, a character change clears it, and `degenerate` was
observed live by name. See `docs/browser-verification-cardinal-guides.md`. The original
entry follows, unedited, because the reasoning it records about what one bit can and
cannot express is what produced the union.

**Status:** closed. (triaged 2026-10-16)

**144 (original). The error-clearing effect was WIDENED to `[text, hovered]` and now clears a refusal
it does not cure — introduced by that widening, not pre-existing.** `commit()` refuses for
three distinct causes, and a new pick answers only two of them. *No target* is answered by
acquiring one; a *zero-length ray* (anchor and hover at the same position, which
`offsetPoint` refuses) is answered by hovering somewhere else. **Unparseable text is not.**
Type `abc`, press Enter with a target, and the box marks invalid correctly; move the pointer
to any other snap point and `setTapeHover` fires, the effect runs, and the red clears over a
value that still cannot parse. Keyed on `[text]` alone — the shape before this change — the
red survived until a character changed, which was right for this cause and wrong for the
other two. That is the trade the widening made, and it was made knowingly for the wrong
reason: the two causes it fixes are the reachable ones, and the one it breaks is cosmetic.

Not fixed, on three grounds: it is cosmetic (the value is still there, still wrong, and
still refused), it self-corrects on the very next Enter, and the clean remedy is a small
design change rather than a patch. **The remedy, named so it is not re-derived:** make
`error` carry its CAUSE rather than a boolean — `null | 'no-target' | 'unparseable' |
'zero-length'` — then clear the two pick-answerable causes when `hovered` changes and any
cause when `text` changes, which is two effects or one effect with a switch. Say plainly why
the widening happened rather than treating it as carelessness: **a boolean cannot express
the distinction at all.** With one bit, the key has to be either too narrow (a cured
no-target refusal stays marked until an unrelated character is typed) or too wide (this),
and there is no third option that does not add the cause. Whoever picks this up should also
consider whether the cause is worth *printing* — the box says "wrong" and never says what,
which is the same complaint that produced this whole round about the placeholder.

**Status:** closed (the note above). (triaged 2026-10-16)

## The chosen successor — 2026-08-04

**145 is SHIPPED, MERGED AND LIVE (2026-08-04 — merged as `a998793`, deployed as bundle
`index-K_vbIrhN.js`, and confirmed working in real use by the user), and every open question
below now has an answer.** Design
`docs/superpowers/specs/2026-08-04-sloyd-cardinal-guides-design.md`, browser pass
`docs/browser-verification-cardinal-guides.md`. Answers, in the order the questions are
asked below, so nobody re-derives one from the question alone:

- **World axes, and the "central question" COLLAPSED rather than being decided on
  balance.** `axisDimensions` is by construction always a *permutation* of the world axes
  — `posture` names which dimension is up and `rotation` is only 0 or 90 about Y, so each
  dimension lands on exactly one axis and no two share one, and the document can express
  no oblique case at all. So board-local axes reach the same six directions: they would
  buy a **label**, not a capability. The guide-anchor asymmetry noted below survives as a
  second, independent reason (a guide-owned anchor names no board), but it was not the
  deciding one. See `towardFor`'s doc comment in `document/snapPoints.ts`, design §2.
- **How the axis is chosen: keys, `X` / `Y` / `Z`**, in **two** handlers — `App`'s
  existing keydown effect, and a twin branch inside `TapeReadout`'s `onKeyDown` because
  `isTextEntry` stops the window listener seeing anything once the box has focus.
  `tapeAxisFromKey` is the one mapping both call, beside the type it produces. No modifier,
  no on-screen affordance, no cursor inference (declined, §8).
- **Mode, not fallback — and the ray path SURVIVES.** `towardFor(anchor, axis, hover)` is
  one function called from both the preview memo and `commit()`; with an axis it returns
  the anchor plus one inch along that axis, without one it returns the hover unchanged. The
  axis **wins** over a hover rather than falling back to it (§5.1), because `TapeTool`
  latches the hover and a lock a stale invisible value can override is not a lock.
- **`commit()`'s "no target" did become a legitimate state**, which is what made follow-up
  144 stop being cosmetic — see 144's closure above.
- **`TapeTool`'s measuring line draws nothing while locked with nothing typed**, chosen on
  scope grounds rather than as an omission: the honest thing to draw is a semi-infinite
  axis line, which is 130's construction line. Verified in a browser as reading *waiting*
  rather than *broken*; §9.1's 1" stub was named as the remedy and was **not** needed.

**No schema change, as predicted below**: `CURRENT_VERSION` stays 6, `validateGuides` is
untouched, no migration step, and both round-2 mechanisms were extended rather than
duplicated. The original entry follows unedited.

**Status:** closed (shipped). (triaged 2026-10-16)

**145. CARDINAL-DIRECTION GUIDE PLACEMENT is the next line of work — CHOSEN, not
proposed.** The user named it immediately after confirming in real use that both tape
rounds work: *"being able to draw guide points in arbitrary cardinal directions."* This
entry exists so the next design starts from the motivating problem rather than
re-deriving it, and so the questions it must answer are not mistaken for questions it
already has answers to. **It records no decisions.**

**The problem, stated as it actually is.** A guide can land in exactly two places today,
and both borrow their direction from a feature that already exists. Clicking while
anchored places one **on** the hovered snap point — which is very nearly redundant, and is
the complaint that produced the type-anywhere round in the first place (*"I can
effectively only duplicate existing grab-points, which adds nothing"*). Typing a length
places one along the **anchor→hover ray**, via `offsetPoint(anchor, toward, distance)` in
`document/snapPoints.ts`. The ray is what makes the typed path worth having, and it is
also the entire limitation: **a second snap point is what supplies the direction**, so the
tool can only ever measure *between things that already exist*. There is no way to place a
guide 3" straight up from a corner, or 6" out along Z from a face centre, unless some
other feature happens to lie along that direction — and in a model made of rectangular
parts, the direction wanted is usually one nothing points along yet.

**Relationship to 130, stated precisely because the temptation is to overstate it.** 130's
non-goal list does **not** contain a "free placement off the ray" item, and this entry does
not close anything in it. The nearest neighbour is the **semi-infinite construction lines**
bullet — axis-parallel lines bounded to `SCENE_EXTENT`, recorded there as the user's
original mental model and set aside on the judgement that *"points with typed offsets may
simply be enough in practice."* That judgement is now half-refuted and half-confirmed:
typed offsets are enough *as a mechanism*, and they are not enough *as long as the
direction has to be borrowed*. Cardinal placement answers part of construction lines'
motivation — reach along an axis from one feature — while providing no line, so read 130's
bullet as **narrowed, still open**, not closed. And what was promoted is the
**cardinal-direction** case specifically: an axis and a distance. Arbitrary 3D placement —
a guide dropped at a free position in space, with no anchor and no axis — was not asked
for, is not implied by this, and remains a non-goal.

**The open questions, listed so the design can be judged against them:**

- **World axes or board-local axes.** The central question. `axisDimensions`
  (`src/document/geometry.ts`) is the single source mapping a board's
  length/width/thickness onto world axes through `posture` and `rotation`, so on a board
  turned 90° "along the board" and "along X" are different points. Both readings are
  defensible for woodworking. Note the asymmetry that constrains the answer: a
  `SnapOwner` is `{ type: 'board' | 'guide'; id }`, so an anchor taken from a board can
  name its board and an anchor taken from a guide cannot name anything — board-local is
  not reachable from every anchor.
- **How the axis is chosen.** Modifier key, on-screen affordance, typed syntax, or
  inference from cursor direction (SketchUp infers axis locking from the drag). **The tape
  has no axis concept at all** — nothing in `TapeTool.tsx`, `TapeReadout.tsx` or the store
  names one — so there is no existing idiom to match and this is the first of its kind.
- **Mode, or fallback when nothing is hovered?** Three verified integration points, each
  of which is a constraint rather than an answer:
  - `offsetPoint` already normalises `toward − anchor` and refuses a zero-length or
    non-finite input, so the *arithmetic* exists; what is missing is a direction source
    that is not a second snap point. Whether the axis path synthesises a `toward` and
    reuses `offsetPoint` or takes its own path is a real choice about blast radius.
  - `TapeReadout`'s `commit()` does `if (!target) { setError(true); return; }`. In axis
    mode there is **no target by construction**, so this turns a refusal into a legitimate
    state — which is exactly what makes **follow-up 144**'s remedy (an `error` carrying
    its cause: `'no-target' | 'unparseable' | 'zero-length'`) stop being cosmetic. 144 is
    filed as not-worth-fixing on the grounds that its one broken case is cosmetic; this
    round should re-read that judgement rather than inherit it.
  - `TapeTool`'s measuring line is `lineEnd = preview ?? hovered?.at ?? null`. With no
    hover there is no far end. What the line draws against in axis mode is an open
    question.
- **Does the ray path survive?** Possibly complementary rather than superseded: measuring
  *between* two features and projecting *from* one are different operations, and only the
  ray answers "half the distance between these two" — the very gesture 130 used to justify
  dropping guide lines. Folding it into the cardinal case would be a genuine
  simplification and would also discard that gesture.

**No schema change.** `GuidePoint` is `{ id, at }` with `at` a bare world position, so a
guide placed along an axis is the same document data as one placed along a ray:
`CURRENT_VERSION` stays 6, `validateGuides` is untouched, no migration step. **Extend, do
not duplicate**, the two mechanisms round 2 built — the type-anywhere capture inside
`App`'s existing keydown effect (already carrying the `cutListOpen` and `isTextEntry`
guards, and the standing rule that every window-level shortcut joins that effect rather
than adding a listener) and the preview marker derived every render in `TapeTool`, which
shares `offsetPoint` with the commit path so the marker and the placement agree by
construction. A second capture or a second preview would be two places for one rule to
disagree — follow-ups 113 and 125's shape, arriving before the code exists rather than
after.

**Status:** closed (shipped; the note above). (triaged 2026-10-16)

## From the cardinal guides round

**146. Design §5.2's ILLUSTRATION is contradicted by its own §3.1, and the browser is what
showed it — 129's shape, and another link in the chain.** §5.2's first bullet specifies a
mechanism: while an axis is locked, a click on a snap point **re-anchors and keeps the
lock**, placing no guide. That mechanism is implemented exactly and was verified live —
click a corner, press `Y`, click a *different* corner (anchor moves, axis stays `y`, guide
count unchanged), type `3`, Enter, guide lands at the second corner plus 3" on Y. What is
false is the sentence appended to that bullet, which describes the payoff as
*"walking a row of corners placing a guide 3" up from each is click, type, Enter, click,
type, Enter"* — one axis press for a whole row. It is not, because `commit()` ends with
`clearTapeAnchor()`, and §3.1's structural rule is that the axis lives exactly as long as
the anchor. Driven literally from an empty document, the trace is: Enter #1 places one
guide and leaves `tapeAnchor` and `tapeAxis` both `null`; the next click re-anchors with
**no** axis; Enter #2 falls back to the ray path, whose direction is the latched hover —
which is the anchor itself — and is refused with `degenerate` (*That target is on the
anchor*). One guide, not two. Nothing wrong is written to the document, and the refusal
names its own cause, which is this round's own §7 machinery working on the round's own gap.

**The false illustration had SIX homes — the design (twice, §5.2 and §9's browser-check
list), the plan (which is where the code copies came from), and THREE in code — and all
three CODE copies are corrected.** `store.ts`'s `tapeAxis` doc comment (which had copied the
sentence verbatim, immediately under the correct structural rule that contradicts it),
`store.test.ts`'s `SURVIVES a re-anchor` comment, and `TapeTool.tsx`'s comment on the
locked-click branch itself. The test itself is correct and was not touched — only its
narration. **Design §5.2 was left unedited**, as the historical record, annotated by this
entry: the repo's habit is to mark superseded design text rather than rewrite it, and the
plan is left alone for the same reason — a plan is a record of what was asked for, and this
entry is the correction.

**The third code copy is the interesting one, and this entry's first version both
undercounted it and wrongly claimed the correction was complete.** It sat in
`TapeTool.tsx`, on the very branch that implements the re-anchor — the one piece of code
in the round whose behaviour is *unambiguously correct*. So no per-task review had any
reason to doubt its prose: the code under the comment did exactly what the comment's first
clause said, and the false clause was the *consequence* it drew about a path that lives in
a different file. That is the general shape worth carrying: a comment is most likely to go
unchecked where the code it annotates is right, because correctness of the code is what
reviewers actually test the comment against. The corrected version states the
click/commit asymmetry explicitly rather than only the half its own branch owns — a click
retargets the lock for free, a successful Enter drops it — precisely so a future reader of
that branch cannot draw the same conclusion again.

This is follow-up **129**'s shape recurring exactly — *documents illustrating a rule with a
claim the code makes false, visible only from outside all of them* — and another link in
the plan-supplied-justification chain (64, 68 twice, 80, 87, 88, 107, 118, 126, 141), with
the distinguishing feature that here the claim was **in the design before any code
existed** and survived six task reviews, because every individual task's code was correct.
Only running the sentence end to end in a browser could catch the claim, and only a review
sweeping for the *sentence* rather than for the behaviour could catch its third copy.

**Status:** record-only (the code comments are fixed; the design is kept as history). (triaged 2026-10-16)

**147. Should the axis outlive a COMMIT? Open BY RULING rather than by default — the user
was asked and chose to ship as-is (2026-08-04).** The ruling: the single-sentence rule below
is worth one keystroke per guide, and the question is worth revisiting only with real use
behind it. That use has since begun — the round is merged and live, and the user reports it
works well — so anyone reopening this now has evidence available that nobody had when it was
first filed. Do not read what follows as an unmade decision; read it as a made one with its
reasoning preserved.

146 records that the axis does not survive a commit. The question this leaves is whether it
should: `commit()` currently ends with `clearTapeAnchor()`, which drops the lock, so
walking a row of corners costs one axis press per guide. Three things a decision should
weigh. **For keeping it:** §3.1's rule is a single sentence that a reader can hold — *the
axis lives exactly as long as the anchor* — and every clearing site inherits it for free,
including the four this round never had to think about (`undo`, `redo`,
`replaceDocument`, `dropHeldIfGone`). Carving out one exception makes the rule *the axis
lives as long as the anchor except when the anchor was cleared by a successful commit*,
which no longer falls out of anything and has to be enforced at a specific call site.
**Against:** the row-of-corners gesture is the concrete thing the lock was sold on, and
paying one keystroke per guide for it is a real cost in the exact use the round exists for.
**And the cheap middle:** `commit()` could set the anchor to the placed guide instead of
clearing it — a placed guide is a snap point, so chaining from it is already legal — which
would keep both the rule and the gesture but changes what Enter *means* (it would stop
ending the measurement), and is therefore its own design question rather than a tweak. Do
not resolve this by adding `tapeAxis` back into a `set()` beside a `clearTapeAnchor()` call
without amending §3.1 and the `tapeAxis` declaration together; the rule and the code have
to keep agreeing, which is what 146 is about.

**Status:** open by decision (the user ruled ship as-is). (triaged 2026-10-16)

**148. `gesturing` and `gestureSnapshotTaken` are MODULE-LEVEL closure variables that
`replaceDocument` does not reset, and in tests that leaks across files' worth of state.**
Found during Task 3, then independently reproduced by a reviewer, so this is evidence
rather than a suspicion. Both flags live in the closure `useStore`'s factory creates, not
in the store's state — so `replaceDocument` (which every test's reset path runs through)
restores the document, the history and every held point, and leaves these two exactly as
the previous test left them. The reachable consequence: a component that unmounts **while a
gesture is open** — which is ordinary in RTL, where `cleanup()` tears the tree down between
tests — leaves `gesturing` true and `gestureSnapshotTaken` at whatever the last `edit()`
set it to, and every later test in that file then does its undo bookkeeping under a gesture
nobody opened. Snapshots are lazy by design (invariant 4), so the visible symptom is
missing undo entries in a test that never touched a gesture, which reads as a defect in the
code under test rather than as contamination.

Task 3 worked around it **in-file**, by adding a `.blur()` to a pre-existing test in
`src/App.test.tsx` so the field it exercises closes its gesture before the tree comes down.
The reviewer confirmed both halves independently: removing that `.blur()` reproduces the
leak, and the workaround is legitimate rather than masking — it makes the test end in a
state a real user's browser would also be in, which is exactly what the test should have
been doing. **The real remedy is store-level and was not attempted**, because it is not
this round's surface: move both flags into the store's state (where `replaceDocument`
already rewrites everything it should), or reset them explicitly alongside it. The first is
better — a flag that must be reset by convention at every call site is the same shape as
the held-point clearing rules invariant 24 had to enumerate, and the reason those are
enumerable is that they are *in the state*. Anyone taking this on should note that
`beginGesture`/`endGesture` currently cost no re-render precisely because the flags are
outside state, so moving them needs a check that no consumer subscribes to them.

**CLOSED 2026-08-31 by the store-state round — the first remedy, the one this entry argued
for.** Both flags are now fields on the Zustand store, initialised false, and
`replaceDocument` clears them alongside the held points. The named precondition was checked
rather than assumed: every `useStore` call site in `src/` passes a selector and none names
either field, so the cost of the move is one `set()` per gesture boundary — focus, blur,
gizmo mousedown and mouseup, never per frame — and no component re-renders on it. They are
public by necessity and private by intent; the declaration in `StoreState` says so, because
subscribing to either would put a re-render on every gesture boundary and is the one new
hazard the change introduces.

Three details worth carrying, each decided rather than inherited:

- **The reset stops at `replaceDocument`.** Adding the pair beside `grabbed: null` in
  `undo`/`redo` is the invariant-24 tidying instinct and would split one focused field's
  gesture in half after a Ctrl+Z — a behaviour change with no defect behind it. Both this
  and the no-subscription rule are **invariant 34** now, with pointers at `undo` and `redo`
  themselves: the prohibition was initially written only inside `replaceDocument`, where
  someone tidying `undo` would never see it.
- **The test asserts an UNDO ENTRY, not a flag value.** `expect(gesturing).toBe(false)`
  after `replaceDocument` cannot fail: the field initialises false, so it passes with the
  reset deleted — follow-up **155**'s shape exactly. What the test does instead is leave a
  gesture open, replace the document, edit, and assert `past` grew. Mutation confirmed it:
  deleting `gesturing: false` turned **7** tests red, and six of them were the leak crossing
  into later tests in the same file, which is the contamination this entry described.
- **`gestureSnapshotTaken: false` in `replaceDocument` is symmetry, not coverage, and
  saying so is the honest report.** Deleting it alone passes 137/137, because `!gesturing`
  short-circuits the snapshot test and `beginGesture` clears the flag anyway. It is kept so
  that "the gesture is closed" is one statement wherever it is said (it mirrors
  `endGesture`), not because a test would catch its removal. A second surviving mutation is
  in the same family and pre-dates this round: `takeSnapshot = gesturing` can be written
  `= true` with nothing observing the difference, since the flag is meaningless while
  `gesturing` is false. The two mutations that carry the semantics — the `gesturing` reset
  and persisting `gestureSnapshotTaken` out of `edit()` — both fail loudly.

Task 3's `.blur()` in `src/App.test.tsx` was **kept**, and its comment rewritten to say why
it is no longer load-bearing but still correct: it ends the test in the state a real user's
browser would end in, which is what the reviewer found when confirming it was not masking.
`Gizmo.tsx`'s mid-drag guard comment, which called `gesturing` "the store's private flag"
and said a leak lasts "forever", was corrected on both counts — and the guard itself stays
primary, because nothing about a mid-drag unmount implies a document is about to be
replaced.

**Status:** closed. (triaged 2026-10-16)

**149. NON-GOALS — design §8, recorded as decisions rather than omissions.**

- **No schema change**, and none was needed. `GuidePoint` is `{ id, at }` with `at` a bare
  world position, so a guide placed along an axis is the *same document data* as one placed
  along a ray. `CURRENT_VERSION` stays **6**, `validateGuides` is untouched, and there is
  no migration step — the first round since joinery to add a real user-facing capability
  with no version movement at all, which is the point rather than a coincidence: nothing
  about how a guide was created is stored, and nothing should be.
- **No axis LINES.** The round places a point along an axis and draws no line while locked
  with nothing typed. See 130's amended bullet: semi-infinite construction lines are
  narrowed by this round and remain the one genuinely open item there.
- **No arbitrary free placement.** A guide at a typed x, y, z with no anchor is still not
  asked for and still not a goal.
- **No board-local axes.** §2 shows they add no reachable position, because
  `axisDimensions` is always a permutation of the world axes. If the *labelling* is wanted
  later it is a display change over the same mechanism, and it will have to answer the
  guide-owned-anchor case this round does not have (a guide names no board).
- **No cursor-direction axis inference.** SketchUp locks an axis from the direction of an
  initial drag; doing that here needs a cursor world position with no snap point under it,
  which the tool cannot obtain — it would mean a ground-plane or screen-plane projection,
  a new mechanism rather than a new use of one.
- **No second capture path and no second preview.** The type-anywhere capture in `App`'s
  keydown effect and the derived preview in `TapeTool` were extended, not duplicated. The
  one place a second handler *was* forced is the axis keys inside `TapeReadout`, and that
  is not a second capture path: it exists because `isTextEntry` stops `App`'s listener
  seeing anything once the box has focus, it calls the same `tapeAxisFromKey`, and Escape
  had already set the precedent for exactly that reason.

**Status:** record-only (non-goals). (triaged 2026-10-16)

**150. What the browser pass found and what it could not reach** — full report in
`docs/browser-verification-cardinal-guides.md`. All 8 checks were run. **No defect was
found in this round's code**; the only finding is 146, which is against a claim rather than
against the code. Two results are worth having here rather than only in the report.

**The locked-with-nothing-typed state reads as WAITING, and §9.1's 1" stub was NOT
applied** — but the sharpest observation in the pass is the argument that stub would rest
on if it is ever wanted: the measuring line does not merely fail to appear, it
**disappears**. Before the axis key there is a line from the anchor to the hovered point;
pressing the key removes it, because the hover stops contributing a direction (§5.1). A
thing vanishing is a weaker confirmation than a thing appearing. Three things are why it
still reads as waiting rather than broken, measured out of the scene graph rather than
eyeballed: the chip appears in the same instant, the hint sentence changes to name the axis
(*Along Y — Enter to place*), and one keystroke restores both a line along the axis and a
preview marker at its end — the state is a fraction of a second long in the gesture the
tool is for. Recorded with that framing so a future complaint about it lands on the named
remedy instead of reopening §8.

**`no-direction` was not reachable live, and that is itself a result.** `TapeTool` sets
`tapeHover` on the anchoring click and then latches it, so every anchored state in the pass
had a hover — which makes the ray path's reachable failure `degenerate` (hover on the
anchor) rather than `no-direction` (no hover at all). Getting to `no-direction` needs the
hover cleared point-precisely while the anchor survives, e.g. editing the hovered board so
its hovered corner stops existing. All three causes and all of their cures are covered in
`src/App.test.tsx`. §7 calls `no-direction` ray-path-only; this is evidence for how narrow
that path is in practice, and a reason not to spend more on its wording than it is worth.

**Named gaps, so the coverage is not read as broader than it was:** no touch or pen input
(follow-up 106's remaining half, still open); one window size, one camera and one zoom
level, so check 8's legibility judgement is at 1600 × 1000 only; no orthographic-camera
pass; Escape-while-the-cut-list-is-open and undo/redo-with-a-live-lock were left to the
unit tests rather than driven; and the pass's screenshots are **not committed**
(`.playwright-mcp/` is gitignored), so every visual claim in the report is written out in
prose and backed by a scene-graph or DOM read.

**Two harness traps, in the shape of 74/75/106.** Autosave lags the store by roughly
200 ms, so a `localStorage` read taken immediately after Enter returns the document
*without* the guide just placed — and because it still holds the previous one it looks like
a plausible wrong answer rather than an obvious failure. Two results were sampled that way
before the store and `localStorage` were read together and seen to converge. Separately, a
DOM read 150 ms after a keystroke can race a React effect: the *a new character clears an
unparseable refusal* probe reported the refusal still present at 150 ms and absent when
re-read. The behaviour is correct; the sample was early. Both are recorded because either
shape would read as a defect in a longer check that was not repeated.

**Status:** record-only. (triaged 2026-10-16)

## From the project library round

**151. The row's two controls reveal INDEPENDENTLY on keyboard focus, so a keyboard user
never sees that a second one follows.** `.project-row-action` is `opacity: 0` at rest and
revealed by two rules: `.project-row:hover .project-row-action` (the whole row, both
controls) and `.project-row-action:focus-visible` (**one** control, the focused one). With a
pointer you see duplicate *and* delete together and can choose; Tabbing onto duplicate shows
duplicate alone, with nothing indicating that one more Tab reaches delete. Both are reachable
and both were operated by keyboard alone in the browser pass, so this is discoverability, not
access. The obvious fix — add `.project-row:focus-within .project-row-action` beside the
hover rule — is one line and was **not** applied, on the grounds that it is a visual decision
nobody has looked at on real hardware and this round's ruling everywhere else has been to
record rather than retune. Recorded now because the argument for the current state is
"nobody noticed", which is not an argument.

**Status:** open (hygiene, one CSS rule; a visual change for the user's nod): no `.project-row:focus-within` reveal. (triaged 2026-10-16)
**Status:** fixed on the branch 2026-10-16 (follow-ups 5); THE LOOK IS OWED TO THE USER. `.project-row:has(:focus-visible) .project-row-action` joins the hover reveal — KEYBOARD focus only (`:focus-within` was tried first and dropped: Duplicate focuses itself on click, so a mouse user would have kept both lit). A CSS test pins the rule and the absence of `:focus-within`. Seen live: a menu opened by mouse shows no actions; Tab onto the row shows both, and onto Duplicate both with its ring (`docs/img/fu151-row-focus.png`); a fresh mouse-only load, a real click on Duplicate, pointer moved away: none lit, `:focus-visible` false. (A click after earlier Tabs in the same page does read `:focus-visible` — Chromium carries the last modality into a programmatic `focus()`; accepted, it is the keyboard user's page.)
**Status:** CLOSED 2026-10-16 — the user looked at the deployed row actions and approved: "The row actions look fine."

**152. Escape closes the project menu and leaves focus on `<body>` rather than returning it
to the caret.** Confirmed live: `document.activeElement` after an Escape from an armed delete
is the body element. The popup unmounts the focused button and nothing restores focus to the
trigger that opened it, so a keyboard user who backs out of the menu is returned to the top of
the document rather than to where they were. Cheap to fix (a ref on the caret and a `.focus()`
in the Escape branch) and deliberately not fixed here: it is a behaviour change to the one
handler this round argued *out* of invariant 27's scope (design §4.1), and doing it in a
docs-only task would put an unreviewed edit on that file. Note the two closing paths differ:
the focusout close happens *because* focus went somewhere sensible, so it has nothing to
restore — only the Escape path is affected.

**Status:** closed 2026-10-16 (follow-ups 3): Escape focuses the caret before closing (as Popover does); pinned and mutated; checked live. (triaged 2026-10-16; updated by follow-ups 3)

**153. A genuinely full `localStorage` was never produced in a browser.** `available` goes
false down two routes: an unrecognised or corrupt index (driven live, see
`docs/browser-verification-project-library.md` case 5) and `setItem` **throwing** — quota
exhausted, or a privacy mode that refuses writes. Only the first was exercised against a real
browser; the second is covered by a storage double that throws on demand. The two are not the
same shape: on the throwing route the project write can fail *after* the index has been read
and *before* it is committed, and what the user sees depends on `autoSave`'s ordering
(`_available` may only go true once both writes land — R11). The double pins that ordering;
what it cannot show is how the app reads to a person once a real browser starts refusing
writes mid-session. Filling a real origin to its quota and driving a few edits is the
remedy.

**Status:** open (owed: a real browser at quota). (triaged 2026-10-16)

**154. Two tabs of Sloyd on one origin is now a materially different situation, and nothing
was designed or driven for it.** Before this round two tabs fought over one key and the loser
was obvious. Now each tab holds its **own** `activeId` in React state and its own 600 ms
autosave timer over its own document, and nothing listens for the `storage` event. So: two
tabs on *different* projects are fine and always were — that is the layout working. Two tabs
on the *same* project last-write-wins per debounce, as before. The new case is the index:
tab A creating or deleting a project rewrites `sloyd.library.v1`, and tab B's next mutating
write is built from the index **it** last read, so A's row can be dropped by B without either
tab showing anything. No data in a project document is lost by that — only the row naming it,
which orphans the `sloyd.project.<id>` key rather than deleting it, so it is recoverable by
hand. Not driven in the browser pass and not modelled by any test. The honest small remedy is
a `storage`-event listener that re-reads the index; the honest large one is a lock, which is
more machinery than a single-user woodworking app has earned.

**Status:** closed 2026-10-16 (follow-ups 4) — the reach the entry described is closed: every index write re-reads the index from storage (`readIndexForWrite`), so a tab never writes from the copy it last saw, and a project deleted in another tab is refused as an autosave target. Pinned with two adapters over one storage, writes interleaved; mutated (cache the index) — red. No `storage` listener was needed. The library and prices (fu 325) are separate and stay record-only. (triaged 2026-10-16; updated by follow-ups 4)

**155. SIX DISTINCT plan-supplied tests in this round could not fail, and one of them was
hiding a real shipped bug.** Say *distinct*, because the ledger's own running count and this
enumeration disagree by one and both are right: `progress.md`'s R18 calls itself the "sixth
instance this round", which it is only because the dep-array observation was logged **twice**
(once as a Task 4 deferred minor, once as R17 when Task 5 investigated it), making R22 the
seventh ledger entry and the sixth distinct test. The number is stated here rather than only
in CLAUDE.md precisely because a bare count copied into several homes without its derivation
is follow-up 146's shape. The full narrative is in `docs/history.md`; recorded here as a
numbered entry
because CLAUDE.md's "code and justifications supplied verbatim by a plan have been wrong"
chain now points at it, and because the enumeration is the useful part:

- **R6** — the write-verify-commit ordering. The reviewer rewrote `adopt` to commit the index
  first and deleted the round-trip check: **22/22 still passed.**
- **R8** — the byte-identity guarantee on `sloyd.autosave.v1`. A guarded *equivalent-JSON*
  rewrite of that key left the flagship test green, because it compared parsed values.
- **R12** — "a background delete leaves the open project alone". An early return that
  preserved the caller's active project still passed **55/55**; the test named for the
  behaviour could not fail.
- **R17** — the switch-race test. With `[doc]` alone in the dep array it **still passes**, so
  it does not cover what the plan said it covered. That correction is now invariant 29.
- **R18** — the `libraryAvailable: false` gate that hides the project menu. Flipping it to
  `libraryAvailable ||` passed **all 889**.
- **R22** — `App.test.tsx`'s fake `duplicateProject` did not set `activeId` where the real
  adapter did, **which is why no test could expose R21** — the shipped bug where duplicating
  moved the persisted active project to the copy, so the next boot opened the wrong project.
  This is the one that was not merely a weak test.

Five were caught by a reviewer mutating the code and re-running; the sixth (R22) by asking why
a known bug had produced no red. **The lesson is narrower and more actionable than "write
better tests": a test whose subject is an ORDERING, a REFUSAL, or a "cannot exceed" property
must be mutated before it is believed** — those three shapes all admit a test that observes the
end state and cannot see the step that was skipped. Invariant 23 said this about containers;
this round says it about orderings and refusals too, and invariant 31 carries it for the
storage seam.

**Status:** record-only (lesson). (triaged 2026-10-16)

**156. `App.test.tsx`'s fake still does not model `activeId` on duplicate.** Left as it is,
knowingly. After R21's fix the fake is *coincidentally* correct — the real adapter's
`duplicateProject` passes `{ activate: false }`, and the fake never touched `activeId` either
— so the App-level tests agree with the shipped contract by luck rather than by modelling it,
and cannot distinguish correct-by-fix from correct-by-luck. The contract is pinned instead at
the layer the bug lived in: `src/storage/browser.test.ts`,
*'duplicateProject does not move the persisted active project to the copy'*, against the real
adapter. That is the right layer, and it is why this is a note rather than a defect. The
reason to keep the entry is the general one: this is the **fifth** fake divergence found in
this round alone (`available` a static literal, `deleteProject` always returning null,
`loadProject` returning by identity, `openLibrary` absent, and this), and the App fake is now
carrying enough approximation that the next person to add a test against it should check what
it actually models before trusting a green.

---

**Status:** record-only. (triaged 2026-10-16)

**157. CLOSED 2026-08-31 — one shared in-flight token, and the boolean guard it replaced
was itself wrong.** `App` now holds ONE `switchToken` ref; all four adopting handlers
(`openProject`, `onNewProject`, `onDeleteProject`, `importIntoLibrary`) bump it on entry and
re-read it after their awaits, and one that finds it moved abandons its adoption. The rule is
one sentence — **the last handler to START owns the outcome** — which is why it is one token
rather than four guards, each of which would have had to re-derive it.

Three things this round found that the entry below did not say:

- **`openProject`'s boolean re-entry guard could not have been generalised, because it was
  the wrong shape.** It DECLINED the second click, so the session ended on the row the user
  did **not** click last — which is the same casualty this entry was filed about, arriving by
  the other road. It is deleted, not extended. Note also that the test this entry specified
  ("two rows clicked and resolved out of order") is **unreachable under a decline**: the
  second click never issues a `loadProject`, so there is nothing to resolve out of order. The
  ledger specified a test its own shipped code could not run.
- **The token check alone was not enough for the two `createProject` callers.** A superseded
  `onNewProject` had already let the adapter move the index's `activeId` to the project it
  wrote, so abandoning the adoption left the persisted id on a document the user is not
  looking at — this entry's exact casualty, surviving the fix. Both callers now pass
  `{ activate: false }` and call `setActiveProject` themselves **after** the check, so moving
  the persisted id and adopting it are one step on one side of it. That is `browser.ts`'s own
  `duplicateProject` ruling ("an implicit activate leaves the trap armed for the NEXT caller")
  applied to the next callers.
- **The bump sits BEFORE `openProject`'s `id === activeId` early return**, decided rather than
  inherited: clicking the already-open row while a switch is out means "stay here", and
  cancels it. Uniform last-click-wins is one sentence; two rules would be two.

`onDeleteProject` keeps a narrower guarantee on purpose — see **160**.

Covered by two `App.test.tsx` tests, both **mutated before being believed** (155's rule):
deleting `openProject`'s check turns both red, and making `onNewProject` read the token
without bumping it turns the first red. The `activate` contract is pinned separately in
`src/storage/browser.test.ts` against the **real** adapter, and mutated in both directions —
because `App.test.tsx`'s fake ignored the parameter entirely, which was the **sixth**
divergence in the list 156 keeps (now taught to the fake rather than left silent).

The original entry follows unedited.

**Status:** closed. (triaged 2026-10-16)

**157. The three async handlers beside `openProject` are unguarded, and the persisted
`activeId` can end on the loser.** `openProject` got an in-flight guard in the final fix
wave; `onNewProject`, `onDeleteProject` and `importIntoLibrary` are now all
async-before-mutation too, and one of them fired during an in-flight `openProject` can still
interleave. **No wrong-slot write is possible** — each handler writes a matched
`(id, doc)` pair, which is invariant 29's whole point — so the only casualty is the
*persisted* `activeId`, which can end on the project the user did not finish on. The next
boot then opens the wrong one. Deliberately left narrow: the ruling on the final wave was to
guard `openProject` only, because that is the path a user can actually double-click, and
widening the guard across four handlers at the end of the round was a bigger change than the
defect justified.

The remedy is one shared in-flight token rather than four separate guards.

**And the reason this entry exists rather than a fix: the re-reviewer showed the guard IS
straightforwardly testable, contrary to the fixer's stated reason for skipping it.** A
deferred-promise `loadProject`, two rows clicked and resolved out of order, asserting the
persisted `setActiveProject` ends on the row the user ended on — that bounds against a value
the guard cannot itself move, which is the *opposite* of the can't-fail shape (155) the fixer
was rightly wary of. The technique was already proven in this round on `ProjectMenu`'s
await-before-refresh test. **"This cannot be tested" meaning "I did not find the technique"
is itself one of this round's recurring findings.**

**Status:** closed (the note above). This is the SECOND entry numbered 157. (triaged 2026-10-16)

**158. CLOSED 2026-08-31 — both, and the second one has a `tsc` receipt.**

- The `App.tsx` comment now states the rule **and its one known limit**: `onDuplicateProject`
  can report a stale `true`, because a missing or unreadable source returns null through
  `loadProject`, which deliberately moves nothing. Comment-only was the right remedy: flipping
  `_available` there would make the banner claim persistence is broken when it is working and
  one project is simply gone, which `browser.ts` rules against at its own `_available` sites.
  What is left over — a failed duplicate being silent to the user — is **159**.
- The pending-write record is no longer `{ id, doc, timer }` but `{ write, timer }`, where
  `write` is a **thunk created inside the autosave effect**, the one scope where `activeId` and
  `doc` are each other's counterpart by construction. The mismatch this entry named is now
  unwritable rather than merely forbidden: `storage.autoSave(activeId, p.doc)` fails to
  compile, `Property 'doc' does not exist`. **That failing `tsc` is the receipt** — the thing
  the entry pointed out all 51 `App.test.tsx` tests could not produce, and a reminder that
  `npm test` does not typecheck. Invariant 29 carries the new shape.

The original entry follows unedited.

**Status:** closed. (triaged 2026-10-16)

**158. Two comments overstate what the code does, both in the same fix wave that narrowed
invariant 31 for exactly this reason.** Neither changes behaviour; both are the failure mode
this repo has now logged five times in one round, which is why they are written down rather
than left to be rediscovered.

- `App.tsx`'s "ONE RULE FOR ALL FOUR HANDLERS" comment above the `setAvailable` calls is
  false for `onDuplicateProject`: a corrupt or missing source returns null through
  `loadProject`, which never moves `_available`, so its `setAvailable` reports a stale
  `true`. Same gap the fix wave consciously recorded for `openProject` — the difference is
  that one is documented as a known limit and this one is documented as a rule.
- Invariant 29's matched-pair requirement (the flush must write the outgoing document with
  the outgoing id) is **doc-enforced only**. Rewriting the flush to
  `storage.autoSave(activeId, p.doc)` — reintroducing exactly the mismatch the invariant
  forbids — passes all 51 `App.test.tsx` tests. The invariant is correct and the code obeys
  it; nothing makes the code keep obeying it. A type that pairs the id and document at the
  point they are captured would enforce what the sentence currently only asks for.

**Status:** closed (the note above). This is the SECOND entry numbered 158. (triaged 2026-10-16)

## From the 157/158 correctness round — 2026-08-31

**159. A duplicate that fails is silent.** `onDuplicateProject` reports the storage layer's
verdict like the other three handlers, but `duplicateProject` returning null for a missing or
unreadable source moves no verdict to report (see 158's closure), so the user presses ⧉ and
nothing happens — no new row, no banner, no message. The shape of the remedy already exists
and was ruled on for a neighbour: `importIntoLibrary` **throws** into a flow that owns a
visible error surface at the point of action, precisely because "the banner is easy to miss
right after a deliberate action." Duplicate has no such surface — it is a bare button in
`ProjectMenu`'s row — so the honest fix is a surface, not a throw, and that is a design
question rather than a fix. Recorded, not built: it is reachable only when a project key has
gone missing or corrupt underneath a listed row, which is the two-tab case (**154**) or hand
editing.

**CLOSED 2026-08-31. The surface was built, and it is per-row.** `onDuplicateProject` now
resolves `DuplicateFailure | null`, and `ProjectMenu` prints the message under the row that
failed. The design question the entry raised was put to the user, who chose the row-level
surface over one message at the foot of the popup and over marking the row unopenable.

Four things decided rather than fallen into:

- **The cause is carried, not collapsed to a boolean.** `duplicateProject` returns null for
  two reasons and they need different sentences: `source-missing` is this entry's case, and
  `write-failed` is storage refusing the new key — which also raises the banner, so saying
  "missing" there would send the user looking for the wrong thing. Same shape as
  `TapeReadout`'s cause-carrying `TapeError`.
- **The two are told apart by `storage.available`, and it must be the ADAPTER FLAG, not the
  `available` React state.** The React value is a render behind and `setAvailable` does not
  update it synchronously, so reading it reports the *previous* attempt's verdict. Pinned by
  mutation. What is **not** load-bearing, though it looks it: the read's position relative to
  `setAvailable` — that call touches React state and mutates nothing on the adapter, so
  hoisting the read above it changes no behaviour and no test. Both facts are in `App.tsx`'s
  comment, the second one precisely so a later reader does not preserve an ordering that means
  nothing while feeling protected by it.
- **ONE clearing rule, as an effect keyed on `open`** — not a `setFailed(null)` beside each of
  the six close paths (Escape, outside click, focus-out, opening a row, New, Import). A flag
  reset by convention at every call site is the shape invariant 34 argues against, and a
  seventh close path inherits the clear without knowing it exists. The per-row error also dies
  with its row for free: it renders inside `projects.map`, so an id that leaves the list takes
  its message with it.
- **`.field-error` reused, not a second inline-error idiom**, with a scoped
  `.project-menu-popup` override — the move `.toolbar .field-error` already makes.

Ten mutations, and the two that survived are recorded rather than hidden. Caught: never
reporting (6 red), never clearing on success (1), dropping the clearing effect (1), showing the
message on every row (4), one message for both causes (2), always `source-missing` (1), always
`write-failed` (1), never reporting from `App` (2), and reading the React state instead of the
adapter flag (1). Survived: reading `storage.available` before rather than after
`setAvailable` — genuinely unobservable, and the comment now says so instead of claiming the
ordering matters.

One thing the round pinned that it did not change: wrapping each row in a `Fragment` plus a
`.project-row-group` div moved `key` off the row div, and `ProjectMenu.tsx` carries an explicit
warning that the delete arm/disarm swap keeps focus only because both branches render a
`<button>` at the same sibling index. The buttons' index inside `.project-row` is untouched, so
the warning's subject survives — but "it should still be fine" is the reasoning that warning
exists to distrust, so there is now a test asserting focus lands on `Delete X?` after arming.
It had none before. Mutation: giving the armed branch its own `key` — the documented break —
turns it red.

Verified against the dev server on the real path — a library index naming two projects with
only one project key present, which is the state 154 or a hand edit produces:
`docs/browser-verification-duplicate-error.md`. The unit tests drive a stubbed `onDuplicate`
and a fake store, so they pin the wiring; only the browser pass shows the real adapter taking
the null branch for a key that is really absent, the banner correctly staying away, and
nothing being written.

**Status:** closed. (triaged 2026-10-16)

**160. `onDeleteProject`'s in-flight token covers its ADOPTION, not the index write, and that
residue is deliberate.** The other three handlers can be made to move the persisted `activeId`
only on the far side of the token check (157's closure). `deleteProject` cannot: the project is
gone and the adapter must name a replacement in the same write that removes the row, so a
delete overtaken by a switch can still leave the persisted id on that replacement rather than
on the project now open — one wrong project on the next boot, no data lost. Two things bound it
and are why it is filed rather than chased. The replacement is always a **valid, loadable**
project, unlike the pre-157 case where the id could name what the user was not looking at for
arbitrary reasons; and `autoSave` refuses an id the index does not name, so anything worse than
"the wrong project opens" reports itself through `available`. Closing it properly means
`deleteProject` taking the caller's intended active id as an argument — the same shape as
`autoSave`'s explicit id (invariant 29) and worth doing if the adapter is touched for another
reason.

**CLOSED 2026-08-31, by neither remedy this entry named and with no source change.** The
diagnosis above is right about the shape and wrong about both the fix and the reachability.
The fifth shape again (140's): *a remedy an entry names is a hypothesis recorded at diagnosis
time, not a prescription.*

**The named remedy is dead, and the sentence is worth keeping so nobody revives it.**
`onDeleteProject` captures `activeId` **before** its awaits. On the only path that matters —
deleting the project that is open, then being overtaken by a switch — the captured value is
the project being deleted. Passing it as the intended active id would write an id naming
something that no longer exists, which is strictly worse than naming the valid replacement.
An argument computed at call time cannot know a switch that starts after it.

**The obvious restructure is not a fix either, and the reason generalises.** Moving the
`activeId` write out of the adapter (`deleteProject(id, { activate: false })`, caller calls
`setActiveProject` after the token check, the shape invariant 32 uses for the other three) only
helps if the adapter's index read-modify-write is atomic. Where it is, the residue does not
exist to begin with; where it is not, the delete's write is derived from a stale read and can
clobber the winner's id with a **deleted** one — a dangling `activeId` that makes `autoSave`
refuse and raise the storage banner, worse than the wrong-but-valid project this entry
describes. Either way the property in question belongs to the seam, not to this method's
signature: `createProject`, `autoSave`/`touchEntry`, `setActiveProject` and `deleteProject` all
do read-modify-write on the index, so an adapter without atomicity is already broken for all
four and no delete-shaped change rescues it.

**And it is unreachable on the current adapter — the fact the entry never checked.** Every
index write in `deleteProject` lands in the same synchronous run as the `readIndexForWrite` it
derives from: no `await` separates them on either branch that moves `activeId`, and the
last-project branch writes through `createProject`, whose body is synchronous end to end. So
the persisted id cannot move on the far side of a suspension point, and a later-started
switch's own write is always the last one. The claim is broader than delete:
**every method on `BrowserStorageAdapter` is synchronous-bodied**, so no two of `App`'s four
adopting handlers can overlap in production at all — microtasks drain before the next click is
dispatched, so each runs to completion inside its own task. That is exactly why 157's race
tests have to hang a mocked `loadProject` to construct a race, and it puts 160 and 157 in one
class: latent, reachable only on a future adapter with real async I/O, which is the basis 157
was closed on.

One method genuinely does suspend and is not a counterexample: `importProject` awaits
`file.text()`. It sits **before** `importIntoLibrary`'s token bump, so no token-holding
critical section spans it.

**What shipped is the pin, because the property was an accident and is now a decision.**
`deleteProject`'s doc comment carries an explicit prohibition against putting an `await`
between the index read and the index writes, and two tests in `browser.test.ts` call
`deleteProject` **without awaiting it** and read the committed index straight out of the store
— one per branch that moves `activeId`. Awaiting the call first is what would make them
unable to fail, so the comment says not to tidy them that way.

Mutated, not merely run. `await Promise.resolve()` between `readIndexForWrite` and the index
write turns **both** red; `await Promise.resolve()` inside `createProject` before its own write
turns the last-project one red on its own, which is what shows that test covers the callee
rather than the caller. No other test in the file caught either mutation, so nothing else was
holding this.

**Status:** closed. (triaged 2026-10-16)

## From the turned-label round — 2026-08-31

**161. The `name` tier still says nothing about a turned part, and the remedy is a design
decision rather than a fix.** `fitLabel` picks one of three tiers by measurement, and only
two of them print `dims`: `full` draws the name and the dimension line, `index` draws a
number whose key-list entry is built from `dims`, and **`name` draws the name alone**. So a
part whose rectangle fits its name but not its dimension line prints neither its dimensions
nor the word — follow-up 92's ambiguity surviving in the one tier its fix does not reach.
Adding seven characters to the dimension line makes a turned part reach that tier slightly
sooner than before, so this round narrowed the gap's entrance and did not close it.

Bounded the same two ways 92 was: only near a 1:1 aspect ratio, and only under
`rotate: 'free'`. Narrower still in one way — at this tier no dimensions are printed at all,
so a reader has no transposed pair in front of them to be misled *by*; they have to go to
the cut-list row for the numbers, and the row does not describe the placement either way.

**The named remedy, and why it was not just done.** `SheetLayout` could demote a turned part
from `name` to `index`, since the key entry carries name, dimensions and the word — strictly
more information than the name alone, at the cost of an indirection and of a numbered box
where the user could have had a name. That is a legible-sheet judgement about mid-sized
parts, not a correctness question, and the round's design question had already been put to
the user and answered ("a word on the dimension line"), which this is not.

**CLOSED 2026-08-31 by the named remedy, after the design question was put to the user.**
Three options were presented with the size of the affected band measured rather than
asserted — on a 96" sheet, `24" × 18"` needs ~11.9" of part width to print and
`24" × 18" turned` needs ~20.2", so a turned part between roughly 12" and 20" wide fell to
the `name` tier and printed neither. The user chose the demotion over the two alternatives:
**retiring the `name` tier entirely** (uniform — a part shows its complete label or a number,
never a partial one — but it repaints sheets that have no defect, since an unturned part at
that tier also prints no dimensions) and **leaving it** (this entry's own bound: nothing on
screen misleads, because no dimensions are printed to be transposed).

Four things decided rather than fallen into:

- **The rule lives in `fitLabel`, not in `SheetLayout`.** The obvious version is a panel-side
  override — `tier === 'name' && p.turned ? 'index' : tier` — and it would give the ladder two
  deciders, one in `diagramLabels.ts` and one in the component. That is invariant 31's shape
  ("a rule written out twice holds in one place after the next edit"). Instead `fitLabel`
  takes `options?: { requireDetail?: boolean }` and, when set, **skips the middle rung**:
  `full` or `index`, nothing between. Default off, so every existing call site is unchanged.
- **`requireDetail` is an ARGUMENT, never a search of the strings.** Recovering `turned` by
  looking for the word in `lines[1]` would parse a formatted string to learn a fact the caller
  already holds as a boolean — and `nesting.ts` keeps `turned` beside `dims` precisely so
  nobody has to (`PlacedPart.dims`'s comment: one is the fact, the other is how it prints).
- **Nothing else moved.** The key entry is already `${p.name} — ${p.dims}` and `dims` already
  carries the word from 92, so the demoted part's entry is complete for free; and `nextIndex`
  already counts only parts that reach the index tier, so the new route feeds the existing
  counter rather than opening a second one. Confirmed in the browser, not assumed.
- **`SheetLayout` got its first tests.** The component had **none** — 92's browser pass says so
  in as many words — so the wiring would have been unpinned. `src/panels/SheetLayout.test.tsx`
  is new; `PAD` is now exported so the test can size its parts from `labelWidth` instead of
  keeping a second copy of the number (invariant 19's argument, one constant over).

Five mutations, all caught, and the split matters. Dropping the `requireDetail` branch reds
four tests across both files. Skipping the `name` rung unconditionally reds six — including
the unturned-part assertion, which is the one bounding the change to turned parts only.
Returning `index` whenever the flag is set (demoting even a part that fits everything) reds
two. Inverting the flag at the call site reds three. **And dropping the argument from
`SheetLayout` entirely reds only the component tests** — the `fitLabel` unit tests stay green
through it, which is the whole justification for the new file.

Verified against the dev server on a fixture where the geometry decides nothing: `Side`
(turned) and `Back` (unturned) are laid out on rectangles of exactly the same size,
187.5 × 156.25, and a third part `Rail` is unturned at the `name` tier to show the rung
survives. `docs/browser-verification-turned-index.md`.

**Status:** closed. (triaged 2026-10-16)

**162. The sheet's key list draws a bullet in front of a line that already numbers itself.**
`.cutlist-layout-key` sets `color`, `margin` and `padding-left` but never `list-style`, so the
browser's default marker stands in front of an `<li>` whose text begins `1. `, and the entry
reads `• 1. Side — 15" × 18" turned`. Pre-existing — the width-driven route into the index
tier has always produced it — and recorded now because 161 makes that tier meaningfully more
common, which is what made it visible in the browser pass. One line of CSS, but it is a visual
change to a printable sheet and was not part of the design the user approved, so it is filed
rather than folded in.

**CLOSED 2026-08-31, same day, at the user's request.** `.cutlist-layout-key` now sets
`list-style: none` and `padding-left: 0`.

**What it turned out to be is better than "a stray bullet": it was the ONE list in the app
that never got the reset the other four have.** `.parts`, `.guides`, `.cutlist-rows` and
`.cutlist-setup` all carry `list-style: none` with `padding: 0`. This one carried neither, so
the fix is the app catching up with its own idiom rather than a new opinion about how a key
list should look — which is also why it needed no design question of its own.

**The `<ol>` version was considered and rejected, and the reason is the same one that shaped
161.** Making the list an `<ol>` and dropping the `n. ` prefix would let the browser number
the entries — but the number inside the part's rectangle comes from `nextIndex`, so the two
numbers would then have **two deciders**, agreeing only while DOM order and counter order
happen to match. One counter, printed in both places, is the point. `styles.css` carries that
as a prohibition at the rule rather than as a note here.

**`padding-left` went with the marker rather than surviving it.** It existed to make room for
a disc; with no disc, zero puts the key's left edge on the same pixel as the `Sheet n` caption
and the drawing — measured at 453px for all three, not eyeballed.

No unit test: this is CSS, which is the same class as the viewport — verified by driving a
real browser, not by asserting on a stylesheet. The pass used a **two-entry** key list (a
fourth turned part added to 161's fixture), because a one-line list can show neither alignment
nor numbering. Print carries the change unchanged: the `@media print` block sets `color` on
this class and nothing else. Addendum in `docs/browser-verification-turned-index.md`.

**Status:** closed. (triaged 2026-10-16)


**163. `FACE_AXES` discarded the SIGN of each UV axis, so a solid's sub-range landed on the
wrong side of its face.** Reported as "when a plywood board is on end, the layers don't draw
correctly — the middle layer is too wide and the outer layers are too narrow", then narrowed
by the user to "only on plywood boards when I add a cut", which is what made it findable.

**CLOSED 2026-08-31, same session, by a two-line change in `boardUVs` plus the sign in
`FACE_AXES`.** `docs/browser-verification-ply-cut-uv.md` carries the measurements and the
before/after image.

**The mechanism.** `FACE_AXES` recorded which world axis each of `BoxGeometry`'s default UV
axes runs along and threw away which way it runs, with a comment saying why: *"signs are
irrelevant — grain is mirror-symmetric, so all that matters is which axis carries u and which
carries v."* True of a whole board, false of a solid. `boardUVs` looks a SOLID up in the
BOARD's tiling (invariant 17), so a solid's span is a sub-range, and reversing the axis puts
that sub-range on the wrong side of the face. On a 3/4in panel with a 1/4in dado the two
solids meeting at the split plane handed each other **v = 0 from one side and v = 1 from the
other** — the outermost ply butted against the innermost, one double-width light band mid-
stack and a part-ply at each edge, which is the report verbatim.

Three of the box's twelve UV axes run backwards (`+X`'s u, `+Y`'s v, `-Z`'s u), so three of
six faces were wrong on every board ever drawn. Four things hid it at once and all four have
to be true: an uncut board shows the whole tile either way; solid wood's figure is
near-random, so a mirror reads as a different board rather than a wrong one; MDF has no
structure; and plywood's edge is the ONE texture in this app where **position within the tile
carries meaning**. Plywood plus a cut is the only combination that shows it.

**Read this before writing another UV test: EVERY range assertion in `grainTiling.test.ts`
was blind to it, and a 48-case sweep written during the diagnosis passed with the bug live.**
The sweep asserted `tileInches[1] === thickness` — a SCALE — and the defect was a DIRECTION.
A reversed axis maps `[0, 1]` to `[1, 0]`: same span, same min, same max, mirrored content.
This is 155's shape arriving in a new place, and the general form is worth carrying: **a test
that reads only the extremes of a mapping cannot see the mapping.** What catches it is one
number — `uv - position / tileInches`, `boardUVs`' additive constant — asserted identical for
every vertex of every solid of a board. A reversed axis makes it vary WITHIN a face; a solid
in the wrong half of the tile makes it differ BETWEEN solids.

**The ordering in the fix is load-bearing, and it is the half a tidying pass gets backwards.**
A sign belongs to the pair (face, GEOMETRY axis), which is the same thing as the drawn u/v
only when `swap` is false. The flip therefore happens BEFORE the swap; flipping after it
applies `+X`'s u sign to the drawn v, which is precisely the upright faces the defect showed
on. Mutated: that version reds four tests, the no-flip original reds six, one wrong sign in
the table reds five.

**Both new tests build a real `THREE.BoxGeometry` rather than a fixture**, and that is the
point rather than a convenience — the vertex layout and default UVs belong to three.js, a
fixture would be this module's own belief about them, and this module's own belief about them
WAS the bug (invariant 23). No WebGL is involved, so it stays inside the no-unit-tests-for-the-
viewport rule.

**One thing changed that nobody asked for, recorded rather than left to be found.** The fix
mirrors the drawn texture on `+X`, `+Y` and `-Z` for every board, cut or not. Invisible on
plywood edges and streaky faces. Visible on **wood end grain**: the ring pattern's pith sits
off-tile at v = 1.8, so flipping `+Y`'s v moves it to -0.8 and the arcs curve the other way.
Before, a board's `+Y` and `-Y` ends disagreed with each other; now they agree.

**A separate, measured, NOT-fixed finding from the same session, filed here rather than acted
on.** At a realistic 3/4in thickness the five plies are hard to read even when correctly
placed: the boundary rules are 2 px in a 512 px texture, so they are sub-pixel at any real
board size and vanish; what survives is a 0.10-alpha alternation, a 7% step (255 vs 236); and
the mesh's own `lineSegments` outline covers a share of the OUTER plies only — on a ~20 px
edge, 1 px each side is roughly a quarter of each outer ply. **The user was shown this and
said the layers look even to them, so it is open by decision, not by oversight.** Any remedy
is a taste call about how a plywood edge should read and wants asking first, the way 161 was
asked.

**Status:** closed; the ply-legibility residue is open by decision (do not re-open unasked). (triaged 2026-10-16)

## From the Generate round — 2026-10-03

**164. The generations in one batch converge on the same design, and variety was the point
of phase 1.** The user chose to build variety and exploration first (option C) and joinery
second. In the live pass, three Sonnet 5.5 side tables (oak, Mid-century, Detailed) came
back **essentially identical**, differing only in stretcher width. The two Opus bookcases
were only "slightly different". The cause is structural: every run in a batch sends the
same system prompt and the same user message, so the only source of difference is sampling.
**Hypothesis, not prescription** (the fifth shape in CLAUDE.md): give each run in a batch a
distinct direction, such as a variation index plus a short "make this one differ from a
typical design in X" line, or one call that plans N contrasting concepts and then one call
per concept. Measure before adopting either. Both cost something: the first needs an axis
of variation that does not fight the user's own style choice, and the second adds a call
per batch. **This is the strongest candidate for the next round** because it touches the
round's stated purpose. Ask first.

**CLOSED 2026-10-03 by the batch variety round, using the remedy it named second, and the user
judged the result live.** A batch of 2–3 now makes ONE planning call
(`src/generate/concepts.ts`) for N structurally contrasting concepts. Each run gets its
concept as one line at the end of its first user message, so `SYSTEM_PROMPT` stays a fixed
prefix and repairs carry it for free (invariant 37). A batch of 1 is unchanged and pinned
by a literal. The first remedy named above, a per-run variation hint, was rejected at
design time, and it survives only as the fallback roles. The reason: a run designing alone
cannot see what its siblings chose, so "be different" converges again on the second most
obvious idea. Only something that sees all N at once can make them contrast.

The live pass (`docs/browser-verification-batch-variety.md`) re-ran the exact batch that
failed: oak, Mid-century, Detailed, 3, Sonnet. It produced a case on a leg frame, a
trestle, and a cantilevered spine. A second batch, an Opus bench, produced four legs,
slab ends, and a trestle with a backrest. All six completed first time, for ≈ $0.20.

**What a later round could reopen, and why it was not acted on.** Bench A (four legs) and
Bench B (slab ends) are structurally different but read alike from above: a long plank
seat over aprons in both. The planner can also return near-identical concepts, and nothing
rejects them. Both were seen and set aside: the user judged the batches distinct, and a
duplicate check would be code for a case not yet observed. If a future live pass shows
duplicates, the cheap remedy is a re-ask with the duplicates named, inside `planConcepts`.

**Status:** closed. (triaged 2026-10-16)

**165. `checkDesign`'s support rule is topological, not structural, and the user found a
piece it passes that is not properly supported.** The workbench (Sonnet 5.5, Shop,
Moderate) passed every check after one repair, and the user judged one piece "not quite
supported properly". By construction, support means a chain of FACE contacts (overlap more
than `TOUCH` on two axes, coincident on the third) down to the floor. Any face contact
counts, however small and wherever it sits. So a long rail resting on a 1/8in corner of a
leg, or a shelf hanging off one cleat at one end, is "supported". **The specific piece was
not inspected**, so which of these it was is unknown. Read the design out of the user's
library before theorising. Candidate rules, each with a cost: a minimum contact area
relative to the part; a centre-of-mass-over-contact test; or requiring support at two
separated points for a part longer than N inches. Any of them makes a repair round more
likely, and each repair round costs money.

**CLOSED 2026-10-03 by the held and stable round, judged by the user live.** The workbench
was read before any rule was chosen, as this entry asked. Its lower shelf sat **under** the
four low rails (y 5.25–6.0 against rails at 6.0–9.5). The rails were also outside its plan
outline, so it met them along lines only, and it hung by four 0.75 × 2in patches against the
legs' inner faces, with nothing under it. The obvious rule, "held between two parts",
**passes it**: legs touch both of its ends. What is wrong is coverage, 19% of each end. That
measurement is what shaped the rule. `checkDesign` now has:

- **`hangs`**: a part off the floor must be held (a) resting, (b) between two parts that
  cover ≥ 50% of each opposite side, or (c) lapped on a broad face.
- **`tips`**: the grounded parts' volume-weighted centre of mass must sit at least min(1in,
  s/4) inside the floor footprint's hull.

Invariant 39 carries the rules. **Three user rulings shaped (c), each one closing a hole a
reviewer proved by probe**, not by argument:

1. A crate set on the hanging shelf "held" it, so the top face stopped counting.
2. That failed cleats under a seat and steered repairs to a non-fix, so a top-face contact
   counts again, but only when the part above is held without this part.
3. A box or two lapped uprights standing on the shelf then held each other, so the part
   above must also still reach the floor without this part.

The live pass (`docs/browser-verification-held-and-stable.md`):
- The same workbench request now puts the shelf **on** the stretchers, first time.
- The side table batch that produced the spine cantilever produced a plinth cabinet instead.
- All four designs check clean against the shipped code.
- No `hangs` or `tips` message was ever sent.

**Status:** closed. (triaged 2026-10-16)

**166. Centring a design whose coordinates are near 1e307 overflows.** This is ruling 19
from the round's ledger. `designToDocument` translates the design onto the floor and
centres it; for parts near the top of the double range the translation sum overflows. The
finiteness re-check after snapping (`3600252`) catches the snap case but not this one. Real
model output does not reach these values, and the failure is loud: the generation fails
with an odd message instead of writing garbage.

**Status:** closed — fixed: `MAX_MAGNITUDE` rejects it (generated.ts); `rejects a loose part at 1.1e307 (centring overflow) and keeps the rest (F3)`. (triaged 2026-10-16)

**167. Prompt caching was never observed working.** The system prompt carries
`cache_control`, but it is probably below the minimum cacheable prefix for both models. If
so, every repair call pays full input price for the system prompt and the growing history.
The live pass did not log usage, so `cache_read_input_tokens` was never seen. Measure it
with a temporary usage log on a repair round. If it is zero, the remedy is a cache
breakpoint on the last history turn as well: the history is append-only (invariant 37), so
it is a clean prefix.

**The live pass's console usage makes this LOW VALUE** (`docs/browser-verification-generate.md`).
Input was 20,101 tokens across eleven calls, $0.046 of a $0.19 total, against $0.149 of
output. Opus's first calls averaged about 1,380 input tokens, so a fully cached repair round
would save a fraction of a cent. Output is 77% of the spend. Any cost work should look
there first: the effort level, the thinking share of the output, and whether repairs could
send a delta instead of a whole design. Do not spend a round on caching.

**The premise was WRONG, and the batch variety live pass measured it** (2026-10-03,
`docs/browser-verification-batch-variety.md`). The system prompt **does** cache: every
side-table run read 1,271 cached tokens, because the user's earlier single run had written
the cache minutes before. What does not cache is the **cold parallel start**. Every bench
run read 0, because all three started together before any had written the cache, and each
paid to write it. So the entry's question "is the prefix long enough?" is answered yes. The
live gap is narrower: a batch's runs could share one cache write if one run (or the planning
call, if it shared the prefix) went first. At these prices that is still well under a cent
per batch, so the LOW VALUE verdict above stands; only its reason changed.

**Status:** closed — moot: caching was later observed working. (triaged 2026-10-16)

**168. The cost estimate has not been checked against a real bill, and loses money on two
paths.** The live pass did not record the per-row estimates. The console's token counts
priced at the app's own rates give $0.075 for the Opus pair and $0.120 for the Sonnet four.
Compare those with the billed dollars once the console shows them; a mismatch means the
price table is wrong, not the arithmetic. Separately, the cost of any
calls made before an `LlmError` (auth, rate limit, network) is dropped rather than reported,
because `RunFailed` carries usage and `LlmError` does not. A sub-cent run also prints
"≈ $0.00", which reads as free.

**Status:** closed 2026-10-16 (follow-ups 3): a failed Generate or Refine run prices what it spent before the error (`spentOnFailure`, run.ts: a `RunFailed`'s usage or `spentBefore`; null when nothing was spent), and a run under half a cent reads `< $0.01` (`formatCost`, estimate.ts, the one run-cost string). Joinery already reported its fallback's usage. The bill comparison is superseded by fu 236's measured ranges. Mutated: both halves red. (triaged 2026-10-16; updated by follow-ups 3)

**169. Deferred minors from the round's reviews, each judged not worth a fix round:**

- The edge-contact hint text in `repairMessage` could say more plainly that an edge or
  corner touch is not support.
- `batchSize` is fixed when Generate is clicked, so changing the radio mid-batch does
  nothing until the next batch. That is correct, just unexplained.
- A mid-stream `api_error` that `toLlmError` does not map lands in `'other'`, not in the
  *try again shortly* class a 5xx gets, so the message does not tell the user a retry may
  work.
- Starting a new batch replaces the previous batch's rows in the dialog. The projects
  themselves are untouched.

**Status:** open (hygiene, low): the minors stand. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): a mid-stream `api_error` (no status) now maps to the retryable server-error class (`toLlmError`; two tests, red first). The other three are record-only: the repair hint is MODEL-facing text (not reworded unasked), batchSize-at-click is correct, and replacing the previous batch's rows leaves its projects untouched.

**170. The Generate dialog's form layout is off in two places (cosmetic).** From the
browser-pass screenshot (`docs/img/generate-dialog-no-key.png`):

- The *Generations* legend is a `<legend>` in the body face, white and sentence case. Every
  other field label uses the uppercase monospace label style, and the 1/2/3 radios spread
  across the row with small digits.
- The max width/depth/height row puts three labels and three inputs into the width the
  other rows give one control, so the labels leave the label column and the inputs are
  narrow.

Both are CSS in `.generate-*`. Neither affects function.

**Status:** closed — superseded by the ui-polish round's dialog layout. (triaged 2026-10-16)

**171. Phase 2: refine and joinery, the planned successor to this round.** Option B from
the design discussion: take a generated design and sharpen it, adding real joints as
`Cut`s and fixing proportions. **Invariant 38 is the trap to read first.** `overlap` is
phase-1-only: phase 1 forbids parts interpenetrating because nothing accounts for it, and
phase 2 must relax that to "overlap not accounted for by a cut", deliberately and in one
place. Also wanted before it: 164, since refining one of three identical designs is less
useful than refining one of three different ones.

**2026-10-04: joinery is built (Add joinery…).** Refine by instruction is
now follow-up 179.

**2026-10-04: the stopped cuts round landed first.** A `Cut` can stop short of either end of
its `across` dimension (`stopMin`/`stopMax`, schema v7), so mortises, through mortises and
stopped dados exist. The "overlap not accounted for by a cut" rule can be written against a
tenon sitting in a mortise rather than only in a through slot. Angled and round joinery are
still out.

**Status:** closed (shipped: joinery 2026-10-04, refine 2026-10-09). (triaged 2026-10-16)

**172. A design-quality eval set.** The live pass is three prompts judged by eye. Tuning the
prompt, the effort level or the repair messages (164, 165, 167) needs a fixed prompt set and
a grading rule, or every change is judged on a different sample. Costs real money per run,
so get approval for each run.

**Status:** open (owed to the user: paid eval runs). (triaged 2026-10-16)

**173. Settings deferred by decision during the design discussion:** a budget cap per batch,
"use what I have" (generate from a stock inventory), and providers other than Claude. The
`LlmClient` interface in `src/llm/types.ts` is the seam for the last one. `LlmMessage` is
opaque precisely so a second provider cannot be made to share the first one's turn shape.

**Status:** record-only (by decision). (triaged 2026-10-16)

## From the batch variety round — 2026-10-03

**174. Settings accepts text that cannot be an API key, and the error that follows hides the
API's reason.** In the live pass, three pastes into Settings were saved and then rejected
by the API, one call each. One was 248 characters with whitespace and non-ASCII characters
inside it. Settings already trims the ends; it does not look at the middle. Two remedies,
**hypotheses, not prescriptions**:

- Refuse on Save a key with inner whitespace or characters outside printable ASCII, with an
  inline reason.
- Carry the API's own message into the auth error ("API key was rejected — check Settings.
  (API key is invalid.)"). `toLlmError` already does this for `'other'` errors, and auth is
  the case where it would have helped.

**Do NOT check a prefix.** During diagnosis Claude claimed standard keys start with
`sk-ant-api`, and the key that then worked does not. A prefix rule would have refused a
valid key. The live pass records the correction.

**CLOSED 2026-10-03 by the key check round, using both remedies the entry named plus a
third**, `docs/browser-verification-key-check.md`. Measured first, as CLAUDE.md asks of a
named remedy. Of the three bad pastes, a shape check alone catches only two: the 212-character
key was well-formed and simply invalid. So Save also verifies a newly typed key with a free
`GET /v1/models?limit=1` (`checkAnthropicKey` in `llm/anthropic.ts`, beside the client):

- **401/403:** the key is refused, and the API's reason is shown.
- **Anything else** (offline, rate limited, overloaded): the key is saved, with a note.
  A network blip must not stop someone saving.
- **Changing only the model** skips the check.

The shape rule is "one run of printable ASCII", with **no prefix rule**: the key that worked
in the batch variety pass does not start with `sk-ant-api`, and a deliberate mutation adding
a prefix rule turns six tests red. **One test case was corrected while writing it:** a line
break cannot be the bad character, because a single-line `<input>` strips LF and CR itself,
so the test uses a tab.

**Status:** closed. (triaged 2026-10-16)

**175. Deferred minors from the batch variety round's reviews**, each judged not worth a fix
round:

- `FALLBACK_CONCEPTS`' test pins the titles but only checks that the briefs are non-empty,
  so editing a mandated brief would pass.
- No test asserts that the abort signal reaches `complete` inside `planConcepts`. The
  end-to-end cancel tests exercise it.
- Two hook tests keep a local `let calls` that shadows the file's new `calls(c)` helper.
- The fallback `it.each` covers `overloaded` only, of the five non-auth error kinds. All
  five share one branch.
- The plan line has no `role="status"` or `aria-live`. The rows have none either.
- `.generate-run-concept` has no wrap rule. Titles are capped at 40 characters.
- **A throw from `client.estimateCostUsd` after planning now escapes the batch's async
  block** and would leave the batch live until a reload. Previously a throw there was
  silently swallowed into a fallback, which the final review moved it out of. It is
  unreachable today, because `AnthropicClient.estimateCostUsd` is arithmetic that returns
  `null` for an unknown model. It only matters for a future client whose cost function can
  throw.

**Status:** open (test gaps / hygiene, low): the minors stand. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): a throwing `estimateCostUsd` no longer strands a batch (`costOf` → null; test red first: the batch stayed live); the fallback briefs pinned verbatim; `planConcepts` pins the caller's signal; the four non-auth, non-cancel kinds each fall back; the shadowed `let calls` renamed; the plan line is `role="status"` and the run list `aria-live="polite"`. Every change mutated. `.generate-run-concept`'s wrap rule stays record-only (titles are capped at 40).

## From the held and stable round — 2026-10-03

**176. Known limits of `hangs` and `tips`, recorded rather than coded**, each a judgement that
the case is unseen or by design:

- **Mutual lapping.** Two panels glued face to face, each touching the posts by a sliver, are
  each "held" by the other through (c). Nothing in either is anchored. The generator has not
  produced it.
- **Coverage is summed, not unioned.** Two contact rectangles that overlap on one face count
  twice toward 50%. It is capped at 100%, and it is reachable only when the touching parts
  themselves overlap, which is already its own violation.
- **Square-section parts are held by any side contact.** The broad-face tie rule makes all
  four long faces of a square leg "broad". This is spec-intended.
- **Edge-attached trim hangs by design**: breadboard ends, a corner shelf with one end on a
  side and its back edge on a back panel, and edge-on cleats. Edge contact does not hold,
  and (b) needs a same-axis pair. Watch for these in a Detailed live run; if they keep
  costing repair rounds, (b) may need to accept perpendicular pairs.
- **Corner regions in `tips`.** When the centre of mass is outside near a hull vertex, `|d|`
  is the distance to the farthest-violated edge's line, which is less than the true
  distance. On an edge tie the first hull edge wins, so the direction can read `-Z` where X
  was as plausible. Both follow spec §4, or the spec is silent.
- **The degenerate-hull branch is unreachable**, because every box has positive extents. Its
  wording does not say "beyond" as spec §4 does.
- **One-word part names in two test helpers.** The `names` helpers in the `hangs` tests take
  the message's first words, which assumes one-word part names.

**Status:** open (known limits). (triaged 2026-10-16)

**177. A live round trip of a `hangs` or `tips` repair has not been seen.** In the live pass,
five design calls drew no message from either rule: the model obeyed the two prompt lines
up front. The checks and their exact messages are unit-tested (the user's own workbench is
a fixture, and its message text is pinned), but whether the model *repairs* well from
"X sides are covered 19% and 19% …" is unobserved. The next paid run that triggers one
should record the round trip. Chasing it with extra batches was judged not worth the money.

**Status:** open (owed: a live repair, a paid run). (triaged 2026-10-16)

## From the stopped cuts round — 2026-10-04

**178. A cut a board shrink has left with no stock to remove is still printed.** Shorten a
board under one of its cuts and the cut can end up removing nothing: a stopped cut whose
stops now cross, or a dado whose offset now lies past the board's end. The 3D view correctly
shows no cut, but `cutLabel`, the setup line and the diagram still describe it — a "3/4"
mortise … stopped 3" short of the min end and 2" short of the max end" on a 2" board, or a
phantom dado "20" from the length min end" on a 10" one. The loader drops such a cut on the
next load, so it lasts only for the session. The phantom dado predates the stopped-cuts round;
stops add a second way in. **Open by decision, for the user:** the remedy is a design choice
— hide the cut from the sheet, flag it on the row, or drop it at the edit — and none was
chosen. A shared "region is empty" test in `cutlist.ts` and `diagram.ts` is the obvious
mechanism whichever is picked.

**CLOSED 2026-10-04 by the phantom-cut round, using the user's pick: hide it from the sheet
and flag it on the row.** Dropping it at the edit was rejected, because shrinking a board and
growing it back is ordinary while sizing a part, and dropping would lose the joint.

- **One test decides it.** `cutRemovesNothing(board, cut)` in `cuts.ts` is true when the
  cut's box, CLIPPED to the board, has no volume.
  - Clipping is the point. `cutRegion`'s all-zero sentinel covers crossed stops, but not an
    offset past the end.
  - It is written as `!(span > 0)`, so a NaN span counts as empty, which is what
    `boardSolids` makes of it.
  - It is asserted equal to "the solids are the whole board" for every case, in both
    directions. The first version of that test never called the predicate (a review
    finding).
- **Its readers:**
  - the cut list's setup lines and its row signature, so a board carrying such a cut groups
    with an identical clean one;
  - the diagrams;
  - and, at the user's word after the review, the snap points. Invariant 16: a cut that
    removes nothing draws nothing, so it offers nothing. Before, a cut sitting exactly at the
    board's end put shoulder points on the end face.
- **What it does not touch:** the document, the 3D view, `boardUVSignature` (growing the
  board back must rebuild the geometry), nesting and board feet.
- **Properties.** The row keeps the cut and its fields, and shows a note: "This cut no longer
  fits the board and removes nothing. It will be dropped when the project is reopened." The
  last sentence is true: the loader drops every case the predicate reaches in the app. The
  row's label still names the stored shape ("Dado"), which the user saw live and passed.
- **Live pass:** `docs/browser-verification-phantom-cut.md`.

**Status:** closed. (triaged 2026-10-16)

## From the joinery round — 2026-10-04

**179. Refine by instruction.** Phase 2's other half: a box for change requests ("shelves 2in
lower", "thicker legs"), the model editing the design, and the existing checks. Chosen against in
favour of joinery first; it reuses `runRepairLoop` and `checkDesign` unchanged.
- **Status:** CLOSED 2026-10-09 by the refine round (`docs/superpowers/specs/2026-10-09-sloyd-refine-design.md`): fresh prototypes only; designs with joints are refused (a later round could lift that).

**180. A tenon prints as four "rabbet" lines.** `mortiseTenon` cuts the waste around a tenon as
up to four `pocketFor` boxes, and `cutLabel` names each by its shape, so a tenoned rail's cut list
reads "rabbet" four times per end. The geometry is right; the word is wrong. A "tenon" label (one
line per end, naming length and thickness) is wanted, and would need either a grouping step in the
cut list or a cut kind the vocabulary does not yet have.
- **Status:** CLOSED 2026-10-04 by the cut-words round. `findTenons` recognises a tenon from its end cuts; the sheet prints one line per tenon and Properties labels each shoulder `tenon shoulder`.

**181. A rabbet stopped at both ends prints as "stopped dado".** The cut vocabulary has no word for
an edge rabbet stopped short of both ends, so `cutLabel` falls through to the nearest shape it
knows. Reported by the final review; not re-observed in this fix wave. Needs a word, not a
geometry change.
- **Status:** CLOSED 2026-10-04 by the cut-words round. Words now come from the clipped box's opening, so one box gets one word whatever its stored fields. The joinery Top's back rabbet, this entry's example, now reads `stopped rabbet`. Refined after the live check by §2.4 (a side is open when no stock remains): the joined bookcase's housings into the back rabbet now read `dado`.

**182. A dado stopped at the back next to a back rabbet.** Since the final-review fix (rabbets run
before end-into-face), the DEFAULT bookcase reaches this path: each shelf is trimmed for the back
first, so its dado in each side stops 1/4in short of the back edge and prints as "stopped dado".
Measured with the reviewer's void script, the default case leaves no gap — the side's rabbet
already removes that 1/4in — so this is mostly a word: the dado effectively runs out into the
rabbet. A stopped dado chosen to stop at the back (`-Z` in the reviewer's bookcase) still leaves
small voids where the top and bottom meet the sides (0.023 in³ per joint, unchanged by the fix).
- **Update 2026-10-04 (cut words round):** the WORD half is gone. "Open" now means no stock left
  (`openSides`), so the default housing that runs out into the back rabbet prints as a plain
  `dado`. The voids in the back-stopped case remain; **status: open, low** for that half.
- **Status:** CLOSED 2026-10-05 by the joinery residues round (branch `joinery-residues`). The voids
  were one root cause, ORDER: each rabbet site cut its receiver's pocket against the panel as it
  stood at that site, so a side's rabbet ran full height and a later top/bottom rabbet trimmed the
  back off its end, leaving an unfilled pocket (in the cabinet 1/8 × 1/4 × 3/8in, 0.0117 in³ a
  corner). It also hit the cabinet live-checked in the joinery fixes round, the drawer (0.0078 in³
  a side) and the 72in bookcase (0.0234 in³ a side), and
  `checkDesign` cannot see it. A panel's rabbet sites on one face are now ONE unit, resolved from
  its FINAL box (moved, then trimmed to every receiver's rabbet line), and every pocket is cut
  against that box: zero voids in all 120 listing orders of the cabinet and in the bookcase with
  default, −Z and +Z stopped housings. The sides now print `stopped rabbet` (user-accepted).

**183. A part on the panel's OUTER face is left floating after a rabbet.** The rabbet moves the
panel toward its receivers by its own thickness; anything fastened to the panel's outer face (a
cleat, a French-cleat rail) stays where it was and now hangs in air. Only `butt` clears the new
`hangs`. The recipe could carry outer-face parts with the panel; not done.
- **Status:** CLOSED 2026-10-05 by the joinery fixes round, the user's ruling (outer-face chain): when a rabbeted panel moves, the parts butting its OUTER face move with it, transitively outward (never the panel's own receivers; reachable with a panel rabbeted on both faces, now tested). Carried parts are listed in `moved`. A carried part that would hit something makes the site a skip, decided BEFORE any trim, move or cut. Also seen by the final review: a drawer bottom on skids now carries the skids and the re-ground runs. The ledger's description was partly off: the symptom measured as `unsupported`, not `hangs`.

**184. `moved` is misleading after a re-ground.** When a rabbeted bottom lifts the piece and
`applyJoints` lowers everything back to the floor (§4.7), every part has moved in the world, but
`moved` still lists only the parts a recipe moved relative to the others. The dialog's wording
should say "moved relative to the rest", or the list should be computed after the re-ground.
- **Status:** CLOSED 2026-10-05 by the joinery fixes round: `JoinResult.lowered` carries how far the re-ground lowered the piece; the dialog says "Moved relative to the rest: …" and, when it happened, "The whole piece was lowered <len> to sit on the floor again." A lift reports 0 (see 202).

**185. A three-layer half-lap stack abandons or skips a lap — STILL OCCURS after the final-review
fix.** Re-checked with A (X), B (Z) on A, C (X) on B, all 3/4in, every crossing a half-lap. Listed
C, B, A: C laps into B, then B drops into A and leaves C's lap behind (C reports `hangs`). Listed
A, B, C or B, C, A: B drops first and C's site is skipped ("no longer meets"), so C is
`unsupported`. Identical before and after the fix, because crossings keep site order among
themselves. A stack needs the drops computed together, or the upper part dropped with its partner.
- **Status:** CLOSED 2026-10-05 by the joinery fixes round. Crossings now run BOTTOM-UP (sorted by the entering part's original min on its axis, grouped by axis), so a part is final before anything drops onto it and every part moves once; identical across all six listing orders (also probed on X). Half-laps no longer need contact: they need to still cross in plan with R wholly below E, and a swept-volume check (`overlapsBeyondTouch`) over the whole drop replaces the butting-face blocker. A "carry riders" design was rejected because a part with two lap partners would be carried twice. Found while probing: a stack whose top and bottom parts share one footprint used to finish with NO violation and two empty notches; it is now a skip with a reason.

**186. Smaller residues from the joinery final review.**
- **The shelf's cut-list word depended on board order — GONE after the fix.** Before, a bookcase
  with the back listed last printed the shelf's housing as "dado" and with it listed first as
  "stopped dado". With rabbets always first, both orders print "stopped dado" (see 182); since the cut words
     round both print `dado`.
- A narrow inset back leaves a 1/8in slot (reported by the final review; not re-observed here).
- `problemKey` joins part names with commas, so a name containing a comma can collide with a pair.
  Harmless today; worth a separator that cannot appear in a name.
- A joinery move (a rabbet's panel, a half-lap's drop) can raise a NEW `tips`, which is then
  blamed on the joinery. See 176/177 for the limits of `tips` itself.
- **Status:** CLOSED 2026-10-05 by the joinery residues round (branch `joinery-residues`).
  `problemKey` is now `JSON.stringify([kind, sortedParts])`, so no part name can collide with a
  pair. The 1/8in slot was NOT reproduced: the inset-back fixture was clean on master and still is.
  Its description matches the shape of 182's 1/8in-wide pocket, which is gone, but that is not
  evidence it was the same thing. The blamed `tips` is closed by decision, the user's ruling: the
  joinery caused it, so blaming the joinery is correct.

**187. On growth, a cut that runs out at the moving end keeps running out — an amendment to
§4.7 that NEEDS THE USER'S RATIFICATION.** The final review ruled that `resize` rebases a part's
existing cuts (min end: `offset`/`stopMin += amount`; max end: `stopMax += amount`). Applied
literally together with "rabbets before end-into-face", the DEFAULT bookcase regressed: the bottom
and top are rabbeted for the back first, then grow 1/4in into the sides' dados, and the rebase
left their full-length rabbets stopped 1/4in short of each end — printed as "notch" — with the back
driving 1/4in into each grown end (also Bookcase2: the sides growing up into the top). The fix
wave added one rule in `rebaseCuts`: when a part GROWS, a cut that runs out at the moving end (a
zero stop there, or a position span reaching that end) grows with it; a cut that stops short of
that end still stays put in the world, which is what keeps a tenon in place. Shrinks are unchanged
(they clip). Pinned by the bookcase tests in `recipes.test.ts`; removing the rule reds three of
them. Physically it is the right reading of "runs out", but it is a deviation from the ruling's
literal formula, so §4.7 should be amended or the rule reverted by decision.

**CLOSED 2026-10-04.** The controller signed off the rule, and spec §4.7 is amended. The
re-review then found that the POSITION-axis half was wrong:
- **The case:** a housing flush with an end holds a part that sits AT that end, and that part
  does not move when the board grows.
- **The failure:** extending the housing made the geometry depend on document order. A footed
  case side printed a "1-7/16″ rabbet" instead of a 3/4″ dado, and left a hidden void.
- **The decision:** the user approved dropping that half (commit `d55f1ab`).
- **What remains:** only the `across` half. A through cut keeps running out along its across
  axis, and a cut positioned flush with an end stays where it is.
- **The tests:** the footed side in both listing orders, plus a grooved-back ordering test.
- **Later (follow-up 199, 2026-10-05):** the rule now reads the cut's SHAPE, not its stored
  form: `rebaseCuts` re-stores each cut via `storedAsShape` (judged before the growth) before
  applying it, so "runs along the growth" and "positioned at the end" no longer depend on storage.
**Status:** closed 2026-10-04 (the `across` half kept; the position half dropped by the user, `d55f1ab`; fu 199 reads the shape). (triaged 2026-10-16)

**188. The default tenon cap's edges.** I1 caps a default tenon 1/16in short of another default
tenon's cross-section inside the same part. Three recorded limits: the cap rounds DOWN to 1/16in
(so rounding cannot eat the clearance); when the cap falls below the range's 1/2in floor, the clamp
wins and the two tenons still meet, which the check then reports; and the cap ignores how far the
OTHER tenon actually reaches, so it can shorten a tenon whose neighbour is too short to meet it.
- **Status:** CLOSED 2026-10-05 by the joinery residues round (branch `joinery-residues`), the
  user's ruling, defaults only: a cap under the 1/2in range floor no longer loses to it. The
  default's floor drops to 1/4in, and a cap under 1/4in makes the site a butt. Measured overlaps
  that motivated it, on the old defaults: opposite rails into a 3/4in post 1/4in, a 7/8in post
  1/8in; adjacent corner legs 7/8in 3/16in, 1in 1/8in, 1-1/8in 1/16in. Now each gets 5/16, 3/8
  (opposite) and 1/4, 5/16, 3/8 (adjacent), pinned exactly; a 3/4in corner leg butts. The model's
  range and the prompt are unchanged; a model tenon with NO length at a butt-default site takes
  the default choice (butt) with a note rather than the 1/2in floor. The third limit (the cap
  ignores how far the other tenon reaches) stands: it only shortens.

**189. A shelf housing closed at both ends prints as "mortise".** This was seen live on a
generated bookcase, whose back panel sat between the sides.
- **What happens:** the model stopped each shelf's dado at the front. Each shelf also ends 1/2″
  short of the sides' back edge, so the pocket is closed at both ends. `cutLabel`'s table (the
  stopped-cuts round) therefore calls it a `mortise`.
- **Geometry vs. word:** the geometry is right. A woodworker would call it a blind (stopped)
  dado. A mortise is a pocket for a tenon, not a housing for a whole board's end.
- **Possible discriminator:** the pocket's width along the position axis compared with its length
  (a housing is long and shallow, a mortise narrow and deep), or the receiving part being a
  panel.
- **Status:** a cut-list vocabulary question for the user, in the same family as 180 and 181.
- **Status:** CLOSED 2026-10-04 by the cut-words round. A closed pocket is named by its proportions, giving `blind dado` for a shallow housing. Refined after the live check by §2.4 (a side is open when no stock remains): the joined bookcase's housings into the back rabbet now read `dado`.

**190. Rails entering one post from OPPOSITE faces collide on the defaults.** A centre post or
long-bench middle leg has rails tenoned in from both sides at one height.
- **The numbers:** each default tenon is 1-3/16″, so together they need 2-3/8″ in a 1-3/4″ post.
- **Why the cap misses it:** I1's cap only looks at ADJACENT faces (`o.axis === k` is skipped
  by construction).
- **The fix would be** to cap each to under half the post's depth when the opposite site exists.
- **Reach:** the model can still choose well, and the repair loop catches it. Only the
  fallback, which builds the defaults and never repairs them, delivers the overlap.

Also seen live, and not a defect: on a hand-built corner leg, the model avoided the
adjacent-tenon collision by itself, choosing 11/16″ tenons. So no repair round ran, and the
joinery repair path has been seen only in unit tests, the same as 177 for `hangs`/`tips`.
- **Status:** CLOSED 2026-10-05 by the joinery fixes round, defaults only (prompt unchanged by user ruling): default tenons from OPPOSITE faces of one receiver, with cross-sections overlapping on both in-plane axes, are capped at down(depth/2 − 1/32), 13/16″ each in a 1-3/4″ post, combined with the adjacent cap by min. The 1/2″ floor still wins under about 1-1/16″ (188's limit). Reachable only through the fallback defaults, so unit-verified only.

**191. `findTenons` compares span edges exactly.** It groups ℓ within `FLUSH_EPSILON`, but its
remaining-rectangle split compares the cuts' span edges with `===`.
- **What happens:** two hand-made cuts meant to abut, but a few ULP apart, leave a sliver of
  uncovered cells. The tenon goes unrecognised and prints as shoulder lines.
- **Reach:** recipe output is unaffected. Its spans come from one box, and its shoulders overlap
  the cheeks rather than abut them. Not reachable through joinery.
- **Status:** CLOSED 2026-10-05 by the joinery residues round (branch `joinery-residues`):
  `remainingRectangle` merges breakpoints within `FLUSH_EPSILON` (invariant 22's rule; stored
  values stay exact), and one merged into the far end is the end itself. Cheek halves 1e-12 apart
  now read as a tenon; a real 0.01in gap still does not.

## From the cut words amendment — 2026-10-04

**192. The setup line is written from the cut's stored fields, not its shape.** The cut-list
setup line (`setupLines`) still describes a cut by its stored `stopMin`/`stopMax`, while the
word (`cutLabel`) now comes from the clipped box's opening (spec §2.7).
- **Example, seen live:** joinery stores a front-stopped shelf housing across the side's LENGTH, so
  it prints `10-1/4" stopped dado … 1/4" from the width min end, running across the length, stopped
  24" short of the min end and 47-1/4" short of the max end`. Its position up the side is printed as
  two "stops", and its real 3/4" stop at the front never appears.
- **The other face of it:** a through word can still carry a stop clause. A housing stored across
  the length that spans the full width prints `11-1/4" dado … stopped 24" short of …`. A random
  search by the Task 5 reviewer found this in 4 of 1,389 `dado` labels. It happens because the
  stops sit on `across` while the open pair is the position axis.
- **Status:** CLOSED 2026-10-04 by the cut lines round. `cutShape` describes a cut by its opening (run axis, position, stops at closed ends); the setup line and the drawing both format from it, so one shape prints one line whichever way it is stored, and a through word can no longer carry a stop. The drawing was found to print the same stored numbers while planning and was changed with the line (spec §2.4).

**193. Grain-aware words: `groove` with the grain, `dado` across it.** Woodworking usage names a
channel running with the grain a groove and one running across it a dado. `cutLabel` has no grain
input, so it says `dado` for both.
- **Basis:** the research behind the round (a groove runs with the grain, a dado across it).
- **Status:** CLOSED 2026-10-04 by the cut lines round, the user's ruling: a channel whose run axis is the board's grain says `groove` / `stopped groove` / `blind groove`, on solid wood and plywood; MDF (a sheet with free rotation) has no grain and keeps `dado`.

**194. Two boards a hair apart in exact length share a cut-list row but can differ in tenons.**
They collapse at display precision (invariant 18), yet `findTenons` may recognise a tenon on one
and not the other. The first-listed board decides the row's lines.
- **Reach:** effectively unreachable, since the tenon cap (ℓ ≤ L/2) puts the boundary far from
  any hair's-breadth difference. The same class as follow-up 55a.
- **Status:** CLOSED 2026-10-04 by decision, the user's ruling, with no code: follow-up 55a's ruling covers it (a row is decided at display precision and its first board's lines represent it).

## From the cut lines round — 2026-10-04

**195. Properties shows the stored cut while the sheet shows its shape.** For follow-up 192's
housing (stored across the side's length), the sheet now says "running across the width, stopped
3/4" short of the max end", while the cut's Properties row (`src/panels/Properties.tsx`, the Runs
across and stop fields) shows Runs across: Length with stops 24 and 47-1/4.
- **Before:** both described the stored form, so they agreed. The cut lines round moved only the
  sheet to the shape.
- **Remedies:** a read-only shape summary on the cut row, or an action that re-stores the cut in its
  shape's orientation.
- **Status:** CLOSED 2026-10-04 by the cut storage round, the user's ruling: joinery stores every cut the way the sheet reads it (`pocketFor` → `storedAsShape`), and a row stored the other way shows "The cut list reads this cut as running across the …" with a one-click **Match the cut list** (one undo step, same stock removed). No load-time rewrite. Final-review ruling: a re-store the sheet would read differently (word, direction or stopped ends) is refused, and the note and button are not shown for it.

**196. A square opening prints one of two lines, depending on storage.** Spec §2.1 rule 3 breaks an
exact tie in extents by the stored `across`, so a square notch or a square mortise stored two ways
prints two different (both true) lines.
- **Example:** the same edge notch prints `3/4" notch … 6" from the length min end, running across
  the width, stopped 4-3/4" short of the max end` or `3/4" notch … 0" from the width min end,
  running across the length, stopped 6" short of the min end and 17-1/4" short of the max end`.
- **Reach:** square corner notches (a shelf notched around a leg) are common.
- **Remedy:** a shape-only tiebreak, e.g. prefer an axis with an open end, then `DIMENSION_ORDER`.
- **Status:** CLOSED 2026-10-04 by the cut storage round, the user's ruling: on an exact tie a cut runs along the direction with exactly one open end, else length, width, thickness. `runAxis` no longer reads the stored `across`.

**197. An overhanging cut's drawn band is unclipped but its labels are clipped.** `buildDiagrams`
still draws `cutRegion` unclipped (`h`/`v`, unchanged by spec §2.4) while the labels now come from
the clipped `CutShape`, e.g. `h: [-0.5, 0.5]` labelled offset `0"`, width `1/2"`.
- **Reach:** shrinking a board under an end rabbet.
- **Remedy:** clip `h`/`v` to the board.
- **Status:** CLOSED 2026-10-05: `clippedRegion(board, cut)` (cuts.ts) is the cut's box clipped to the board — exactly what it removes — and everything that SHOWS a cut reads it: the drawing's `h`/`v` leader spans, `pointsOfCut`'s snap points, and (one home for the rule) `cutShape`, `openSides` and `findTenons`. An overhang arises only in-session (shrinking a board under an end cut); the loader's `validateCuts` clamps it on the next open. Live-checked: a 3/4" end rabbet on a rail shrunk 1/2" draws, labels and prints as the 1/4" that remains. `cutRegion` stays unclipped for building solids.

## From the cut storage round — 2026-10-04

**198. The "Match the cut list" note on a square opening decided by the default.** A hand-entered
square closed pocket or corner opening stored across the width shows "The cut list reads this cut
as running across the length", though both storages are equally valid; the direction there comes
from the tie's final default (length, width, thickness), not from the geometry.
- **Reach:** any square closed pocket or corner opening a user stores across the width.
- **Possible remedy:** suppress the note when the run was decided by that default.
- **Status:** CLOSED 2026-10-04, the user's ruling: `CutShape.runByDefault` marks a run decided only by the tie's final default, and Properties shows no note and no button then; the sheet still prints the default direction. A square typed in millimetres is usually not float-exact, so it is decided by rule 2 and keeps the note (follow-up 200).

**199. `rebaseCuts` treats a cut differently by its stored form when a board grows.** In
`src/generate/joints/recipes.ts` (`rebaseCuts`), a zero stop along `across` keeps running out to
the new end, while a cut flush on the position axis does not move, so re-storing a cut
(`storedAsShape`) can change how it follows a later growth.
- **Reach:** latent: a 248-variant joinery corpus probe showed 0 differences.
- **Status:** CLOSED 2026-10-04: `rebaseCuts` re-stores each cut via `storedAsShape`, judged on the part before it grows, so a cut that runs along the growth keeps running out and one positioned at the moving end stays, whichever way it was stored (a 648-case probe: 0 storage-dependent differences). A square corner opening at the moving end follows the length default and so extends; a cut the guard refuses keeps its stored form and the old rule; only resized parts (grown or shrunk) are re-stored.

**200. A square typed in millimetres is not a tie.** `runAxis` compares extents exactly (cut-storage spec §2), so a 20 mm × 20 mm opening measures 0.78740157480315 against 0.7874015748031495 and is decided by the longer extent, not the tie: it keeps the Match note that 198 hides for a fractional square, and its sheet direction can depend on the last bit. An epsilon tie would change the sheet's rule as well as the note.
- **Status:** CLOSED 2026-10-05: every comparison between COMPUTED opening extents in `runAxis` and `tableWord` is made within `FLUSH_EPSILON` (invariant 22's rule; stored values such as depth against the face stay exact). An mm square now reads exactly like its fractional twin (word, direction, `runByDefault`); fractions cannot change, because sixteenth extents are equal or at least 1/16 apart (a reverted probe: 0 of 6,000 sixteenth cuts and the live designs unchanged). `storedAsShape`'s guard is still reachable at the tolerance boundary itself (186 of 20,000 constructed cases) and is pinned by a test.

## From the joinery fixes round — 2026-10-05

**201. The rabbeted panel's own move is still not collision-checked.** The 183 carry judges the
parts it carries, but the panel's own shift toward its receivers is not tested against other parts,
and a carry can raise a new `tips` that is then blamed on joinery (compare 186).
- **Status:** open, low. Needs a design call on what a refusal of the panel's own move should say.
- **Status:** CLOSED 2026-10-05 by the joinery residues round (branch `joinery-residues`), the
  user's ruling: a part in the panel's path is TRIMMED by the intrusion (a part butting the panel
  loses t, one in the gap loses t minus the gap; reproduced with a shelf 1/8in short of the back,
  which the back drove 1/8in into). One the panel would pass through refuses the unit, and the
  panel's own final box is checked against everything else before anything changes. A carry
  raising `tips` is closed by decision with 186's: joinery caused it.

**202. A re-ground that LIFTS reports `lowered` 0.** `JoinResult.lowered` is the distance dropped;
a negative re-ground (a lift) reports 0 and the dialog says nothing.
- **Reach:** no path found that reaches it (a rabbet only ever lowers the piece). Recorded so it is
  not rediscovered as a silent dialog.
- **Status:** CLOSED 2026-10-05 by decision, the user's ruling, with no code: unreachable.

**203. The two new blockers compare BOXES, not solids (invariant 38).** The 183 carry blocker and the
185 half-lap sweep use `overlapsBeyondTouch` on boxes. A design that arrives already cut (hand-made,
or Add joinery run on a joined project) can be refused falsely.
- **Reach:** not reachable within one run (nothing is cut yet when the blockers judge). A false
  refusal is safe and reported as a skip with its reason.
- **Pre-existing, recorded only:** `halfLap`'s defensive guard still returns after E has moved (argued
  unreachable), and `movedFace` holds one face per part, so a mixed-axis lap set is not tracked per axis.
- **Status:** CLOSED 2026-10-05 by the joinery residues round (branch `joinery-residues`). Every
  blocker, trim and the pass-through test judge SOLIDS on both sides, through the one exported
  `worldSolids` (designCheck.ts); a moved or trimmed part is its solids shifted or clipped, never a
  box again. The half-lap plane guard is judged on E where it would land, before it moves.
  `movedFace` is keyed per (part, axis). Compute-phase pre-checks (`cutIntoEnd`, rebaseCuts' own
  throwing condition) replace rebaseCuts throws for the trims, the panel's own trim and, from the
  final review, tenon and dado growth into an end already cut (a skip with a reason; it threw on
  master too, after a paid call).

**204. Surviving mutations from the round, recorded rather than chased.** Each is unobservable by
construction, not untested by oversight.
- **Axis grouping in the crossing sort:** every crossing fixture is on Y (X probed once by the final review).
- **`crossesInPlan` in the half-lap precheck:** crossings run first and laps move only along their own axis, so a crossing pair cannot stop crossing in plan.
- **"R wholly below E":** R only ever drops, so it stays below E.
- **`halfLap`'s `movedFace` guard:** alignment is idempotent, so on E's second partner the delta is 0 and nothing changes.
- **M6, judging carried parts at their PRE-trim box:** differs from the post-trim box only at TOUCH-scale interpenetration, which `design()`'s 1/16 snap cannot produce.
- **The `lowered` epsilon (1e-9):** a zero drop yields 0 either way; the guard matters only for float noise.
(M7, the receiver exclusion in the carry walk, does NOT survive: the final review showed it reachable through a two-faced panel and a test now pins it.)
- **Update 2026-10-05 (joinery residues round):** closed by decision as a record. Two lines above
  are now killed: judging trimmed parts at their PRE-trim box (the `M6` line) fails 12 rabbet tests
  through the solids final-box check, and the rabbet panel's solids NOT clipped to its final box
  (that round's `M7`, a different mutation from the carry-walk one above) fails the overhang probe.
  Current survivors, re-run against the round's head:
  - **The rabbet unit's no-longer-touching member filter:** only a crossing moving a receiver off
    the panel's face reaches it, and no sound fixture does.
  - **The empty-members guard:** needs a half-lap and a rabbet on the same panel, axis and side.
  - **`delta` recomputed when E is already in its lap plane:** alignment is idempotent (the
    `movedFace` guard line above).
  - **`clipped` keeping zero-volume solids:** a zero-volume box never overlaps beyond TOUCH.
  - **`movedFace` reverted to one key per part:** crossings sort by axis and rabbets run after
    them, so a lap on another axis never sits between two lookups on one axis (full suite green).
  (The final-box check moved below the mutations, a survivor when trims judged boxes, is now
  killed by the receiver-standing-off control.)
- **Status:** CLOSED 2026-10-05 by decision, as a record (not work).

## From the joinery residues round — 2026-10-05

**205. A refusal to cut into an end depends on how the existing cut is STORED.** `cutIntoEnd`
(recipes.ts) asks rebaseCuts' throwing condition, `face === d && from === end`, which reads the
stored form, not the shape that follow-up 199 made the rest of `rebaseCuts` read. It gates the
rabbet trims (a receiving cut that makes only part of the room), the panel's own trim, and tenon
and dado growth.
- **Probed:** a shelf's 1/2 × 1/2in corner notch at its far end, stored with its depth along the
  length (`face: 'length', from: 'max'`), skips the far dado. The same notch stored with its depth
  on the width face joins: rebaseCuts treats it as positioned at the end, so it stays put in the
  world, the shelf grows past it and it reads `dado`, with no overlap.
- **Reach:** hand-made cuts at the end of a part that a joint grows or trims. Conservative either
  way: a refusal is a skip with a reason, never wrong geometry.
- **Status:** CLOSED 2026-10-10 by the joinery-end-cuts round: refaceFromEnd re-stores a cut stored into the resized end from another face its box reaches, in rebaseCuts and cutIntoEnd; the cause was two equally valid storage forms that storedAsShape keeps as given (spec docs/superpowers/specs/2026-10-10-sloyd-joinery-end-cuts-design.md). An end-grain mortise still refuses. The final review's fix moved the re-facing ahead of the shape pass; one residue is recorded as fu 245.

**206. The half-lap partners-coplanar check ignores axis.** `halfLap` gathers all of E's half-lap
partners, on any axis, and requires them to share one plane on k. That partly undercuts `movedFace`
being per (part, axis), which exists so a part lapped on two axes is tracked on each.
- **Reach:** no reaching path found; crossings sort by axis, and a part lapped on two axes with
  partners in different planes is refused, which is safe.
- **Status:** CLOSED 2026-10-10 by decision (the user's): the refusal is pinned by a test; per-axis would also need the drop's collision sweep keyed by axis, for a path no real design reaches.

## From the multi-select round — 2026-10-05

**207. After a selection change ends a gizmo drag, the gizmo follows the pointer near the OLD
selection until mouse-up.** Ctrl/Cmd+A or Delete landing mid-drag ends the gesture and abandons the
rest of the drag (the controller's ruling), but three-stdlib keeps its own internal drag state, so the
handle keeps tracking the pointer around the old centre until the button is released. Nothing is
committed meanwhile; `commit` and `onMouseUp` ignore the abandoned drag.
- **Possible remedy:** end the control's internal drag on abandon. Not attempted: unverified against
  three-stdlib, and the viewport has no unit tests.
- **Status:** open, low, no data harm. Pending the live check's view of it (item 9).
**Status:** open (cosmetic; real hardware): unchanged — after an abandon, three-stdlib's own drag still runs to mouse-up; `Gizmo.tsx`'s abandon comment names it. Nothing is committed. (triaged 2026-10-16)
**Status:** open (follow-ups 5 looked, 2026-10-16; real hardware): the only remedy is three-stdlib's public `controls.dragging = false` (+ `axis = null`) on abandon, which stops `pointerMove` — but `dragging` is a defineProperty whose setter dispatches `dragging-changed`, and drei answers it by RE-ENABLING the orbit controls mid-press; if the orbit controls took that pointerdown, the camera would start orbiting with the pointer, worse than today's cosmetic follow. Not applied: needs a real mouse to judge. Nothing is committed either way.
**Status:** record-only by the user's ruling 2026-10-16: "the gizmo glitch is real but it's probably going to be a rare sequence of actions, so maybe not worth chasing unless it's simple to fix." It is not simple (the one remedy risks orbiting the camera mid-press; previous Status). Do not re-open unasked.

**208. Undo/redo pressed mid-drag can change a selected part's size without changing the selection
key.** The mid-drag abandon effect keys on the selection, so an undo that alters a selected part's
dimensions while the control is dragging leaves `commit` reading the new size against a proxy
positioned for the old one. Pre-existing on the single-part path.
- **Status:** open, low.
- **Closed 2026-10-16 (follow-ups session 2).** Worse than recorded: an undo mid-drag popped the drag's own snapshot while
  `gestureSnapshotTaken` stayed set, so the rest of the drag edited with no undo entry at all. `undo` and `redo` are now
  refused while `gesturing`, as a hide is (inv 43). Ctrl+Z inside a field never reached them (`isTextEntry`), and the
  toolbar's Undo blurs a focused field (ending its gesture) before its click. Tests: undo mid-drag changes nothing and the
  drag stays one entry; redo is refused from the press, before the first edit; each guard mutated away is red.
  **Status:** closed.

**209. A Delete pressed mid-drag merges into the drag's undo entry.** The gesture's lazy snapshot is
already taken, so the deletion shares the drag's single entry. Pre-existing on the single path.
- **Status:** open, low.
- **Closed 2026-10-16 (follow-ups session 2).** `deleteBoards` (and so `deleteBoard`) is refused while `gesturing`; the
  delete after the drag gets its own entry. Test: delete mid-drag does nothing, the drag is one entry, a delete after it
  another; mutated, red. **Status:** closed.

**210. A mixed group field typed into, then cleared, shows a parse error on blur until Escape.** The
blank draft in a field whose stored value is mixed reads as an unparseable entry. The single panel
behaves the same way.
- **Status:** open, low, cosmetic.
- **Closed 2026-10-16 (follow-ups session 2).** A MIXED field (`value: null`) whose text is empty on blur or Enter is treated
  as untouched: it stays mixed, writes nothing, shows no error. A field with a value, emptied, is still refused (empty is not
  a length). Tests: cleared then blur, cleared then Enter, and the valued field's refusal; mutated, red. **Status:** closed.

**211. Small coverage gaps the round judged fine to leave.** Record-only.
- `duplicateBoards` collapsing a repeated id, and dropping a grab that is not a copy, has no test.
- GroupProperties' Through-thickness test is absence-only; mutation 12 covers the behaviour.
- "1 parts selected" is unreachable (selection filtering in the store), so no singular form exists.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch A), item by item: `duplicateBoards`' repeated-id collapse and the dropped grab on a non-copy — tested (`store.test.ts`, mutated; the singular Duplicate already pinned the grab); Through-thickness absence-only — closed, mutation 12 covers the behaviour; "1 parts selected" — closed, the store filters a one-part selection out so no singular form is reachable.

**212. A field's Enter commit shows nothing, so it goes undiscovered.** Raised in the multi-select
live check. The user found clicking away to commit a group Length awkward and asked for Enter as an
alternative. Enter already commits (`DimensionField` and `NameField`, both tested). It was confirmed
live on a group field: both legs were saved. But focus stays in the box and only the text
reformats, so nothing says the value was taken. Pre-existing; it affects every field, not only
group ones.
- **CLOSED 2026-10-05, on the multi-select branch, by the user's ruling: blur on Enter.**
  - Enter on a changed field commits and then blurs, so the next Ctrl+Z reaches the app's undo.
    Checked live: one Ctrl+Z put both legs back.
  - An entry DimensionField refuses keeps focus, so it can be fixed.
  - An untouched Enter just blurs, through the ordinary untouched path (no commit).
  - The Escape flag is renamed `blurHandled` and set by Enter too, so the blur does not resync from
    the render's stale `value`.
  - Mutations: 4 of 5 go red. The one that survives is dropping the flag in NameField: the adopt
    effect corrects the text, so only a one-frame flicker of the old name differs. Recorded, not
    tested.
**Status:** closed 2026-10-05 (Enter commits and blurs, the user's ruling). (triaged 2026-10-16)

## From the hide/unhide round — 2026-10-05

**213. `deleteBoards` reconciles `hiddenIds` in a second `set()` after `edit()`.** The entry
`edit()` pushes already records the set as it was, so undo is right; but for one moment the
document lacks the deleted parts while `hiddenIds` still names them. Harmless: every reader
filters by id against the boards. Folding it into `edit()` would need an API change.
- **Status:** open, low, no data harm.
**Status:** record-only: unchanged (`reconcileHidden` is still a second `set()` after `edit()`); every reader filters by id, and folding it in needs an `edit()` API change. (triaged 2026-10-16)

**214. Small gaps the round judged fine to leave.** Record-only.
- `HISTORY_LIMIT` (50) is shared: many eye toggles each push an undo entry and can push real
  edits out of the history. Recorded, not changed.
- `.part-row.hidden .part { cursor: default }` may duplicate the existing `button:disabled` rule.
  Unchecked.
- TapeTool's candidates memo is a ~120-character one-liner. Cosmetic.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch A), item by item: `HISTORY_LIMIT` — FIXED by the user's ruling: consecutive hide/show toggles through `applyHidden` share ONE undo entry (the run is the entry on top of `past`, held by identity; any edit, gesture snapshot, undo or redo ends it; a run back at its starting set leaves no entry), pinned in `store.test.ts`; `.part-row.hidden .part { cursor: default }` — fixed, the row's button is `disabled` so `button:disabled` already sets it (and out-specifies `.part`), duplicate dropped; TapeTool's candidates memo — closed, cosmetic, and viewport memo dep lists are inv 15's failure mode.

## From the quarter turns round — 2026-10-05

**215. Postures differ in handedness, and the cut sheet's handedness is not established.** Flat
and upright map `(length, width, thickness)` onto the world one way; on-edge maps it the other way.
So changing a part's posture mirrors a one-handed part's cuts in the 3D view (a stopped dado stopped
at one end only swaps ends). Separately, it is not established which hand the printed cut sheet's
drawings assume, so some orientations may show a one-handed part as the mirror of its sheet.
- **What the round did about it:** nothing, on purpose. Turn 0 keeps each posture's pre-v8 frame
  exactly, and the four turns within a posture are proper rotations of it, so nothing got worse.
  Linking does not need it: linked parts share a posture.
- **The question to settle:** whether postures should become proper rotations of ONE frame, and
  first, which hand the cut sheet's drawings read in. A change here would move existing parts' cuts
  on screen, so it would likely need a migration like `trueTurnsToV8`, not a quiet fix.
- **Probed 2026-10-10 (spike, no code kept).** (1) Turn-0 frames: flat (L→X, T→Y, W→Z) and upright
  (W→X, L→Y, T→Z) are MIRRORS of the part's own (length, width, thickness) basis (determinant −1);
  on-edge (L→X, W→Y, T→Z) is a proper rotation (+1). Turns within a posture are proper. (2) The sheet
  draws every view with the earlier dimension running right and the later running DOWN, for BOTH sides
  of a face, so one side of every face is a mirror image of the face seen from outside. Measured against
  `axisFrame` for every posture × turn × face × side: flat/upright draw T max, W min, L max true and
  T min, W max, L min MIRRORED; on-edge the reverse. (3) Not in the entry before: the cut list's row key
  omits posture (cutlist.ts, "where a part sits, not how it is cut"), which holds only if postures share
  handedness — a flat and an on-edge part with the same stored one-handed cuts are mirror images yet
  share one row.
- **The user's decision (2026-10-10):** both steps as a round — unify posture handedness in the model
  (schema 12 migration of on-edge parts, nothing moving on screen), then draw every sheet view true.
- **Status:** CLOSED 2026-10-10 by the posture-handedness round (schema 12): on-edge reverses thickness (axisFrame), v12 mirrors on-edge cuts so nothing moves; sheet views thickness/min, width/max, length/min draw vertical upward, so every view is true; the cut-list grouping is now correct.

**216. A millimetre box cut on a reversed axis can store a width an ulp away from the same cut at
turn 0.** `pocketFor` clamps in world-offset space and then reflects through
`spanFromWorldOffset`, so on a reversed axis the stored span carries one extra subtraction. For a
non-dyadic box the stored widths then differ in the last digits: measured
`0.5999999999999996` at turn 0 against `0.5999999999999979` at 180° (the offsets differ
legitimately, 3.3 against 20.4). The cut list's row key compares stored cuts EXACTLY
(invariant 18), so two parts cut alike but turned differently can split into two rows that print
the same.
- **Reach:** not reachable from Generate's designs, whose coordinates snap to sixteenths (dyadic,
  exact). It needs millimetre or decimal coordinates reaching `pocketFor`.
- **Do not "fix" it by rounding the row key**: that is invariant 18's prohibition. A remedy, if
  wanted, belongs where the cut is stored.
- **Status:** open, low, recorded.
**Status:** open (latent): unchanged in `pocketFor`, and its reach has WIDENED — since metric display (inv 52) a metric project's whole-mm sizes are non-dyadic and can reach `pocketFor` through Add joinery. Not reproduced; reproduce before any remedy, and never by rounding the row key (inv 18). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 (follow-ups 5). Reproduced first: of 4008 probed mm dados, 2591 stored a different offset/width at 180° than at 0°; turn 0 was not exact either (`mm(37) − mm(12)` need not be `mm(25)`), so position split rows too, and a two-part cut list printed `[1, 1]`. `pocketFor` now stores each of ITS OWN numbers (offset, width, depth, stops) within its EPS (1e-9") of a 1/64" or 0.1 mm grid point as that point's exact float — dyadic first, 0.1 mm as `parseLength` stores a typed `x.y` mm; anything else as computed. When `storedAsShape` then re-stores the cut (another cut opens one of its ends), it recomputes from the region and the result is NOT the grid float (a 19 mm housing beside a back rabbet: width `0.74803149606298…` varying in the last digits with position along the part) — but it is a function of identical inputs, so both turns and every position still agree (pinned), and the row split is closed. A rabbet flush with the max end stays a rabbet reaching the end within EPS in both turns (pinned). The row key is untouched (inv 18). Tests in `pocket.test.ts`: both turns and three positions over a sweep, a stopped groove of every depth, the cut list's one row of 2, a flush-max rabbet, a re-stored housing, an off-grid number kept; all five fields and both branches mutated (without `onGrid` five tests red). Residue in fu 382.

**217. Small test gaps the round judged fine to leave.** Record-only.
- Joinery equivariance covers a 180° turn only. `pocketFor`'s pose test covers all four turns in
  every posture, and the resize and end-cut paths have their own mutation evidence.
- The equivariance test's non-vacuity guard is "some joint not butt"; it does not pin each
  fixture's joint kind (that the rabbeted back actually got a rabbet).
- The UV turn sweep uses a solid-wood chiral part only. A plywood chiral variant would exercise the
  fit axes under reversal; the existing "plywood on-edge rotated, dado" case covers part of it.
  Flat at 180° is blind to the reflect-after-swap mutation by symmetry (both horizontals reverse).
- The oracles in `pocket.test.ts` (`assertCarves`) and `recipes.test.ts` (`worldOf`) now use the
  geometry helpers, so they catch a site that skips a helper, not a wrong table. The table itself
  is pinned by `geometry.test.ts` and `turns.test.ts`' `rotateQuarter` checks.
- The turn-0 test in `geometry.test.ts` is partly circular (`horizontalOf` against `axisFrame`);
  literal pins exist in `document.test.ts`.
- No millimetre (non-dyadic) migration case: spec §4 says a migrated part's solids match within
  `FLUSH_EPSILON` there, and only dyadic cases are tested.
- The store tests (a box-corner tape anchor kept across a 180° turn, a cut-point anchor dropped)
  were not mutation-tested; they exercise `updateBoard`'s existing point-precise rule.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch C), item by item:
  1. 90/270 joinery equivariance: TESTED. A 90 or 270 turn about each part's own centre moves the
     world box, so it is not the same design; the test instead turns the WHOLE design rigidly
     (`rotateQuarter` k times about one pivot, rotation + 90k, notches rebuilt from the carried
     world box) and asserts joint kinds, skips, moved and trimmed equal and the joined world
     solids equal the unturned result carried by the same rotation (recipes.test.ts).
  2. Joint kind per fixture: TESTED. Each fixture now pins its sorted applied kinds (the back
     gets `rabbet`) and the skip fixtures pin the "already cut" reason.
  3. Plywood chiral UV part: TESTED, grain length and width, three postures, four turns. Grain
     width makes broad faces swap, so flat 180 sees the reflect-after-swap mutation there (the
     solid-wood flat 180 stays blind to it, as recorded).
  4. Oracles use the helpers: CLOSED, not a gap to test. The table is pinned by
     `geometry.test.ts` (spec section 2 table) and `turns.test.ts` (`rotateQuarter`).
  5. Turn-0 circularity: CLOSED. Literal pins exist in `document.test.ts` (`axisDimensions`
     for every posture at 0 and 90) and `geometry.test.ts`' turn-0 case is secondary.
  6. Millimetre migration: TESTED. A one-handed metric 90 part with one cut on each mirror branch
     keeps its world solids within `FLUSH_EPSILON` in every posture (document.test.ts).
  7. Tape-anchor-across-turn store tests: MUTATED. They caught every point-precise mutation
     tried; strengthened to assert the same point survives, and that the axis lock is cleared
     with a dropped anchor (the one mutation the old assertions missed).
  Mutated and caught: the store tests (item 7), a reflect-after-swap UV mutation (item 3), a wrong turn in the rigid-turn joinery comparison (item 1). Known limit: a joinery equivariance test cannot
  see a table consistently wrong on both sides of a crossing; the table pins in 4 do.

**218. Apply with a refused entry still in the field applies the last GOOD value.** Raised in the
copy-in-a-row round. Type `abc` into Gap and press Apply: the field refused the draft, so the form
still holds the previous value, and Apply uses it. The summary line describes that value, so the
screen is consistent, but a person may expect Apply to be disabled while the field shows an error.
- **Status:** CLOSED 2026-10-05 by the round's final review, ruled a defect: Apply is disabled
  while the field shows a refusal. `DimensionField` gained an optional `onErrorChange`, called from
  ONE effect keyed on its error (so commit, the adopt effect, the untouched blur, Escape and the
  `key={mode}` remount all report), and `CopyInRow` disables Apply on `!layout.ok || fieldRefused`.
  The probe (+Z, type `-1/2` in Gap, click Apply without Enter) now makes nothing: the blur commit
  is refused before the click lands. Tests click Apply straight from a refused draft and from a
  valid one, and switch modes away from a refused draft; dropping the effect or ignoring the flag
  turns them red.

**219. `rowLayout`'s `!(s > 0)` guard is unpinned.** Raised in the copy-in-a-row round. No test
reaches `s = 0` or `NaN`, so the guard (which returns `value`) can be deleted without a red test.
`s = Infinity` passes it; unreachable from real boards.
- **Status:** CLOSED 2026-10-05 by the round's final review: `rowLayout('gap', 0, 0, 2)` is pinned
  to `{ ok: false, reason: 'value' }`, and deleting the guard turns it red. `s = Infinity` stays
  unpinned and unreachable.

**220. Small gaps the round judged fine to leave.** Record-only.
- `copyInRow`'s `sign` is not validated at runtime: `0` would stack every copy on its original.
  The panel is the only caller and always passes +/-1.
- ~~The order of the selection after a multi-part group is copied, and distinct names in the group
  test.~~ Closed by the final review: the group test asserts the selection is the originals then
  the copies k-major, and that all six names are distinct.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch A), item by item: `copyInRow` now refuses any `sign` other than +1/-1 (no edit, no undo entry), pinned in `store.test.ts`.

## From the linking round — 2026-10-06

**221. A linked file whose cuts have no ids unlinks its members on load.** `validateCuts` mints a
missing cut id through `takeId`, one board at a time, so two members carrying the same cut without
an id come out with DIFFERENT minted ids. `sameShared` compares cut ids, so `repairLinks` then sees
them differ and unlinks every member after the first. It fails safe: no geometry moves, only the
link is lost. Every writer in the app stores cut ids, so only a hand-edited or hand-merged file
reaches it.
- **A remedy, if wanted,** would have to mint one id per (label, cut position) rather than per
  board, which is a second decider beside `takeId` (invariant 33). Not worth it for this reach.
- **Status:** open, low, fails safe.
**Status:** record-only: `repairLinks` is retired (inv 45); a below-v11 linked file's members now get per-board minted cut ids, and `linksToShapes` judges by `sameShared` (ids compared), so they load as plain parts. Fails safe; hand-edited pre-v11 files only. (triaged 2026-10-16)

**222. Small gaps the round judged fine to leave.** Record-only.
- ~~`sharedPatch` has no direct test.~~ It has one since the final-review fix wave (which also
  made it copy `cuts`), in `links.test.ts`.
- Properties' plural wording branches ("N parts" in the will-match line, "N other parts" in the
  linked block) are untested; the tests link two parts, so they reach only the singular.
- `runJoinery`'s link tests run on the mocked-answer path only. The fallback-to-defaults path
  builds through the same `applyJoints` and `migrateDocument`.
- `linkBoards` runs `dropHeldIfGone` on every member, including the source and members that did
  not change. A superset of "changed", and harmless: the test is point-precise, so an unchanged
  part keeps its points.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch A), item by item: Properties' plural wording — tested (three parts linked, `Properties.test.tsx`); `runJoinery`'s links on the fallback path — tested (`runJoinery.test.ts`, the same three outcomes); `linkBoards` dropping held points on unchanged members — closed, the test is point-precise so an unchanged part keeps its points.

**223. Joinery returns linked parts it cuts UNLINKED, even when their cuts are identical.**
"Add joinery…" leaves any linked part it cuts unlinked in the joined project, because `pocketFor`
mints a fresh cut id per board and `sameShared` compares ids. The user ruled this ACCEPTABLE FOR
NOW (2026-10-06): the joined project is a new copy and the original keeps its links.
- **Possible remedies, not chosen:** have joinery reuse one cut id across members whose cuts are
  identical in shape, or offer a one-click re-link of parts that match.
- **Status:** CLOSED 2026-10-07 by the components round (`c3cf381`). Links are now shared `Shape`s, and joinery's write-back groups users whose results are identical by GEOMETRY (cut ids ignored), so four legs with identical mortises stay one shape with one set of cut ids. Pinned by `runJoinery.test.ts` (a TWIN fixture; the old fixture's mortises genuinely differ, so its "comes out unlinked" test still stands) and `writeBackFlat`'s tests.

## From the assemblies round — 2026-10-06

**224. Round 2 (components): the questions this round left for it.** Round 1 gives every
definition exactly one instance, so none of these could arise yet.
- **A joint cut into ONE instance of a shared definition.** Does it make that instance unique, or
  cut every instance? Spec §6.1 left it open. Joinery maps parts back by index today, and it throws
  on a part-count mismatch. A shared definition breaks the 1:1 mapping that relies on.
- **What links become.** Should a link stay a label on parts, or become a shared definition?
  Spec §7.
- **`applyWorldEdits` keys its edits by stored part id per container.** Two occurrences of one
  shared definition would collide there. Round 2 changes only this write-back.
- **Load repair step 4** copies a definition referenced twice. It is round 1's stand-in for
  sharing, and round 2 must remove it.
- **Status:** CLOSED 2026-10-07 by the components round. Each question was answered by the user or the spec (`docs/superpowers/specs/2026-10-06-sloyd-components-design.md`):
  - joinery on a shared definition: copies whose results are identical stay shared, differing ones split (one level deep, shallowest first);
  - links became shared `Shape`s;
  - `applyWorldEdits` keys on the storage target and refuses disagreeing edits;
  - load-repair step 4 runs only below v11.

**225. Out of scope by decision, recorded so they are not re-proposed as oversights.**
- **Mirrored instances** (left and right cabinet halves). Blocked on follow-up 215, which hand
  each posture has. — DONE 2026-10-11 by the mirrored-instances round (schema 13); the rest of 225 stays out of scope by decision.
- **A cut list organised by assembly** ("Drawer ×3"). Today's cut list groups parts by identity
  across assemblies and names each by its path.
- **Scaled instances.** They make a cut list lie.
- **Free rotation.**
- **Dragging items between assemblies** in the parts list. Ungroup and regroup does that job.
- **Status:** open by decision (spec §1).
**Status:** open by decision (its mirrored-instances item shipped as schema 13). (triaged 2026-10-16)

**226. An assembly emptied by deleting its last part lingers.** It stays as an empty row with no
geometry. Delete prunes only definitions that are no longer referenced, and an empty one still is.
No data is lost, and the row can be deleted.
- **A remedy, if wanted:** `removeItems` could drop an instance whose definition it leaves empty,
  recursively up the open path. The open path would then have to close the levels it removed.
- **Status:** CLOSED 2026-10-11 by the fu 246/226/227 round: `removeItems` drops every placement of a
  definition the delete EMPTIED (it held something before), cascading up, in every copy of a shared
  definition; an assembly that was already empty is not the delete's and stays. `deleteBoards` closes the
  open level to the deepest one left, as `restore` does; one undo entry restores everything (the open level
  stays at the parent: history does not record it). Pinned in `treeOps.test.ts` and
  `store.assemblies.test.ts`, mutation-checked (single pass, no "held before" guard, root-only, no close).

**227. Two small parts-list and display-name gaps.**
- **The eye on a covered row.** On a row covered by a hidden ancestor, the eye draws struck
  through and is disabled, but its accessible name still reads "Hide <name>". Found in the live
  check. A label like "<name> is hidden with <ancestor>" would match what is drawn.
- **A part name containing ` › `.** `NAME_SEPARATOR` is not reserved in a typed name, so "A › B"
  inside assembly "X" prints like part "B" inside assembly "X › A". Only the cut list's and
  joinery's DISPLAY names can collide. Joinery maps back by index, never by name, so no edit
  lands on the wrong part. Renaming resolves it.
- **Status:** CLOSED 2026-10-11 by the fu 246/226/227 round.
  - **The eye:** a covered row's eye reads "<name> is hidden with <nearest hidden assembly>"; a row's own
    eye keeps Show/Hide. The open assembly and its ancestors, whose eye is also dead, read "<name> is open
    and can't be hidden" (the final review's minor, same mismatch). Pinned in `PartsList.test.tsx` (nearest,
    not outermost; both labels mutation-checked).
  - **The separator:** `cleanName` turns every `›` into `>` where a name is WRITTEN: `renameItem` (typed)
    and Generate (which already did). The whole glyph is reserved, not only " › ": an assembly "X ›"
    holding "B" and "X" holding "› B" both printed "X › › B". **Not on load, and not in `uniqueName`:**
    a flat document names assembly parts "Front › Leg" by construction and runs through `migrateDocument`
    (`applyJoints`, Refine, repair); cleaning there renamed every assembly part on write-back (47 joinery
    tests red, caught in the round). Residue: a file saved before this round with a typed `›` keeps it
    until renamed (display names only, as before).

**228. Small gaps the round judged fine to leave.** Record-only. These are the per-task reviews'
deferred minors, condensed.
- **Untested refusal and null paths.**
  - `groupItems`' nonexistent-id refusal and `ungroupItem`'s non-instance null.
  - `joinPath`, `lastSegment`, `instancesOn` and `definitionAt` on null paths.
  - `renameItem` on a nonexistent path returns a name.
  - Ctrl+G under a modal or in a text field, and the order of Escape's ladder.
- **Untested store paths.**
  - Toggle-click across levels.
  - The tape surviving a level change.
  - `openPart` on a root part.
  - `restore` dropping a closed level's selection.
  - Self-snap refusal for a target inside the selected assembly.
  - Cut-action mates across containers.
  - `selectLinked` across containers.
- **Weak assertions.**
  - `flatDocument` is compared against `worldParts`, its own source.
  - `writeBackFlat` is tested on a cut change only, not a moved part.
  - The `moveGroupTo` and turned-copy tests.
  - The "Group inside an open assembly" test.
  - The repair step-7 test cannot tell per-container from world-wide link repair.
- **Unreachable or cosmetic.**
  - `translateItems` double-moves an ancestor given with its descendant. A selection is one
    level, so the UI cannot reach it.
  - A diamond-shaped hand-edited file copies a definition 2^k times on load.
  - The identity-frame shortcut can turn a -0 into +0.
  - `rekeyHeld` with `edit()` is three `set()` calls, a transient state no subscriber reads.
  - `linkedHere` counts a hidden mate at the open level, so Select linked shows and selects
    only the part itself.
  - `instancesOn` rebuilds its definitions map per call. It is not on a per-frame path.
- **Stale comments** named in the reviews: `duplicateBoards`' "same order", `addBoard`'s
  "root-only", `selectAll`/`hideUnselected`, `uniqueName`'s "board", and the "Two or more" comment
  at the Gizmo's commit.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batches B1, B2), item by item.
  - **Untested refusal and null paths: tested (B2).** `tree.test.ts` pins `joinPath`, `lastSegment`, `instancesOn`, `instanceAt`, `definitionAt` and `containerAt` on a miss, a part path and a missing definition; `treeOps.test.ts` pins `groupItems` refusing an unknown id (alone, beside real ones, in an unknown container, and a deep path whose last segment matches a direct child's id) and `ungroupItem` returning null for a part, an unknown path and a missing definition; `store.assemblies.test.ts` pins `renameItem` on a path that names nothing (returns the sibling-unique name, writes nothing, no entry). Ctrl+G under the cut list, under a dialog and in a text field (not prevented, no group or ungroup), Alt excluded, Cmd+G, and Escape's whole ladder (grabbed, axis, anchor, tool, each open level, then unclaimed; held points survive behind the cut list; a text field leaves it alone) are pinned in `App.test.tsx`.
  - **Untested store paths: tested (B2).** Toggle-click across levels (it re-targets, never toggles), the tape surviving every level change, `openPart` on a root part or inside an open level (a no-op), undo and redo dropping a closed level's selection and held points, Select linked across containers (only the mates at the open level), and a cut action's mate across containers from either side (one undo entry each) are pinned in `store.assemblies.test.ts`. Self-snap into the selected assembly was already tested ("a snap move cannot land on a part of the assembly being moved"); B2 added a child and a nested grandchild, asserting no entry and the grab kept. **Finding:** since fu 230, `sharesStorageWith` walks the path's own ancestors and so covers `isCovered(owner, selected)`, which makes the older guard in `commitSnapMove` redundant (removing it alone changes nothing; removing both turns the tests red). Left in place.
  - **Weak assertions: tested (B2).** `flatDocument` now has literal names, ids, positions and turns for a hand-derived nested fixture (a 90-degree assembly included). `writeBackFlat` has moved-part cases at the root, one and two turned frames deep (the position is lowered as a DELTA, inv 46: the stored value gains the inverse-rotated world change and an unmoved axis stays bit-identical), and a deep-frozen-input test (also fu 231). `moveGroupTo` has hand-derived exact values for an assembly and for a mixed selection, and the rounding of a target that equals an off-grid min. The turned-assembly Copy in a row test asserts the stored copy `[1.1, 0, 2.7 + 5]`, name, selection and one entry. "Group inside an open assembly" asserts the child list, the new assembly's frame, the stored definition, bit-identical world parts and one undo. The repair step-7 item: the two existing "link spanning the root and an assembly" tests already tell world-wide from per-container link grouping (mutation-checked in B2); B2 added the load's dissolve count (world-wide over STORED parts: two containers keep the shape, one stored part placed twice dissolves it, and a v10 definition placed twice is copied first so its shape stays).
  - **Unreachable or cosmetic.** `translateItems` double-move: FIXED (B1), covered descendants are skipped. `linkedHere` counting a hidden mate: FIXED (B1), visible mates only. Diamond-shaped hand-edited file copying 2^k times: closed, `copyShared` runs only for a file below v11, so no v11 path reaches it. Identity-frame shortcut turning -0 into +0: closed, no visible or stored difference. `rekeyHeld` with `edit()` as three `set()` calls: closed, no subscriber reads the transient state. `instancesOn` rebuilding its map per call: closed, not on a per-frame path.
  - **Stale comments: fixed where stale (B1).** `uniqueName`'s "board" is now sibling/item. The other four were found already correct: `duplicateBoards`' "same order" (explains selection order), `addBoard` (no "root-only"), `selectAll`/`hideUnselected` (say "open level"), the Gizmo's "Two or more parts, or any assembly".

## From the components round — 2026-10-06/07

**229. Ungrouping in one copy can bring hidden parts back in another.** Ungrouping a nested group
inside copy A also rewrites copy B, which shares the definition. If B's nested group was hidden,
its stale hidden id is dropped (`reconcileHidden`), but "hidden" does not pass to B's lifted
children, so they reappear. No data is lost; hiding them again is one click.
- **A remedy, if wanted:** in the all-placements re-key, map a hidden group path to its lifted
  children's paths.
- **Status:** CLOSED 2026-10-11 by the 229/233 round, as the remedy named: `ungroupItem` returns a `Lift`
  (the ungrouped assembly's path under every placement of its container maps to its lifted children there),
  and `rekeyHeld` expands a lifted hidden id, deduped against a child already hidden on its own; several
  ungroups in one action compose in order. The copy the user ungrouped was visible (a hidden item cannot be
  selected) and stays so. Undo restores the set as it was (`editRekeyed`'s entry). Pinned in
  `store.components.test.ts` (c2, rewritten from "dropped"; c3 a nested assembly, a clashing id and a
  covered child; c4 two at once), mutation-checked (no lift, no dedupe, this copy only, first step only).

**230. `commitSnapMove` has no store-side guard against a twin target.** `moveCandidates` no
longer offers another placement of a selected stored part as a target (the final fix wave), and it
is the only source of targets. A programmatic caller could still snap a part to its own twin, which
then moves with it.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch A), item by item: FIXED: `commitSnapMove` refuses a target on another placement of a selected stored part, through `sharesStorageWith` (`treeEdit.ts`), the one predicate `moveCandidates` now also uses (no owner-type guard, inv 26); pinned in `store.components.test.ts`.

**231. Small gaps the round judged fine to leave.** Record-only; the per-task reviews' deferred
minors, condensed.
- **Behaviour edges.**
  - `edit()` pushes an undo entry even when its function returns the same document (pre-existing,
    invariant 4's shape).
  - A Link whose members are all placements of ONE stored part mints a one-user shape. The UI cannot
    reach it, because a selection is one container.
  - An OPTIONAL own field added to `Board` would be dropped silently by `copyBoard`'s shaped
    literal; only required fields fail `tsc`.
  - Joinery's grouping compares exactly, so a part moved or grown inside a turned placement may
    split off by a last-bit difference. That is the safe direction: less sharing, never wrong
    geometry.
  - `subtreeSignature` is roughly quadratic in the number of parts (fine at furniture scale).
- **Untested.**
  - Make Unique on an instance inside a shared container.
  - `selectCopies` dropping hidden copies or a held grab.
  - A nested definition's own `×N` badge, and `treeRows.copies` directly.
  - `writeBackFlat` leaving its input unchanged.
- **Wording and cosmetics.**
  - `treeRepair`'s doc comment numbers `dropUnresolved` as step 5 though it runs last.
  - Test titles still say "9" and "schema 10" (document.test.ts).
  - A plain part's key order in exported JSON changed (no behavioural effect).
  - A test sorts `selectedIds` in place.
  - The `anchorOn` test helper has an unused `pick` parameter.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batches B1, B2), item by item.
  - **Behaviour edges.** `edit()` pushing an undo entry for an unchanged document: FIXED (B1), `next === doc` pushes no entry, clears no redo and takes no gesture snapshot (a supplied `selection` callback still applies; that branch is unreachable today and untested). A Link over placements of ONE stored part: FIXED (B1), `linkPlan` takes an optional `keyOf` and refuses fewer than two distinct stored parts (the store and Properties both pass `storageKey`). An optional own field dropped by `copyBoard`'s shaped literal: FIXED (B1), own fields are spread. Joinery's exact grouping splitting by a last bit: closed, the safe direction (less sharing, never wrong geometry). `subtreeSignature` roughly quadratic: closed, furniture scale.
  - **Untested: tested (B2).** Make Unique inside a shared container (`treeOps.test.ts`, `store.assemblies.test.ts`): the one stored drawer instance is re-pointed, so every placement of the container follows, a loose placement of the same definition keeps it, world positions, hidden ids and held points are unchanged, one undo entry; when the container holds the only stored instance the action is refused (no entry), matching the Properties button's gate. `selectCopies` dropping a hidden copy and a held grab that no longer belongs (inv 24), same file. A nested definition's `x N` badge and `treeRows.copies` directly (`tree.test.ts`, `PartsList.test.tsx`, new `cabinetsDoc` fixture): a nested instance counts once per placement of its parent, parts and unshared assemblies carry no `copies` key. `writeBackFlat` leaving its input unchanged: tested with deep-frozen inputs plus a JSON snapshot.
  - **Wording and cosmetics: fixed (B1).** `treeRepair`'s comment now says its numbers are the spec's and gives the run order; the "9" and "schema 10" test titles say 11 and "the v10 step"; the test that sorted `selectedIds` in place sorts a copy; the `anchorOn` helper lost its unused `pick`. Exported key order of a plain part: closed, no behavioural effect.

## From the generate-assemblies round — 2026-10-09

**232. Generated assemblies are one level, unturned, and never mirrored.** By decision (spec §1):
nested assemblies (drawers inside a case assembly) and turned placements are out of scope; a
left/right pair of mirror-image assemblies cannot be expressed in schema 11 anyway. Generate still
emits only 0° and 90° parts (invariant 44).
- **Update 2026-10-11:** schema 13 (mirrored instances) can now express a mirrored pair; Generate's format
  (`DESIGN_SCHEMA`) still has no mirror, and Refine refuses a mirrored assembly. Lifting it means a `mirrored`
  placement field in the design format and in `documentToDesign`.
- **Status:** open by decision; revisit if prototypes need them.
**Status:** open by decision. (triaged 2026-10-16)

**233. A flat Simple design of 49+ parts gets two cap reports for one fault.** It fails both the
distinct cap (`N distinct parts; the limit is 12…`) and checkDesign's placed ceiling
(`N parts; the limit is 48.`), which counts one extra in the repair loop's "fewest". Spec-conformant;
a fix would drop the ceiling report when distinct equals placed.
- **Status:** CLOSED 2026-10-11 by the 229/233 round, as the remedy named: `evaluateDesign` drops the placed
  ceiling's `too-many-parts` when the distinct cap fired and `distinctParts` equals the placed count (no
  repeated assembly: one fault). With an assembly placed more than once the counts differ and both reports
  stay. Shared by Generate and Refine. Pinned in `run.test.ts`, mutation-checked (no equality, no filter).

**234. The batch concept planner sees assembly wording it is not taught.** `conceptsMessage` builds
on `userMessage`, so the planner reads "an assembly's parts count once", but `CONCEPTS_SYSTEM` never
explains assemblies. Cosmetic: the planner only proposes directions.
- **Status:** open, low.
**Status:** open (cosmetic): `CONCEPTS_SYSTEM` still says nothing about assemblies while the planner reads `userMessage`'s assembly lines. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 (follow-ups 6): `CONCEPTS_SYSTEM` now explains assemblies (designed once, placed where they repeat, counted once) — and no longer forbids tapered parts: it still said "no turned or tapered parts" after AI tapers/angles taught the designer tapers, miters, bevels and chamfers, so the planner could not propose a tapered-leg concept. Pinned in `concepts.test.ts` (red first).

**235. Small gaps the round judged fine to leave.** Closed 2026-10-10; the reviews' deferred minors.
- **Untested.** A part named in a violation but missing from the authored index; a violation
  spanning two assemblies (the `assemblies.size === 1` guard has no red test of its own); the
  class-split guard in `linkByRole` is load-bearing in one test only (`linksToShapes` re-checks
  equality, so a second test cannot see it); the run-level collapse test asserts loosely (the unit
  test pins exact text).
- **Cosmetic.** `'first' in x` tells a group from a violation in `collapseViolations`; merged
  `parts` may repeat a label for an overlap between placements (not shown to the model);
  `isShaped(b)` in `linkByRole` is dead on generated documents; one `extentsOf(b as Board)` cast
  stays because tsc needs it.
- **Not confirmed live.** The collapsed repair wording: the live run came back clean on its first
  call.
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch D), item by item: a violation naming a part missing from the authored index, and a violation spanning two assemblies — tested (`assemblyChecks.test.ts`, mutated: the missing part keeps its own name as a between-placement fault; the two-assembly fault lists both assemblies' placements, never "fix the assembly"); the `assemblies.size === 1` guard — still no red test of its own, and none can exist: `every` also needs `internal`, which means ONE placement, so a group over two assemblies cannot reach `all.length > 1` (dropping the guard changes nothing; kept as a cheap defence); `linkByRole`'s class-split guard — closed, `linksToShapes` re-checks equality so no second test can see it; the run-level collapse test — exact text now (the overlap message and the full repair message the model receives, `run.test.ts`, mutated on the suffix and on the repair-prompt tail); `'first' in x` — closed, cosmetic; repeated label in merged `parts` — closed, not shown to the model; `isShaped(b)` in `linkByRole` — closed, not removable: it is dead on generated documents but is also the type narrowing from `StoredBoard` to `Board` that `sameShared` needs, and skipping an already-shaped part is the safe answer for any other caller; the `extentsOf(b as Board)` cast — closed, tsc needs it; the collapsed repair wording not seen live — closed, it needs a paid run that happens to fail, and the unit and run tests pin the exact text.

## From the refine round — 2026-10-09

**236. Refine's cost estimate is a first-call lower bound.** The live run showed `≈ $0.02` before and
cost `≈ $0.07`: the estimate counts one call's input and the design's size as output, but adaptive
thinking is on and repair rounds resend the history. Options: label it "from ≈ $X", or scale the
output estimate by a measured factor. Generate's and joinery's estimates may share the gap.
- **Status:** closed 2026-10-09 (estimate-range round). Measured with one paid Refine (14 parts) and
  one paid Add joinery (8 sites) on the dev server: the miss was not mainly thinking. Prompts and
  design JSON tokenise at ~2 characters per token (not 4), the cached prefix (system prompt AND
  output schema) is billed as a cache write, and Refine's output runs ~1 token per design character.
  Joinery's flat 2,000 output tokens over-read (~34 per site). Both dialogs now show a range
  (`src/generate/estimate.ts`): one call low (Refine $0.05 vs $0.048 actual; joinery $0.02 vs
  $0.016), every repair round high with the history resent and output doubled for thinking
  variance; a joined design's high end includes joinery over every meeting. Generate still has no
  before-you-run estimate (out of scope by decision).

**237. Refining a refined project names it "X — refined — refined".** The spec is silent; "— refined
2" or stripping a trailing "— refined" would read better.
- **Status:** CLOSED 2026-10-10 by the refined-name round: `derivedName` counts a repeated suffix ("— refined 2") for Refine, joinery, repair and Duplicate ("copy 2"); see `docs/history.md`.

**238. Refining designs with joints.** The user chose fresh prototypes first (option 1 of 3). A
joined design is refused before any call. Lifting that needs cuts to survive (or be re-derived)
through the model's box format.
- **Status:** CLOSED 2026-10-09 by the refine-joined round (`docs/superpowers/specs/2026-10-09-sloyd-refine-joined-design.md`).

**239. Small gaps the round judged fine to leave.** Closed 2026-10-10; the reviews' deferred minors.
- **Untested.** The material-label-identical guard in `diffDesigns` (cannot fire: labels are unique);
  added/removed parts inside a kept placement merging ×N; material/link merges ×N; the dialog's
  storage-unavailable branches and repairing/retrying text; the 240-placed boundary was not mutated.
- **Edges.** An off-grid value inside an assembly may land an ulp off after normalisation (no
  phantom change line: zero deltas are not printed); an unplaced definition counts toward distinct
  parts but is dropped from the design (load repair should prune it).
- **Cosmetic.** The estimate recomputes per keystroke; two `role="status"` elements can render
  together; the `' turned'` detail string is duplicated in its merge key; the change list lives in
  hook state, so closing the dialog mid-run and reopening clears it (joinery's pattern).
- **Status:** CLOSED 2026-10-10 by the older-record-only round (batch D), item by item: `diffDesigns`' material-label guard — closed, labels are unique so it cannot fire; added/removed parts inside a kept placement, material changes, link gained/lost, and a turned part merging ×N — tested (`designDiff.test.ts`, mutated: dropping any merge key fails its test; the link key's kind component is unobservable, since linked and unlinked cannot both occur for one definition part); the dialog's storage-unavailable branch — tested (message, Refine disabled with a filled form); repairing/retrying text — already pinned by the fu 242 labels test; the 240-placed boundary — already pinned by `refuses at 241 placed parts and not at 240`, now mutated (`>` to `>=` and `REFINE_MAX.placed + 1` both fail); an off-grid value landing an ulp off — closed, zero deltas are not printed so no phantom line; an unplaced definition counting toward distinct parts — FIXED: `distinctParts` counts root parts plus the parts of definitions a placement reaches (root instances, recursively through definitions' own instances, once each, cycle-safe), pinned for an unplaced definition and for one reached only through another; the estimate recomputing per keystroke — closed, cheap (the gate runs once per document); two `role="status"` — FIXED: one status region holding a `<p>` per message (refusal unless a repair notice replaces it, bad limit, storage), none lost, and none when there is nothing to say (the bad-limit message now sits with the others below the form); the `' turned'` string duplicated in its merge key — FIXED: one `TURNED` constant; the change list lost on close-and-reopen mid-run — closed, joinery's pattern.

## From the refine-joined round — 2026-10-09

**240. Saved projects joined before `a899b51` may carry duplicated AND phantom mortises.** Joinery's
`applyJoints` cloned the flat board list as a whole, so twin placements of one definition shared one
`cuts` array: every joint landed in both copies — a duplicated mortise for joints both copies had,
and a phantom mortise in one copy for a joint only the other had. Any shared assembly joined since
the assemblies round (2026-10-06) may show these on its cut list. Fixed going forward in `a899b51`.
Refine's gate refuses such projects (safe; its message blames a hand edit). A load repair could drop
exact duplicates but not phantoms; the real remedy is re-running Add joinery from the unjoined
original.
- **Status:** closed 2026-10-09 (repair-joints round). A "Repair joints" action in the Refine and
  Joinery dialogs (`src/generate/joints/repair.ts`) de-duplicates cuts on twin parts (same last id
  segment and own name), reads the joints back leniently, accepts only twin strays (equal to a
  twin's explained cut, empty — nothing occupies it — and stored in the same part as that twin, the
  user's ruling after the final review), prunes, keeps stored values in the re-join's
  order, proves the result with `gateUnjoin`, and saves `<name> — repaired` without adopting it.
  Fixtures made by the buggy code (`src/generate/joints/fixtures/`) measured the damage: only
  RECEIVING pockets were doubled (a lengthened part's waste cuts got their own array). Projects not
  damaged this way get no message (evidence rule); damage it cannot account for is refused. Accepted
  cost: a phantom in an assembly the buggy write-back had also split for another reason is refused.

**241. A design that tips gets repair rounds on every refine.** Part-less problems (`tips`, size
limits) are always new by the user's limits ruling, so a refine of a design that already tipped
spends repair calls on it each time.
- **Status:** open by decision (a tipping design is a defect); revisit if it proves costly.
**Status:** open by decision. (triaged 2026-10-16)

**242. The join stage's repair text isn't labelled as joinery,** and the estimate note understates
the possible joinery calls (up to 1 + MAX_REPAIRS). Cosmetic, but it is money (see fu 236).
- **Status:** the money half closed 2026-10-09 with fu 236 (a joined Refine's high end includes
  joinery's every round). The repair text CLOSED 2026-10-10 by the join-repair-text round: joinery's rounds in a joined Refine read "Choosing joints — fixing N issues…" / "— retrying…"; see `docs/history.md`.
**Status:** closed (the money half 2026-10-09 with fu 236; the repair text 2026-10-10). (triaged 2026-10-16)

**243. Small gaps the round judged fine to leave.** Record-only.
- `gateUnjoin`'s unmapped-joint refusal is redundant with the compare; the named-part filter on
  `alsoPresent` is unpinned; half-lap records always carry `side: -1` (consistent with `findSites`).
- `refineDesign`'s `'cuts'` refusal is defence-in-depth (Refine's gate runs first).
- Re-opening a colliding kept joint re-opens every non-butt kept joint touching the named parts,
  not only the culprit (may over-open a few).
- **Status:** CLOSED 2026-10-10 by the record-only round (`docs/history.md`), item by item:
  the unmapped-joint refusal — no change (it is `rejoin`'s null branch; removing it buys nothing);
  the `alsoPresent` named-part filter — pinned (`src/generate/alsoPresent.test.ts`, mutated);
  half-lap `side: -1` — no change (consistent with `findSites`); the `'cuts'` refusal — already pinned
  (`refineDesign.test.ts`); over-opening — closed by decision (the user's re-open ruling; it costs a
  few extra site choices).

## From the repair-joints round — 2026-10-09

**244. Small gaps the round judged fine to leave.** Record-only.
- A cut duplicated by hand on a part with a twin earns the repair note (de-duplication counts as
  evidence); building one exactly takes deliberate hand-editing.
- `repairDocument` runs unguarded in the dialogs' memos (as `plainForRefine` does); a throw there
  would break the dialog render.
- A finished repair is cleared only when the dialog closes.
- Untested: the App wiring (covered live), `repairDocument` passing a refusal through, `unjoin`'s
  internal refusal text after the `readJoints` split. A test guard matches twins by id only.
- Not driven live: the refused-repair text, a storage failure, the nested and turned fixtures.
- **Status:** CLOSED 2026-10-10 by the record-only round (`docs/history.md`), item by item:
  the hand-duplicated cut — closed by decision (deliberate hand-editing; dropping an identical
  duplicate changes no geometry); the unguarded memos — FIXED: `repairDocument` and `plainForRefine`
  catch, log, and return their usual refusals (`src/generate/throwGuards.test.ts`); the finished
  repair cleared on close — closed by decision (Refine's and joinery's pattern); untested — the
  pass-through and `unjoin`'s whole reason now pinned, the twin guard matches id AND own name, the
  App wiring stays covered live; not driven live — all four driven
  (`docs/browser-verification-repair-joints.md`, "Follow-up 244's live pass").

## From the joinery-end-cuts round — 2026-10-10

**245. A full-span cut stored into the OPPOSITE end stays put when the other end grows.** A cut with
`face === d` spanning all of `d` (e.g. a full-length back-edge rabbet stored `face: 'length'`, `from: 'max'`)
is stored into the MAX end. When the MIN end grows, `refaceFromEnd` does not touch it (spec §2 re-faces only a
cut stored into the MOVING end) and the old rule leaves it in place, so it ends 1/4in short at the min end
(`[0.25, 20.5]` in the probe, against `[0, 20.5]` for the same rabbet stored `from: 'min'`).
- **Reach:** hand-made only. `pocketFor` picks the shallowest face, so joinery never stores such a cut.
  Pre-dates this round (the same on master before it).
- **Status:** CLOSED 2026-10-10 by the opposite-end-cut round: `rebaseCuts` re-faces every `face === d` cut
  that REACHES the moving end — stored from it, or stored from the other end with a depth spanning all of `d`
  — so the max-stored rabbet runs out the grown length like the other forms; a partial far-end cut is left as
  stored (its stored form is pinned, so it does not churn). Spec §2 amended.

## From the posture-handedness round — 2026-10-10

**246. Small gaps the round judged fine to leave.** Record-only; the final reviews' deferred minors.
- **Stale comments.** `PartDiagram.tsx`'s `TOP` doc ("nothing is DRAWN above it") and module doc still describe
  columns as growing only downward; a vUp column's labels now sit above the outline after the lift.
  `docs/diagram-overlap-sweep.js` (~line 41) says no text is drawn above the outline and quotes a 5.83 clearance;
  a lifted depth label sits 4 units from the viewBox top. The browser overlap sweep was not re-run on flipped views
  (the live check read one flipped view by eye: no overlap).
- **Tests.** `snapPoints.test.ts` (~line 204) cites another test by line number; the one-sided joint probes in
  `unjoin.test.ts` pin the face, floor and one side of each in-plane span, not the far bounds; the restated
  "version-8 never mirrored" test checks the on-edge branch's stored values only (world solids are covered by the
  v12 migration cases).
- **Status:** CLOSED 2026-10-11 by the fu 246/226/227 round, item by item.
  - **Stale comments:** `PartDiagram.tsx`'s `TOP` doc and module doc now describe the vUp lift; the sweep's
    TOL comment is re-measured (below).
  - **The sweep, re-run** on the dev server on a fixture with stopped and positioned cuts on all six views at two
    part sizes (12 views, 54 rotated column labels): no overlaps, nothing outside the viewBox; the highest text sits
    5.32 units below the top on a lifted view, 4.75 on an unflipped one. **Finding:** its P3 check
    ("left-of-board") predates the rotated leader columns, which stand left of the outline by design, and flagged
    every column label on every view, flipped or not. A rotated label lying wholly in the column band left of the
    outline is now exempt from P3 (one straddling the outline's edge is still reported), and the re-run is clean.
  - **Tests:** the line-number citation in `snapPoints.test.ts` now names the test; the one-sided pocket probes
    pin every bound 0.05in either side (mutation-checked by shortening the pocket); the version-8 test now compares
    the on-edge part's world solids against the v8-v11 frame written out by hand (mutation-checked).


## From the mirrored-instances round — 2026-10-11

**247. Small gaps the round judged fine to leave.** Record-only; the reviews' deferred minors.
- **`sameSideFirst` in `linkBoards` is dead since the round-3 fix** (Link writes no shared field through an
  occurrence; the posture pivot keeps X/Z centre and min height, which a mirror leaves alone). Harmless; three texts
  still say the side matters for Link: the comment at `linkBoards`, spec §4 "through an occurrence on the source's
  side", CLAUDE.md invariant 46 "each lowered alone". It is still load-bearing for the shared POSTURE write in
  `updateBoards`.
- One edit changing posture so `d0` moves AND the new `d0`'s size, without keepWorld, could reuse a symmetric stored
  cut whose reflection differs. Properties edits one field at a time; looks unreachable.
- `replaceKeepingBox` uses non-null assertions on `instanceAt`/`definitionAt`; both callers guard first.
- The joinery split test (`joints/mirrored.test.ts`) asserts the split, not that the Shelf itself got cuts.
- `linkBoards`' pivot write would be skipped silently if `partAt` failed to resolve; `linkPlan` makes it unreachable.
- **Status:** record-only.

## From the ui-polish round — 2026-10-11

**248. The new viewport colours have not been seen on real hardware.** The maple ground `#ebe3d4`, grid
`#d3c7b3`/`#9c8f7b`, hemisphere ground `#bfb29e` and the oak selection emissive `#c8955a` (spec §2.1) were only
rendered by llvmpipe here (26a). Colour constants only, no shader change, so the undefined-behaviour risk 26a is about
does not arise; what is unconfirmed is how the colours look on a real GPU and display.
- **Status:** closed 2026-10-11 — the user looked on real hardware after the deploy: "The viewport colors look fine."

**249. The cyan edge-midpoint snap marker is the weakest on the maple ground.** Measured fills against `#ebe3d4`:
corner `#2e9e5b` 2.67:1, edge-mid `#22b8d4` **1.86:1**, face `#8a5fd0` 3.56:1, guide `#4f6fd0` 3.65:1; the ring
`#f5f2ec` is 1.14:1 (it exists for walnut and all but vanishes on maple). The live pass found all three hovered markers
legible (`docs/img/ui-polish-snaps.png`); the cyan reads by hue rather than lightness. Not a regression: the old ground
`#e6e3dd` gave the same ratios to two decimals.
- **Closed 2026-10-11: recoloured at the user's request** ("they do kind of stick out") to muted milk-paint tones:
  corner moss `#3a6028`, edge-mid verdigris `#378988`, face mulberry `#753c60`, guide (and tape) slate blue `#5469a6`.
  Found by a search under stated floors, not picked by eye: on the ground 5.71 / 3.23 / 6.40 / 4.17 (was 2.67 / 1.86 /
  3.56 / 3.65); against the ring 6.52 / 3.69 / 7.31 / 4.76; mutual CIEDE2000 ≥ 25 (was 13.7), and ≥ 14.5 under
  simulated deuteranopia and 16.4 under protanopia (was 2.5 and 2.0: the old violet face and blue guide were
  indistinguishable to those viewers); ≥ 37 ΔE from the selected-board oak. On walnut and cherry the fill itself is low
  (1.0–2.0) and the cream ring carries the marker, as before; a RESTING guide has no ring, so it is 1.55:1 on walnut
  (was 1.78). Live: the resting guides drawn on pine, walnut, plywood and the ground at 1920×1080 on the dev server,
  and the user looked and judged the markers fine. The scripted hover sweep of each kind on each wood was stopped by
  the user as unnecessary.
- **Status:** closed; deployed as `index-DrjjRDmM.js`.

**250. Popover and ProjectMenu close on a focusout whose `relatedTarget` is null — before an item's click lands, on
browsers that do not focus a button on click.** Safari and macOS Firefox do not focus a `<button>` on mouse click, so
pressing an item while focus is inside the popup moves focus to nowhere (`relatedTarget === null`), `onFocusOut`
closes the popup, and the item unmounts before its `click` fires: the menu would open and do nothing. A mouse-opened
popup there also never had focus inside it, so Escape (listened for on its subtree, invariant 27) never reached it.
Chromium and Firefox on Linux focus the button, so `relatedTarget` is the item and the popup stays (driven live with
real clicks in this round).
- **Popover: fixed** in the final-review fix wave. The trigger focuses itself in its own `onClick` (Escape reaches the
  subtree), and a null-`relatedTarget` focusout is ignored while a pointer is down inside the root (set on the root's
  `pointerdown`, cleared on a window `pointerup`/`pointercancel` while open, reset on open). With no pointer down it
  still closes. Pinned by `Popover.test.tsx` (pointerdown, null focusout, click → `run` once and closed; trigger click
  leaves focus on the trigger; a released press no longer guards), each mutated red. Still only simulated: no
  Safari/macOS Firefox exists on this host.
- **ProjectMenu: fixed** 2026-10-11, after the deploy, at the user's request. Popover's guard ported verbatim
  (`pressing`, set on the root's `pointerdown`, cleared on a window `pointerup`/`pointercancel` while open, reset on
  open). Unlike Popover's items, two of its controls leave the popup OPEN (Duplicate, the × that arms a delete), so
  they and the caret focus themselves in their own `onClick`: on those browsers focus would otherwise sit on the body
  after the press and Escape would stop reaching the popup. The arm/disarm swap is untouched (the same `<button>` at
  the same sibling index; focusing it before `setArmed` leaves focus on the confirm). Pinned by seven tests in
  `ProjectMenu.test.tsx`, each part mutated red (guard, caret focus, duplicate focus, arm focus, window `pointerup`,
  reset on open). The reset on open was unpinned in Popover too; `Popover.test.tsx` gained the same stale-press test,
  mutated red. Still only simulated: no Safari/macOS Firefox exists on this host.
- **Status:** closed; deployed as `index-c2pDi0bK.js`. Only a real Safari or macOS Firefox can confirm it.

**251. Small gaps the round judged fine to leave.** Record-only; the task reviews' deferred minors.
- **Closed in the final-review fix wave:** the stale comments (`BoardMesh.tsx`'s "Brass", the `.toolbar-hint`
  citations in `styles.css` and `TapeReadout.tsx`, the sidebar-width figure in `styles.css`, `Toolbar.tsx`'s doubled
  "the"), the dead `generate-limit` class, and the missing test that a guide placed after the user closed the footer
  reopens it.
- **Dead or dangling.** `.add-cut` has no rule; `GuidesFooter`'s `aria-controls="guides-body"` points at nothing while closed.
- **Tests.** `palette.test.ts` reads `src/styles.css` relative to the cwd (`?raw` is `''` under Vitest and
  `import.meta.url` fails under jsdom); Popover and ActionBar key items by label (unique today); no test of Popover's
  `align`/`title`; ViewportControls' ported
  "independent" test dropped its two initial-state asserts (covered by its `it.each`); `App.test.tsx`'s Claude-item
  `it.each` takes string keys and branches.
- **Palette values.** The ink tokens differ from spec §2's table: one scale per material (walnut `#ece4d6`/`#b9ad9c`/
  `#a09482`, grey `#ece9e4`/`#c8c3bb`/`#a19c94`); the spec's `--ink-faint` `#857a6c` was 3.64:1 on walnut-900, below
  the floor. No value was nudged in a live pass. Final ratios: `docs/browser-verification-ui-polish.md` §8.
- **Placement.** A single part's Delete (the trash icon) now sits at the top of the panel, beside the actions (spec
  §4.2); watch for accidental clicks. Delete is undoable.
- **Status:** record-only.


## From the plans-sheet round — 2026-10-11

**252. Numbered callouts linking the exploded figure to cut-list rows.** The exploded isometric names no part; a
reader matches it to the cut list by eye. Spec §9, out of scope by decision.
- **Status:** closed 2026-10-16 (plans balloons round, spec `2026-10-16-sloyd-plans-balloons-design.md`): one numbered balloon per
  cut-list row on the exploded view, in columns beside it, a leader to a line drawn for the part; the cut list prints the row
  number, and (the user's ruling) its sheet and board layouts label small parts with the same row number. Feature callouts
  stay 333, 279, 362; residue 380.

**253. User-placed dimensions.** The sheet's dimensions are automatic (overall plus chains, `document/dimensions.ts`).
A dimension tool whose dimensions live in the document needs a schema bump (14) and a rollback cost; spec §9.
- **Status:** open.
**Status:** open (feature; needs a spec) (schema bump). (triaged 2026-10-16)

**254. Real print-to-PDF of the Plans sheet is unverified.** Only `emulateMedia('print')` was driven (Playwright
exposes no `pdf()`; the same limit as fu 70/79/84). Unconfirmed: page breaks and the ink on a real printer. The print
ink bug (F2) was found by the emulated pass and fixed. See `docs/browser-verification-plans-sheet.md`.
- **Known overflow — FIXED 2026-10-12 (the user chose a height cap), deployed as `index-Dk0nNgH6.js`.** `layoutTrio` fitted width only, so a trio
  with (front h + plan h)/(front w + side w) above about 1.15 was taller than a printed Letter page (a 36w x 12d x 72h
  bookcase: 1000 x ~1564 units, about 11.7 in tall at 7.5 in wide). Now the scale also fits `TRIO_MAX_HEIGHT` (1250
  units, Letter's printable ratio with room for the heading); the bookcase comes out 820.6 x 1250. Second half of
  the same bug: `.plans-figure` is `width: 100%`, which would have stretched the narrower figure back to full width
  and off the page again, so each figure is now drawn at its share of the page width (`pageWidth` in
  `PlanFigure.tsx`; the exploded figure too, whose own height cap had the same hole). Tests pin the bookcase case
  and the on-page width; both were mutated.
- **Status:** open only for the real print dialog (page breaks and ink on a real printer); the overflow is closed.
**Status:** open (owed to the user, not code): a real print. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 by the user's real print ("A real print looks good"; see fu 70's last Status).

**255. The explode spread constants were approved only on software GL.** `EXPLODE_SPREAD` (1) and `EXPLODE_INNER`
(0.5) in `document/explode.ts` were judged on llvmpipe (fu 26a). They are plain numbers feeding translations, not
shader behaviour, so the 26a risk does not arise; what is unconfirmed is how the spread reads on real hardware and a
real display. Retuning changes only those two constants (INNER must stay below 1, spec §3).
- **Status:** open; a look on real hardware closes it.
**Status:** open (owed to the user, not code): real hardware (26a). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the spread reads clearly.

**256. Section views (a clipping plane).** To see inside a joint on the sheet or in the viewport. Spec §9.
- **Status:** open.
**Status:** open (feature; needs a spec) for the SHEET half: the viewport half shipped as the section cut (2026-10-15, inv 51); section views on the Plans sheet remain. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-17 — section views on the Plans sheet (spec `2026-10-17-sloyd-section-views-design.md`, plan
`…-section-views.md`): with the viewport's Section on, the piece trio carries an A–A cutting line on one edge-on view and a
hatched Section A–A of the assembled piece follows it (`drawView`'s `section` option; `sectionView.ts`). Residue 384.

**257. Exploding along each joint's engagement direction.** The explode is hierarchical and radial from centres
(spec §3, option B); option C moves parts along the direction they slide apart. Spec §9.
- **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**258. Live dimension annotations in the viewport.** The sheet is the only place dimensions show; the viewport has the
Tape tool and nothing automatic. Spec §9.
- **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**259. Small gaps the plans-sheet round judged fine to leave.** Record-only; the task reviews' deferred minors.
- **T1.** `hiddenSpan`'s positive-test comment says s=1 (it is s=sqrt(3)); `Math.max(0, s0)` / `Math.min(1, s1)` are
  redundant; `Math.min(...spread)` in bounds would hit the argument limit around 100k corners (about 12.5k parts).
- **T2.** The explode cache is per amount (bounded by the 0.05 slider step); the cached Vec3 arrays are shared and
  mutable; the "not radial" test partly duplicates test 1.
- **T3.** The all-coordinates-collapse branch is untested; no SIDE axis-name assertion.
- **T4.** The mirror test does not assert copies; no dangling/cycle test (load repair removes them); an inline
  container type; `?? 1` could hide a `placementsOf` mismatch.
- **T5.** `setTapeAnchor`/`setTapeHover`/`grabSnapPoint` are ungated (unreachable with the tool forced to Select); five
  entry guards (`moveGroupTo`, `updateBoards`, `addCut`, `linkBoards`, `commitSnapMove`) are redundant behind `edit()`
  in practice and untested.
- **T6.** Viewport subscribes to `doc` twice.
- **T7.** Zero-size layout, the `layoutSingle` cap and the `fitChain` `<=` boundary are untested.
- **T8.** No test pins dimension/outline placement (the browser pass checked it).
- **Spec §7 tests not written:** drawing through a mirrored instance, `chiralPart` pose coverage, explode counting
  hidden parts (all guaranteed by construction); the three-stick test asserts "> 1in lost", not hand-derived crossings.
- `docs/img/plans-explode-viewport-50.png` is about 1 MB.
- **Status:** record-only.

**260. F / Home frame the unexploded positions while exploded.** `CameraKeys` frames the assembled boards; fix by
passing the explode offsets.
- **Fixed 2026-10-13 (standard views + image export round).** Every framing — F, Home, the projection swap and the new
  standard views — boxes the parts where they are DRAWN: `subsetBounds` (`viewport/framing.ts`) takes the
  `explodeOffsets` map, read at call time; at explode 0 the arithmetic is the old `THREE.Box3` path's. Pinned by
  `framing.test.ts` (offsets moved the box; `explodeOffsets` keys every `worldParts` id) and seen live
  (`docs/browser-verification-standard-views-image.md`).
**Status:** closed 2026-10-13 (standard views round: `subsetBounds` takes the explode offsets). (triaged 2026-10-16)

**261. Renaming in the parts list reverts silently while exploded.** `PartsList` is outside the edit lock (same class
as F3); make it visibly disabled.
- **Status:** open.
- **Closed 2026-10-15 as not reproducible (follow-ups session).** The parts list has no rename control and never had
  one (`git log -S NameField -- src/panels/PartsList.tsx` is empty): renaming lives in Properties, inside the lock, and
  the header's Project name field is `disabled` while exploded (Toolbar.tsx). Nothing in the parts list writes the
  document except the eye (hide is view state, live by design). **Status:** closed.

**262. The blanket edit lock also disables view-only controls.** Select copies / Select linked / the open buttons in
Properties, and the guides footer's own disclosure toggle.
- **Status:** open.
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`).** App's two blanket fieldsets are gone; `EditLock`
  (panels/EditLock.tsx, the same fieldset) wraps only editing regions: in Properties the name and everything below the
  action bar, with Select linked outside and Unlink inside; in the guides footer the list, not the disclosure. The
  ActionBar sits outside and disables its own actions while exploded except those marked `view` (Hide others, Select
  copies), More ▾ disabled only when nothing in it is live, Delete locked; Popover items gained `disabled`. Store gates
  are unchanged (the three view actions were already allowed while exploded). Tests: App (view actions live, editing
  ones and Delete locked; the guides list locked, its disclosure live) and Properties (Select linked selects while
  exploded, Unlink and Length disabled). Seen in the dev browser: the panel lays out as before. Found in review before
  the merge: the Copy in a row form renders beside the bar, so moving the bar out of the lock left a form opened BEFORE
  exploding live (Apply then silently refused by `edit()`); it is wrapped in `EditLock` inside ActionBar (test: opened,
  then exploded — Apply and Count disabled; red without the wrapper). Its Cancel is locked with it (the form's one
  fieldset); a selection change or Explode back to 0 frees it. The view-only set was approved by the user 2026-10-16.
  **Status:** closed.

**263. The sheet slider recomputes the isometric synchronously.** About 130-250 ms per step at furniture scale
(measured in node); consider `useDeferredValue`.
- **Status:** open.
- **Closed 2026-10-15 (follow-ups session, with fu 344).** The sheet passes the exploded figure `useDeferredValue(amount)`,
  and `ExplodedFigure` and `PlanTrio` are `memo`ised: a tick re-renders the sheet and the slider at once, the trios not at
  all (their props never change), and the figure at low priority with the latest value. With fu 344 a drilled piece's
  figure is also ~2x cheaper. Not measurable in jsdom (concurrent rendering); the existing test still sees the figure follow
  the slider. A real-browser feel is owed with the sheet's other real-hardware looks. **Status:** closed.

**264. A piece wrapped in ONE top-level assembly explodes at `EXPLODE_INNER` spread.** The first term is zero, and the
sheet draws that wrapper as a duplicate of the whole piece.
- **Fixed 2026-10-12 (the user asked for the fix), deployed as `index-ulm_-ktQ.js`.** One principle in both places: a container with ONE child is
  not a level. `explodeOffsets` gives full weight to every term until the first BRANCHING container is passed, and
  EXPLODE_INNER only below it, so a wrapped piece explodes exactly like the unwrapped one (a doubly wrapped one too).
  `planAssemblies` skips a definition every one of whose placements is the sole child of its container; its
  sub-assemblies are still drawn, titled through it. Normal documents are unchanged (their root branches). Tests pin
  both, each mutated.
- **Status:** closed.

## From the lumber yield & cost round — 2026-10-12

**265. Per-project price overrides (the user's option C).** Prices are browser-level only; a project carries none, so
an exported project does not say what it was priced at. Overrides would need a schema bump. **Status:** open.
**Status:** open (feature; needs a spec) (schema bump). (triaged 2026-10-16)

**266. Custom materials and nominal lumber names.** `MATERIALS` is still a fixed seven; ash, poplar, 5x5 Baltic birch
and nominal names (2x4 = 1-1/2 x 3-1/2) are not expressible. `ShopSettings` is keyed by material, ready for more.
**Status:** custom materials done 2026-10-14 (chunk 1, branch `custom-materials-1`; spec
`docs/superpowers/specs/2026-10-14-sloyd-custom-materials-design.md`, schema 15); nominal names done 2026-10-14 (chunk 2,
merge `bfde00c`, deployed, no schema change). **Closed.** Residue: 324, 325, 326.
**Status:** closed 2026-10-14 (custom materials, both chunks). Residue 324–326. (triaged 2026-10-16)

**267. Edge banding and a hardware bill of materials** (`docs/feature-gaps.md` §3). **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** the BANDING half: spec `docs/superpowers/specs/2026-10-19-sloyd-edge-banding-design.md` (approved 2026-10-19);
**chunk 1** (schema 19: band types, bands, the corner rule, `banding.ts`'s arithmetic, the cut list's core sizes, band lines
and strip rows, nesting at core size, Buying's strips and Edge banding block, Properties' Banding section, the Materials
dialog's Edge banding section, Curves' band refusal, joinery/Refine/Repair refusing banded projects) **built** on branch
`edge-banding-1` (2026-10-20), merged to master as `b7f700b`; deploy pending the user. **Chunk 2** (viewport looks, Plans
sheet glue lines and keys, part diagrams) is next. The HARDWARE half (a hardware bill of materials, with fu 332's dowels)
stays open, feature-sized, for its own spec. Residue: 395–401.
**Status:** the HARDWARE half is CLOSED by the hardware round (schema 20; spec `docs/superpowers/specs/2026-10-20-sloyd-hardware-design.md`; merged `98c7df4` and deployed 2026-10-21 as `index-BZhrLswD.js`): hardware types, counts on parts, assemblies and the project, the cut list's Hardware section, Buying's Hardware block. Residue: 404–412.

**268. Glue-ups from narrow stock.** A part wider than every stock board is "too wide"; edge-gluing narrower boards is
not modelled. **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** closed — the glue-ups round (2026-10-29, option A: derived in Buying, no schema change; spec
`docs/superpowers/specs/2026-10-29-sloyd-glue-ups-design.md`). A by-the-piece part no listed stock is wide enough for is bought as N
equal strips (`gluePlan`); residue fu 556–567.

**269. The by-the-piece packer is a heuristic.** Largest-first then swap-down is not an optimum; a mix of sizes that
needs a different split across boards is not searched. **Status:** open; measure before reaching for an optimiser
(the follow-ups 140/160 rule).
**Status:** open (measure first): no case where swap-down loses to a better split has been measured; find one before any optimiser (fu 140/160). (triaged 2026-10-16)
**Status:** MEASURED 2026-10-17 (follow-ups 6), a fix awaits the user. Brute force over every split of 3–6 parts against the packer + swap-down, three price sets: 1×4 with long boards dearer per foot — the packer loses in 104 of 150 jobs, worst 44% (26", 74", 17", 68": $26 as a 12′ + 6′ against $20 as two 8′); 1×6/1×12 mixed widths 55/150, worst 16%; long boards cheaper per foot 45/150, worst 16%. Cause: it always opens the LONGEST size. A candidate measured on the same jobs — also pack with each size as the preferred opener, swap down, keep the cheapest plan — is never worse than today and cuts the losses to 23 (17%), 33 (15%), 22 (13%).
**Status:** CLOSED 2026-10-17 (the user: "go ahead with the multi-start fix"). `packOnto` takes an optional preferred opener;
Buying builds the largest-first plan and, when its every board has a price, one more plan per size preferred, each swapped
down as before, and keeps the strictly cheapest (a tie keeps largest-first: fewer boards). **Ruling, for the user:** with no
prices (the DEFAULT pine stock) the plan stays largest-first, byte-for-byte — comparing unpriced plans by wood bought turned a
150-part default project from 37 boards (mostly 1×12) into 53 narrower ones, a visible change the price-framed approval did not
cover; "least wood" for unpriced stock is the user's call. Tests (`purchase.test.ts`): the measured losing job ($26 → $20); 60
random jobs bounded by the old plan above and a brute-force optimum below; a tie; price over wood; unpriced unchanged; two old
expectations corrected ($21 → $18 for 40/40/30 on 1×6: two 6′; the total $100.50 → $97.50). Every branch mutated. Cost: 4.2 ms
→ 27.5 ms for 150 priced parts × 36 sizes (unpriced: unchanged). Live (dev server): "Buy 2 × 1×4 × 8′ · $20.00".
**Status:** CLOSED 2026-10-17; the ruling confirmed by the user: "keep unpriced as is" — unpriced stock stays largest-first.

**270. US dollars only.** `formatMoney` is en-US `$`. **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**271. Rough thickness classes (4/4, 8/4) as named stock** for board-foot materials, and a thickness the user does not
stock (a 5/8" walnut part is priced as 5/8" stock). **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**272. The Lumber & prices dialog is long on a small screen** (fourteen pine sizes; it scrolls). Not judged on a phone.
**Status:** open, cosmetic.
**Status:** open (owed to the user, not code): a phone look at Materials & prices (longer since custom materials). (triaged 2026-10-16)


**273. Pricing one size pulls small parts onto it, with no hint (spec §3.2 step 4, for the user to decide).** With only
the 1x12x96 priced, a 30" x 1" strip that needs its own board is bought as a $20 1x12 rather than an unpriced 1x2x72:
"a priced size is preferred over an unpriced one only when both fit" is the spec's rule, and the total gives no hint.
A note ("priced as 1x12; a 1x2x72 would hold it — no price set") is one option. Found by the final review.
- **Fixed 2026-10-12 — the user chose the note; deployed as `index-TRoZVkeX.js`.** The rule is unchanged; when a board is bought as a priced size and a
  SMALLER unpriced size would also hold its parts (proved by the same re-pack), the Buying section adds e.g.
  `1 board priced as 3/4" × 11-1/4" × 96" — a 3/4" × 1-1/2" × 72" would hold its parts (no price set)`, once per
  (priced, smaller) pair with a board count. Tests pin one board, two boards sharing a pair, and no note when the
  chosen size is already the smallest; both the note and its grouping were mutated.
- **Status:** closed.

**274. End-grain parts are not priced by the piece.** A part with grain through its thickness (an end-grain block) is
listed as not placed ("has end grain — not priced as pine stock") rather than priced as long grain, which would buy
stock that cannot yield it (final review). Modelling it means the part's thickness runs along the stock and its
length x width must fit the stock's thickness x width. **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

## From the angle cuts round (chunk 1) — 2026-10-12

**275. Stopped angle cuts** (a stopped chamfer, a two-stage taper). Spec §11. **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**276. Angle-aware joinery** (splined and biscuited miters). Add joinery, Refine and Repair joints refuse angled
documents (spec §6). **Status:** open for the joint kinds (splined, biscuited, keyed miters). Accepting angled documents
is the AI-angles spec (`2026-10-13-sloyd-ai-angles-design.md`): chunk 1 (2026-10-13) lets Add joinery and Repair run on
mitered, beveled and chamfered projects, refusing only an angle cut that runs into a joint; chunk 2 (2026-10-14) lets Generate
and Refine write them. Both chunks deployed; only the angle-aware joint kinds remain.
**Status:** open (feature; needs a spec) (the joint kinds only). (triaged 2026-10-16)

**277. Generate emitting tapers and miters.** `designToDocument` emits `angleCuts: []`. **Status:** closed 2026-10-14 — tapers
(AI tapers chunk 2) and miters, bevels and chamfers (AI-angles chunk 2, merge `a4914f1`, deployed 2026-10-14): Generate and Refine write them in
world words (`angleWorld.ts`); live: one Generate gave four chamfered legs linked through turns, a top chamfered on four
edges and a flat 45° picture frame; one Refine changed only the top's chamfers.

**278. A "taper all four faces" shortcut.** **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** closed (presets batch, 2026-10-17): `+ Add ▾` → Taper two faces (a leg's inside faces) and Taper four faces; independent rows, one undo entry, one amount (¼ of the thinner cross dimension).

**279. Angle callouts on the Plans sheet** (see fu 252). **Status:** open.
**Status:** open (feature; needs a spec) (feature callouts, with 333 and 362; 252 closed). (triaged 2026-10-16)
**Status:** closed 2026-10-16 (feature callouts round, spec `2026-10-16-sloyd-feature-callouts-design.md`): every angle cut gets a lettered tag on its trio, in the view where its slope is edge-on, keyed `Miter 45.0°`, `Bevel 15.0°`, `Chamfer 1/4"`, `Taper 1/2" over 20"`; seen live on a mitered, tapered table. Residue 381.

**280. Compound angles** (an angle cut that is sloped in two axes). **Status:** open.
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**281. The short point formula is wrong for parallel end cuts (spec defect, for the user to decide).** Spec §4.2
subtracts each end's deepest depth even when the two deepest points are at opposite edges. A 20 × 3-1/2 × 3/4 brace
with parallel 45° ends prints a short point of 13", where both real long edges are 16-1/2". Proposed fix (final
review): the minimum over the end-face corners of L − depth_min_end − depth_max_end, clamped at 0. Reachable only from
hand-edited files until chunk 2's Miter preset. **Fixed 2026-10-12** (user-approved): `shortPointLine` takes the corner
minimum; spec §4.2 amended; tests cross-checked against `boardBodies` vertices. **Status:** closed.

**282. Sloped-face shading and grain are unverified on real hardware (26a).** Browser checks ran on software GL;
lighting on sloped faces and grain continuity across a slope need the user's eyes.
- **Confirmed 2026-10-12 — the user judged tapers and miters on real hardware and approved them.**
- **Status:** closed.

**283. Add joinery with an API key present on an angled project was not seen live** (no key in the dev profile). The
refusal is pinned by tests (no mutation, no paid call). **Status:** open, needs a key.
**Status:** open (owed to the user, not code): needs the user's key (a refusal, so no paid call). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-27 — seen live with the user's key stored on the dev origin: a leg with two rails, Rail X mitered at the end
that meets the leg; Add joinery's dialog opened with `Rail X's miter runs into its joint with Leg — add joinery before cutting it, or
remove it.` and its Add joinery button disabled; the browser's requests to `api.anthropic.com` were the same three before and after
(no call).

**284. Test-coverage gaps (record-only).** No bodies test with two or more angle cuts on one part (a cap clipped by a
second cut); the mortise + taper test does not overlap the two regions; the drift check loops only `d1` entries (add a
length assertion); near-coincident tests skip the |delta| <= BODY_EPS band (add +-5e-10); "draws exactly as before"
only asserts `box !== null` (compare `worldBodies` boxes to `worldSolids` on a turned non-flat pose with a cut); no
committed occlusion/plane-containment test for on-edge or turns 90/270; zero-area triangle skip unpinned; no direct
`runRefine`/`refineEstimateUsd` angled test; `useJoinery` refused-to-failed branch untested; no stale-draft-after-undo
field test; the plan's miter tie-break test cannot fail (comment pointing at the bevel tie test); duplicate document
import in `grainTiling.test.ts`; `angleCuts: []` added to `after` spreads in `treeEdit.test.ts` unnecessarily.
**Status:** open, record-only.
**Status:** record-only (was "open, record-only"). (triaged 2026-10-16)

**285. The geometry cache goes cold after long resize drags or more than 256 distinct geometries.** `partGeometry`'s
LRU is keyed by a board-local geometry signature and capped; past the cap it recomputes (slow, never wrong). **Status:**
open, record-only.
**Status:** record-only (was "open, record-only"). (triaged 2026-10-16)

**286. `depthAt` overflows for finite-but-huge slopes (hand-edited files only).** Validation requires a finite slope
and finite station span, but a huge finite slope can still overflow the depth. **Status:** open, record-only.
**Status:** record-only (was "open, record-only"). (triaged 2026-10-16)

**287. Sloped snap corners carry ~1e-14 noise**, against invariant 25 (exact moves are never rounded) and
`sameSnapPoint`'s exact comparison. **Status:** open; decide whether a snap tolerance or a canonical corner is wanted.
- **Closed 2026-10-16 by the user's ruling: record-only.** Measured: on `chiralAngled` in every posture and turn, 16 of 936
  snap coordinates sit one ulp off a 1/64" step (a turned part's corner at `13.124999999999998`). Deterministic (the same
  arithmetic every time, so `sameSnapPoint` still matches its own points), rounded away by every display, and no size or
  cut depends on it — only a snapped position stores it. **Status:** closed, record-only.

**288. SLIVER / BODY_EPS sub-micro behaviour.** Hand-edited features below ~1e-6 in draw approximately (spec ruling);
the coplanar test's absolute 1e-9 on |n.u| should be noted in the SLIVER comment; `boardEdges` has no output filter for
segments shorter than SLIVER; `boardEdges` with angle cuts costs ~35-100 ms per call on a heavily cut part before the
cache (measure a heavily joined part on Plans). **Status:** open, record-only.
**Status:** record-only (was "open, record-only"). (triaged 2026-10-16)

**289. Duplicated code.** `treeEdit` `copyDefinition` and `treeOps` repeat the same plain-part copy expression
(pre-existing); the plane-collection one-liner is duplicated in `cuts.ts` and `snapPoints.ts`; `boardBodies` is
computed twice per sloped part in `boardSnapPoints` (ghost check and `boardEdges`); `drawing.ts` uses a double cast
`as unknown as Vec3` and computes box corners twice. **Status:** open, record-only.
**Status:** record-only (was "open, record-only"). (triaged 2026-10-16)

**290. Zero-area Float32 slivers in `bodyMesh`.** The absolute 1e-12 triangle skip misses ~BODY_EPS slivers that may
collapse in Float32 (cosmetic); the unit-pin for the skip is missing. **Status:** open, cosmetic.
- **Closed 2026-10-16 (follow-ups session 2), measured:** over 17 fixtures (split curves, holes, angle cuts, every posture)
  `bodyMesh` emits 5788 triangles, none with two equal Float32 vertices or zero Float32 area. `bodyMeshSlivers.test.ts`
  pins that. It does NOT pin the 1e-12 skip itself: with the skip removed the fixtures still emit no degenerate triangle
  (no fixture reaches a sub-1e-12 one). Dropping such triangles was not adopted: a collinear sliver's edges can pair with
  its neighbours', and removing it could reopen the cracks fu 369 closed. **Status:** closed.

**291. `joineryEstimateUsd` is unguarded internally** (App guards the angled case). **Status:** open, record-only.
**Status:** record-only (was "open, record-only"). (triaged 2026-10-16)

**292. Wording: "a long-start taper on a short part".** A taper whose start station lies past the part's far end, or
that deepens toward the far end, is phrased from its deep end (ruling at Task 9); the wording for odd hand-edited
starts has not been reviewed by the user. **Status:** open, the user may prefer other wording.
- **Closed 2026-10-16: the user kept the wording** (shown "Taper off the width face (min side): 3/4" at the length min end,
  1/4" at the length max end" for a line starting past the far end, beside the normal form). **Status:** closed.

## From the angle cuts round (chunk 2, miters) — 2026-10-12

**293. The angle field's max message rounds up past the max it enforces.** Fixed 2026-10-12: `AngleField` floors the limit to the 0.1° it displays (epsilon keeps an exact 45.0), so a 24 x 2-1/2 rail reads "Must be at most 84.0°" and 84.0 is accepted. **Status:** closed.

**294. A miter's bench line does not say which side holds the long point.** Fixed 2026-10-12: the line now ends `, long point on the width min side` (`miterLongSide`, shared with `miterFields`). **Status:** closed.

**295. A row control to add the matching miter at the other end of an edited miter.** Spec §7 amended (chunk 2): "both
ends" is the add-menu preset only; a user who edits one miter adds the match as a second miter by hand. **Status:**
open, by decision.
**Status:** open by decision. (triaged 2026-10-16)

**296. An edit is refused on a part shortened after its miter was stored, until the angle is reduced.** A resize is
not checked against stored miter depths: the 24" rail resized to 2" kept both 45° miters (depth 2-1/2" > length), and
the next miter edit (Long point) was refused with `Removes more than the length — reduce the angle first.`, nothing
written. Seen live (chunk 2). The add-time half is closed 2026-10-12: the Miter and Miter both ends presets are withheld
from the + Add menu on a part wider than long (Taper stays). The resize half stays open. **Status:** open, fails safe.
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`), on the holes/curves precedent (inv 50, 53: a fault a
  resize causes is KEPT and noted, never clamped; an edit refused only when it adds one).** Every angle row now computes
  its stored cut's EXCESS (depth past what it may remove) and notes a positive one — `This miter removes more than the
  length at this size.`, likewise bevel and taper, `This chamfer is bigger than its edge at this size.` — and refuses an
  edit only when the result would overrun by MORE than the stored cut (`worse`). So the shortened rail's miter takes a
  Long point or End change, or a reduction, and is still refused when deepened or moved to a side it would overrun
  further. Stricter than the holes rule (which allows any edit not ADDING a fault kind) on purpose: deepening an
  already-consuming cut has no use. The resize itself is still not refused (the precedent). Tests: the shortened rail
  (note; Long point taken; Across to the thickness fits and clears the note; back across the width refused), a thinned
  bevel, a taper moved to a face it overruns by less (taken) and more (refused), a chamfer moved to an edge it overruns no
  further; each kind's rule mutated back to the old refusal turns its test red. The ruling was approved by the user
  2026-10-16. **Status:** closed.

**297. A hand-edited offset miter is moved to canonical form on its first edit.** A miter whose stored points do not
start at the corner (an offset miter, only reachable by editing the file) is rewritten to the canonical corner-anchored
form by its first row edit. **Status:** open, hand-edited files only.
- **Closed 2026-10-16 (follow-ups session 2).** `miterFields` returns null for an offset line (depth 0 at neither side of
  `along`), the same test `bevelFields` already made, so the row falls back to the bench line and Remove — the AngleCuts
  per-file rule (a reader returns null for what its row cannot represent). Tests: the reader (an offset, a zero inside the
  part, null; the canonical, not) and the row (Remove, no Long point or Angle); both red before. **Status:** closed.

## From the angle cuts round (chunk 3, bevels and chamfers) — 2026-10-12

**298. A raised-panel field bevel has no preset of its own.** The Bevel row runs along the length only and always
slopes corner to corner across the full thickness (or width); an end bevel is the Miter row with Across → Thickness,
also full-depth. A fielded (raised) panel's bevel leaves a flat field and a tongue at the edge, so it reaches neither
corner: it is an unequal-leg chamfer (e.g. 2" into the face × 9/16" into the thickness on each of the four edges —
the long edges along the length, the ends along the width), which `chamferCut` stores but the row cannot make (its
Size field writes equal legs and is a mixed field, `value: null`, on an unequal-leg chamfer). A "Raised panel" preset, or a
second leg field, would close it. Found while writing the chunk 3 live check; not exercised live. **Status:** open, a
feature gap.
**Status:** open (feature; needs a spec) (a preset or a second leg field). (triaged 2026-10-16)
**Status:** closed (presets batch, 2026-10-17): the Chamfer row has one field per leg (`Into the <dim>`; never mixed; a leg a resize pushed past its part may be reduced, never deepened), and `+ Add ▾` → Raised panel adds the four front-edge chamfers, 1-1/2" into the face, a 1/4" tongue (withheld under 1/2" thick). Residue fu 385.

**299. The chamfer Edge select's option text is clipped at the panel's width.** At the default 1726 px window the
Properties panel shows `Width min / thickness min edge (along the lengt` under the caret (`docs/img/angle-cuts-chamfer-leg.png`).
The option text is the full name in the open list; only the closed select is clipped. Cosmetic.
- **Fixed 2026-10-12 with fu 300:** the options are now `Width max side · thickness max side` (≤ 36 characters; the through
  dimension is implied), so they no longer clip. **Status:** closed.

**300. Wording drift across the five presets (for the user to rule on).** The chamfer Edge option text
(`Width max / thickness max edge (along the length)`) uses a different phrasing from the `face (max side)` form used
elsewhere; an end-edge chamfer says `the length face (min side)` where miters and tapers say `the length min end`; and the
chamfer refusal message pattern (`Too big for that edge — reduce the size first.`) differs from the taper/bevel ones
(`Removes more than the … — reduce it first.`). None is wrong; the vocabulary just is not unified.
- **Fixed 2026-10-12 — the user approved the wording:** a length face is named as an end everywhere (`faceName`:
  `the length max end`; other faces `the width face (min side)`), so an end-edge chamfer reads `… between the length max end
  and the width face (min side) …`; the Edge options read `Width max side · thickness max side` / `Length min end · width max
  side`; every refusal follows `Removes more than the <dimension> — reduce the <control> first.` (taper: `the removal`,
  miter/bevel: `the angle`, chamfer edge: `the size`, naming the dimension the leg exceeds).
- **Status:** closed.

## From the AI tapers round (chunk 1, joinery and checks) — 2026-10-13

**301. Mirrored-component legs: inside-tapered legs share no Shape.** A leg whose inside tapers are reflected through a
mirrored instance is a different stored part from its unmirrored twin, so the pair cannot share one Shape (inv 45). Joinery
and the checks are correct; the cost is that a mirrored set of tapered legs is not one component. **Status:** closed
2026-10-13 (turned links; the title's mirrored case is fu 315). `linkByRole` now aligns angle-cut ids (identical tapered
parts never linked before: the converter mints fresh ids per cut, so `sameShared` always differed; a latent bug) and tries
each part's other quarter turns (`turnCandidates`, tapers re-stored via `taperWorld`), so four inside-tapered square legs
become one Shape with turns 0/90/180/270; the prompt gives inside-tapered legs one role. Cut ORDER ruled not geometry:
`regroupShapes` groups by geometry and `sameJoined` compares cuts as a multiset, so a joined and refined table keeps its legs
linked (see fu 316).

**302. Overlap stays box-based for tapered parts.** `overlap` reads `worldSolids` (inv 38), which ignore angle cuts, so a
tapered part can report an overlap on wood the taper has removed. False positives only; a real overlap is never missed.
**Status:** closed 2026-10-13 at the user's word: a pair with a tapered part is measured on the two parts' world bodies
(their intersection, through the bodies' convex clipper `clipConvex`), reported by its extents like today's box overlap; an
untapered pair is unchanged.

**303. The tip check's centre of mass uses box volumes.** `contactSolids` makes the footprint trust only a taper's flat
wood, but the centre of mass is still computed from box volumes (no body centroid), so a heavily tapered part's mass is
overstated. **Status:** closed 2026-10-13 at the user's word: `partMass` weighs a tapered part by its world bodies (each split
into tetrahedra from an interior point); an untapered part keeps its box. The chunk-1 test "the footprint shrinks…" relied
on the overstated weight; its top was widened to 6in so it still tips for the footprint's reason.

**304. The taper-at-joint rule is all-or-nothing.** If any site's patch lies on tapered wood, joinery refuses the whole
document (`joineryRefusal`); skipping the offending joint and joining the rest was proposed and declined by the user.
**Status:** closed by decision; do not re-propose unasked.

**305. Generate and Refine do not emit or keep tapers.** Refine still refuses every angle cut and Generate emits none.
**Status:** closed 2026-10-13 (AI-tapers chunk 2). The design schema's parts carry `tapers` in world directions
(`taperWorld.ts`), stored through `taperCut`; a broken rule rejects the part (`'taper'`). Model-facing `taper-joint`
violations (`taperJointViolations`, `taperFaults`) are added by `evaluateDesign`. Refine accepts standard-form tapers and
refuses non-standard ones (`'taper-form'`); a joined Refine refuses up front when the original's taper runs into a joint
and returns a still-conflicting result unjoined; the change list names taper additions, changes and removals; the prompt
teaches tapers and the start-below-the-joints rule.

**306. Deferred minors (record-only).** Untested branches: a zero-amount taper (filtered), a non-finite `start` (refuses with
odd wording), a tapered part with rectangular cuts (multi-cell clip/slab), two-part conflict ordering, two tapers on one
face and end, a whole-section slab drop. Accepted-run joinery tests 2/3 were not mutated. (Closed in the final review: the
mixed taper+miter part is covered by tapers.test.ts "both at once"; the notched-part test's comment now says footprint only;
the taper-only repair test now asserts the repaired leg keeps its taper.) **Status:** record-only.

**307. A hand-edited deep-end-last taper is shifted by joinery's resize.** A taper stored deep-end-last (`alongFrom` the
deep end, e.g. `alongFrom: 'max'` with points `[[20,0],[28,0.5]]`) is anchored at the end a tenon grows; `rebaseCuts` does
not touch angle cuts, so joinery shifts and slightly deepens it, and the post-run gate does not re-check the taper rule.
Everything the app writes is canonical (`taperCut` stores `alongFrom = end`), so only hand-edited or imported files reach it.
Remedy when touched: rewrite a resized part's tapers into canonical form via `taperCut(taperFields(c))` (fu 297 precedent).
**Status:** closed 2026-10-13 (AI-angles chunk 1, branch `ai-angles-1`). The named remedy was not adopted: it covers tapers
only and rewrites stored values. Instead `rebaseAngleCuts` (`recipes.ts`, called from `resize` beside `rebaseCuts`) shifts
every angle-cut station or depth measured FROM the moving end by the growth (or trim), one addition per number, so every
kind keeps its wood exactly; a canonical cut is the same object. Pinned by the deep-end-last taper (RED by exactly the
0.75in tenon before the fix), a trim, and two linked rails written back as one component.

**308. "Taper the other end" is impossible for a part joined at both ends.** The taper-at-joint refusal for a joint on the
thin end advises tapering the other end; a part joined at both ends has no such option (only "remove it" applies).
**Status:** open, record-only.
**Status:** record-only (was "open, record-only"). (triaged 2026-10-16)

## From the AI tapers round (chunk 2, Generate and Refine) — 2026-10-13

**309. `isStandardTaper` accepts `start > length`.** A part shortened after tapering can keep a taper whose start lies past
its end; Refine would send it and `convertPart` rejects the whole part. **Status:** closed 2026-10-13 (final-review fix,
widened): `documentToDesign` now runs the converter's own rule, `taperCutsFor`, on each tapered part as `orient` will encode
it, and refuses `'taper-form'` before any call with a person-facing reason (`taperCutsFor` returns a fault `code`). Covers
the four reachable cases: a start past the length; a knife edge (amount = the face dimension); opposite faces whose amounts
meet; a part wider than long tapered along its stored length (re-encoded, the taper no longer runs along the length). Tests:
`refineDesign.test.ts` (message), `run.test.ts` (each case: zero calls, document untouched).

**310. designDiff "changed" lists every new taper.** Unchanged tapers appear too, and removing one of two reads "changed".
The taper compare is exact-float while the other change lines compare at display precision. **Status:** closed 2026-10-13 at
the user's word: `designDiff` compares tapers face by face (a sloped face toward one end), at display precision; only faces
added, removed or changed get a line, faces sharing a kind and values share one line, and a regrouping is not a change.

**311. An unjoined Refine shows the same fault twice.** When Refine returns unjoined (`notJoined`), the dialog shows the
person-facing refusal AND the model-facing `taper-joint` violation (decimal inches). A UX call for the user.
**Status:** closed 2026-10-13 at the user's word ("show the fault only once"): when `notJoined` is set, the dialog lists no
`taper-joint` violation; the "Joints were not re-applied." note is its one statement. It still counts in "N new issues", and
`violations` itself is unchanged (problems compare by kind and parts). A normally joined result lists it as before.

**312. `plainForRefine` recomposes the taper refusal.** It does not call `joineryRefusal` (inv 41's one decider);
equivalent today, but a throw inside it is reported as `'joints'` and offers repair. **Status:** closed 2026-10-13: it calls
`joineryRefusal(plain, pf, findSites(pf))`.

**313. Minor test and wording residue (record-only).** `taperCutsFor` is tested on one pose; no NaN or second-entry tests;
the same face named twice across entries gives overlapping cuts without a fault; non-finite taper numbers report the
"position or size" not-finite text; the plural `taper-form` message is untested; the "checkDesign never emits taper-joint"
test cannot fail; the prompt's "For legs under 5in aprons…" phrasing; the prompt test pins phrases, not the corner table.
**Status:** closed 2026-10-13 at the user's word. `taperCutsFor` is tested in every pose (two adjacent faces, so a min/max
mix-up shows), with NaN and a fault in a second entry; a non-finite taper number is rejected in taper words (reason `taper`);
the plural `taper-form` message is pinned (names cut at three); the test that could not fail is removed (`checkDesign` cannot
produce the kind; `evaluateDesign` alone adds it); the prompt reads "For a 29in table whose aprons are 5in deep at the top of
the legs…" and its test pins all four corner rows. **By decision:** the same face named in two entries toward one end stays
allowed (two overlapping cuts), as Properties allows two tapers on one face — refusing it in the converter would also make
Refine refuse such hand-made parts.

## From the turned-links round — 2026-10-13

**314. Parts with rectangular cuts are not turned.** `turnCandidates` returns none for a part carrying rectangular cuts,
non-taper angle cuts or non-standard tapers, so such parts link only when already equal. Turning them would mean re-storing
cuts through `axisFrame`'s crossings. **Status:** open, fails safe (the parts stay unlinked).
- **Closed 2026-10-16 as unreachable (follow-ups session 2).** `turnCandidates` runs only inside `linkByRole`, whose one
  caller is `designToDocument` (Generate and Refine), and the converter writes every part with `cuts: []`; holes and
  curves are refused by both. Rectangular cuts arrive only through joinery, after linking, whose write-back keeps sharing
  by geometry (`regroupShapes`, fu 316). Reopen if Generate ever authors dadoes. **Status:** closed.

**315. Mirror-only matches need mirrored placements.** Legs that match only through a reflection cannot share a Shape by
turns alone; they need fu 232's mirrored placements from Generate. **Status:** open (depends on 232).
**Status:** open by decision (depends on 232). (triaged 2026-10-16)

**316. `splitAssemblies`' `resultSignature` is order-sensitive.** Two placements whose joined cuts differ only in order
split into two definitions: sharing is lost, geometry is right. The cut-order ruling covered `regroupShapes` and `sameJoined`
only. **Status:** open, fails safe.
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`).** `resultSignature` now reads `groupSignature` (every
  list sorted; the order-sensitive `sharedSignature` is gone, its one other caller having been this), so placements of one
  definition whose joined cuts differ only in order stay one definition; step 2 already writes one edit per storage key,
  from the first occurrence, so the definition takes the first placement's order and ids. Test: three drawer placements,
  one with its two cuts reversed — one definition, every copy reading the first's ids (red before the change).
  **Status:** closed.

**317. Turned-links minors (record-only).** `groupSignature` also sorts angle cuts (inert today); the greedy multiset match
in `sameCutSet` could false-negative within 1e-9 (it refuses, safe); the first-member-keeps-order rule is unpinned by a
test; `turnCandidates` is rebuilt per representative (burns ids); the untapered test's title over-claims; no test of a tapered
component inside an assembly definition; the joined-tree tests assert the shape count, not each leg's world cuts (the gate
test covers it indirectly); `roleLinks.ts` ends without a trailing newline. **Status:** record-only.

**318. A width-only (or thickness-only) edit on one turned, linked leg grows the legs along different world axes.** Linked
parts grow from their own min corner (existing rule); turned links store the legs at 0/90/180/270, so a non-square edit grows
two legs along X and two along Z (on the Shaker fixture, width 1-3/4" → 2" runs two legs into an apron). A square edit (width
and thickness together) grows all four alike, as untapered linked legs do today. **Status:** accepted by the user 2026-10-13
("accept and record"); found by the turned-links final review.
**Status:** record-only (accepted by the user 2026-10-13). (triaged 2026-10-16)

**319. The View group wraps even at 1440 px.** With the standard views and Save image it holds five clusters; it wraps
right-aligned (Save image on a second row at 1440, three rows at 1024) and never runs under the Tools group
(`max-width: calc(100% - 220px)`, measured). Works; whether it reads well is the user's call by eye. **Status:** open
(awaiting the user's look).
**Status:** open (owed to the user, not code): the View group's wrap, by eye. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the two-row wrap reads fine.

**320. Standard views and image export minors (record-only).** No keyboard shortcuts for the views and no
Back/Left/Bottom (spec §6, out of scope); the selection colour blinks off for one frame during a capture (accepted in
conversation); a saved PNG has been seen only on software GL — one look on real hardware is owed (fu 26a); the capture
waits on the frame loop, so a capture asked for in a hidden tab completes when the tab is shown; the View group's
`max-width: calc(100% - 220px)` depends on the Tools group staying under 220 px (a fourth tool would re-open the overlap);
after a capture the gizmo's stabilize patch is re-installed on the fresh controls instance (`hidden` in its effect's deps),
so its first frame back is unpatched, as after any selection change. **Status:** record-only.

**321. AI angles chunk 1 minors (record-only; final review M1, M2).** (1) `angleConflicts` judges whether a RECEIVING
part's touched box "reaches" the joint by the ENTERING part's touching face at a 1e-9 tolerance, while sites tolerate gaps
up to TOUCH: a receiver chamfered on the joint face but sitting up to 1/32in apart is never caught (confirmed: a 3/4in leg
chamfer flush with Rail X conflicts; Rail X moved 1/64in away, 0 conflicts and the mortise runs through the chamfer).
Remedy when touched: test against the receiving part's own face (`r.min`/`r.max` by side) or with TOUCH. (2) Test gaps:
Review Focus 2 pins only a turned MITER (its touched box spans the whole cross-section, so a width/thickness mix-up in the
crossing would not show) — no turned or on-edge chamfer case; no bevel in the new contact or conflict tests; the split
tests are board-local only (the `worldBox` crossing is pinned elsewhere). **Status:** record-only.

**322. The design schema's compiled-grammar margin (record).** The API compiles the structured-output schema into a grammar
and refuses one that grows too large (400 "The compiled grammar is too large…"; unpublished limit, beyond the documented
24-optional / 16-union caps). Measured 2026-10-14 with user-approved probes (max_tokens 16): the chunk 2 schema inline (the
part written twice, 4,297 chars, 16 enums) was refused; the same schema with the part and the direction in `$defs`
(2,372 chars) compiled; that `$defs` schema plus two more four-field arrays (2,836 chars) also compiled. So there is room
for at least two more angle-like arrays. A new part field or enum costs once (in `$defs`). Anything that changes
`DESIGN_SCHEMA` needs one live compile before it ships — the unit suite cannot see this limit (a test pins the `$defs`
form only). **Status:** record-only.
**Status:** AI-holes compiled (2026-10-23, `ai-holes`): the `holes` array added one 8-field item (`face`, `diameter`, `depth`, `through`, `offset` (a vec3 from the part's `at`), `toward`, `count`, `pitch`) with no new `$def`. The Refine form with the catalog is 2,952 chars (Generate's built-in form 2,918, against 2,372 before holes). It compiled on the FIRST probe, no fallback (HTTP 200, request `req_011CgJGkuYyCJ51nxdbdHDTn`, `max_tokens` 16). The probe exercised the grammar only, not the model's hole output.
**Status:** AI-bands (2026-10-23, branch `ai-bands`, chunk 1 of fu 430): the `bands` array adds one 2-field item (`edge`, a direction; `edging`, a closed enum: `veneer`, the project's band type ids, `solid <id>` per solid material). Probe 1, with `vec3` still inline (Refine form, a custom solid, a sheet and a custom band type), was REFUSED as too large (request `req_011CgJpd3fNoqKzSmffAtj5M`, 3,267 chars, 8 edging keys). Probe 2, the same with `vec3` moved into `$defs` and referenced (fallback (a), no change of meaning), COMPILED (request `req_011CgJpkiPjQyZQA8DGccLtW`, 2,911 chars); Generate's built-in form is that minus the custom enum entries, strictly smaller. Headroom is thin: every custom SOLID material now appears in two enums (`material` and `solid <id>`) and every band type adds one; a large real project's Refine schema (final review I2) is to be probed before the round deploys (the controller records it here). Note for chunk 2: edge profiles will not fit without a much smaller form — revisit the spec's §2.3 before planning it.

**Status:** profiles probes (2026-10-23, for fu 430 chunk 2; no code changed; schemas built in the dev page). Base = the shipped Refine form
with 1 custom solid, 1 custom sheet, 1 custom band type. (1) Base + spec §2.1's `profiles` array (9 fields): REFUSED, 3,452 chars,
`req_011CgK1EepMgmGMwUVjD4ARb`. (2) Option A — the four angle arrays merged into ONE `angles` array `{ kind, dirs: [dir], toward: dir,
values: [number] }` — plus `profiles`: COMPILED, 2,805 chars (smaller than today's), `req_011CgK1FhrhkS9XP5obZb297`; at the upper bound
(6 custom materials, 4 custom band types) COMPILED, 3,003 chars, `req_011CgK1HAcoVCSHiF2fewT5E`. (3) Option B — bands and profiles folded
into one `edges` array, angles untouched: REFUSED, 3,248 chars, `req_011CgK1GN4r8AQ7VqiSxKuXd`. So the cost is distinct object shapes, not
characters: merging shapes frees room; folding fields into an existing shape does not.
**Status:** AI-profiles compiled (2026-10-23, branch `ai-profiles`, fu 430 chunk 2; spec R1, R5): the FINAL design form — the four angle
arrays replaced by ONE `angles` item (`kind` enum taper/miter/bevel/chamfer, `dirs` [dir], `toward` dir, `values` [number]) plus a
`profiles` item (`edge` [dir], `kind` enum, `size`, `fillet`, `depth`, `facing` enum face/edge, `allRound`, `start`, `end`), every
field required, `additionalProperties: false`, `dir` and `vec3` by `$ref`, no other new `$def` — COMPILED on the first probe (HTTP 200,
`req_011CgK3FpwL6Fshe5BsSWfuC`, `max_tokens` 16): the Refine form with 2 custom materials and 1 custom band type (8 edging keys) is 2,800
chars (the shipped AI-bands form: 2,911); Generate's built-in form is 2,727. The upper bound (6 custom materials, 4 custom band types,
3,003 chars) was measured on R1's 2,805-char probe form, not re-probed on the final schema. `src/document/fixtures/design-schema-builtin.json`
re-captured (`docs/browser-verification-ai-profiles.md`). The rule this leaves (inv 48): a new design-form feature joins an existing item
shape where it can; each new SHAPE costs grammar.

**323. AI angles chunk 2 minors (record-only; final review M2–M6).** (M2) The `angle-joint` design fault's advice is generic
("move it off that end or face, or remove it") — the spec wanted the tenon-clearance rule's numbers carried back; it
invites removal. (M3) `refineDesign.ts`' unbuildable refusal finds the cut's kind by searching the fault text — return it in
a field; its `direction` reason says "reshaped part" when only orient re-encoded it. (M4) `turnCandidates` gives turned
candidates angle-cut ids by index after the canonical re-sort, so an id can name a different world cut; harmless today
(`alignedTo` overwrites ids before storing), latent for any other caller. (M5) The Review Focus 2 test checks document →
design only (no back-conversion in the definition frame); the fault table runs in one pose. (M6) AngleField accepts more
than one decimal; a model that rounds such a degree value misses the exact-angle map and `ratioFor` falls back to 0.1°
(a change below the change list's 0.1° display). **Status:** record-only.

**324. Custom materials chunk 1 minors (record-only; task and final reviews).** (1) `builtInInfo` shares
`MATERIALS[id].sheet` by reference (nothing mutates it; freezing would close it). (2) `mintMaterialId` loops forever on a
constant injected `random` whose id is taken (tests only). (3) `validateShapes`' `known` defaults to the built-ins, so a
future caller can omit it silently (the one caller passes it). (4) `updateBoards` accepts a custom id the document does
not carry when no `adopt` is passed — the next load turns that part to pine; Properties always adopts. (5) Refine's
prompt line interpolates the user's label unescaped (odd prompt text only). (6) `runRefine` rebuilds `refined` with
`materials: doc.materials` and prunes, redundantly (the converter already carries and prunes); the catalog is built
twice from one list. (7) In the dialog: a deleted library row still shows its notes; `rowRefusal` judges the first label
match only; `deleted` is honoured on non-library rows (the UI cannot set it); `libraryLabelClash` is judged against the
stored library, not the planned one (over-refuses a rename-then-add in one Save); two new rows share aria-labels
("New material: name"); the trash SVG is duplicated from ActionBar; the fallback refusal "Choose a colour." covers other
invalid rows. (8) Test gaps: no test that the Material select shows the stored value after New material…, no
multi-select adopt test, no assembly-in-selection kind case, no plain custom sheet `rotate: 'free'` cut-list case, the
fix-5 posture-refusal bail of `applyMaterials`, a NEW entry joining a pre-existing duplicate library label, the explode
test's reset not in `finally`. (9) A cut-list fixture puts `rotate` into a `CustomMaterial` behind a cast.
**Status:** record-only.

**325. Two tabs and the browser-level settings (record).** The material library (`sloyd.materials.v1`) and the prices
(`sloyd.shop.v1`) are read once at mount; a second open tab saves its stale copy over the first's on its next Save.
Prices behaved this way before custom materials; the spec is silent. Remedy if it bites: re-read both when the dialog
opens (cheap), or a `storage` event listener. Also recorded: a rollback to the 2026-10-14 v14 bundle followed by a prices
Save writes custom-id prices to a top-level `extra`; this build folds a top-level `extra` back on read (final review I1),
so the prices survive the round trip. **Status:** record-only.

**326. Nominal names minors (record-only; chunk 2 task and final reviews).** (1) `NOMINAL_DEFAULT_STOCK` filters sections
by float equality on table literals (exact, but a name filter would be tidier). (2) Untested: re-picking the current
section in "Nominal size" (a native select fires no change; a no-op edit pushes no entry), a shaped/assembly selection, a
stored custom-nominal stock entry in Buying, a kind change after the nominal switch on a new row (the switch resets with
the kind, as prices do), a switch on a row rebased after a partial-failure Save, the checkbox's visible text. (3) A new
row's kind round trip (solid → sheet → solid) turns its nominal switch off — consistent with prices resetting on a kind
change. (4) "Use library version" may change a stored row's nominal flag without touching its prices (the rule for stored
rows). (5) Materials created before chunk 2 keep their stored board-foot buying when the switch is turned on — choose By
the piece to get the yard list (by design: the switch never touches stored prices). **Status:** record-only.

## From the holes round (chunk 1) — 2026-10-14

**327. Holes chunk 2: drawings and the Hinge cup.** Spec §9 chunk 2 (`2026-10-14-sloyd-holes-design.md` §3.4, §4.3, §7):
Plans-sheet rims as `DRAWING_HOLE_SEGMENTS = 96` polylines through the hidden-line pass, dashed depth lines (the wall's two
silhouette generators and a blind hole's bottom rim; none looking down the axis), occluders staying the hole-free bodies
(inv 47, pinned by a test); part-diagram circles with a centre mark and a once-per-row label (`21 × Ø1/4" × 3/8"`), built
from `holeText.ts` (inv 19); the **Hinge cup** preset (35 mm × 1/2" deep, 3" from the length min end, 22.5 mm in). No schema
change. **Status:** closed 2026-10-14 — holes chunk 2 (branch `holes-2`, merged as `d74e5c5` and deployed as `index-DFCdm3n1.js`;
no schema change), with the §4.3 amendment (a row's diagram label is its bench line as an HTML note, not a measured SVG label) and
rulings R2 (an edge-on rim is ONE segment; plan paths chain within a part so a hidden rim dashes) and R3 (diagram holes
independent of row order); the Hinge cup runs along the longer in-face dimension (fu 343, the user's ruling). Residue: 343–346.

**328. Holes through Add joinery, Repair and Refine.** Chunk 1 refuses a holed project at entry (`holedRefusal`, spec §6).
Carrying holes through needs a rebase for rows measured from an end joinery grows or trims (as `rebaseAngleCuts`, fu 307),
`readJoints`' exact undo of it, and a hole-in-pocket refusal (a hole meeting a mortise or tenon). **Status:** open (spec §11).
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** closed for joinery and Repair (joinery-features chunk 1, merged `f3493a7`, deployed 2026-10-22: `featureAllowed` rules out joint kinds, `rebaseHoles`, the gate compares holes); Refine stays with fu 329.
**Status:** Refine half CLOSED (refine-features, 2026-10-22: Refine carries holes by flat name in the original frame, inv 56; `holedRefusal` deleted). Fully closed; authoring holes in Refine stays fu 329.

**329. Generate and Refine authoring holes.** Holes in world words in the design schema — a `DESIGN_SCHEMA` change, so one
live compile before it ships (fu 322); Refine keeping untouched rows exactly. Depends on 328 for joined Refine. **Status:**
open (spec §11).
**Status:** open (feature; needs a spec) (a `DESIGN_SCHEMA` change: one live compile, fu 322). (triaged 2026-10-16)
**Status:** CLOSED on branch `ai-holes` (2026-10-23, spec `2026-10-23-sloyd-ai-holes-design.md`; not yet merged or deployed): Generate and Refine author hole rows in world words through `holeWorld.ts` (inv 50); Refine keeps untouched rows exactly; holes leave the carry (inv 56). The deferred minors are fu 428.
**Status:** CLOSED — merged `424c184` and deployed 2026-10-23 as `index-D3k3tvUe.js` (live check `docs/browser-verification-ai-holes.md`).

**330. Counterbores, countersinks and cam-and-bolt.** Concentric holes and holes meeting holes; `holeFaults`' `meets-hole`
refuses both today. **Status:** open (spec §11, a non-goal of chunk 1).
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** narrowed 2026-10-29: counterbores and countersinks are chunk 1 (merge `4f73858`, schema 30; deployed 2026-10-29 as `index-D9SIz2nX.js`); what remains of 330 is **cam-and-bolt (its chunk 2), now fu 568**.

**331. Half-holes and holes breaking out of an edge.** `breaks-out` refuses them; they would need a hole to cross body
edges (inv 50's convex bodies stay). **Status:** open (spec §11).
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**332. Dowels as hardware.** A dowel joint is two holes placed by hand (the user's ruling); dowels as objects belong with
the hardware bill of materials (fu 267). **Status:** open (spec §11).
**Status:** open (feature; needs a spec) (with 267). (triaged 2026-10-16)
**Status:** closed by the hardware round (2026-10-21): a dowel is a hardware type counted by hand on the part that carries the joint (spec §2.1); counting dowels from hole pairs is fu 404. Deployed 2026-10-21 (`index-BZhrLswD.js`).

**333. Hole callouts on the Plans sheet.** Dimensioned hole positions and sizes on the sheet; joins fu 252 (callouts).
**Status:** open (spec §11).
**Status:** open (feature; needs a spec) (feature callouts, with 279 and 362; 252 closed). (triaged 2026-10-16)
**Status:** closed 2026-10-16 (feature callouts round): every hole row gets a lettered tag on its trio, in the view looking down its axis (on its dashed rims when hidden everywhere, R4 — seen live on a bookcase's inward shelf-pin rows), keyed with its size and pitch, no positions (R1: the part diagrams keep the stations). Residue 381.

**334. Pointed bottoms.** Twist and brad-point bits leave a cone; chunk 1's holes are flat-bottomed. **Status:** open
(spec §11).
**Status:** open (feature; needs a spec) (holes spec §11). (triaged 2026-10-16)

**335. Metric display of hole sizes.** `units.display` is unchanged; a whole-millimetre diameter or pitch prints its mm in
parentheses only (spec §4.1, amended). **Status:** open (spec §11).
- **Closed 2026-10-15 (bookkeeping, follow-ups session): delivered by the metric-display round.** A metric project's
  holes read in mm through `holeLengthText` (diameter and pitch to 0.1 mm, positions whole mm, no imperial aside —
  `holeText.test.ts`, "diameter and pitch to 0.1 mm"), and the Holes fields share that string (inv 52). An imperial
  project keeps the ` (35 mm)` aside for a whole-mm size, as this entry described; that is intended. **Status:** closed.

**336. The grain seam inside a bore (ruling R9).** A wall facet takes the plan of the world axis its normal is nearest
(spec §3.2, inv 35's sloped-face rule), so a bore's wall switches from end-grain rings to long grain halfway round with a
hard seam. The user, on the live pass: "It looks pretty bad and the seam is very clear." A seamless look needs cylindrical
or triplanar mapping — shader work judged by eye. **Status:** deferred by the user 2026-10-14 to a later texture/shader
session; chunk 1 ships with the seam. **Also covers curved faces (curves chunk 1, deployed 2026-10-15):** a curve's
chord face takes the plan of its nearest world axis (inv 35), so around an arc the grain switches partway with the same
kind of seam — accepted by the user's ruling in the curves spec (§1, §3.4); the same cylindrical/triplanar remedy, the same
session. Not yet seen on real hardware (fu 370).
**Status:** open (deferred by the user to a texture/shader session; covers the curved-face seam too). (triaged 2026-10-16)

**337. Real-hardware looks owed (26a).** Seen only on software GL: hole wall shading and grain; rim lines (indistinguishable
at screenshot scale, as the part's own edges are; unit-tested only); drag smoothness on a drilled cabinet side (the
in-browser timing was meaningless on llvmpipe: 1.5–7 s per edit with holes, 3–9 s without); a FADED (transparent) holed
part, which no longer draws interior seam faces in its holed bodies while an unholed one still does (Task 11b); overlapping
or coincident (faulted) holes, for cracks at the fallback split's T-junctions. **Status:** open (awaiting the user's look).
**Status:** open (owed to the user, not code): real hardware (26a). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling ("close them all") after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): hole walls, cups and pins read well; drag smoothness, a faded holed part and faulted holes were not separately exercised.

**338. Count-1 rows still compare `pitch` (ruling R18).** `HOLE_FIELDS` is every field but `id`, exact (spec §4.2), and a
count-1 row stores a pitch it ignores; two identical single bores whose rows once had different pitches split into two
cut-list rows (and do not link). Normalising the pitch at count 1 (on compare, or on write) is the user's call.
**Status:** open (for the user).
- **Closed 2026-10-15 (the user ruled: on compare, not on write).** `holeRowValues` reads a count-1 row's `pitch` as 0,
  so every "same row" decision built on it — the cut list's grouping, `sameHoleRow` (links, the no-op edit, write-back
  reuse), the geometry and UV keys — ignores it; stored files are unchanged, and the Every field (shown only from
  count 2) is never the edit that differs. Tests: two single bores with different stored pitches are one row and one
  `sameHoleRow`; at count 2 the pitch still splits them. **Status:** closed.

**339. AngleCuts and the field-owned refusal message.** Holes' DimensionField onCommits return the refusal text (R7): the
field shows it as its own error, keeps focus and the typed text. AngleCuts' refusals still use the row alert, and the
holes Task 10 review judged it to carry the same latent pattern (a caller-refused DimensionField edit blurring with the
refused value showing while the stored value is unchanged) — inferred from the code, not checked live. Adopting R7 there
is a small change. **Status:** open.
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`).** Checked first whether the pattern is reachable: it
  is not, today — every AngleCuts field a caller can refuse (the miter and bevel Angle) carries a `max` floored to what
  the check accepts, so the field's own bound refuses first; the Starts, Removes and Size fields have no caller refusal.
  Adopted anyway, as the entry asked: `setM`/`setB` return the refusal, the Angle fields pass it back to DimensionField
  (its own error, focus and typed text kept), and the selects show it in the row alert as before (`pickM`/`pickB`).
  `AngleField`'s `onCommit` type now admits the message; its test pins the plumbing (a returned refusal is the field's
  error). No UI test can reach the AngleCuts half, so it is unpinned by construction. **Status:** closed.

**340. The hole perf guard is wall-clock (Task 11b, final review).** `holesPerf.test.ts` bounds runs (≤40 ms
healthy, ≤100 ms faulted). On 2026-10-14 it failed 1 of 4 isolated runs at a load average of 5.4, then passed 3/3 (the
round's runs passed 3/3 on a quiet box); run `npm test` on a quiet machine before trusting a red. The faulted bound has
only ~1.4× margin over the revert it guards (about 135–140 ms reverted); the memo gate checks freezing of `h.centre`
only (Hole's one nested field today — a new nested field must join it). The guard now times the minimum of 9 runs (R19): load can only inflate a run, so the minimum is load-robust. **Status:** record-only.

**341. Holes geometry and model minors (record-only; task reviews 1, 3, 5, 6).** (1) The drop-malformed test lacks cases for
a negative station/inset, a non-finite pitch/diameter, a bad `from`/`alongFrom`, a non-array `holes`; `holes.test.ts`
exports `PIN` (consumed by its own appended tests; R2: never import a test module). (2) A corner breakout names one edge
only; `holeFaults.ts` duplicates `idx`/in-plane/span helpers beside `holes.ts`' `frameOf`. (3) Test gaps: only `dir = -1`
for prism/ring/`insideHole`; the bottom cap's `PRISM_EPS` and `onSlope`'s far disc unpinned; `holeRims` closure and depth
unchecked; the original perpendicular test's comment overstates; a max-face hole against a min-face dado floor and a
stopped cut's in-plane edge not separately pinned; the exact `+HOLE_EPS` touching margin unpinned. (4) Zero skin against
an ANGLE cut (a plane exactly perpendicular to the axis touching the bottom disc) still passes — R3 made only a cut's
floor count; reachable only from a near-axis-aligned taper. (5) `stockProbe` recomputes `boardHoles` per call; the
through-hole snap test does not assert the entry centre is still present. (6) The `removeDupEndPts` guard in
`faceTriangles` is unreachable and untested; a doubled coplanar bottom on a grid seam is possible and unverified;
`holeTouchesBox`' test pins Task 3's function only. **Status:** record-only.

**342. Holes copies, mirroring, text, store and panel minors (record-only; task reviews 2, 4, 7–10).** (1) The plain-part
copy expression is duplicated at `treeOps.ts` and `treeEdit.ts` (a pre-existing pattern); the store duplicate test does
not assert row object independence. (2) No shaped-part posture-through-mirror test for holes; the chirality test is flat
only; `sharedSignature`'s doc comment does not name hole rows. (3) `holeFaultText` relies on `f.edge!`/`f.other!`
(`HoleFault` is not a discriminated union); the signature separators are uncommented. (4) The hole-row literal is
duplicated across five test files; the runJoinery holed test does not assert the document unchanged. (5) The third held
test's title says "removing" but never calls `removeHoleRow`; `removeHoleRow`'s `judgeHeld` is unpinned. (6) A caller
refusal's message can go stale after a sibling edit makes the value fit (R8-consistent: a later blur commits it, visibly);
a test comment overstates "no silent commit"; one row can hold two `role="alert"` elements. **Status:** record-only.

## From the holes round (chunk 2) — 2026-10-14

**343. The Hinge cup on a part wider than long (ruling R5).** `defaultHingeCup` runs the cup along the LONGER of the broad
face's two dimensions (the shelf-pin convention), 3" from its min end, 22.5 mm in from the other's min side. Spec §7's "3"
from the length min end" assumed length is the longer, as on any door; on a part stored wider than long the two readings
differ (the cup goes 3" from the width end). Pinned by a test with width > length. **Status:** closed 2026-10-14 — the
user's ruling: keep the cup on the longer side (R5 stands; spec §7 amended).

**344. The exploded view's hidden hole work (ties to fu 263).** `drawView` computes every hole's silhouettes and blind
bottom rims and runs them through the hidden-line pass even in the exploded view, which draws no hidden lines: ~8k
discarded segments, ~25 ms per sheet on a drilled cabinet — part of why the sheet's Explode slider lags (fu 263). Remedy to
measure first: emit no silhouettes or blind-bottom rims when no hidden lines are drawn.
**Status:** open.
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`).** Measured first: the exploded isometric of two
  drilled sides (84 bores) took 41 ms (min of 9) and produced 8800 hidden segments it never draws. `drawView` takes
  `{ hiddenLines: false }` (the exploded figure passes it), and `holeDrawingSegments(…, visibleOnly)` then leaves out a
  CLEAN hole's blind bottom rim and wall silhouettes — inside the hole-free occluder, always hidden. A faulted hole keeps
  every line (its wall can run into air). 41 → 18 ms; visible lines identical (pinned on the sides and on a faulted bore;
  mutated — every hole treated as clean — red). **Status:** closed.

**345. The dash look on a real print.** Hidden lines are `4px, 3px` dashes over chained paths (R2): a hidden rim is one
subpath so it dashes continuously, and chaining also carries the dash phase around a part's own box corners, so a corner
join may land mid-dash. Seen only on screen; real print-to-PDF is unavailable here (fu 254). **Status:**
open — for the user's eye on paper.
**Status:** open (owed to the user, not code): a real print. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 by the user's real print ("looks good"; see fu 70's last Status).

**346. Holes chunk 2 minors (record-only; task reviews 2 and 4).** (1) A duplicate row id would repeat a diagram note, and a
zero-count row would open a diagram view — both unreachable (`takeId` makes row ids unique; validation keeps count ≥ 1).
(2) The Hinge cup's thin-stock withholding test lacks a self-contained positive control (it relies on the other tests'
fitting part). (3) R6: in FRONT a through-bore's edge-on rims are hidden, drawn beneath the coincident visible edges (no
visible difference; pinned as is). **Status:** record-only.

## From the section-cut round — 2026-10-15

**347. The section caps' look on real hardware.** Caps are the part's colour × `CAP_DARKEN` (0.62), no grain, lit by an
explicit normal toward the viewer (the live pass measured a cap at ≈ 0.6× the same material's lit face, so front-lit).
On dark cherry the cap reads near-black and its outline (the part's edge colour) is not legible, so a tenon inside its
mortise cannot be told apart on screen. Also owed (fu 26a, software GL only here): z-fighting where a cap meets a
clipped face, the clipped half casting no shadow (`clipShadows`), a cap receiving another part's shadow.
**Status:** open — for the user's eye on real hardware; retune `CAP_DARKEN` and the cap outline colour together.
**Status:** open (owed to the user, not code): real hardware (26a). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 — confirmed on real hardware in the first real-hardware pass and FIXED (branch `section-caps`): two
root causes, each tested alone in the user's Chrome. (1) The speckle: the cap is a zero-thickness DoubleSide shadow caster that also
receives, so it self-shadowed; it now casts from its back side (`shadowSide = BackSide`), as solids do — smooth caps on pine and cherry.
(2) The illegible tenon or tail: the outline lay ON the plane behind its own fill (the fill's polygonOffset pulls it forward; a line takes
none); it is now lifted 0.01" toward the viewer, and on a dark cap drawn lighter than the cap (`capOutlineColor`, unit-tested; a light
cap's outline unchanged). Seen in the user's Chrome: the stool's round tenons outlined through the pine seat's cap; the cherry
drawer's three half-blind tails outlined in the front's cap.

**348. Cap cost on drilled parts.** `sectionCaps` on a 42-pin cabinet side cut ACROSS its bores takes 13–14 ms (min of 9;
the round's target was 10 ms): ~8 ms in `minusPrism` splitting the cap into ~2000 wedge pieces, ~5 ms in `unionOutline`.
A slider move recomputes it per crossed part per frame, so two drilled sides crossed at once are ~28 ms a frame. A move
that keeps the local plane coordinate is served from the per-part cap cache (0.35–0.55 ms); explode ticks and moves along
the cut axis miss it. Remedy to measure first: triangulate a face's interior rings as holes (as `faceTriangles` does)
instead of wedge-splitting. **Status:** open.
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`).** Measured first (one process, min of 12): 15.7 ms a
  cap, `unionOutline` over the 1975 wedges ~5 of it. The named remedy (triangulate the rings as holes) would need a
  triangulator in `document/`, which imports no `three` (earcut lives there) — not taken. Instead the outline is BUILT
  when every bore the plane meets is cut across its axis, strictly between mouth and bottom, its ring strictly inside one
  unbored piece and clear of every other ring: the unbored pieces' union plus each ring's edges (`buildLocalPieces`);
  anything else unions the bored pieces as before. 15.7 → 10.6 ms. Tests: the built outline and a union of the same
  pieces cover each other; overlapping bores fall back. Mutated — no disjoint guard, no base outline — each red. The
  one-piece condition is stricter than needed (a ring inside the union across a seam would do); kept as the safe side.
  Residue: minusPrism's wedges, ~8 ms, remain (a triangulated cap would need earcut in `document/`). **Status:** closed.

**349. Snap points on caps.** The Tape and Move tools offer no points on a cap (a mortise's floor corner seen in
section, a bore's centre on the cut). Spec §1 non-goal. **Status:** open — ask before assuming it is wanted.
**Status:** open by decision: ask before assuming it is wanted. (triaged 2026-10-16)

**350. Move/Tape markers on the removed side — owed a hand check.** Candidates on the removed side are filtered
(`keptBySection`; guide points exempt by ruling, since guides are drawn unclipped), pinned by code review only: the live
pass could not drive a snap marker reliably through Playwright hover (one marker in many tries, section on or off).
**Status:** open — a two-minute check by hand.
**Status:** open (owed to the user, not code): a two-minute hand check of Move/Tape markers with a section on. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): a tape marker shows on a kept corner, none on the cut-away side.

**351. Invariant 43's wording vs a boolean selector.** Inv 43 says never call `visibleBoards` in a selector. The Section
toggle's "any part visible" test does, returning a BOOLEAN (stable snapshot, identity-keyed cache), which the rule's reason
(a fresh array re-rendering every store write) does not reach. **Status:** closed 2026-10-15 — the user amended inv 43: never return
`visibleBoards`' array from a selector; a primitive reduction is allowed.

**352. Section-cut minors (record-only).** (1) The cap cache keeps up to 64 slots after their parts are deleted or the
project switches (bounded; no clear-on-switch). (2) `unionOutline`'s bucket-edge test pins the grouping but does not
discriminate the strict and closed neighbour reach. (3) The world map is affine from `toWorldOffset` at 0 and 1, not
bit-identical to `toWorld` (~1e-15 in; nothing compares caps to snap points with `===`). (4) A hovered snap marker can
outlive a section move until the next pointer move (display only; a click re-picks from the filtered list). (5) The perf
guards are wall-clock (fu 340); the hole-prism memo-bypass mutation does not slow the cap (fresh holes per run).
**Status:** record-only.

## From the metric display round (chunk 1) — 2026-10-15

**353. Metric chunk 2 owed (and chunk 1's deploy gate).** The part diagrams' and sheet-nesting labels, the Plans sheet, the
Buying section's actual dimensions and the viewport grid stay imperial in a metric project until chunk 2 (spec §4). Chunk 1
is merged but must not deploy alone: a metric cut-list sheet would print mm rows beside imperial diagram labels.
**Status:** closed 2026-10-15 — chunk 2 (drawings bare mm + sheet note, Buying brackets, metric grid).

**354. Round-mm parts miss nominal lumber.** A part typed in whole mm is not a nominal section (286 mm = 11.26" > a 1×12's
11.25"), so the cut list names no nominal size and Buying reports "fits no pine stock — too wide". Correct arithmetic, but a
metric user picking boards from a US yard will meet it. Remedy to discuss: a tolerance for nominal matching in metric, or a
Nominal size select that snaps the part to the actual section. **Status:** closed 2026-10-15 — the user chose matching at
display precision: in a metric project `nominalName` matches when both sides read the same whole mm, and Buying (thickness
filter, `fitsIn`, the packer) and sheet nesting fit a part when it READS no more than the stock's outer bounds at whole mm
(`fitsStock`, `mmTicks` — the review caught a first cut with a literal half-mm slack, which disagreed with the naming for
decimal mm: 89.45 mm was named 2×4 but refused; 19.5 mm read 20 yet was bought from 3/4"). Shelves stay exact (inv 23).
Imperial unchanged (exact). Stored values untouched.

**355. `designCheck` messages shown in decimal inches.** `inches()` in `designCheck.ts` writes "passes 0.25in into …" — text
that is model-facing (stays inches, spec non-goal) but also rendered in the Joinery and Refine dialogs. In a metric project
those dialog lines read in inches. Remedy: format the displayed copy with the project's units, keep the model's in inches.
**Status:** closed 2026-10-15. A `Violation` may carry `shown`, the person's copy: set only in a METRIC project and only when
it differs (an imperial violation is byte-for-byte as before, inv 52). `checkDesign` and `jointViolations`/`jointFaults` take
a `display` units parameter defaulting to the checked document's; Refine passes the ORIGINAL project's (`EvaluateOpts.units`),
because it checks the model's imperial conversion. Fault lengths read to 0.1 mm (`formatMm(v, 1)`: a 2.6 mm part must not read
"3 mm; the minimum is 3 mm"); the taper advice is floored to whole mm (`floorToTick`, as `angledRefusal`'s). `collapseViolations`
suffixes both copies; the Joinery and Refine dialogs render `shownText(v)`. The converter's rejections (`rejectedViolations`:
"beyond 10,000in", "1/16in") stay inches — they describe the model's numbers. `too-large` stays inches too (the user's
ruling: a fault reads in the unit typed, and Generate's and Refine's limit fields take inches, spec §7). The model's feedback
is unchanged.

**356. Metric chunk 1 minors (record-only).** (1) The 1e-9 bound tolerance can store a value up to an ulp past a bound; a
reload clamps it, below any display. (2) `'- 19 mm'` (space after the sign before `mm`) is null in both modes — the
pre-existing `MM_RE` shape. (3) A metric `formatSize` with a non-finite value renders `— × 140 mm`. (4) JoineryDialog
formats with the open project's units, not the source's. (5) `diagram.test.ts` calls `buildDiagrams` only with imperial
units until chunk 2 owns the diagrams. **Status:** record-only.

## From the metric display round (chunk 2) — 2026-10-15

**357. The units note prints on a sheet's first page only.** `Dimensions in mm` sits in the cut-list and Plans-sheet
headers; a long cut list or a multi-section Plans sheet (`.plans-section { break-inside: avoid }`) prints later pages with
unitless numbers. Spec R8 says "one note per sheet". Remedy to discuss: repeat the note in each printed section's caption.
**Status:** closed 2026-10-15. The named remedy was rejected: a cut-list group runs across page breaks, so a caption misses pages.
Measured in this Chromium (148) with `page.pdf` read page by page: a header group (CSS `table-header-group` or a real `<thead>`)
does NOT repeat; `position: fixed` repeats but overlays content; an `@page` margin box repeats in the margin. Shipped: a metric
sheet gets `.sheet-metric`, which in print takes the named page `metric-sheet`, whose `@top-right` margin box reads `Dimensions in
mm` (styles.css). Live, on the dev server with a 76-part metric fixture at 0.4in margins: cut list 16/16 pages and Plans 3/3
carry it (page 1 twice: margin and header), top-right, clear of content; the same project in inches prints none, same page
count. Limits: margin boxes are Chromium 131+ (Chrome, Edge, Brave — the user prints from Brave); Firefox/Safari ignore the rule
and print the header note on page 1 only, as before; a print with margins set to None leaves no room for it.

**358. Metric chunk 2 minors (record-only).** (1) The part diagram's crossings note (`overlap: 6 deep governs`) is bare
while its neighbouring bench notes carry ` mm` (the sheet note covers it). (2) Chain dimensions are rounded one by one, so
three ~10.4 mm steps read 10 / 10 / 10 under an overall of 31 — as at 1/16 in imperial, but more visible at whole mm.
(3) The CutList/PlansSheet header wrapper and note are duplicated. (4) No metric tests for the Buying layout title, the fu
273 note or the end-grain note (all through pinned helpers). **Status:** record-only.

**359. The imperial plane note can read the same on both sides.** A part 0.748" thick (19 mm typed, then the project
switched to inches, or any part within 1/32" under 3/4") bought from 3/4" stock prints `plane 3/4" stock to 3/4"` — the same
display-rounding contradiction chunk 2 removed from metric (omitted when both read the same whole mm). Pre-existing;
left byte-identical on purpose (inv 52's imperial guarantee). Remedy: the same "reads the same → omit" rule at the
display precision. **Status:** open — the user's call (it changes imperial output).
- **Closed 2026-10-15 (the user ruled: omit when the same, imperial too).** `buildPurchase` compares stock and part
  through `formatLengthBare` in the project's units, one rule for both systems (was metric-only): a 0.748" part from
  3/4" stock prints no plane note; one display step under (11/16") keeps it. The one ruled exception to inv 52's
  byte-for-byte imperial guarantee. **Status:** closed.

**360. Built-in pine has no 2× (or thicker) default stock.** `defaultBuying('pine')` lists only 3/4" S4S boards (the
1×2…1×12 widths at 6′/8′ lengths); a custom NOMINAL solid gets the full `NOMINAL_DEFAULT_STOCK` (1× at 8′, 2× at
8/10/12′, 4×4 at 8′). So a 2×4 (38 × 89 mm, or 1-1/2 × 3-1/2) in built-in pine is named `2×4` yet Buying reports "fits no pine stock
— too thick" until the user adds 2× sizes in Materials & prices. Found during fu 354's live check (2026-10-15). Remedy to
discuss: give pine the nominal default stock (a change for any browser whose shop settings were never saved — saved
settings keep their own list), or leave pine as board stock and say so in the dialog. **Status:** closed 2026-10-15 — the
user chose the nominal set. Pine keeps its own 1× list (6′ and 8′, its own ids, so no 1× choice changes) and adds the
nominal list's 2× (8/10/12′) and 4×4 (8′): 36 sizes, no prices. Reaches only a browser whose pine settings were never saved
(or "Reset pine to defaults"). Consequence, as for a custom nominal solid already: a 3/4" pine part longer than 8′ or wider
than a 1×12, refused before ("too long"/"too wide"), now buys 2× stock with a plane note.

## From the curves round (chunk 1) — 2026-10-15

Chunk 1 merged (`54ea740`) and deployed 2026-10-15 (schema 17). Spec
`docs/superpowers/specs/2026-10-15-sloyd-curves-design.md`; the narrative is `docs/history.md`.

**361. Curves chunk 2: drawings.** Spec §5 and §10's chunk 2. The Plans sheet already draws curved parts through
`partGeometry`'s edges at the MODEL's tolerance (0.005", ≤24 chords per arc; seen live, dashed exactly where hidden); chunk 2
draws the outline lines at `DRAWING_CURVE_TOLERANCE = 0.001"`, capped at 96 chords per arc (as hole rims are 96-gons on the
sheet), occluders staying the model's bodies. Part diagrams (seen live as plain rectangles for a curved part, as specified):
the waste outline in the view down `through`, clipped to the part; a line across the part at each SHARP outline vertex in
the other views (matching the viewport, inv 16); each curve's bench line as an HTML note under the figure (inv 19). No
schema change. **Status:** CLOSED 2026-10-15 — curves chunk 2 (branch `curves-2`, merged as `1e16c01`, deployed as `index-C-5a29hA.js`) (spec §5 as amended, rulings Q1–Q6; `curveDrawing.ts`,
`diagram.ts`, `PartDiagram`). Shipped: `curveDrawEdges` (fine path ON the true arc, 0.001", ≤96 chords; visibility on the model
chord, edge-on views unrefined, a split chord keeping its end); part diagrams (hatched waste, sharp-vertex lines on their own
face, notes through `curveLineEntries`, four corners one note). **The curved-surface silhouette was a LIVE production defect
(chunk 1 as deployed), fixed here:** a four-corner top's Front and Side elevations had open ends and an arch's Side view
lacked its hidden crown; `silhouetteLines` now draws them. Live check (`docs/browser-verification-curves.md`, Chunk 2): seen on
software GL; the real print is owed (fu 254, 345, 357, 379).

**362. Dimension callouts on curves.** Radius and rise on the Plans sheet. Joins fu 252 (callouts) and 333 (hole
callouts). **Status:** open (spec §12).
**Status:** open (feature; needs a spec) (feature callouts, with 279 and 333). (triaged 2026-10-16)
**Status:** closed 2026-10-16 (feature callouts round): every curve (four collapsed corners as one) gets a lettered tag in the view through its outline, keyed `Arch, 18-1/2" span, 1-1/4" rise (radius 34-7/8")`, `Bow …`, `Rounded corner, … radius`; seen live on an arched apron. Residue 381.

**363. Claude features on curves.** Add joinery and Repair accepting curved parts (refusing only a joint a curve runs into,
as angle cuts do, inv 41), Generate and Refine reading and writing curves (a `DESIGN_SCHEMA` change: one live compile first,
fu 322), and the design checks (overlap, held, tip, contact) reading curved bodies. Chunk 1 refuses curved projects at entry
(`curvedRefusal`, after holes'); `turnCandidates` returns none for a curved part. **Status:** open (spec §12).
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** first piece CLOSED (joinery and Repair accept curved and profiled projects, joinery-features chunk 2, 2026-10-22; inv 41); Generate/Refine reading curves and the design checks reading curved bodies stay open (feature; needs a spec).
**Status:** Refine's reading CLOSED (refine-features, 2026-10-22: Refine carries curves and profiles, inv 56; `curvedRefusal` deleted). Authoring curves in Generate/Refine (`DESIGN_SCHEMA`, fu 329-style) and the design checks reading curved bodies stay open (feature; needs a spec).

**364. Splines and free curves.** A new segment type; no schema bump, because every build from 17 on refuses a document
holding a segment type it cannot draw (spec §2.4). **Status:** open (spec §12).
**Status:** open (feature; needs a spec) (no schema bump). (triaged 2026-10-16)

**365. Stopped curved cuts and edge profiles.** A scooped seat or curved recess; roundovers, coves, ogees (chamfers exist as
angle cuts). **Status:** open (spec §12).
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** chunk 1 shipped (2026-10-17, spec `2026-10-17-sloyd-edge-profiles-design.md`): full-length profiles — roundover,
cove, Roman ogee, bead, thumbnail, an optional fillet — as plain `CurveCut`s recognised by `profileFields`. **Open: chunk 2**
(stopped profiles and blind curved recesses, one stored range along `through`, schema 18, its own spec). A scooped seat is
out of scope (doubly curved). **Stopped profiles moved to the profile runs spec** (`2026-10-17-sloyd-profile-runs-design.md`, chunk a2;
the §7 plan of "one stored range along `through`" superseded). Blind curved recesses remain for their own spec.
**Status:** stopped profiles shipped in profile runs chunk a2 (2026-10-18, merged as `a0b0186`, deployed with a1 2026-10-18 as `index-BbXkYYy4.js`): a profile on
a straight side may stop short of either end and runs out as the router's bit would (the profile revolved about the bit's axis
1/4" outside the edge). **Open:** blind curved recesses (their own spec). A scooped seat stays out of scope.

**366. Compound curves.** A cabriole leg is two curves on two faces — allowed today, nothing designed for it. **Status:**
open (spec §12).
**Status:** open (feature; needs a spec). (triaged 2026-10-16)

**367. A row control to change a curve's kind.** Arch into Bow and so on; the user removes and re-adds this round.
**Status:** open (spec §12).
**Status:** open (feature; needs a spec). (triaged 2026-10-16)
**Status:** closed (presets batch, 2026-10-17): a Kind select on a representable curve row (`curveAs`: placement and id kept, the new kind's preset sizes; Arch ↔ Half-round notch keeps the span); an option that would be refused is disabled.

**368. Rebuild cost of a non-convex waste (Task 8 ruling; final fix wave).** `curvesPerf.test.ts`' L-shaped notch (a
hand-edited waste, ear-clipped into 14 pieces, sliced into 83 bodies and 477 faces) measured 48–54 ms (bodies ~4, edges ~35
on frozen bodies, mesh ~8), and 62–72 ms after the watertight fix's weld and conform pass; it is bounded at 100 ms (the holes
guard's bound for an unusual case) because no preset authors a non-convex waste. The upstream causes, each a hypothesis to
measure before adopting: (1) the ear-clip triangles are not merged into larger convex pieces (Hertel–Mehlhorn), and SPLIT
slices each body along every piece plane EXTENDED across it, which multiplies bodies; (2) `bodyEdges` finds a polygon edge's
line by a linear lookup and filters every face per line — bucket it as `unionOutline` and the seam index do; (3) frozen
bodies slow `bodyEdges` about threefold (A/B in one process: unfrozen 14.5 ms, frozen 35.3, then unfrozen 36.3 — deepFreeze
appears to leave the call sites slow afterwards, so unfrozen timings are only valid in a clean process). Also: the presets
measure ~7–13 ms (arch), ~7 (four corners) and 15–22 (two through axes, the least margin under a 16 ms frame in node and
the 40 ms bound) on a loaded machine; the guard is wall-clock (fu 340's caveat). **Status:** open.
- **Closed 2026-10-16 (branch `perf-368`), each hypothesis measured first** (min of 12, fresh processes): bodies ~2–3 ms,
  edges ~35, mesh ~10. **(3) did not reproduce:** frozen and unfrozen bodies time the same edges in fresh processes (34 vs
  35 ms). **(2) confirmed:** the profile put nearly all of `curvedEdges` in `bodyEdges` — a linear line search per
  polygon edge (1866 edges) and an all-faces coplanar filter per line (477 faces, 33 distinct planes). Lines are now
  bucketed by their point nearest the origin (cells 1e-5, 27 searched; the earliest-created line passing the SAME test
  wins), faces grouped by normal and sorted by plane offset (the same exact test on the few candidates, in face order),
  each face's edges computed once: output byte-identical to the original over 21 fixtures (curved, angled, holed, every
  posture; an A/B against a saved copy), edges 35 → 19 ms. **(1) confirmed:** `convexPieces` merges the ear-clip triangles
  across diagonals while the piece stays strictly convex at both ends (Hertel–Mehlhorn): the L-notch's 14 pieces → 2, 83
  bodies → 16, the whole rebuild ~6 ms. Same wood (the clip/split agreement tests), watertight, every suite green; tests:
  an L is 2 pieces, a comb fewer than its triangles, every piece strictly convex, area whole; mutated (no merging; merging
  without the convexity check) red. The guard's bound is 40 ms now, as every other case. A Bow on a part lengthened past it
  (the one preset on the split path) looked whole in the dev browser. **Status:** closed.

**369. A holed face of a curved part keeps T-junctions (final fix wave limit).** The watertight pass (inv 50) inserts
vertices and fans from the centroid on every face of a curved part EXCEPT one a hole reaches: that face keeps
`faceTriangles` (earcut, whose `filterPoints` drops collinear — inserted — points, or the vertex-0 fallback fan). So pinholes
can remain where a holed face meets a split slice (shelf pins on an arched side). No fixture has one; untested. Remedy to
measure: feed earcut the inserted vertices with a guard against its filter, or conform the ring-cut polygon. **Status:**
open.
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`).** Reproduced first: with the holes' mesh in the
  watertight check, the default arch with a shelf-pin row left 4229 unmatched edges (8458 through, 212 for one bore);
  a holed part without curves, 0. The cause was wider than earcut's filter: the split arch cuts the broad face into
  strips, so a mouth nearly always straddles a seam and took `faceTriangles`' wedge fallback, whose corners match neither
  neighbour nor wall; it was also most of the rebuild (an arched bookcase side with two pin rows: 63 ms, over the 40 ms
  bound). Neither named remedy was taken: each plane a CLEAN hole opens into is merged (`unionLoops`, a directed
  `unionOutline`; loops chained and welded), triangulated once with the wall's own rings as holes, each triangle conformed
  (`mergeHoledPlanes`, grainTiling.ts). Watertight on five fixtures (blind and through rows, a straddling bore, a bore in a
  box cell, a hinge cup) and the caps across them; the side's bodies, edges and mesh rebuild in ~16 ms (was ~52), the stile
  ~6 (new `curvesPerf` cases; the holes' own mesh, ~13 ms there and the same on a part without curves, stays with holesPerf —
  timing it in the curves guard put the side at ~33 ms and failed one full-suite run in two under load).
  Mutated: no merge, no conform, unwelded loops, no disjoint guard, no faulted-hole guard each turn a test red. Residue:
  a plane a faulted hole reaches or whose rings overlap keeps the per-face path and its T-junctions (pinned by area, not
  watertightness); the ring-inside-its-loop guard is unreachable for a clean hole (defensive); the holes' own mesh costs
  ~13 ms for 52 bores on any part (~0.26 ms a hole), unexamined (fu 340's guard). Real-hardware look still owed
  with fu 370. **Status:** closed.

**370. Real-hardware looks owed (26a).** Seen only on software GL (llvmpipe): smooth shading on the curved faces (radial
normals); the grain seam on a curved face (fu 336); the arch-end edge lines and the absence of facet lines (not
distinguishable at screenshot scale); a FADED curved part beside a dado, which shows vertical strips at the dado — the box
path's control looks the same, so undetermined; the shadow and cap after the watertight fix (clean on llvmpipe, re-check on
hardware); drag smoothness (there is no gizmo resize; in-browser frame times were set by llvmpipe, 1.1–1.4 s with or
without the arch). **Status:** open (awaiting the user's look).
**Status:** open (owed to the user, not code): real hardware (26a). (triaged 2026-10-16)
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): smooth curved faces, no cracks or facet lines beside a shelf-pin row.

**371. Curves model and geometry minors (record-only; Tasks 1, 3–6).** (1) Validation's crossing test sees chords and
crowns only: an arc crossing a straight side without its crown is not caught (documented). (2) No half-turn (uFrom = vFrom =
max) fixture in `localSegments`' tests (covered by `chiralCurved` and the mirror tests), none through width or length; a
misleading `[arc]` test name; `as never` casts in `bowsInto` tests; the tangent's sign unpinned (only |cross|). (3)
`curveFaults`' run count over-reports `cuts-through` when a waste leaves the face and re-enters (only on a curve already
`runs-off`; no canonical form); its empty-face branch and `rectMeetsWaste`'s endpoint/crown shortcut untested;
`segArcHits`/`segSegHits` tolerances are on 0–1 parameters, not inches. (4) `frames.mirror`'s outline test samples the
through-min face only. (5) The `curve` tag on internal walls (a SPLIT's chord planes and diagonals, and walls the `rest` clip
leaves) is undocumented; `convexPieces`' no-ear fallback can merge collinear edges, drop flags and stop silently (untested;
never reached by a validated curve); `curvePlan` and `splitPieces` build the outline twice; `splitBodiesForTest` is exported
from a production module (plan-mandated). (6) Duplicate and split import lines in `curves.test.ts`. **Status:** record-only.

**372. Curves edges, mesh and snap minors (record-only; Tasks 7–9, final fix wave).** (1) `smooth` uses |cross|, so a
reversal (a cusp) also reads smooth; `canon` (the edge oracle) rounds keys at 1e-7 (a boundary flake risk, plan-mandated);
`smoothLines` also lists collinear straight-run points; the smooth-join match ignores the normal's sign and wing direction
(no reachable geometry found). (2) Per-stretch judging raised the edge cost (arch ~4.3 ms, four corners ~2.8, arch + end
corner ~10). (3) The seam lookup's `.sort` is unpinned; `chordArc` is linear per face. (4) No Bow and no turned or mirrored
pose in the snap tests (`toWorld` carries the pose). (5) Cap pieces are not welded — a mutation removing it survived, so it
was dropped as unpinned; `capFill(…, false)` (a part without curves) has no dedicated byte test, being the moved loop
unchanged. **Status:** record-only.

**373. Curves text, refusals, store and panel minors (record-only; Tasks 10–14, final review).** (1) A hole both past an
edge and into a curve reads two faults, `(and 1 more)` (deliberate: `faultKey` tells them apart, and `distinctFaults` must
share the key); `intoCurve` recomputes `localSegments` per hole per curve. (2) The notch is detected by exact
`rise === span / 2` (a hand-edited 1e-16 drift reads as an arch); the Bow's `from the length min end` hard-codes min (bows
are always min-anchored). (3) `curvedRefusal`'s list helper duplicates `holedRefusal`'s (plan-mandated); its ordering test
lives in the document layer importing `generate/`; holes-before-curves is pinned only at `joineryRefusal`. (4) `readOnly()`
in the curve store actions is unobservable (`edit()` gates explode, as for holes); the held-point "kept" case is not
mirrored. (5) `Curves.tsx`: the cuts-through branch reads `control ?? 'Rise'`, so a corner select that cut through would
say Rise (likely unreachable); the half-circle refusal always says Rise (a corner's Radius cannot trip it: its chord is
r√2); a select refusal's row alert survives later events; `refusalFor`'s `had` is keyed by fault kind only
(plan-mandated); the Rounded-corner Corner select and Radius field and the Bow's Side select have no panel test; "No curve
preset fits this part." and the `.curve-label` sentence-case rule are untested. **Status:** record-only.
**Status:** (3) moot: the refusal modules were deleted (refine-features, 2026-10-22).

**374. The edge-on fold (Q3).** A view looking along an arch's plane (an arch's Side view) keeps chunk 1's 24-chord arc
unrefined, because 96 chords fold back over themselves on screen. The 24-chord fold remains as chunk 1 had it; it almost
always lies under the face's own visible edge line. **Status:** open (a dedicated edge-on rule, if a print shows it).
**Status:** open (owed to the user, not code): only if a real print shows the fold. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16: the user's real print looked good and raised no fold (see fu 70's last Status).

**375. A silhouette drawn through another cut's air.** `silhouetteLines` draws a smooth vertex's line along `through` for its
whole length; where another cut (a dado, a hole) removes wood along that line, the line is drawn through air. **Status:** open
(unseen on a print; fix by clipping the silhouette to the wood).
- **Closed 2026-10-15 (follow-ups session, branch `follow-ups-1`).** Reproduced first: the default-style arch with a 1/4"
  dado across its crown drew the crown silhouette (looking along the length) the full 3/4". `silhouetteLines` now clips
  each line to the part's convex bodies (`onWood`: a plane along the line is met within 1e-7, since the line lies ON a
  body face; a plane crossing it clips exactly), merging the stretches where slices meet, so a dado, another curve or an
  angle cut breaks the line. Holes are not clipped: a clean hole never meets a curve's waste (touching is a breaks-out),
  and a faulted one is drawn approximately. Tests: the plain crown (one line, 3/4"), under the dado (1/2", nothing above
  the floor), a dado clear of it (whole); mutated — no clip, no merge — each red. **Status:** closed.

**376. Chord ends off the arc (record-only).** (1) Q4: a model chord split by a dado or a second curve keeps its split end ON
the chord, up to 0.005" (the model tolerance) off the true arc, so the other feature's line meets it. (2) Q2: visibility is
decided on the model chord, so a visibility cut inside a chord can land up to 0.005" (not 0.001") off an oblique occluder's
edge. Both far below a printed line's width. **Status:** record-only.

**377. The unreachable node guard (record-only).** `curveDrawEdges` drops fine nodes whose chord parameter `at` is <= 0 or
>= 1 (Q4's exactness beside a split end). No constructed case reaches it; its test pins the invariant (no node at 0 or 1), not
the guard, so removing it is not caught. Kept by ruling: it states the invariant at no cost. **Status:** record-only.

**378. Curves chunk 2 deferred minors (record-only).** (1) No test pins a reversed p→q edge or a negative-sweep arc in
`curveDrawEdges`. (2) Its match scan is O(edges × chords) (memoised; fine at the caps). (3) The totals test (`toBeCloseTo 2`)
cannot tell the fine path from chunk 1's chords; the 54-piece and occluder tests pin it. (4) `curveLines` does not de-duplicate
two curves sharing a sharp vertex (identical lines). (5) No diagram test with `through` = width or length. (6) An unreachable
`F !== cu && F !== cv` guard in `diagram.ts`; test imports appended mid-file. (7) `PartDiagram`: the `along: 'h'` line branch
and the line's `vUp` are untested; X/Y closures are per iteration. (8) The plan's Task 3 comment said corner radius 2 (joins at
(0,2), (0,18)); `defaultCorners` gives radius 1 (tests use the right values). **Status:** record-only.

**379. drawView timing, and the real print (record).** A curved part's `drawView` costs about 6 ms per view (measured in Task 2:
5.6 / 6.2 / 6.2 / 6.6 ms against the baseline 5.6 / 6.4 / 6.3 / 5.4), unchanged by chunk 2. The line weight of 96-chord arcs and
the dash look on a real print are owed to the user's eye (with 254, 345, 357). **Status:** open for the user's print.
**Status:** open (owed to the user, not code): a real print. (triaged 2026-10-16)
**Status:** CLOSED 2026-10-16 by the user's real print ("looks good"; see fu 70's last Status).

## From the plans balloons round — 2026-10-16

**380. Plans balloons residue.** (1) **Column balance, for the user's eye**: a column takes every anchor on its side of the
drawing's centre, so a piece whose parts sit mostly right puts most balloons in one column (the live bookcase: 10 right, 2
left) and its cascade slants the lower leaders steeply; moving the overflow to the emptier column, or ordering both columns
around the drawing, would shorten them. (2) Leaders to anchors at different depths may cross (accepted in the spec). (3) An
anchor is the midpoint of a part's longest visible segment, which can sit where another part's edge passes close by (the
table's top and drawer front read fine; not measured on a dense piece). (4) The real print is owed with 254. (5) Balloons
follow the exploded view only; the elevations and the viewport get none (R3). Final review's deferred minors: (6) anchors at
EXACTLY one height are ordered by row number, not by x, so their leaders can cross; (7) `SheetLayout`'s comment still says its
key reads 1, 2, 3 — with row numbers it reads sparse numbers in sheet-part order (and two parts of a row repeat theirs, as
ruled); sorting the key by number is a look for the user's eye; (8) `ExplodedFigure` builds the full cut list (diagrams,
nesting) for the numbers — once per document, unmeasured on a heavy holed/curved project; (9) the copies/mirrored sheet test
checks unique, real numbers, not that every visible row got one or that its anchor is on its own part; (10) when one column
passes the height cap its lowest rows go to the note even if the other column has room (with (1)). **Status:** open for (1)
and (4); the rest record-only.
**Status:** open (owed to the user, not code): (1) column balance by eye, (4) a real print; the rest record-only. (triaged 2026-10-16)
**Status:** record-only 2026-10-16: (4) closed by the user's real print ("looks good"; fu 70's last Status); (1) column balance stays for the user's eye.


## From the feature callouts round — 2026-10-16
**Status:** (1) CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the columns read balanced (5 / 4).

**381. Feature callouts residue.** Rulings made while writing the plan (approved by the user 2026-10-16): **P1** the key list reads the bench lines' units (`6.4 mm dia × 10 mm deep, every 32 mm`; imperial's straight `"`), not bare mm — spec §3's metric example amended; **P2** a feature with no true view whose lines are all hidden (a hand-edited compound angle cut) is keyed on its hidden lines in tie order, not listed as not shown; **P3** a curve's straight sides off the face boundary carry no tag (`curveDrawEdges` knows only arc chords), so a hand-made curve of lines only is listed "Not shown". Live-pass notes: (1) **for the user's eye**: tags can sit on dimension lines (the table's B tags on the overall dimensions under Front and Side; allowed by spec §4.4, the paper fill masks the line); (2) at screen scale a hidden 1/4" rim's dash reads solid (as fu 337), so a tag on dashed rims looks like one on visible rims; (3) the real print is owed with 254 (page fit with the key list added under a capped trio). Final review (fixed: a densely drilled part — ~450 holes on one panel — overflowed the stack and blanked the app; an angle cut that removes nothing was keyed and tagged the part's own face edges): (4) **ruling, for the user**: a definition that is never listed (every placement a sole child) but sits under two different listed assemblies has its features keyed in BOTH trios, against R5's "once" — kept, since each trio draws the part; (5) the tag's leader reuses the balloons' `plans-leader` class where spec §4.5 names `plans-key-leader` (same look); (6) when the clamp pulls a tag to within its radius of the anchor, the leader is drawn backwards (cosmetic); (7) `(N×)` counts instances while merged tags draw fewer circles (the spec's rule; for the user's eye). **Status:** open for (1), (3) and (4); the rest record-only.
**Status:** CLOSED 2026-10-16. The user's rulings: (1) "letters sitting on dimension lines is ok"; (4) "no we don't need to label duplicate assemblies (too busy on the plans sheet)" — CHANGED: `keyedHere` claims each STORED part (container id + part id) for the first trio that keys it, so a never-listed definition under two listed assemblies is keyed only in the first (`plans.test.ts`, mutated); only assembly trios can share one (a part reached through unlisted definitions has one path from its trio, and the piece's unlisted chain cannot sit under a listed assembly without a cycle). (3) closed by the user's real print ("looks good"). The rest record-only.

## From follow-ups 5 — 2026-10-16

**382. Follow-ups 5 residue.** (1) Joinery's `rebaseCuts` (`recipes.ts`) still does float arithmetic on stored cuts when a
part grows (`offset += amount`, a stop `+= amount`), so a rebased mm cut may sit an ulp off the grid point `pocketFor` would
store for the same opening. It applies the same LOCAL operation to congruent parts, so it cannot split two of them once
`pocketFor`'s inputs agree (fu 216); not changed without a failing case. (2) Likewise `storedAsShape`'s re-store recomputes a
re-stored cut's numbers off the grid (fu 216's last Status) — deterministic, so no split; snapping after it was declined because
its ulp rulings (fu 200, the user's) decide which side of a flush boundary a re-store may land on. **Status:** record-only.

**383. The printed cut list splits across pages messily.** The user, after a real print 2026-10-16: "A real print looks good, although the cut list should probably try to start new sections on new pages because right now the way it splits things up across pages is very messy". Today only a drawn
diagram, a sheet layout and a Buying entry avoid breaking inside; a material group, its heading, its rows and its subtotal
flow across page breaks wherever they land. **Status:** open (work; design to be approved).
**Status:** CLOSED 2026-10-16 (the user's ruling: "yes, new page per section"). Print rules in `styles.css`: each `.cutlist-group`
after the first and `.cutlist-buying` take `break-before: page`; section and Buying-entry headings `break-after: avoid`;
`.cutlist-subtotal` `break-before: avoid`; rows already never split. Four CSS tests plus a sibling-structure test
(`CutList.test.tsx`), every rule mutated. Verified with a REAL Chromium PDF (`page.pdf()` through the code runner — possible
after all, see fu 70): a 29-part, three-material project printed 7 Letter pages — Pine 1–4 (each page starting on a whole
row, its subtotal beside row 22), Plywood with its sheet layout 5, Walnut 6, Buying 7 (`docs/img/fu383-cutlist-pages.png`).

## From the section views round — 2026-10-17

**384. Section views residue.** (1) Hatch neighbours are found by outlines MEETING (a vertex on the other's edge, within
DRAW_EPS); two parts modelled OVERLAPPING (a design-check fault, inv 38) can get the same hatch where they cross — seen live on a
fixture table whose aprons ran into its legs. (2) The hatch line is drawn at the pattern tile's edge, so half its stroke is
clipped (final review M3); density and weight are for the user's eye on a real print. (3) A part with no kept wood draws nothing
on paper, even a face lying ON the plane, where the viewport keeps (and z-fights) that face — a deliberate difference (review I1).
**Status:** open (for the user's eye: (2); record-only: (1), (3)).

**385. A raised panel's cut-list row reads a short point.** `shortPointLine` (fu 281) takes any cut on the length face as an
end cut, so the Raised panel preset's two end chamfers give `Short point 17"` on a 20" panel — true of the front face's long
edges, but not a length a woodworker cuts to: the panel's stock and back face are full length. Seen in the presets batch live
pass. A remedy would have to say which chamfers count (kind never decides geometry in `shortPointLine`). **Status:** open (for
the user's ruling: keep, or omit the short point when every end cut is a chamfer that leaves the far face whole).
**Status:** closed (2026-10-17, the user's ruling: "Omit the short point for chamfers"). `shortPointLine` leaves out an end
chamfer that keeps part of the end face standing (its leg along the cross dimension short of that dimension: a tongue); one
reaching the far face is a miter by geometry and still counts. A raised panel has no short point; a miter beside such a chamfer
sets it alone.

**386. A part with curves on two `through` axes loses visible lines in the exploded isometric.** Found 2026-10-17 probing
edge profiles (fu 365): a 36 × 20 × 3/4 top with a 3/8" Rounded corner on all four top edges (two `through: 'length'`, two
`through: 'width'`) draws as a few stray lines in the Plans sheet's exploded view. `drawView(…, ISO, { hiddenLines: false })`
gives 24 visible segments, where the two long-edge roundovers alone give 58 and no curve gives 9. One long edge plus one end
(39) is plausible, so the loss appears when both axes have curves on opposite edges. Cause not yet diagnosed (suspect: the
bodies split by curves on two axes making an occluder seam that hides the part's own edges). Live on master: Rounded corner
with Through: Length/Width is reachable today. **Status:** open (bug; blocks edge profiles, fu 365).
**Status:** closed (2026-10-17, edge profiles chunk 1, `84d0030`). The loss was NOT two-axis, and the suspected occluder seam
is refuted (the top is one convex body). A 3/8" roundover has 5 model chords, so its middle chord face lies at exactly 45°,
edge-on to the isometric: `silhouetteLines`' product test read that face's n·d as +2.8e-16 (facing) while the lift test read
it as edge-on (≤ 1e-9), so the silhouette's near vertex was skipped and the far one drew hidden — for one roundover as for
four (even chord counts were unaffected). On a four-edge top the end profiles legitimately remove the plane the long edges'
arcs would sit on, which is why so few lines were left. Fix: one `EDGE_ON` (1e-9) / `facing()` shared by both tests.

## From the edge profiles round (chunk 1) — 2026-10-17

**387. Edge profiles residue.** Deferred review minors, record-only unless noted:
(1) an edge-on chord face's far silhouette can draw hidden under the visible one (a dashed tail over a solid line is possible;
**for the user's eye on a real print**); (2) a pre-chunk set of four through-length "Rounded corners" no longer collapses to one
line (now four `Roundover` lines; the bytes are kept); (3) preset menu text: the ogee's detail has no noun (`1/2", on the top
long edge`), and "top long edge" is wrong when width > length or the part is upright (spec-given wording); (4) the Profile
select is not judged on focus as the Curves Kind select is, and a row's select-refusal error is not cleared by undo or a
resize (the same as Curves); (5) `profileCurve` does not normalise a symmetric kind to facing `v` — every writer passes `v`;
a bead with quirk 0 or a thumbnail with no depth must be validated by the caller; (6) test gaps: byte identity pinned on 1 of 8
edges, facing `u` tested only for the ogee, no loader round-trip test, `drawingIdentity` has no curved fixture, the
"curve-tagged segments are silhouettes only" comment is not pinned; (7) dead code: the corner collapse's `through` branch
and group key after the profile filter, a redundant `k === 1` branch, a stale header comment in `profiles.ts`; (8) residue of
the final fix pass: a face within ~5e-4 of edge-on still grazes under `curveEdgeLifts`' `LIFT_MAX` 1e-3; `bodyEdges`'
`NEAR_LINE` face prefilter has a theoretical gap for a face whose sharpest angle is under ~2e-6 rad (no fixture changed);
the four-edge cove top is the least improved (61 bodies from its concave facets, ~22–26 ms) and the ogee guard has ~25%
margin on a loaded host; (9) final re-review: `drawing.ts`' probe comments still say "silhouettes only", no test pins that
the along-view lift leaves another part's occlusion alone, and the fix pass re-triangulates every SPLIT-plan curve (same wood,
watertight) — its shading on real hardware goes with fu 370. **Status:** open (for the user's eye: (1); the rest record-only).
**Status:** (1)'s on-screen look seen 2026-10-28 (the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving)); CLOSED by the user's ruling ("close them all").

**388. Should the Profile select grey a refused option and say why?** The Curves Kind select does (presets minors). The
Profile select applies the change and refuses in the row's words instead (spec silent). **Status:** open (for the user's ruling).
**Status:** open (code-sized). The user's ruling 2026-10-17: "greying out a choice makes sense" — the Profile select greys a
refused option and says why, as the Curves Kind select does (judged on focus). **Status:** closed (2026-10-17). The Profile select's options are judged only while it has
focus (afresh when the profile or part changes under it, dropped on blur); a refused one is disabled with the refusal's words
up to its dash (`Cove — puts hole 1 into the cove`; `optionReason` in `curveRefusal.ts`, shared with Curves). 387(4)'s
"not judged on focus" half is closed with it.

**389. Draw the corner miter where two profiles meet at the paper tolerance.** Where two profiles meet at a corner, the miter
lines (the intersection of the two curves' chord faces) are drawn as model chords, up to ~0.005" off the true curve, because spec
§5.1 refines outline-plane lines only to `DRAWING_CURVE_TOLERANCE` (0.001"). New scope, found in fu 386's diagnosis. **Status:** open (candidate; ask first).

**390. A profile does not follow a curved edge.** The user, 2026-10-17, after edge profiles chunk 1 went live: the profiles
"don't work well with curves" — a profile runs straight along its edge (a prism through the length or width), so on an edge an
Arch, Bow or Rounded corner has cut it disappears where the curve cuts in and stops at a rounded corner, instead of following
the outline as a router bearing would. Following an arc means sweeping the profile around it (a surface of revolution about the
arc's axis), which is outside the line/arc prism model (inv 53) and the convex-body rule (inv 48). **Status:** open (feature;
needs a spec).
**Status:** open — spec `2026-10-17-sloyd-profile-runs-design.md` approved 2026-10-17 (with fu 365's stopped profiles), in chunks
a1 → a2 → b → c. **Chunk a1 implemented** (branch `profile-runs-a1`, schema 18: `Board.profiles`, no visible change); a2 (stopped
profiles and the run-out) next, then b (following the outline: this entry).
**Status:** open — chunk a2 implemented and merged 2026-10-18 (stopped profiles, the run-out). Next: chunk b (following the
outline: this entry).
**Status:** open — chunk b1 implemented and merged 2026-10-18 (not deployed; no schema change): End to end follows a cut side and
carries round its corner arcs (B1, B1a), All round follows the whole outline, and a saved End to end follows on load (B10) or, too
tight to follow, runs straight as a2 built it (the user's ruling). Next: b2 (two-side runs, B3; stops on a turned run). Residue 393.
**Status:** closed — chunk b complete: profile runs b2 (2026-10-19, code complete at `5027ff9`; merged `0e41f87` and deployed 2026-10-19 as `index-BhtaBf2G.js`; no
schema change) makes a stop on an arch, bow, notch or corner arc follow and run out there, and a stopped run start on one side and
stop on another (B3); saved a2 stops on a turned path follow on load or run straight by cause. Chunk c (speed) stays under 393(2)
and 394(5); blind curved recesses under 365. Residue 394.

## From the profile runs round (chunk a1) — 2026-10-17

**391. Profile runs a1 residue.** (1) **The schema-18 gate's last hole** (final re-review): an end carrying both `through` and a
stray `from`/`at` is read as a `through` end, and an end with a parseable side but an unreadable `through` (and no `from`/`at`) is
dropped, not refused. a2's plan tightens it first: refuse `stopped` whenever `from` or `at` is present, refuse an unreadable
`through`. Until then, **deploy a1 together with a2**, never alone (a1 shows nothing new, and its loader would become a rollback
target). (2) Degenerate profile sizes (1e-5, 1e-10, a thumbnail depth of 1e-12) are kept where the curve validator would drop the
same shape; no reader throws. (3) The store's profile writers do not validate their input (only the panel writes, always End to
end); a2 must teach `profileAsCurve` station runs before they can load. (4) Test gaps: no perf guard for a part that stores
profiles (measured 39 µs per four-edge ogee part per frame, against 26.5 µs as curves); `judgeHeld` after a profile edit unpinned
(as for curves); the cache-miss corpus cases rely on unique dimensions; the corpus is default pose only. (5) Small code notes:
`refusalFor`'s `after` parameter cannot be told apart from its default in a1 (a2's plan must add the test that can); Profiles.tsx
still normalises twice per attempt. **Status:** open ((1) before a2 ships; the rest record-only).
**Status:** (1) closed in profile runs a2 (Task 1, `ac1f049`): an end carrying `through` with `from`/`at`, or a `through` that is
not min/max, REFUSES the document (a half-valid station end — `from` without `at` — drops: a2 understands stations). (3) closed:
`profileAsCurve` builds station runs. The rest record-only.

## From the profile runs round (chunk a2) — 2026-10-18

**392. Profile runs a2 residue.** (1) **P19:** run-out lines (edges and silhouettes) are drawn as the model's chords at
`CURVE_TOLERANCE`, not as paper-tolerance fine paths (inv 47's `curveDrawEdges` does not refine a revolved surface). (2) **For the
user's eye:** the run-outs' smooth shading on real hardware (software GL showed them too small to judge,
`docs/img/profile-runs-a2-iso.png`); a cove's concave run-out draws dashed hidden contours on the Plans sheet (judge on a real print).
(3) **Geometry residue:** sector chord scraps of 2.6e-7–1.9e-6 in³, 0.2–0.5" past a stop, are kept as bodies (watertight and
edge-suppressed, pinned); `runoutPieces`' "removes a little less than the cutter" holds only for an s-monotone section (every
current kind; chunk b's new kinds must check it); the run-out normals' nearest-arc fallback assumes tangent arc–arc joins (true for
all five kinds); collinear section-edge widening does not also require each widened vertex smooth (unreachable with the presets).
(4) **Snap/probe:** P3's other clause — a point exactly on a stopped bead's quirk wall or a fillet shoulder reads air in the spanned
`stockProbe`, so a snap point there would be withheld (no generated point lands there); P14's run-out reach is conservative (a hole
just clear of a run-out may be refused). (5) **Stored form:** a station run whose ends use different `from` values (reachable by
editing one station through a copy mirrored along the run dimension, stored `from: 'max'`) is measured from the max end when the
original grows (P11 as designed), may sit non-canonical in memory until the next load, and can come to overlap another profile
after a resize — `profileFaultNote`'s comment claiming a resize never causes an overlap is wrong for it. A copied view curve keeps
its span but loses its fault words (no caller copies one). An already-overlapping row (a stacked a1 file) can be edited into
overlap with a different profile (the holes/curves kind-compare precedent). (6) **Test gaps:** no turned or mirrored part in the
run-out normal and silhouette-oracle tests (inv 44 wants `chiralPart`); no test asserts every contour is emitted; the 2000-point
`stockProbe` test leans on the oracle; the a1 four-edge ogee perf guard (and holesPerf's dado case) has thin headroom under heavy
host load — close the Playwright browser before a full run. (7) **Small code notes:** `diagram.test.ts` mid-file imports;
`withRun` casts `stoppedRun()`; `curveSilhouettes` (test-only) omits run-outs; a (+,0,+) edge-on facet draws two coincident
silhouettes (invisible). **Status:** open (record-only; (2) owed to the user's eye).

## From the profile runs round (chunk b1) — 2026-10-18
**Status:** (2) CLOSED 2026-10-28 by the user's ruling ("close them all") after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving) (the ogee all round read smoothly).

**393. Profile runs b1 residue.** Deferred review minors, record-only unless noted:
(1) **Owed to the user** (real hardware or a real print): the smooth shading of swept surfaces, and at tangent points the per-face
normals' ~0.005 rad step (Task 5 ruling); the cove's doubled Iso silhouette (~0.12" apart, one facet at exactly 45°: fu 386's rule;
judge with 387(1) and 392(2)); a silhouette along a path arc stays at model chords beside a fine-path crease (Task 7 ruling); B1's ε —
the built run goes on 2·reach·tan(φ/2) past the tangent point, up to 0.084" (a 3/4 × 1/4 thumbnail on 3/4" corners), and on a short
or curved next side the small step at the station (~0.0005–0.001") is accepted instead. **Rulings awaiting the user's review:** B1a (a mitre at a
shared corner arc's middle), B1's ε, Q3/Q6's Task 3 amendments (dropped cells; the odd-count mitre projection; a swallowed end chord
is `too-tight`, so a notch 0.2" from the end under a 3/8" roundover faults), Q6's I2 amendment (the controller's: a station run claims
only straight side chords), Q7's wording (`, top on the edge`; no top clause facing the face; `, round the corner(s)`). (2) **Chunk c,
speed** (minimum of 9, wall-clock): bead loop 53–62 ms (guard 73; the quirk-wall fix costs a third section piece per segment), cove
~63 (guard 81), ogee ~87–90 (guard 113), two loops top and bottom ~62 (guard 78) — cove and ogee now inside Q4's 80/105, guards kept
at measured + 25%; `WALL_MARGIN` fires on a filleted cove/ogee facing the edge (+20% bodies) with no perf row; the Profiles presets
still cost ~8–9 ms per resize frame on a looped part (~25 trial parts rebuild the outline and path; the remedies conflict with the
frozen-memo rule or the "No profile preset fits" note); `holeFaults` on a fresh part rebuilds swept pieces once per edit
(unmeasured); the air test scans the whole section per probe. (3) **The half arc beside a fallen-back neighbour** (final review): a
fitting End to end still mitres at a shared corner arc against a neighbour that fell back to straight, so half that arc gets no
profile (pinned as a record). The fix — mitre only against a BUILT swept neighbour, else carry round to the far tangent point — sits
on a fault-decision cycle. (4) **Path and geometry:** a Bow on a part lengthened after it was written reads as a corner arc; a side
ending at a line-only clipped corner stays straight (a1's prism); a concave corner arc's mitre is untested (no fixture) and
`skeleton.ts`' station-end ray is right only at a convex corner arc (a concave one would leave a wedge); a mitre `null` on one side
only would make neighbours disagree (mitre vs station; no fixture reaches it); corner detection groups chords by curve id (one curve
per corner arc assumed); the through-ray null branch is unreachable; a path bug now throws in every reader through `geometryBoard`
(was fault readers only); the oracle's ρ/cos h bound is true only for a monotone section, and it
shares `profilePath`/`faceOutline`/`profileSection` with the build; profilePath's segment-to-chord map repeats `curveOutline`'s
chord counting (guarded by a throw); the corners-area check's margin is thin (0.036/0.05; an exact pin exists); `keptSection`
throws in a geometry reader (unreachable); reach has two sources (`reachDepth`, `keptSection`). (5) **Probes and snaps:** at a mitre
between two profiles of different sizes the air test slightly over-claims air (untested); the stock probe reads `builtPath` while
hole faults read the tangent point, so a fault-accepted hole's rim snap may sit in air by ≤ ε (0.084") at a station. (6) **Words,
rows and refusals:** the fallback note says "too tight" even when the swept fault behind it is `runs-off` or `overlap`; ogee/bead
loops facing edge and face key alike (ruled: keys carry no facing); `profileRefusal` does not check a swept→straight profile against
its chunk-1 curve faults (unreachable found; still shown); Stopped is always greyed when leaving All round on a part whose default
side is cornered (B7). (7) **Test gaps:** the I2 guard's curved-next-chord arm is masked by the 2ε clause on every pinned fixture;
the committed ray oracle samples one point per edge and skips ambiguous points, `heldBy`/`sweptDrawing` judge an edge by its
midpoint; no pin for a loop on an uncurved rectangle (the closed form passes per the reviewer); the convexity test covers only
`cases`; the faulted loop's `planKeys` not-shown path and a built swept profile with a null `sweptInnerLine` are unpinned; the
Curves Remove refusal has no fixture that truly refuses. (8) **Small code notes:** `bodies.ts`' doc says `profileEdge` is "its
profile id"; `boardBodiesForTest` is exported from a product module; `SURFACE_EPS` in `sweep.ts` is a literal 1e-9 labelled
CURVE_EPS; `sharesEdge` is redundant after both `has(E)`; `normalsMemo`/`perFace` key on identity, frozen or not; `lineDist`
duplicates `distToLine`, no box prefilter in `sweptDrawing`; the `runoutSilhouettes` alias. **Status:** open (record-only; (1)
owed to the user's eye and review; (2) for chunk c; (3) for b2 or a ruling).
**Status:** open — re-read after profile runs b2 (2026-10-19). (3) against Q18: b2 adds NO half-arc gap for stops — B1a never mitres
a neighbour against a stop that fell back (`neighbourTakes` skips it on the stored part), so the neighbour carries round to B1's
station as it is built. b1's own case — an End to end mitring against an End to end that ran straight — is unchanged, and a
following stop can now reach it too (b2 Task 3's deferred M4); still open (the fix sits on the same fault-decision cycle). (6)'s
"the note says too tight" closed (b2: `runsStraightNote` by cause — too tight, overlap, runs off) and its "Stopped greyed when
leaving All round" closed (B7 lifted). The rest unchanged.

**Status:** chunk c1 (2026-10-19, byte-identical): (2)'s rows now — bead loop ~46 alone (guard 71), cove ~45 (62), ogee ~61 (89),
two loops ~36 (51); still over a frame: bead, cove, ogee — for c2 (the restructure). The presets' per-frame cost, `holeFaults`' rebuild and
the air test's full scan are unchanged (unmeasured by c1). The rest unchanged.

**Status:** chunk c2 (2026-10-19, branch `perf-c2`, unmerged; no schema change): (2)'s rows, worst minimum alone/full of four runs: ogee loop 48.1
(guard 61), cove 38.2 (48), bead 40.2 (51), two loops 41.2 (51); the ogee loop stays over 40 and bead/two loops cross it in full runs.
Levers left: `sweepBodies` ~11 ms, `sectionSeams` ~5, per-body mesh emission and swept normals. Still open.
**Status:** (2) the speed rows: chunk c2 MERGED (`90ef45f`) and DEPLOYED 2026-10-19 (`index-Cqf9kRT7.js`). **The ogee loop (48.1 ms alone, guard 61) is left as is by the user's ruling (2026-10-19: "Leave the ogee loop as is for now")** — its remaining levers (`sweepBodies`, `sectionSeams`, per-body mesh emission and swept normals) need relaxing c2 spec §1 (the bodies fixed); do not pursue unasked. The bead loop and two loops cross 40 only in full runs (guards 51). (2) stays open by decision; the rest of 393 as above.

## From the profile runs round (chunk b2) — 2026-10-19

**394. Profile runs b2 residue.** Parked and deferred review minors, record-only unless noted:
(1) **Owed to the user** (real hardware, a real print, or a ruling). Rulings awaiting review: R5–R7 (the Stop side select: an
adjacent side moves the station nearer the shared corner, the short way round; an opposite side keeps the station SHOWN as Start,
or, where that would make an inconsistent through Start, the profiled extent on the kept side; a moved `through` end is always
seeded per Q26); the crossed-stations `stop-off` rule (final review I1); **M1** — a long-way two-side run with ONE station on the
corner arc its two sides share (`L_MAX@0.5 → W_MIN@33` on 2" corners) is refused as `stop-off` with `A stop runs off the part`,
conservative but misleading (a spec question); **M2** — on a one-side run, Side onto a shorter side is greyed (a2) rather than
seeded; the neighbour-refusal words, `The roundover overlaps another profile on this edge — move the roundover first.`, cannot say
which of two of one kind (a proposed `… on the width max side …`), and Curves' new `A stop on the roundover runs off the part —
move it first.`; Task 6's junction override (a run-out vertex on the stop plane takes the band's normal). By eye: the shading at a
curved stop, the GPU section cap and picking through a run-out on an arc and an overlap piece, the stop-junction snap markers on a
curve, R5–R7 and redo in the real store, a two-side run in a mirrored instance edited through Properties, a real print of M3's
doubled segment (below).
(2) **Upgrade and rollback** (no schema change): a saved a2 stop on a turned path that fits changes its wood on first open
(`stopOnArch` 97.527 → 97.375 in³; bench line unchanged); rolling back to `dc49b01` refuses a two-side run but loads a turned
one-side stop SILENTLY as a2's prism (on an arch it cuts only air: the profile vanishes; data intact) — final review M5. Task 3's
M1: a saved stop whose a2 form was already faulted and whose swept form faults builds nothing on upgrade (Q10 as approved; the b1
End to end twin). Task 3's M2: a following stop uses b1's cautious hole check (40 probe documents gained a hole `— check:`).
Task 3's M4: a following stop still mitres against an End to end that ran straight — see 393(3).
(3) **Geometry and edges:** final review M2 — the one break in byte for byte: a saved a2 ogee, cove or bead stop on a corner arc
beside a B10 End to end draws two FEWER edge lines than `dc49b01` (b1 drew two its own reference does not; a fix, from Task 7's
N4; `profilesFinal`'s fingerprints are roundover-only, an ogee hash could be pinned); M3 — the fast edge path emits some
smooth-join stretches twice where a stop or run-out lies on a loop's or End to end's arc (1 segment in 300 in one Top view;
present on `dc49b01`; `fastIsReference`'s `merged()` cannot see it); Task 7 N3 — a through→through two-side run whose B1 stations
land 0.002" apart joins their run-outs at 155–157° with zero drawn length (unpinned); a run-out meeting its own band on a SECOND
chord would lose the join (`ownEnd` reads the end's path chord; no fixture); `coveredBothSides` with three strips on one line falls
back (correct, slower); Task 6's latent limits — `endOverlaps` skips a non-convex face, a triple-covered area would emit twice;
Task 2's M-c — `stationPoint` trusts a monotone stretch (a hand-made line waste could make one station name several points;
unreachable from presets); the probe past a stop plane reads only cutter distance inside that half-plane (a path curving back
into it would misread; none does); `from` is not canonicalised, so a loaded `from: 'max'` station and an equal `from: 'min'` one
split cut-list rows (pre-existing).
(4) **Q13's zone, its cost:** a stop within reach·tan(φ/2) of the next convex vertex is BUILT at that vertex (never lengthened;
faults read the typed station): 0.008" short for a 1/4" roundover on 2" corners, ~0.05" at R10's limit (1/4" on 1/4" corners),
0.07" for a 1/2" roundover on 1/2" corners. Q14: a stop inside a neighbour's B1 ε overlaps that cut by up to ε (≤ 0.084").
(5) **Chunk c, speed** (minimum of 9, wall-clock; guard = measured + 25%): bead loop 73 (measured 60–63 since Task 7's N4 fix, b1 rows
+5–13% on `dc49b01`), cove loop 81, ogee loop 113, two loops 78, `wrapFour` 57 (measured 39–45.5), the two-side cove 69 (55.0) —
the last two over the 40 ms frame during a resize drag; **re-baselined 2026-10-19 after the merge** (two full runs each failed one
row: the stopped corner cove 42.3 on 40 at load 5.2, two loops 80.0 on 78; the user's ruling: the worst full-run minimum + 25%, never
lower than the old guard): bead loop 89, cove loop 86, two loops 82, the two-side cove 73, and over a frame the 2" roundover loop 45,
thumbnail loop 42, B1 front 47, the four-edge ogee top 46, the cove stopped on a corner arc 41; ogee loop 113 and `wrapFour` 57 kept
(the table is in `docs/history.md`, b2); `stationFrontToBack` ~38 with no row. The guards are honest at idle and
FLAKY under load: a full run once read 40.47 ms on the 2" roundover loop's 40 (load 4.5; 28.5 alone), and at ~1.4× inflation the
cove, bead, two-loops and B1 front rows would fail too (fu 340's class). `profileFaults` ~0.8 ms a call on fresh trial parts
(`deepFreeze` and the outline build); the Side and Stop side selects judge every profile per option on focus (3–25 ms; unmeasured
on a busy part); `sweepView.test` ~30 s, `sweepEdges.test` ~16 s, `sweepStops.test` ~95 s alone.
(6) **Test gaps:** only the `top` cap plane through a run-out is committed (side and front planes checked in review only); the Plans
oracle checks visibility, not presence (Task 7 M2; presence is guarded through the edge tests); CREASE_MIN (30°) is a fixture-only
oracle (a 1/8" roundover steps 30°); the `skeletonFits` key and `runoutFor`'s stop end-tag check are unpinned (equivalent on every
fixture); a stop's ogee `'nearest'` arc branch is unpinned; the probe's step measure cannot resolve below ~1e-6; the R-a oracle does
not model B1's ε (it fails at r ≤ 1" on bodies identical to deployed b1); the `tauInscribed` allowance and the new normal formulas
hold for monotone sections only (roundover, cove); Task 8's m4 (the two-side through-START wording); `twoSideSharp`'s closed form
alone survives a `BEARING` 0.26 mutation (the axis pins catch it). **Status:** open (record-only; (1) owed to the user's eye and
review; (5) for chunk c).

**Status:** chunk c2 (2026-10-19, branch `perf-c2`, unmerged): (5)'s two-side cove 38.2 (guard 48; was 43-44); `wrapFour` measured 27.9 in c2's four runs. Rows still over 40 are the ogee loop (48.1) and, in full runs, bead (40.2) and two loops (41.2); the
wall-clock guards stay flaky under load. Still open.
**Status:** (5): chunk c2 MERGED and DEPLOYED 2026-10-19 (`index-Cqf9kRT7.js`): the two-side cove ≤ 38.2 (guard 48), `wrapFour` 27.9 (40). (5) is CLOSED for b2's rows; the ogee loop (fu 393) is left as is by the user's ruling. A merged full run flaked the cove loop's new 48 guard once (48.4, under load; passed alone and on a re-run) — wall-clock flakiness under load stays as noted.

## From the edge banding round (chunk 1) — 2026-10-20

**395. Edge banding chunk 1: the live pass's findings, for the user's eye.**
(1) **A banded row prints two sizes.** Its `dims` are the CORE (`35-1/2" × 19-1/2"` on the live tabletop), but its part
diagram, and every setup line except the band line, describe the FINISHED part (`36"` × `20"`). This was Task 5's deferred
minor and is recorded in the spec's §4.1 *Amended (implementation, chunk 1)*. Chunk 2 redraws the part diagrams, so decide
there whether a banded part's diagram shows the core, the finished part with the band marked, or both.
(2) **Wording:** four sides of one type read `Band: the width min side and the width max side and the length min end and the
length max end — …`. Nothing joins three or more sides as a list (`, … and`) or collapses them (`all four sides`).
(3) **Buying's unpriced tail counts a tape type as a material** (`3 materials have no price`). Task 6 kept this as
plan-mandated wording.
(4) **Strip rows can take the first numbers of the series.** A material holding only strips (the maple of a plywood
tabletop) sorts by material, so its strips came first live and the Plans sheet's balloons started at 3. This is correct
by the ruled order, but it may read oddly.
**Status:** open (owed to the user's eye; (1) with chunk 2).
**Status:** (1) CLOSED by edge banding chunk 2 (the user's ruling, 2026-10-20: "Finished + marks + core note"): a banded part's
diagram is drawn at the finished size, with a heavy mark on each banded side, the band line as a note, and a second note giving
the core (`Drawn at the finished size; cut 35-1/2" × 19-1/2" before banding.`). (2)–(4) open (owed to the user's eye).
**Status:** CLOSED 2026-10-20 (the user's choices): (2) three or more sides read as a list, all four of one type as `all four
sides`; (3) Buying's tail counts band types apart (`2 materials and 1 band type have no price`); (4) left as is — strips keep the
material order.

**396. A part whose `faceOutline` is null faults every band `no-side`.** A faulted or overlapping through-thickness curve
leaves no outline. Every band on that part then contributes nothing: no core reduction, no strip, no tape. While the curve
is faulted, the cut list prints the finished size as the cut size, and Buying drops that part's edging. This is
conservative by the Task 4 ruling: the part already carries a curve fault. Judging the bands against the plain rectangle
in that case is the alternative. **Status:** open by decision (ask first).

**397. Split a banded part's bodies into core and band** (spec §7). Today a hole drilled into a solid band, a section through
edging and a profile routed into it all read as one piece of wood. The fix would be a final `boardBodies` stage with
`BodyFace.band`. **Status:** open by decision: take it only when a real project needs it.

**398. Bands through joinery, Refine and Repair** (spec §6). Today all three refuse a banded project at entry
(`bandedRefusal`). Carrying bands through would need: joinery keeping a tenon out of edging, Refine reading and writing
bands, and Repair proving them. **Status:** open (feature; needs a spec).
**Status:** open (feature). Its joinery and Repair half is spec'd (joinery-features spec §4.4, §5, §8 Q2: count only the visible
length) as that spec's chunk 3, not started (needs its own plan, 2026-10-22); Refine stays open (needs a spec).
**Status:** joinery and Repair half CLOSED (joinery-features chunk 3, 2026-10-22, merge `1d39344`, deployed 2026-10-22
as `index-bKxsxRuC.js`): joinery rules out only the joint kinds a band is in the way of, Repair accepts banded projects, and strips, tape and glue lines
count only the visible run (inv 41, 54); §4.4 changes existing hand-notched banded documents (a full-thickness cut through the band
at a run end now shortens its strip, tape and glue line), and no existing test's number moved. The Refine half stays open (feature; needs a spec).
**Status:** Refine half CLOSED (refine-features, 2026-10-22: Refine carries bands, band types included, in the original frame, inv 56; `bandedRefusal` deleted). Fully closed for banding; Refine authoring bands stays out of scope (record in fu 329's reading).

**399. A browser library of band types** (spec §1's non-goal). Band types are per project; a shop's usual edging has to be
re-made in each project. This would follow the materials library precedent (`sloyd.materials.v1`). Prices raise a
question: band prices live in the document (fu 265's direction). **Status:** open (feature; ask first).

**400. Corner rules per corner** (spec §1's non-goal). One rule per part today (`cornerRule`). **Status:** open (feature; ask
first).

**401. Edge banding chunk 1: deferred review minors and test gaps** (record-only unless noted).
(1) **Tests:**
- No App-level `onSave` test: a band-types-only Save should make one undo entry, and a no-op Save none. Verified by reading,
  and live (one undo entry, step 2 of the verification).
- Curves' preset-withheld test clicks `+ Add curve` only `if (add)`. Not vacuous (the final review's mutation of the withheld rule
  turns it red), but asserting the trigger exists, or the `No curve preset fits this part.` note, would state the intent.
- No test that a curve edit leaving or removing an existing band fault is accepted.
- Buying gaps: the whole-foot boundary (24"), mixed priced and unpriced tape, tape-only priced, and the tape-only unpriced
  total `—`.
- No UI-level test of the Materials dialog's in-use delete or fault refusal; the plural wording is untested.
- `bandIds` on a definition part and a dangling band on a shape are untested (the threading is correct).
- A band naming an unknown type id is skipped silently, untested (the loader drops such bands). **Closed** for the cut list's
  band line (final review 2, `cutlistBands.test.ts`).
(2) **Behaviour:**
- Corners reads `Mixed` when a selected part that does not qualify keeps the default `'long'`. **Closed** (final review 1):
  Corners reads and writes only the parts `bandsMeetAtCorner` reaches, and the row key carries the rule only there.
- The Materials dialog's `freeName` for a new row is case-sensitive, but the name-clash refusal is case-insensitive, so a
  new row can arrive refused.
- An exponent-form price (in a hand-edited import) fails `PRICE_RE` and blocks Save.
- `Edging comes from solid wood.` marks no field, and a library name clash hides a band refusal message.
- The loader's `dedupeNames` runs before the built-in is prepended, so a same-named user type can duplicate the built-in's
  name. A stored `band-iron-on` of kind solid counts as the built-in present.
- New band type names use `base 2` (a local `freeName`), not `names.ts`' `(n)`.
(3) **Code notes:**
- `coreSize` returns a fresh, unfrozen object on each call.
- `BAND_SIDES` elements are not frozen; `sameBandType` casts instead of narrowing.
- `bandLine`'s `types.find(…)!` relies on the loader and store never leaving a dangling band type. **Closed** (final review 2):
  a band naming an unknown type is skipped in the line.
- `groupSignature` joins bands unsorted (it relies on canonical order).
- Nesting's `groupBoards` receives strip boards (harmless: solid only).
- Banding option reasons are capitalised (`— Needs a straight edge`), unlike Profiles' lower-case `optionReason`.
- Global DOM ids `band-width-min` / `band-corners`.
- The Materials dialog's band props are optional, with defaults.
- `names` is imported mid-file in `document.ts`.
(4) **From the final whole-branch review (deferred):**
- Properties' band fault note has no `… at this size.` suffix for a fault a resize caused (spec §3.4); the cut list's `— check:`
  covers the sheet.
- The Materials dialog re-judges every part's band faults on each render (`parts={worldParts(doc)}` and the before/after lists are
  fresh arrays, so the `(part, types)` memo never hits), and the open `Band ▾` menu rebuilds `faceOutline` per item via
  `{ ...part, bands }`. Fine at today's project sizes; key the outline on dimensions plus curves if it ever shows.
**Status:** open (record-only).

**402. Edge banding chunk 2: for the user's eye and real hardware.**
(1) **The band looks on real hardware.** The live pass ran under software GL: the walnut/maple `'edge'` texture's scale on a 3/4"
face, the tape look on MDF (its `'face'` texture), and a faded solid band (it takes the PART's faded colour, as everything outside
an open assembly greys). At full size maple edging and plywood plies read alike by eye; the check used walnut on a 4 × 3 part.
(2) **Glue lines on a real print** sit 1/4" inside the outline and print as a near-coincident double line at plan scale; the far
face's glue lines are hidden and dash under the visible ones (as outline edges already do).
(3) **A strip's diagram is not to scale** (Q7): the sliver clamp makes sx ≠ sy, so a 45° mitre's hatched wedge reads steeper.
(4) **A wholly faulted band type is still keyed** and lands in `Not shown in these views: … — check the cut list`.
(5) **The Plans key gives one line per (part, band type)** (Q6), where the spec said "a key line per banded part".
**Status:** open (owed to the user's eye).
**Status:** (3), (4), (5) CLOSED 2026-10-20 — the user approved Q6 and Q7 as built (one key line per band type; a wholly faulted
type keyed under `Not shown in these views`; the strip diagram's distortion lived with). (1), (2) open (real hardware, a real print).
**Status:** (1) CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): walnut edging, its mitre and the MDF tape read well.

**403. Edge banding chunk 2: deferred review minors and test gaps** (record-only unless noted).
- Tests: the ends-rule glue test asserts two sides and counts the rest; no thick-tape case under Ends, no Mitred case with a solid
  long side and a thick-tape end; no banded HOLED part (a bore into a banded edge: painted area = side − mouth, watertight); no
  render test that PlansSheet passes `doc.bandTypes` (dropping the prop would remove every glue line and band key silently); no
  vUp-vs-not mark position, no metric core note or mitre; the square-strip equality test is near-tautological; the viewport look on
  a mirrored copy is not pinned (the Plans sheet's mirrored case is).
- Code: four walks of a side's stretch (`bandFaces.ts` `runOf`, `diagram.ts`, `featureKeys.ts`, the bandFaces test) — one helper
  in `profilePath.ts` would leave one definition; `judge`'s per-side chords stay private in `banding.ts`. `as Point` on a
  computed-key object (`banding.ts`); `bandLine` computed twice in `buildDiagrams`; `+ 0` (−0 normalisation) uncommented.
- Perf: no guard row for a banded rebuild. Measured by the final review: the post-pass is 1.3 ms on a 1140-triangle ogee loop with
  tape all round (its `partMesh` 22.3 ms), 0.3 ms on the arched apron; a banded plain box now draws through `bodyMesh` (Q2).
- A corner arc shared by two taped sides takes the first look in canonical order: invisible, since a tape look is always the
  part's own material and a solid band on an arc faults `needs-straight`.
**Status:** open (record-only).

## From the hardware round — 2026-10-21

**404. Hardware from holes.** Linking a hole row to the hardware it receives: counts derived from holes where a rule exists
(dowel pairs, hinge cups, shelf-pin rows). Today counts are typed by hand (spec §1, §10 call 2). Also the dowel half of fu 332
beyond hand counts. **Status:** open (feature; needs a spec) (hardware spec §11).

**405. A browser library of hardware types across projects**, with fu 399's band types. Hardware types live in the document, so a
new project starts with none. **Status:** open (feature; needs a spec) (hardware spec §11).

**406. Hardware on the Plans sheet** (a table, or keyed balloons). Hardware appears in the cut list and Buying only.
**Status:** open (feature; needs a spec) (hardware spec §11).

**407. Hardware for a multi-selection** (mixed counts). Properties shows no Hardware section for more than one selected part.
**Status:** open (feature; needs a spec) (hardware spec §11).

**408. Handedness and structured sizes** for hardware (left/right hinges, a size parsed from the name), if real projects need
them. Names are free text and never parsed (no `units` edge, inv 52). **Status:** open by decision (only when a real project
needs it) (hardware spec §11).

**409. Hardware round: deferred review minors and test gaps** (record-only unless noted).
(1) **Tests:**
- `hardwareModel` tests are thin: `sameHardware` with a differing type, `withHardwareUse` replace, `mergeHardware` with a duplicate
  in the input, `copyHardwareUse`/`sameHardwareType` directly, and `lowerEdit`/`groupSignature`'s hardware branches (Task 3's tree
  tests cover the paths).
- Task 1 had no strict RED run (mutations ran instead). Task 7's tests were written after the code (RED by revert).
- Task 2: the plan's named mutation (entries before types) cannot fail the dangling-type tests; the set-emptying mutation guards
  the order rule instead.
- `copyInRow`'s hardware test does not say whether the count includes the original.
- Nested PART naming two levels deep is untested in `hardwareTotals`.
- Task 5: no test for a double-placement one-edit-per-target, no `readOnly` test for part and assembly targets, a stale assembly
  path is untested.
- Task 6: the hardware tests sit inside the fu 383 describe; a material-count regex is loose; `hardwareFreeIdentity` covers two
  fixtures only.
- Task 7: an inline ref callback per render; no shaped-part-then-reopen-assembly UI test. (The shaped-part render test was added by
  the live-bug fix, c9d5c08.)
- Task 8: App's hardware Save gate, `projectChanged` and the `newHardware` clear have no test (a mutation would pass).
- Task 9: the joined Refine re-attach site is redundant today and unpinned (the materials precedent).
(2) **Behaviour and code:**
- `deepFreeze` in `hardware.ts` freezes the document's own `HardwareType` objects (`total.type`): a side effect on document state.
- `hardwareUsedBy` is not memoised (the dialog only); the dialog's `useMemo` is dead because App passes a new closure per render.
- `holderPlacements` is a dense ternary. `CutList` calls `hardwareTotals` in the render body (memoised by a WeakMap in `hardware.ts`).
- `setHardware` refuses `count: null` (remove) for an unknown type: unreachable while delete-while-used is refused.
- `ungroupItem` replaces the parent's hardware with an equal new array when the definition's is empty (identity churn).
- Properties' Hardware: a pending-focus flag can survive a refused or no-op add and steal focus later.
- The dialog's name-clash check compares the pre-`cleanName` text; the hardware fieldset reuses the `band-*` CSS classes.
- `bandFreeIdentity`'s DROPPED set drops any `hardware` key: narrow it to null-only so a leak still fails the hash.
- `.cutlist-hardware` has `break-inside: avoid` on the whole section (a long table could move to the rows).
- The refusal name-list helper is duplicated (`bandedRefusal`, `hardwareRefusal`, `refineDesign`); `hardwareRefusal` names a part
  placed twice twice (the `bandedRefusal` precedent).
**Status:** open (record-only).
**Status:** (2)'s refusal name-list helper: moot: the refusal modules were deleted (refine-features, 2026-10-22).

**410. Ungroup refused for overflow is silent.** Ungroup merges an assembly's hardware into its parent by adding counts; a sum above
999 is refused (P1, *Amended (planning)*, approved), but the UI gives no reason: the button does nothing. Reachable only with
counts in the hundreds. **Status:** open (a wording decision for the user: a message, or leave it).
**Status:** closed by decision 2026-10-23 — the user: leave it silent (too rare to be worth UI).

**411. The link note does not mention hardware.** `Linked with 1 other part: edits to size, material, grain, posture or cuts change
all 2.` is unchanged, yet hardware is now a shared field too (and two parts differing only in hardware do not link). For the user's
eye. **Status:** open (wording; the user's eye).
**Status:** CLOSED 2026-10-23 (the user: say what is NOT shared). The note reads `Linked with 1 other part: every edit but name,
position and turn changes all 2.`; `links.test.ts` pins LINK_FIELDS' own set to that sentence.

**412. `Counted once per copy: <n> in all.` sums different types.** On a Drawer placed 3 times carrying a Pull and Drawer slides, it
reads `6 in all` (1 + 1, times 3). The words are the spec's own (§5.1); the sum across types may not be what a reader wants. For the
user's eye. **Status:** open (wording; the user's eye).
**Status:** CLOSED 2026-10-23 (the user: per type). The note reads `Counted once per copy (3): 3 Pull, 6 Hinge in all.` (stored order).

**413. `sameAngleCut`'s exact gate comparison can be refused by rounding.** A number goes out as `x' = x + L` and back as `(x' - L) + L`;
when `x' > 2L` that subtraction rounds, so a re-join need not reproduce an angle cut bitwise. Holes compare within `GATE_TOLERANCE` for
this reason (joinery-features plan P2); the angle-cut clause was left exact. **Status:** open (record-only until a real refusal shows; ask first).

**414. A lap set whose full set is not coplanar but a model-chosen subset is.** With three or more half-lap partners, the unit trial
(`featureAllowed`) joins the whole set; if the full set is not coplanar the trial skips and rules nothing out, yet the model may choose
a coplanar subset that the real run laps through a hole. No fixture reaches it. **Status:** open (record-only; the oracle,
`holesOracle.test.ts`, is the backstop).

**415. A bowed rail loses mortise-tenon, dado and stopped-dado at its ends.** A Bow preset's waste lies along the end line for its
rise, and the growing-end rule (any positive-area end contact rules the growing kinds out, P6 / the AI-angles ruling) applies to it,
so the rail is joined as a butt where a tenon clearing the bow's waste would have been fine. Candidate: an end-face clearance
exception like P7's, judged against the tenon section (a curve whose waste at the end face clears the section). Found at joinery-features
chunk 2, Task 4; the spec's *Amended (execution, chunk 2)* records the ruling. Priority note (final review M1): the default Bow's rise is
min(0.5, w/4) (`bowAt`, curves.ts: ¼ of the in-face dimension that is not `along`, the width by default) and the default tenon shoulder
is min(0.5, snap(w/4)) (`tenonSection`, recipes.ts: the entering part's width) — equal for ordinary widths (any width of 2 in or more,
or one whose quarter is on the 1/16 grid) — so a default bow's end waste lies wholly in the shoulder band, and the candidate clearance
exception would reliably restore tenons on bowed aprons. **Status:** open (record-only; ask the user first).
**Status:** CLOSED 2026-10-22 (the user's ruling, "keep the fu 415 rule"): a curve or straight profile that only meets a growing end keeps
the growing kinds along the length when its waste on the end face stays out of the tenon's section (open); a default bow keeps its
tenon. Costs accepted: fu 417, and a dadoed bowed end's step at the housing's mouth.

**416. A metric Half-round notch was dropped on its next load (2026-10-22).** `archCurve` stored `to = start + span` and `rise = span / 2`;
on a metric part `(start + 2) − start` need not be 2, so the preset (and a typed notch) could store a rise a few ulps past half its chord
and the loader DROPPED the curve on the next load (e.g. a 370 mm part), or read it back as an Arch. Found by the joinery-features chunk 2
final fix wave; it predates joinery. **Status:** CLOSED 2026-10-22 — `archCurve` stores a notch's rise as half its STORED chord, and the
loader holds a rise (radius) within 4 ulps of its coordinates past the bound to the bound, so a notch already saved that way loads
instead of being dropped; tests sweep every metric length 1–3600 mm. A chord that rounded the other way was never dropped and still
reads as an Arch (switching its Kind makes it a notch).

**417. A Bow or Rounded corner shifted by a join no longer reads as its preset (2026-10-22).** With fu 415 a bowed rail can be tenoned
or dadoed at the end its curve is measured from; `rebaseCurves` then keeps the curve on the wood by shifting its numbers, so `start` is
no longer `[0, 0]` and `bowFields` / `cornerFields` return null: the Curves row reads "Curve cut" (Remove only), the Plans key "Curve: 1
arc and 3 lines", and the bench line drops its preset words. At the far end a Bow keeps its kind but spans less than the edge, and a Rise
edit refits it across the tenon. Geometry, the gate and unjoin are correct. A fix needs a design decision (does a bow on a tenoned rail
run between the shoulders?). **Status:** open (feature; ask the user first).

**418. Tape on a hand-cut arc is counted whole (2026-10-22).** The visible run (joinery-features chunk 3, P13) clips a tape run
chord by chord: a LINE chord loses the part inside any qualifying cut's (run, across) rectangle, but an ARC chord is counted whole.
Only a hand cut into an arc reaches it; the result is an over-buy, never an under-buy. Pinned by a test (`bandingVisible.test.ts`).
**Status:** open (record-only).

**419. Mitred known limits at a shortened end (2026-10-22).** Two cases from joinery-features chunk 3 (P12, F1), both at a notched banded
corner under the Mitred rule: (a) a corner cut shallower along the run than the neighbour band leaves
the neighbour's mitre over the square-ended strip (a strip of 29.9 against a glue line ending at 29.75); (b) a notch can leave a strip
shorter than its mitre needs that still keeps its 45° mitre at its unshortened end (0.40 of run on 3/4" edging where the mitre needs 0.75: an
impossible piece, its inner edge at −0.35), and that corner then draws no glue or mitre line. Candidate fix: square the end when the run
is shorter than the mitre (and decide the neighbour's mitre at a shallow cut). **Status:** open (a candidate fix; ask the user first).
**Status:** CLOSED 2026-10-22 (the user: "fix fu 419"; `ac799bb`). Under Mitred a corner is mitred only where a mitre can be cut:
a corner where either band's visible run is shortened, or where a strip's mitred inner edge would be ≤ EPS, is joined as under Long
at that corner — the long edge runs through, the end band gives way, both square (`endModesOf` in `banding.ts`; strips, glue lines and
mitre lines read the one per-corner mode). (a) now: W0 runs 29.9 square to its cut end, L1 gives way (11.75); (b) now: a square 0.40
strip with its glue line, the end band giving way. The part's band note still reads "mitred corners" (the part's rule); the strip rows
show the square ends.

**420. A dropped stop end gets no summary line (2026-10-22).** With "Offer clear ends" (joinery-features chunk 3, the user's ruling)
`featureAllowed` drops a stop end whose trial meets a feature but keeps stopped-dado when another end clears; nothing is written to
`ruledOut`, so the run's summary does not say why only one stop end was offered. **Status:** open (record-only).

**421. Refine re-chooses a kept stopped dado at a dropped stop end (2026-10-22).** `validChoice` rejects a stop end that
`featureAllowed` dropped, so a joined Refine would re-choose such a joint rather than keep it. Unreachable while Refine refuses
holed, curved, profiled and banded projects (spec §3.5's kept joints). **Status:** open (revisit when Refine accepts features: fu 329,
363, 398).
**Status:** now reachable (refine-features, 2026-10-22: Refine accepts featured projects and re-joins them); still open, to be measured on a joined, featured Refine run.

**422. A shared-corner tape arc's halves are clipped per side (2026-10-22).** A corner arc shared by two taped sides is counted half to
each (`tapeRuns`); with the visible run each half is clipped against its own side's qualifying cuts, after the ×0.5. The result can only
over-buy. **Status:** open (record-only).

**423. Joinery-features chunk 3's deferred minors and test gaps (2026-10-22).** Left after the final review's fix wave:
- the bands oracle's floors are loose (`> 0` against 462 measured beside-edging stopped dados, `>= 4` against 454 narrowed-site ones);
- its `tenonExempt` counter counts tape and solid together;
- its assertion 4 (a tenoned edged rail keeps its plain length) would misfire on a part tenoned and ALSO length-trimmed (latent; no
  fixture reaches it);
- F1 (nothing visible after give-way) has no test under the Long rule (traced correct);
- no "clip arcs too" mutation was run against the tape clip;
- a band with no visible run still reduces the core and its neighbour's give-way, and `bandsMeetAtCorner` / `bandSignature` ignore
  shortened corners (by ruling: the core is cut size; an edge-case core one band thickness short needs a cut removing the whole side).
**Status:** open (record-only).

## From the refine-features round — 2026-10-22

**424. `carryGrain`'s grain-axis observation (2026-10-22).** The old `carryGrain` carried the grain's DIMENSION NAME onto a part `orient`
re-encodes. On an original whose longest side is not its `length` (possible after Properties edits), grain could then run along a
different world axis. `carryFromOriginal` replaced `carryGrain`, and the frame rule (inv 56) fixes this for featured parts only; plain
parts still take the old name-based carry. To record and measure, not fixed (refine-features spec §11). **Status:** open (record-only).

**425. A quarter turn in plan of a featured part is not caught (2026-10-22).** `featureTurned` (`'feature-turned'`) tests only that the
original thickness axis is still the thinnest. A part whose length and width swap world axes with thickness unchanged reads as a resize:
its features stay at their stored stations and the "Check at the new size" line names the part (refine-features spec §4, recorded not
built). **Status:** open (record-only).
**Status:** open (record-only), now for parts with curves or profiles only (since AI bands, a bands-only part follows the rank rule too): a holes-only part turned in plan is re-oriented (AI-holes
residual R1, `keptFrame`'s rank rule, 2026-10-23).
**Status:** open (record-only), now for parts with curves or carried profiles (a run on two sides, `carriesProfiles`) only: since AI
profiles (fu 430 chunk 2) a part whose profiles are authored follows `keptFrame`'s rank rule with holes and bands, and is re-oriented
when turned in plan.

**426. A duplicate-named returned part also receives the carry (2026-10-22).** A returned part with a DUPLICATE name of a featured part
also receives the carry (the load gate renames it `X (1)`); `carriedSummary` does not mention it. Follows refine-features spec §2's name
rule, as grain does. **Status:** open (record-only).

**427. Refine's guard around the re-join is broader than the feature check (2026-10-23, final review).** `runRefine` catches any
non-LLM throw from `runJoinery` (meant for `featureAllowed`, fu 244) and saves the design unjoined with FEATURE_CHECK_FAILED's words; a
joinery bug after joinery's own paid call would read as the feature-check message, and that call's cost goes unreported. No worse than
before (a raw failure, cost null). A narrower guard would sit on `featureAllowed` inside `runJoinery`. Same review, wording only: the
feature-turned `shown` names hardware among "the wrong faces"; `JointsSummary.notes` also carries `parseChoices`' notes (its doc comment
says ruled-out lines); FEATURE_CHECK_FAILED's advice ("Add joinery before drilling or shaping") reads oddly on an already-joined Refine and
omits edging. **Status:** open (record-only; ask before changing).

## From the AI-holes round — 2026-10-23

**428. AI-holes deferred minors (2026-10-23, execution ledger; (3) and (4) fixed in the final-review wave).** (1) The `shown` copy of a `'hole-fault'` lacks the
row's first centre, so two faulted rows on one face read as the same line (the model-facing message has it). (2) The `'off-flat'`
phrase in `holeDesignFaults` has no test. (3) `restoreHoles`' `carry.frame` gate is redundant today (untestable). (4) METRIC mirrored
sides did not link AT ALL (found by the final review, I1; the ledger had guessed "by an ulp, after a turn"): `holeSnap` was applied to world
offsets from the min corner, so a far-side distance (D − 37 mm) landed off the grid, and `inset = ext − w` drifted in float
(1.456692913385826 against 37/25.4). Failing safe meant the sides stayed unlinked. (5) The prompt's "front and back"
is not tied to an axis (probe in the live check). (6) `alignedTo`'s row checks are partly redundant with `sameShared` (a comment is
owed). (7) The property grid for `holeRowsFor` lacks station > along dimension and inset > across dimension; `sameHoles` has no test
for a different count; a single bore stores the model's pitch rather than 0; toFixed(3) centres in a message could collide below
0.0005 in (unreachable on the hole grid). (8) Task 6 kept `CHARS_PER_TOKEN` at 2 (2.03 measured on the prompt); a digit-dense prompt
may tokenise below 2 chars/token — re-measure it from the live check's real usage (owed to the live check). (9) Found by the final-review fix
wave: a holes-only part whose STORED thickness is not its smallest extent (e.g. flat 20 x 1 x 3, width 1 < thickness 3), echoed unchanged by
the model, fails `keptFrame`'s test and is re-`orient`ed — the same world holes, but relabelled dimensions and a fresh, re-derived row (not
the exact-row swap). `featureTurned` skips such an original (its precondition); applying the same precondition in `keptFrame` would keep its
frame. Left as ruled (ask first). (10) Found by the same wave, a side effect of M3: role linking compares hole rows INDEX BY INDEX
(`alignedTo`, `sameShared`), and a no-op Refine now keeps each part's STORED row order. Two identical, unlinked parts of one role at the same
rotation whose rows were added in different orders (the Holes panel appends) linked before M3 (both re-sorted canonically) and no longer do
(probe: two `chiralHoled('flat')` sides, one with its rows reversed, role `side` — 1 Shape without M3, 0 with it; mirrored 0/180 pairs still
link). Fails safe (the parts stay unlinked). Candidate fix: `alignedTo` compares the rows in canonical order and hands ids out by matched
row (ask first).
**Status:** (3) and (4) CLOSED on branch `ai-holes` (final-review fix wave, 2026-10-23). (3): the gate is gone — `keptFrame` in `convertPart`
is the one frame decision and `restoreHoles` takes the originals it allows; the skip is tested (the C1 probe fails when the swap ignores it).
(4): `holeRowsFor` snaps the STORED distances, and a computed distance within 1e-9 of the grid takes it even on the exact path; metric mirrored
sides link at D = 10 and D = 11.8125 (roleLinks.test). The same wave fixed the final review's C1 (a holes-only part the model turned is
`orient`ed), I2 (stored numbers checked finite and within MAX_MAGNITUDE after the grid), M1/M2 (diff wording), M3 (a no-op Refine keeps the
stored row order) and M4 (turnCandidates' positional ids documented). (1), (2), (5)–(10) remain open (record-only).
**Status:** (9) CLOSED on branch `ai-holes` (2026-10-23) by the rank rule, residual R1 (the user approved fixing R1 ("Fix it, then merge"); the rank rule, the narrowed §3.2 taper guarantee and the tie clause are the controller's rulings): an echoed holes-only part
whose stored thickness is not its smallest extent keeps its rank order (and the tie clause's carve-out), so it keeps its frame, encoding and row exactly (flat 20 x 1 x 3,
tested; really turned to 3 x 20 x 1 it is oriented). The bare `featureTurned` precondition was not used (the re-review showed it unsafe).
(11) Residual R1 (re-review, 2026-10-23): C1's thickness-only test kept the frame for a holes-only part turned ABOUT its thickness axis
(a flat 30 x 12 shelf, 30 and 12 swapped in plan, stored flat/0 length 12 width 30, grain across, cut list changed silently).
**CLOSED** the same day: `keptFrame` keeps a holes-only part's frame only when every world extent keeps its rank (ties both ways) AND
(the tie clause, re-review) its thickness's world axis is still a smallest extent unless the original's thickness was not its smallest,
else `orient` like the plain twin, no exact-row swap; tested (the R1 probe, ties both ways, the (9) pair, a tied 4 x 4 x 4 block and a
1.5 x 30 x 1.5 leg against their plain twins) and mutated. A holes-only tapered part
widened past its length is now oriented and its taper fault fed back (refine-features spec, Amended). The plan-turn gap for parts WITH
curves, profiles or bands (they keep the frame always; `featureTurned` does not see a plan turn) stays fu 425. (1), (2), (5)–(8) and (10)
remain open (record-only).
**Status:** open (record-only) for the items not closed above ((1), (2), (5)–(8), (10)); (3), (4), (9) and (11) closed; the round merged `424c184` and deployed 2026-10-23 (`index-D3k3tvUe.js`).

**429. An oddly encoded holes-only part tied at its thickness keeps a wrong thickness when grown (2026-10-23, final re-review).**
`keptFrame`'s waiver ("the original's thickness extent was not a smallest extent") also applies when that thickness is TIED with
another extent: a part stored flat/0 L3 W1 T3 (world [3,3,1]) returned as [3,20,1] is kept as L3 W1 T20 (20" stock); its plain twin
becomes upright L20 W3 T1. Not new (the rank rule alone did the same); needs an original already stored with thickness > width, tied,
and the model growing the tied axis. Candidate fix: the thickness axis must stay smallest within its tie group in the original
(`size[k] <= size[j]` for every `j` with `e[j] === e[k]`). **Status:** open (record-only; ask first).

**430. Generate and Refine authoring edge profiles and edge bands (2026-10-23, close-out audit).** After the AI-holes round (fu 329)
Claude authors holes; curves are fu 363's open authoring piece; profiles and bands are carried by Refine (inv 56) but cannot be added,
changed or removed by Generate or Refine. Each is a `DESIGN_SCHEMA` change needing a spec and one live compile (fu 322; the holes item
compiled at 2,952 chars). Bands also name per-document band types. **Status:** open (feature; needs a spec).
**Status:** spec `docs/superpowers/specs/2026-10-23-sloyd-ai-profiles-bands-design.md` (the user's answers 2026-10-23). Chunk 1 (bands) MERGED `e7ce893` and DEPLOYED (`index-lH3mycr3.js`) 2026-10-23 (`bandWorld.ts`, `bandDesignFaults.ts`, inv 54/56 rewritten): Generate and Refine author edge bands in world words, except on a curved part (carried). Chunk 2 (profiles) open; see fu 322's note on its grammar budget.
**Status:** CLOSED (both chunks). Chunk 2 (profiles) DONE on branch `ai-profiles`, MERGED `30f1299` (2026-10-23; DEPLOYED at `e2729ee`,
`index-D_ed_oQ3.js`): the four angle arrays of the design form merged into one `angles` item to fit the grammar (spec R1–R2;
fu 322), and Generate and Refine author edge profiles in world words (`profileWorld.ts`, `profileDesignFaults.ts`; inv 48/53/56
rewritten), except on a part with curves or a two-side run (carried, `carriesProfiles`). Deferred minors: fu 434.

## From the shop-words round — 2026-10-23

**431. Projects generated before shop-words are back to front (2026-10-23).** Until the shop-words round `SYSTEM_PROMPT` never said
which way is front; Sloyd's Front view looks at +z, and the live-check bookcase (`id_mvkg0l4t_g`) put its back panel at +z. Such a
project's Plans "Front" elevation shows its back, and Refine's change list words a move toward its open face "toward the back" —
Claude still moves the right way (the live check's third run: pins moved toward the open face, as before the change; only the
words are world-true and shop-wrong). Nothing migrates. Candidate remedies (each a hypothesis): a line in Refine's user turn naming
the open face as the front when the back panel sits at +z, or a one-off "turn the piece around" in Sloyd. **Status:** open (ask first).
**Status:** closed by decision 2026-10-23 — the user: "leave old projects as they are". Do not re-open unasked.

## From the AI profiles and bands spec — 2026-10-23

**432. Mirror-image parts cannot link (2026-10-23).** Linking tries only quarter turns about vertical (`turnCandidates`). A case's
left and right sides with shelf pins on their inside faces AND edging (or a profile) on their front edges are mirror images: no
turn maps one onto the other, so they stay two distinct parts, count twice against Generate's part cap, and an edit to one does
not follow to the other. Candidate: a reflection candidate in linking, storing the second side as a mirrored use of the Shape
(schema 13's mirror machinery). **Status:** open (feature; the user chose "two parts for now", 2026-10-23).
**Status:** closed — mirrored links (2026-10-23, merged `a2ad5f6`, DEPLOYED at `68dca2d`, `index-_J_yZLbU.js`; spec `2026-10-23-sloyd-mirrored-links-design.md`, the user's choice of a
mirror flag on parts, §1.1; schema 21): a shaped part may be its Shape's mirror image (`mirrored`, inv 45); Generate and Refine link mirror
twins after turns (`mirrorCandidates`); a Mirrored checkbox and ⇋ badge by hand; joinery keeps the link. The premise's part-cap cost is not
fixed by linking (the cap counts stored parts): fu 435(1).

## From the AI bands round (chunk 1) — 2026-10-23

**433. A band type id equal to `veneer` or starting `solid ` collides with the edging keys (2026-10-23, final review M1).**
`bandWorld.ts` reads an `edging` of `veneer` as the built-in type and one starting `solid ` as a solid-material key (`mintBandTypes`;
`worldBands` writes the built-in as `veneer`). A custom band type whose id is literally `veneer`, or starts with `solid `, therefore
has its band remapped on a Refine echo — to the built-in, or to a reused or minted solid type: an untouched band comes back
different. Reachable only from a hand-edited file (ids are minted by `ids.ts`; `takeId` keeps an imported file's opaque ids).
Candidate remedies (each a hypothesis): re-mint such ids on load, or have `edgingKeys` skip such a type and carry its bands.
**Status:** open (record-only; ask first).

## From the AI profiles round (chunk 2) — 2026-10-23

**434. AI-profiles deferred minors (2026-10-23, execution ledger and final review).** (1) A profile's name text has two homes:
`profileDesignFaults.ts` builds `<kind> <size>` / `with a <q> quirk` / `<size> × <depth>` itself, beside `curveText.ts`' `profileName`,
which calls itself THE one home: a wording change to one misses the other. (2) The metric `shown` span of a stopped run's
`'profile-fault'`, and a metric (32/25.4-style) station through a turn and back (`profilesFor`'s `known`), are unpinned — argued by
reasoning only. (3) `convertPart` recognises a taper's count fault by its text prefix (`isTaperFault`: `has a taper `) — a kind field on
the fault would not depend on wording. (4) `partOf` and `wirePart` (generated.ts) duplicate the holes/bands/profiles copy. (5) `alignedTo`
compares profiles in STORED order (`sameProfile` index by index): a turned twin whose canonical re-sort puts equal profiles in another
order may fail to link, though the same profiles. (6) The accepted cost of Rulings 10 and 16: a model that echoes a profile's old world
numbers onto a resized part gets the stored entry back (a through end follows the new extent, a stop keeps the end it is measured from),
so a stop it meant to keep at the same world place moves with its end, and the change list shows only the size line (approved as is by
the user, 2026-10-23: keep, and keep it silent). Smaller residue in
the ledger: `seen` in `profileDesignFaults` merges two same-kind profiles on one edge with the same span and fault (one message); a loop's nominal side picked by axis letter, not
`dirToLocal`; a stop that falls back to straight is judged by its swept faults only; `estimate.ts`' chars-per-token not re-measured.
**Status:** open (record-only).

## From the mirrored links round — 2026-10-23

**435. Mirrored links: out of scope, residue and deferred minors (2026-10-23, spec §8, execution ledger and task reviews).**
(1) Spec §8, out of scope: the part cap counts STORED parts (`distinctParts`), so a linked pair — mirrored or turned — still counts twice
against Generate's cap (a separate decision for Generate); a one-handed pair is TWO cut-list rows, never one "Side ×2 (1 L, 1 R)" row
(the mirrored-instances precedent; pinned in `cutlist.test.ts`); no mirrored link between parts whose posture differs (a link shares
posture). (2) Residue (Task 5, pinned by a test): a joinery regroup whose users are ALL mirrored splits when joinery adds a new metric
cut — the founder's fields are lowered through `mirrorCut`, which is not bit-exact twice on a non-dyadic size (the fu 216/382 class);
geometry exact, the link lost. (3) Pre-existing (Task 4): `alignedTo` does not align CURVE ids, so hand-made curved twins whose curve ids
differ do not link (Refine round trips keep ids). (4) Ruling 6's cost: Link gives every member not on the source's own Shape the SOURCE's
flag, so a mirrored pair under another Shape joining by Link loses its mirror relation (re-tick Mirrored). (5) `mirrorLinkedPart`
reflects across world X for the SELECTED occurrence only: a stored part shared by placements at different chain turns reflects its other
copies across another world axis (a consequence of sharing). (6) Deferred minors worth keeping: `mirrorInPlace` (frames.ts) has no
production caller (the store writes the world-X form itself) and its world check compares boxes and hole centres only; `Board.mirrored?:
true` allows a flag on a plain part in the TYPE (runtime-enforced only); the v20 load test's title over-claims a dropped stray flag;
`writeBackFlat`'s "no plain part keeps the flag" assertions run after `migrateDocument`, so cannot fail (assert on raw output); the
regroup's exact-membership check resolves every user even on an unmirrored project (a cheap short-circuit: equal signatures when
neither is flagged, skip shapes with no flagged user); `writeBackFlat`'s step-3 comment predates Ruling 11; `treeEdit.ts`' comment near
`lowerEdit` ("an unmirrored chain leaves cur === after") is stale; no test of a mirrored user in an unmirrored TURNED assembly, nor of a
two-level nested chain for the checkbox; the checkbox is not refused while gesturing (nor is `mirrorAssembly`); Unlink/Duplicate
characterisation tests not mutation-shown; turn/mirror candidates recomputed per representative; `linkByRole`'s restore pairs records
by index with `linksToShapes` unasserted; turned mirror candidates tested upright only.
**Status:** open (record-only).

## From the splayed legs round (chunk 1) — 2026-10-24

**436. Automatic re-levelling (splayed legs spec §5).** Level the ends is a button: after a later lean edit or resize the ends are
stale, the Lean section says `Ends were levelled for a different lean — Level the ends again`, and the user presses it. Re-levelling
on every lean edit was left out of v1 on purpose (narrower, and no hidden derived cut). If wanted, it would be a store-side follow-on to
`setLean` / the resize path through `levelPlan` (same undo entry), with the refusals (an end bevel or chamfer, a top at the floor,
linked tops at different heights) deciding whether the edit itself is refused.
**Status:** open (feature; ask first).

**437. Leaning parts with holes (splayed legs chunk 2, angled holes).** In chunk 1 a part with hole rows cannot take a lean (`A part
with holes can't lean yet — that comes with angled holes.`) and a leaning part cannot take a hole row (`A leaning part can't take holes
yet — that comes with angled holes.`). A hand-edited or imported document that has both is kept and drawn (its drawing does not throw),
and its section caps omit the bores — with NO note (spec §8 said "with a note"; Amended (build) Ruling 18). Chunk 2 adds hole rows
that are not square to a face (the seat's leg sockets, bored along the leg's real axis), oblique bores in caps and drawings, and probably
a round or tapered round tenon on a leg's top; it lifts both refusals.
**Status:** open (feature-sized; needs its own spec — chunk 2).
**Status:** closed 2026-10-25 by angled holes (splayed legs chunk 2, schema 23; merged `aa1f841` and
deployed 2026-10-25 as `index-B114iN-Y.js`): a hole row's bit tilts (`tiltAlong` / `tiltAcross`, `holeTilt.ts`), Bore leg sockets bores a seat along its leaning legs'
axes (`legSockets.ts`), both refusals are lifted (a holed part may lean, a leaning part takes holes; one new refusal: a lean whose
seam-free face differs from the stored one on a holed part), a leaning part's section caps subtract its bores, and tilted bores are
drawn, capped, snapped and listed (inv 50, 51, 57). The round tenon is NOT done: moved to fu 447 (chunk 2b).

**438. Aprons and stretchers between splayed legs (chunk 3).** The design checks hold nothing "between" leaning parts or lapped onto a
leaning leg's side (Amended (build) Ruling 13, inv 39): a leaning part touches only through its level faces. So a splayed table's
aprons or stretchers report `unsupported` (or `hangs`, when they also rest on something unleaned) until chunk 3 designs the joints
(rung length and angles from the two legs' leaned axes). Conservative: it never passes a design that should fail.
**Status:** open (feature-sized; chunk 3).
**Status:** open (feature-sized; chunk 3), amended 2026-10-25: depends on chunk 2b's round tenons (fu 447) — a rung fits a leaning
leg as a round tenon in a socket bored along the rung, and the checks must hold a seated tenon before a rung can be "held". Angled
holes (chunk 2) are built.
**Status:** open (feature-sized; chunk 3), amended 2026-10-25 (round tenons records): chunk 2b is BUILT on branch `round-tenons`
(schema 24; not yet merged or deployed). A rung uses inv 39's new clause **(d) joined**: a seated tenon holds its part (leaning or
not, no coverage threshold) when the partner reaches the floor without it, so a rung tenoned into two legs' sockets is held by
either joint; `partAxis` already gives any part's world axis and `boreAlongAxis` the coaxial test (inv 50). Watch fu 461 (first
match wins): a rung's tenon through one leg's through socket into a second part reports a false overlap.
**Status:** open (feature-sized; chunk 3), amended 2026-10-26 (square-set legs records): stretchers RESUME ON SQUARE-SET LEGS.
Stretchers' own Task 2 found what its spec missed (square-set legs spec §0): a compound lean twists a TURNED square leg about its
axis (`m = T · Ry(τ)`, about 33.5° on the 8°/12° stool), so a level rung meets the leg's face about 34° askew — bored through the
leg's centre, a 5/8" socket breaks out of the leg's side and only 3/8" fits. The user chose "Untwisted legs first": square-set legs
and compound level cuts (splayed legs chunk 2c, schema 25, inv 59) are BUILT on branch `square-legs`, not merged or deployed. On a
square-set stool a level rung meets a leg face within about 1° (0.83° at 8°/12°), so the stretchers spec stands as written (5/8"
sockets centred, the ~0.2" shoulder gap); when chunk 3 resumes, Add stretcher refuses a TURNED leg with `Set <Leg> square to the
sides first (Lean).` (square-set legs spec §5, the builder's call, recorded there), and its fixture is the square-set stool
(`squareStoolDocument`, `stoolFixture.ts`). Branch `stretchers` is parked at its Task 1 (`52e975f`, the bore core in
`legSockets.ts`), to rebase onto master after square-set legs merges (the overlap is small: `legSockets.ts`' `sameCuts` reads
`sameLevelLine`, which now compares `across`). Square-set legs took invariant 59, so the stretchers spec's "inv 58 clause or a new
inv 59" (its §9, Records) becomes inv 58 or a new inv 60.
**Status:** closed 2026-10-26 — stretchers BUILT on branch `stretchers` (spec `docs/superpowers/specs/2026-10-25-sloyd-stretchers-design.md`,
NO schema change, inv 60 new; invs 50 and 58 extended); merged `fc4302a` and deployed 2026-10-26 as `index-D-XnmIBh.js`; browser verification
DONE (plan Task 7, `docs/browser-verification-stretchers.md`, 8/8 PASS, e4a18ce). A rung between two upright legs (leaning or not) is held by inv 39's clause (d) through its two seated round tenons;
the "between" rule for leaning parts STANDS as written (a part laid between leaning legs without tenons is still `unsupported`,
by design). Aprons, this entry's other half, are fu 480; the rest is fu 475–483 (tapered tenons stay fu 449, wedges and pins fu
458, first match wins fu 461).

**439. The `hangs` sentence for a grounded leaning part off the floor.** A leaning part that is grounded through other parts but does
not reach the floor (a leg whose foot stops short and hangs from the seat) reports the existing `hangs` message — "its X sides are
covered 0% and 0% … fit it between two parts …" — which says less than it could about a leaning part (Ruling 13: no new copy this
chunk). A lean-specific sentence (e.g. naming Level the ends, or "its foot does not reach the floor") is the candidate.
**Status:** open (wording; ask first).

**440. The twist's 180° seam (spec §3.3).** `seamFree` removed the EXACT seam (Ruling 1: a lean landing exactly on it faces the other
dimension, twist 0). What remains is §3.3's accepted behaviour: the twist is reduced into (−90°, 90°], so a sightline that crosses
the seam through a sign change (the stored face's + direction going perpendicular to the sightline, e.g. a leg first set splay-heavy on
width later edited to a rake-heavy lean whose splay changes sign) spins the leg 180° about its own axis — the same box, its features
(curves, profiles, bands) turned. Its ends are stale by then anyway. A re-choice of the face on such an edit would trade the spin for a
90° turn. Reachable only through large lean edits.
**Status:** open (record-only; accepted by the spec).

**441. Refine refuses a leaning part inside an assembly (Ruling 15).** `Refine can't keep a leaning part inside an assembly yet —
Ungroup it first: <name>.` (reason `'lean-assembly'`). Refine rebuilds every definition from the model's assembly, so a kept part
there has no stable container; keeping it in flat world form at the root would change its container and flat name, and per-placement
copies would lose the definition's sharing. The §3.4 idiom builds legs at the root, so the common case is kept. A grouped staked piece
must be ungrouped first.
**Status:** open (by decision for chunk 1; ask first).
**Status:** open (by decision; ask first), amended 2026-10-25 (angled holes §9): the refusal now covers a part with a tilted hole row
too, through `leaningInAssembly`/`keepsExactly`, and reads `Refine can't keep a leaning part or a part with angled holes inside an
assembly yet — Ungroup it first: <name>.`

**442. Kept parts count toward Refine's part caps (Task 12, R7).** Kept leaning parts count toward `distinctPartsViolation` and the
placed ceiling, but `limitLines` does not tell the model that they use part of "at most N different parts", so a model that fills the
cap gets a `too-many-parts` fault it cannot explain. Candidate: subtract the kept parts in `limitLines`' numbers, or exclude them from
the cap.
**Status:** open.

**443. A model ASSEMBLY placement named like a kept part is silently renamed (Task 12 review minor).** `designToDocument`'s `kept`
drop (spec §8(e)) catches a LOOSE model part whose cleaned name equals a kept flat name and reports it on the done view's `Replaced by
the kept part of the same name: …` line. A model assembly PLACEMENT with that name is not dropped: the load gate's dedupe renames it
(inv 8), and nothing reports it.
**Status:** open (minor).

**444. The tip footprint of a leaning part uses its feet's bounding boxes (Task 11 minor; final review should triage).** `designCheck.ts`
`feet(i)` gives the axis-aligned bounding box of each floor polygon, as the plan said. A splayed foot's cut face is a sloped-section
polygon, so its box is slightly larger than the foot and slightly favours "stands". The convex hull of the polygons' vertices would be
exact (stricter).
**Status:** open (minor).
**Status:** closed 2026-10-24 (final review I1): the boxes passed a three-leg staked stool whose centre of mass is 0.96in from its
feet's real hull edge (1.16in from the boxes' hull; TIP_MARGIN 1in). `feet(i)` now gives one zero-size box per polygon VERTEX, so
the tip hull is exactly the feet's (`leanContacts.test.ts`). Three `designCheck.test.ts` hang cases (a four-leg stool with one
foot off the floor or uncut) now also report `tips`: their three remaining feet's real hull is under the margin, which the boxes hid.

**445. The Lean section's single-selection parts (Task 8 minors).** (1) `Level the ends` and the stale-ends note show for a single
selected part only (`levelEnds(id)` takes one id; one undo entry). One linked leg levels its whole Shape, but unlinked legs are
levelled one at a time. (2) With rake or splay at 0° the direction select is a no-op (nothing to sign).
(3) The readout (`Resultant … · sightline …`) is hidden on a symmetric multi-selection (±12°), though both numbers are sign-free and
agree; it could show when they are equal. Multi-selection Rake and Splay themselves are done (Ruling 4: magnitude and direction are
separate controls).
**Status:** open (minor).

**446. Splayed legs chunk 1: deferred minors (2026-10-24, the SDD ledger and task reviews).** (1) `document.ts`: `validateLean`'s JSDoc
orphans the "A part's SHARED fields…" comment above `validateSharedFields` (move it); the loader tests drop a lean only on `flat`, not
`on-edge`. (2) `treeEdit.ts`' Shape path now writes through `storedValue`: a shared key missing from `after` reads ABSENT (only `lean`
can be missing today). (3) `partsBounds`, framing, section and dimensions build `leanMap` twice (predicate, then use) — `leans(b)` now
exists for the predicate; `drawing.ts` mixes `leans(b)` and `leanMap(b)` as predicates. (4) The dimensions / section / framing /
worldBounds lean tests compare against `partBounds` or the same composition (routing, not values); `worldBounds.test.ts`' comment
promises an 8-corner comparison it does not assert; the Plans dimension-chain test passed before its change (its mutation fails it).
(5) `store.test.ts`: the group-move test cannot discriminate on Y (lift the group off-grid); another restates `dragTarget`'s formula;
`expect(x).toBe(x)` tautology near the Lean tests; the Holes panel's error-clear on a board-id change is untested. (6) Return
conventions differ: `updateBoards` / `updateBoard` return `string | undefined` (DimensionField's `onCommit` type), `setLean` /
`levelEnds` / `addHoleRows` `string | null`; `setLean` and `levelEnds` return null silently while gesturing or exploded (no copy).
(7) Level the ends: the disagreeing-tops refusal names every user, not only the outliers (Ruling 9); `levelPlan` mints ids with
`nextId()` for a missing end cut even inside `isLevelled` and unwritten mates' plans (a counter only); no minimum length when R sits
just above the floor. (8) Drawings: no test passes `inverseDir` to `curveEdgeLifts` alone (the silhouette test covers
`silhouetteLines`); `leanLifts` finds an edge's faces by infinite-plane membership, so a coplanar face of another body could donate a
normal (bounded by 1e-3"). (9) Section caps: `section.ts` restates `leanMap`'s pivot (derive it from `map.pivot − position`); no
vertex- or edge-on-plane test on the oblique path; `LocalCap.li` is reused as a world axis; leaning caps carry ~1e-15 off the plane.
(10) Design checks: the per-pair `meet` closure is allocated in lean-free documents too (hoist it behind `anyLean`); a wrong
`tipping()` comment in `leanFreeChecks.test.ts`; internal pocket-cell faces count as level faces (harmless; comment owed).
(11) Refine: no explicit lean-free identity test for `designToDocument` with an empty `kept`; a redundant guard in `RefineDialog.tsx`;
`jointFaults` unchanged (R5: a stray `angle-joint` fault between a kept leg's level top and a seat did not appear; if it does, exclude
leaning parts from its sites); a leaning project WITH cuts shows both the joinery and the Repair sentence in the Joinery dialog (R1).
**Status:** open (record-only).
**Status:** open (record-only), amended 2026-10-24 by the final review: (3)'s "mixed predicates" can no longer disagree —
`leanMap` begins with `leans(b)` (I3: a flat board carrying a lean had a map while `leans` said no), so `leans(b)` and
`leanMap(b) !== null` are one predicate; the double build remains. (11)'s stray `angle-joint` fault DID appear (I2: an apron butting a
kept leg's pre-lean side) and is fixed: `findSites` skips every pair with a leaning part. The rest stands.

## From the angled holes round (splayed legs chunk 2) — 2026-10-25

**447. Chunk 2b: round tenons (angled holes spec §12; was part of fu 437).** A round (later tapered) tenon on a part's end, coaxial
with it: a leaning leg's top tenon through its seat socket, and later a rung's ends into leg sockets. The design checks must hold a
tenon seated in a matching socket (an extension of invs 38/39 — never proximity); today a leg rests on the seat's down face by its
level top (inv 57), and a socket is a bore with nothing in it. Joinery, the cut list (the tenon's shoulder length) and the drawings
read it.
**Status:** open (feature-sized; needs its own spec — chunk 2b, before chunk 3, fu 438).
**Status:** closed 2026-10-25 — BUILT on branch `round-tenons` (spec `docs/superpowers/specs/2026-10-25-sloyd-round-tenons-design.md`,
schema 24, inv 58; invs 2, 38–41, 44, 45, 48, 50, 56, 57 extended); merged `0699965` and deployed 2026-10-25 as `index-ObjqEMR0.js`;
browser verification DONE (plan Task 12, 8/8 PASS). The tapered tenon stays fu 449; joinery on a tenoned part is fu 460; the rest is fu 457–466.

**448. A socket that follows its leg (angled holes spec §5).** Bore leg sockets is a button: after a lean edit, a resize or a move of
a leg, its socket is stale (`staleSocketOf`) and the Holes panel says `<leg>'s socket no longer follows its leg — Bore leg sockets
again.`; pressing again replaces it (its id kept). An automatic follow — the socket re-derived on every edit to the leg — was left out
on purpose (no hidden derived feature, as Level the ends, fu 436). If wanted, it would be a store-side follow-on through `socketPlan`
in the leg edit's own undo entry, with its refusals (copies that disagree, a faulted socket) deciding whether the edit is refused.
**Status:** open (feature; ask first).

**449. Tapered (reamed) sockets.** Staked furniture often reams the seat socket to a taper and shaves the leg's tenon to match. A
bore is a cylinder (inv 50); a tapered bore would need a cone in `holes.ts` (geometry, faults, rings, mesh, caps, drawings, bench
line) and pairs naturally with chunk 2b's tapered tenon (fu 447).
**Status:** open (feature-sized; after fu 447).

**450. Generate and Refine authoring a tilt.** The design form has no tilt (`WorldHoleRow` is square; fu 322's grammar cap), so
Generate never bores at an angle and Refine KEEPS a part with a tilted row exactly (`keepsExactly`, inv 56) instead of letting the
model edit it. Authoring a tilt in world words (a bit direction on a hole row, through `holeWorld.ts`) would let Refine change such a
part and Generate draw a staked stool's sockets. Spec §10 also notes that `holeWorld.sameHoles` compares only some fields (not
table-driven); not reachable by a tilt while tilted parts are kept, but this entry must make it table-driven first.
**Status:** open (feature-sized; read fu 322 before any `DESIGN_SCHEMA` change).

**451. An exact ellipse test in the holed-face mesh (Task 4 review minor).** `grainTiling.ts`' `ringDisc` judges a tilted bore's ring
on a conservative disc (the ellipse's centre on the plane, radius `r·|bit|`), so a clean tilted bore whose ellipse clears a loop
edge but whose disc does not takes the per-face `faceTriangles` path (the residue rule for overlapping rings; on a curved part it
can leave T-junctions, drawn approximately). An exact ellipse–segment and ellipse–ellipse disjointness test would keep it on the
one-region path. Perf guards apply (inv 50).
**Status:** open (minor).

**452. Bore leg sockets: a partial bore's note shows in the alert slot (Task 10 review minor).** When some sockets are bored and a
faulted one is left out, `boreLegSockets` returns the plan's `note` (`<leg>'s socket would … — move the leg, or choose a smaller
diameter.`), and the Holes panel shows it where refusals go, though the action succeeded. A distinct, non-error note would read
better.
**Status:** open (minor; the user's call on presentation).

**453. A matched socket keeps its diameter when the diameter changes (Task 10 review minor).** `socketPlan` leaves a leg whose socket
already matches (`isSocketOf`: a through bore from the top on its axis, 1e-9) alone, and the match does not compare diameters, so
typing a new `Socket diameter` and pressing Bore leg sockets again does nothing for already-bored legs. Remove the rows (or edit
their diameter) to change it. Candidate: a matched socket with a different diameter is re-bored at the new one.
**Status:** open (minor; ask first).

**454. Angled holes copy review (for the user).** Every new string is the builder's or the controller's, unreviewed: (1) too-shallow —
the design-fault phrase `is too shallow for its angle`; the bench line `— check: too shallow for its angle` (no subject); the panel
`Too shallow for its angle — deepen it, or use Through.` (2) Level the ends: `Levelling the ends would cut away a hole — move it or
remove it first.` — it can fire when an end GROWS (a tilted row entering a growing end slides its mouth off the face), where "cut
away" is inaccurate. (3) The Holes panel: the fields `Tilt toward end` / `Tilt toward side`, the selects `Tilt end` / `Tilt side` (a
square row's defaults to the far end/side), the readout `Bore … off square · sightline … from the <along>` (a one-plane tilt reads
sightline 0.0° or 90.0°; the spec said "… dimension"), and `The bore can't tilt past 45° in all — reduce an angle.` (4) The bench
line: `bored … off square on a … sightline from the <along>` (terse: "from the length"), a tiny tilt printing `0.0°`, and a blind
one's `, depth measured along the bit`. (5) Bore leg sockets: `Socket diameter`, `Bore leg sockets`, the fault phrases inside `… would
<words> …`, `The socket must be narrower than <leg>.`, `Its copies stand over different legs (…) — make them match, or make this
part unique first.`, `<leg>'s socket no longer follows its leg — Bore leg sockets again.`, and (final review F1) `<leg>'s socket would tilt past 45° —
reduce the leg's lean.` (6) Lean: `This lean would turn the part a
quarter turn about its length, and its holes with it — keep both angles above 0, or remove the holes first.` (7) Refine: `Kept as
is (leans or angled holes): …`, the assembly refusal (fu 441), and `Refine can't keep a part with angled holes in a joined project
yet: <name>.` (names no cure; Task 11 minor). (8) Behaviour (final review F2, Ruling F2): in the Holes panel, choosing the other
entry side of the SAME face on a tilted row keeps its angle (both slopes negated, its mouth at the same station and inset — a parallel
bore, not the same line through the wood; Ruling F2a); a different face starts square (T2c). The cost: a flip keeps an angle the user meant to clear
(type 0). The review's alternative was to refuse the change on a tilted row (`Set the tilt to 0 first — a new face starts
square.`); ask whether either reads better.
**Status:** open (owed to the user: wording).
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the angled-hole lines read correctly.

**455. Angled holes: deferred minors (2026-10-25, the SDD ledger and task reviews).** (1) Task 1: the loader's bound boundary is not
pinned (a slope of exactly 1, a resultant of exactly 1, kept) — closed by the final review's F1 (the boundary pinned with lean's
1e-9 allowance: 1 and 1 + 1e-9 kept, 1 + 1e-8 dropped, `document.test.ts` / `holeTilt.test.ts`). (2) Task 2: `tiltedBox` is not memoised (cheap; tilted only);
`touchesPrism`'s facet-order hint in u/v is square-only (order only, not correctness). (3) Task 3: the randomised fault sweep does
not cover angle-cut off-flat, too-deep or too-shallow on tilted rows (the exact boundary tests do); the conservative rules
over-refuse (a tilted bore tangent to a dado wall; steep bores near curves) — for the user. (4) Task 4: elliptical-ring punching is
pinned only through watertightness; no FAULTED tilted watertight case. (5) Task 6: the Plan-view tilted test was a pin, not RED; no
case with the mouth edge-on and the bottom not; no `visibleOnly` tilted case; the edge-on tolerance is absolute (unit vectors
assumed). (6) Task 7: under the sliver clamp a tilted ellipse's centre cross stays axis-aligned; no ellipse test in a view whose h
axis is not the length; the ellipse's stroke wants a real-browser look on the Plans sheet. (7) Task 8: no pin of a count > 1 row
with a tilt, nor of a tilt with `— check:` (ordering). (8) Task 11: `refine.test.ts`' `const [leg] = stoolLegs()` could be hoisted to
describe scope.
**Status:** open (record-only).

**456. No stale-socket note between a lean edit and Level the ends; a leg moved past its top orphans its old socket (Task 13
finding; final review M5).** (1) Right after a lean edit, BEFORE Level the ends, the seat shows no `<leg>'s socket no longer follows
its leg` note: the leg's top is no longer level, so it does not stand under the seat (`legsUnder`, the resting rule of spec §5), and
the cue the user gets instead is the Lean section's `Level the ends again`. Once re-levelled the stale note appears and Bore leg
sockets again replaces the socket in place (browser check 5, `docs/browser-verification-angled-holes.md`); the spec's "a later lean
edit … the seat notes it" holds one step later. (2) A leg moved (or resized) farther than its top's half-width, so the old socket's
axis line misses the top's polygon, leaves its old socket orphaned: `staleSocketOf` finds nothing, no note appears, and pressing Bore
leg sockets again either appends a second socket beside the old one or, when they overlap, reports `… would meet another hole`.
Within spec §13's "structural test" latitude. Candidates: note any tilted count-1 through row from the top that matches no leg; or
fold both into fu 448's automatic follow.
**Status:** open (record-only; ask first before changing either).

## From the round tenons round (splayed legs chunk 2b) — 2026-10-25

**457. Plans feature callouts for a round tenon (spec §2 non-goal, §8).** A tenon carries no feature key and no drawing tag on the
Plans sheet: its own segments (sides, silhouettes, the shoulder ring) are untagged, and its square-span view curves are skipped by
every curve key and tag (`featureKeys.ts`, `planKeys.ts`). The bench line (`tenonText.ts` `tenonLine`) and the part diagram carry
it. A callout would need a `partFeatures` entry (a key line through `tenonLine`'s words, no positions), tags on the tenon's own
segments in `drawView`, and `drawingIdentity` kept green (tags never change a segment). A mitered tip already shows the MITER's
letter (ruling T6a).
**Status:** open (feature; ask first).

**458. Wedges, wedge kerfs and pins through a round tenon (spec §2 non-goal).** Staked work wedges the tenon in a kerf from the top
(the wedge across the grain of the seat) and some joints are pinned or drawbored. None is modelled: a tenon is a plain cylinder, and
the cut list has no wedge row. A kerf would be a feature inside the tenon's zone, which `tenonFaults` faults today
(`meets-feature`), so it needs its own kind and fault rule; a pin is a hole row through both parts, which the design checks ignore
(inv 38). A pin hole through a tenon is ACCEPTED (it has no hole fault), and the tenon then faults (`meets-feature`: hole) and
builds nothing (inv 58's kept-and-noted rule; corrected at the final review, M4).
**Status:** open (feature-sized; ask first).

**459. A shoulder parallel to the end (scribed shoulder; spec §10 cost 1).** The shoulder is square to the axis (§3.1, a tenon
cutter's): on a leaning leg it does not sit flat on a level seat's underside, and the shoulder's highest corner just touches (Tenon
the legs). A woodworker who scribes the shoulder to the seat sees a gap the model shows too. Parallel to the end would let the
resting rule carry the leg, but it is not what a tenon cutter makes and it does not fit chunk 3's rungs. The joint rule (§5,
inv 39 (d)) stands either way; the shoulder plane (`shoulderAt`, `tenonZone`, `tenonViewCurves`' span, `withoutTenon`) would change.
**Status:** open (only if wanted; ask first).

**460. Joinery and Repair on a part with a round tenon (spec §9).** v1 refuses the whole document (`tenonRefusal`, inv 41: `Add
joinery can't join a part with a round tenon yet: <name>.`, and Repair's and a joined Refine's twins). A later chunk can rule joint
kinds out per site instead, as holes, curves, profiles and bands do (`featureAllowed`): a tenon's zone (`tenonZone`) is the region a
kind must not enter, and `resize` would need a rebase (a tenon is measured from its end's centre, so a growing end carries it).
`shapedFeatures` reads `profileView`, so `featureZones` sees no tenon today — that is why the whole document is refused.
**Status:** open (feature-sized).

**461. First match wins: a tenon through one part's through socket into a second part's socket (ruling T7e).** `tenonJoints` gives
each tenon ONE joint, the first single bore in world and row order that seats it. A tenon that passes through a through socket in one
part and into a second part's socket is seated in the first only; its wood in the second is reported as an overlap (a false
overlap). Rare in staked work (a leg through a seat into a cap). Candidate: let a tenon seat in every coaxial bore it passes through
whose stretch it fills, each a joint, the overlap waived per pair.
**Status:** open (record-only; chunk 3's rungs may need it).

**462. A misleading `Level the ends` hint for a leaning leg on a foot tenon (ruling T7i).** A built tenon's wood is never a contact
(ruling T7f), so a leaning leg standing ONLY on a foot tenon's tip is not on the floor, and its `unsupported` fault adds `; it leans,
and its foot is not level: Level the ends` — levelling would not help (the foot is a tenon). Rare: a foot tenon with nothing below it
is a half-finished model. Candidate: a hint that names the tenon (`it stands on its round tenon`).
**Status:** open (record-only; wording for the user).

**463. A units switch loses tenoned legs from Bore leg sockets until re-levelled (ruling T9d).** `legsUnder`'s tenoned branch requires
`isLevelled(leg, units)`, which re-plans with the project's rounding; after an imperial ↔ metric switch a leg levelled in the other
units is "not levelled", so tenoned legs are not found: the seat's Holes section hides Bore leg sockets and every stale note until
the user presses Level the ends again. Consistent with the untenoned finder's Lean note (`Lean.tsx` shows the not-levelled note
through `isLevelled` too) but against inv 52's spirit (a units switch moves no number). Candidate: a units-free structural test
(a level up face at the tip). Task 9 review Minor 0.
**Status:** open (record-only; ask first).

**464. Round tenons copy review (for the user).** Every new string is the builder's or the controller's, unreviewed (the Global
Constraints' verbatim fault copy, readout, checkbox, joinery sentences and kept list were the plan's): (1) the bench line `<d> round
tenon, <t> long — at the length <min|max> end, shoulder <s> from the other end` (Ruling P1: the plan's end words, where the spec's
example said `at the top end` and the panel says Top/Bottom on an upright part, ruling T8a); a faulted one's ` — check: <fault>` and
`(and N more)` (T6b); a METRIC `<t>` prints at whole mm though a fitted length steps at 0.1 mm (76.2 and 76.0 mm both read `76 mm`, as
two rows; Task 6 review Minor 2 — use hole precision?). (2) The overlap hint ` — its round tenon doesn't match the socket there`
(`TENON_HINT`, T7b/T7c; it also fires for a too-deep tip in a matching blind socket). (3) The panel: row titles `Top` / `Bottom` /
`Length min end` / `Length max end` and group names `<end> tenon` (T8a); the kept-fault note `The tenon would run into a hole — …`
reads oddly when the hole is already there; the readout's first line has no period and `Seated in <part>'s socket.` has one; a part
inside an assembly is named by its path (`Frame › Post A`). (4) The store's sentences (T8b): `This end already has a round tenon.`,
`A round tenon can't change ends — remove it and add one at the other end.`, `A round tenon's diameter and length must be more than
zero.` (5) Bore leg sockets: the checkbox `Tenon the legs (replaces their top tenons)`; `<leg>'s tenon: <fault>`; `socketsDisagree`
naming leg copies (`Its copies stand over different legs (Front right, Front right (1)) …`), and its group form naming the group's
first leg and the disagreeing placement; Level the ends' refusal, when it refuses the whole action, does not name the leg (T9c); the
stale tenon note `<leg>'s tenon no longer fits its socket — Bore leg sockets again.` also shows for a typed top tenon that was never
seated (before the first Bore; Task 9 review Minor 4). (6) Refine: the widened assembly sentence `Refine can't keep a leaning part, a
part with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: <name>.` (T10a) and `Kept as is
(leans, angled holes or round tenons): …`.
**Status:** open (owed to the user: wording).
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the round-tenon lines read correctly.

**465. Round tenons by eye (for the user).** (1) The Holes panel's `Tenon the legs` checkbox: its label and box sit inside the
two-column field grid beside Socket diameter (the grid gets a third child) — check the layout. (2) A seat LOWERED under fitted
legs (ruling T9a): the seat's Holes section now shows the Bore controls and the stale socket and tenon notes; check they read
right before the re-fit. (3) The part diagram's side view: the tenon's waste (the four corners past the shoulder) stays inside the
blank's outline, unhatched (Task 5 review Minor 2), while every other feature hatches its waste. (4) The tape snaps only to the
tip's centre and the shoulder ring's centre: no shoulder section corners, no points on a square tip's ring (Task 5 review Minor 3).
(5) A mitered tip shows the miter's letter on the tenon's end on the Plans sheet (ruling T6a). Plan Task 12's browser pass may
close some.
**Status:** open (owed to the user: by eye).
**Status:** (1) CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving) (cramped but fine); (2)–(4) remain for the user's eye.

**466. Round tenons: deferred minors (2026-10-25, the SDD ledger and task reviews).** (1) Task 1: `validateTenons` reaches the
canonical sort through a `withTenons({} as …)` cast — export a canonicaliser. (2) Task 2: `turnCandidates` refuses every tenoned
part (through `keepsExactly`), stricter than needed (a turn of an upright part that keeps the length's direction would be fine; it
only loses a link). (3) Task 2: several copy sites test `b.tenons ?` instead of `hasTenons` (`frames.ts`, `treeEdit.ts`,
`treeOps.ts`, `store.ts`), so a stray `[]` would be carried; the write-back strips it today. (4) Task 3: an end-edge band on the FAR
end is never judged (the part does not carry the band type's thickness), so a shoulder inside such a band on a very short part is
missed — pass the types, or treat it conservatively. (5) Task 3: `tenonFaultText`'s `'a feature'` fallback — make `feature`
required on `meets-feature`. (6) Task 4: the closed shoulder wall in `holeFaults` is conservative (accepted) — gone since the final review (M2, ruling
TFa): `intoCurve` skips a tenon's square-span view curves, so the tenon's own `meets-feature` judges a hole in its zone. (7) Task 6: the
bench line's `<s>` measures a far end with an `'other'` cut (a bevel, a second cut) from its uncut end face, right for a corner
chamfer, approximate for a cut that crosses the axis (documented at `tenonLine`). (8) The perf guards (`curvesPerf`) flaked under
load in Tasks 6–7 and must pass on a quiet machine before the merge.
**Status:** open (record-only).

**467. A full-length edge profile blocks Add round tenon (final review M1).** A 28 × 1¾ × 1¾ leg with a 1/8" roundover end to end
on one arris: `tenonFaults` gives `meets-feature: profile` for the default 1" × 1" top tenon, so the Round tenons row withholds Add
(`The tenon would run into a profile — move it or remove it first.`) and `addTenon` refuses with the same sentence; added the other
way round, the profile is accepted and the tenon stops building (kept, noted). Yet the roundover's whole section, a corner strip,
lies outside the tenon's disc, so turning the tenon removes it anyway: the finished wood is identical. Within spec §3.2 and inv 58's
CONSERVATIVE rule (boxes that may refuse a feature that just clears), so not a defect against the spec. A fix would exempt a
straight profile or band whose section lies wholly outside the disc, judged in the section's (u, v) plane, in `featuresMeeting`
(`roundTenons.ts`); today a woodworker stops the profile short of the shoulder.
**Status:** open (ask first).

**468. Imperial bench-line precision for a fitted tenon length (final review M5).** `tenonLine` prints `<t>` through
`formatLength(t.length, units)` (`tenonText.ts`), at the default imperial precision of 1/16", but a fitted length (Bore leg sockets'
Tenon the legs) rounds up to `TENON_STEP`, 1/64": 1 33/64" and 1 1/2" both print `1-1/2"` and land in two cut-list rows that read
alike. The imperial twin of fu 464(1)'s metric item (76.2 and 76.0 mm both `76 mm`); if the fix is hole precision, apply it to both.
**Status:** open (owed to the user: the copy review, with 464).
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving) (`1-13/16" long` reads fine).

**469. A bore exactly tangent to a built tenon's shoulder leaves T-junction cracks (final fix wave).** A 28" leg with a 1.5" top
tenon and a 5/8" through bore whose edge lies on the shoulder (station 26.1875): the tenon builds (the zone test is open) and the
mesh shows 456 unmatched edges on the shoulder plane; 0.0075" short of it is watertight. Not new: the same arises when the tenon is
added after such a bore (accepted before TFa), and any bore tangent to a face does the same today (a plain leg's bore tangent to its
end face: 360/352 unmatched edges; `faceTriangles` documents T-junctions for a tangent hole). It contradicts inv 50's "a curved
part's mesh is WATERTIGHT" in that one tangent case. Remedies to weigh: a closed tenon zone test (touching counts as meeting, the
tenon faults), or conforming the shoulder plane to a tangent bore's rim.
**Status:** open (record-only; by eye first — a crack at a tangent rim may be invisible).

## From the square-set legs round (splayed legs chunk 2c) — 2026-10-26

**470. A hand-authored compound miter (spec §2 non-goal, §6).** Only Level the ends on a square-set leg makes a compound miter
(`across`, inv 59). The Angles row shows its bench line and Remove only (`miterFields` is null for one; `miterCut` never writes
one), so a woodworker who needs a compound end cut anywhere else cannot type one. A writer would need a second-slope control (an
`Across` angle beside `Angle`), the loader's bound (`rise ≤ 1 + 1e-9`) as the field's bound, and the existing refusal sentence
(`Removes more than the <dimension> — reduce the <control> first.`) judged on `deepestCorner`.
**Status:** open (feature; ask first).

**471. A compound bevel, chamfer or taper (spec §2 non-goal).** `across` is legal only on an end miter (`kind 'miter'`, `face
'length'`): the loader drops the CUT otherwise. A bevel or chamfer sloping across its third dimension, or a taper that does, has
no stored form. Every reader of `across` (inv 48's plane, `deepestCorner`, `touchedRegion`, the text, the diagram) is written for
the general affine depth, but the loader gate, `miterFields`' null and `compoundRefusal`'s rationale (only Level the ends makes
one) are miter-only.
**Status:** open (feature-sized; needs a spec).

**472. A compound cut drawn in no part diagram (ruling T5c; Task 5 review M1).** `compoundWedges` (`diagram.ts`) draws a compound
cut on each cross face's EXISTING views, opening a view only when neither side of that face exists. When every existing view of a
face is on the side where the wedge is empty, nothing is drawn on that face and no other side is opened. Reached only by a cut
that bites at one across corner on a part whose other features opened exactly those wrong-side views (Review Focus 1's
corner-only cut with a dado on `thickness|min` and another on `width|max`): the cut, and its bench-line note, then appear in no
diagram. Candidate: when a face's
existing views all come back empty, open its other side.
**Status:** open (record-only; a rare missing wedge).

**473. Square-set legs copy review (for the user).** Every new string is the spec's (quoted there as the builder's calls, marked
"my call") or the builder's: (1) the bench line `Compound miter at the length <min|max> end: <a>° across the <along>, <b>° across
the <through>, long corner at the <along> <min|max> side and the <through> <min|max> side` (the long corner added after the final
review, ruling TFa, so mirror twins differ; the square stool's feet: Front right `Compound miter at the length min end: 12.0° across
the width, 8.0° across the thickness, long corner at the width max side and the thickness max side`, Front left `Compound miter at the length min end: 12.0° across the width, 8.0° across
the thickness, long corner at the width min side and the thickness max side`); the Angles row's head still reads `Miter` above it (the head is the kind, capitalised; Task 5 review M2). (2) The
Plans feature key `Compound miter <a>° × <b>°` (ruling T5a, along then across, the chamfer's `a × b` form). (3) The Lean
section's Set select: label `Set`, options `Square to the sides` / `Turned to the lean (one-cut ends)`, and `mixed`. (4) The Set
refusal `Changing how this leg is set would turn it about its length and move its holes — remove the holes first.` (5) The three
refusals: `Add joinery can't join a part with a compound end cut yet: <name>.`, `Repair can't join a part with a compound end cut
yet: <name>.`, `Refine can't keep joints with a part with a compound end cut yet: <name>.` (6) Model-facing only: Refine's kept
note line `"<leg>" has a compound end cut and is kept as is:` (ruling T6a), under a header that still reads `These parts lean or
have angled holes, which the design format cannot describe` for a cleared leg kept for nothing else (Task 6 review M1; the spec
said the kept-list wording does not change, and `keptNote`'s header already has a tenon conditional, so a compound one is cheap).
(7) Final review M2: Refine's assembly refusal (`refineDesign.ts`, `lean-assembly`) reads `Refine can't keep a leaning part, a part
with angled holes or a part with a round tenon inside an assembly yet — Ungroup it first: <name>.` for a cleared square-set leg (Level
the ends, then Clear lean) inside an assembly, which is none of those: it is kept for its compound end cut alone. The refusal itself is
the accepted knock-on (builder check Q3); only the sentence misdescribes it. Candidate: add `or a part with a compound end cut`, or
make it conditional as `keptNote`'s header is. No code change made.
**Status:** open (owed to the user: wording).
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the Lean section and compound-miter lines read correctly.

**474. Square-set legs: deferred minors (2026-10-26, the SDD ledger and task reviews).** (1) Task 6 review M2: `whyKept` names a
compound end cut only when no other reason applies, so a part with a tilted row AND a compound cut is described by the tilt alone
(harmless: both mean kept as is). (2) Task 5 review M3: `angleText.test.ts`' square-stool short-point test cannot fail on a `t`
flip (the foot's and top's across terms cancel at every corner, their `across.from` opposite); the hand-built one-end cut is the
discriminating test — a comment there would say so. (3) Task 5: the ISO tag test passes with the across term dropped from
`keptHalfSpace` (the FRONT and SIDE floor-edge tests are the ones that go red), and the Clear lean panel test has no mutation of its
own (the stool's levelled lines were already offset, so `miterFields` was null before the compound guard). (4) Task 4 review M4:
the along tie (rake = splay) rests on the 1e-9 tolerance in `levelPlan` (the two slopes are equal only to float precision); a
mutation removing it went red; ACCEPTED as designed. (5) Task 6: `rebaseAngleCuts`' `{ ...c, points }` spread would SHARE an
`across` object by reference if it were ever reached for a compound cut (unreachable: every production path to it sits behind
`compoundRefusal`, inv 41). (6) Task 3: a Set change keeps the stored, seam-free `face` (spec §3.1), so a leg first leaned
square-set and later switched to turned faces whatever `chooseFace` picked at its first lean. (7) Task 2: `tipFarthest`,
`deepestDepth` and `overruns` were exported for direct pins (ruling T2a).
**Status:** open (record-only).

## From the stretchers round (splayed legs chunk 3) — 2026-10-26

**475. Diagonal and X stretchers (stretchers spec §2, §11).** Add stretcher refuses two legs whose axis points at the height differ
in both X and Z (`These legs aren't square to each other at that height — …`): the rung is a `flat` part turned 0 or 90, and an
unleaned part turns by quarter turns only. A diagonal or X stretcher needs a horizontal posture at any angle in plan (a new
posture, or a lean-like placement for a flat part), and its sockets would enter a leg's corner region, not one face.
**Status:** open (feature-sized; needs a spec).

**476. H stretchers: a rung between two rungs (spec §2, §11).** Add stretcher takes two UPRIGHT parts; an H stretcher's middle rung
joins two level rungs, its sockets bored across a rung's section, its length from the two rungs' faces (no leaning axis to cross).
`rungLegAt` finds only upright legs, so the middle rung would never be found as a stretcher either.
**Status:** open (feature-sized; needs a spec).

**477. Round (turned) rung stock (spec §2, §5.3, §11).** The rung is square stock (Sloyd's parts are boxes) with round tenons, so
its square shoulder meets a leaning leg at one corner and stands off it at the others (the readout's `shoulder gap up to <g>`,
about 1/4" for a 1" rung on the square-set stool). Real staked work turns the rung round and the gap disappears. Needs a round part
(a body, a cut-list line, drawings).
**Status:** open (feature-sized; needs a spec).

**478. A shoulder cut to the leg's face (spec §2, §5.3, §11).** The shoulder stays square to the rung's axis; a coped or angled
shoulder that sits flush on a leaning leg's face is a compound cut no single stored cut holds (an end cut whose plane is the leg's
face, around a round tenon). The readout prints the gap so the woodworker can pare or chamfer it.
**Status:** open (feature-sized; needs a spec).

**479. A typed tenon depth kept across a re-fit (spec §8, §11).** Add stretcher runs each tenon to its leg's axis (the tip
`(D − L)/2` short of it, the tenon what the squared shoulder leaves). A different depth is an edit after the Add (the rung's
length, a tenon's, a socket's depth), and Fit the stretcher again puts the default back. A kept depth needs either a stored
preference (a schema field) or reading the current tip-to-axis distance as the intent.
**Status:** open (ask first).

**480. Aprons between splayed legs (spec §2, §11; fu 438's other half).** A wide rail at a leg's top needs a compound-angle
RECTANGULAR tenon (or a loose tenon or dowels) into a leaning leg's face; the round-tenon joint (inv 58) does not describe it, and a
part laid between leaning legs is still `unsupported` (inv 39: nothing is held "between" leaning parts).
**Status:** open (feature-sized; needs a spec).

**481. A three-legged stool's rungs (spec §8, §11).** A three-legged stool's legs are not square to each other in plan, so every
rung is a diagonal one (fu 475) and Add stretcher refuses each pair with the not-square sentence.
**Status:** open (feature-sized; after fu 475).

**482. Stretchers copy review (for the user).** Every new string is in `stretcherText.ts` (its ONE home), quoted in the spec or the
plan's Global Constraints as the builder's calls: (1) the refusals — `Set <Leg> square to the sides first (Lean).` (spec Amended
S1); `These legs aren't square to each other at that height — a stretcher must run straight along the front, back or sides.`;
`<Leg> doesn't reach that height.` (also a section off the leg's entry face, or a tenon that would come out zero long); `Select two
legs in the same assembly.`; `A stretcher can't join a leg inside a mirrored copy yet: <Leg>.` (it names the first of the two legs;
both are inside the same copy); `<Leg>'s socket would <words> — choose a different height, or a smaller tenon.`; `<Leg> already
has a different socket there — remove it first.`; Fit again's `These linked legs need their shared socket in different places:
<rungs>.`, `<Rung> would now run the other way — add it again.` (also a rung that would face the other way along its own axis)
and `<Leg> has two sockets this tenon could be in — remove one.`; from the final review (2026-10-26): `These legs already
have a stretcher at that height: <Rung>.` (ruling TFa: the same pair again where a rung already sits) and `A stretcher's height,
rung size and tenon diameter must be more than zero.` (M2; programmatic callers only, the fields refuse it first); reused, not new: `socketTooSteep`, the too-wide tenon sentence.
(2) The link note `<Part> got this socket too, through its link.`, shown in the RUNG's panel after the Add (ruling T5a), not under
the section. (3) The readout `Between <A> and <B>, <h> up · shoulder gap up to <g>` (`<g>` rounded UP to the display grid since the final
review's M1, so "up to" never understates: the stool's 0.2528" reads 5/16") and the stale line `No longer fits <A> and <B> —
Fit the stretcher again.`; the legs are named in TENON order, the `min` tenon's leg first (ruling T5b), so the front rung added from
Front right and Front left reads `Between Front left and Front right, …`, whatever the selection order. (4) The section heading
`Stretcher`, the fields `Height`, `Rung size`, `Tenon diameter`, the buttons `Add stretcher` and `Fit the stretcher again`. (5)
INTERNAL, never shown by the panel (the button appears only for a stretcher): the store's `This part is not a stretcher.`
(`STRETCHER_NOT_A_STRETCHER`, ruling T4b).
**Status:** open (owed to the user: wording).
**Status:** CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the stretcher lines and section read correctly.

**483. Stretchers: deferred minors (2026-10-26, the SDD ledger and task reviews).** (1) Ruling T2b: the too-steep refusal
(`socketTooSteep`) and `defaultHeight`'s 20-step cap are unreached by any fixture — a world-axis rung meets a square-set or
zero-twist leg's face at the leg's own lean, and the lean bound is the tilt bound (splay-only at the bound gives tiltAlong
−1.0000000000000024, inside `BOUND_EPS`); both stay as guards. (2) Task 2 review M18: `defaultHeight` steps when ANY of a socket's
faults is `meets-hole` (`faults.some`), but no test has `meets-hole` behind another fault, so reading `faults[0]` alone survives.
(3) Ruling T1c: `rungSocketRow` signs its bit by `dot(line.u, towardOther) > 0`, so a line exactly perpendicular to `towardOther`
silently takes `+u` (unreachable: the rung's `towardOther` runs along the line; it would then throw on the face check, loudly);
`roundUp`'s 1e-9 tolerance can leave a depth ~1e-9·step under the true reach (harmless: `seatedIn` has its own tolerance). (4)
Ruling T1b: the face-rectangle test (`faceCrossing`) uses the bare `[0, dim]` box and ignores angle cuts, so a mouth on a levelled
end's waste would pass it (unreachable on a long face at a height the leg's axis reaches). (5) Task 3 report: re-fitting the
closure from the front rung or from the back rung gives documents equal to 1e-9, not bit for bit (the first rung's row is the one
stored); a fitted rung is bit-exact either way. (6) Ruling T5c's caveat: the Height default's memo key (`pairSignature`) treats a
common horizontal move of the pair as no change; under a translation the planner's arithmetic could in principle differ in the last
bits (its thresholds are 1e-9). (7) Two doc comments in `stretchers.ts` (`StretcherPlan.gap`, `stretcherOf`) still name
`shoulderGap`, an export removed in Task 3's fix round (review M-1); the helper is `gapOf` over `cornerExits`. A comment fix only. **Fixed** in the controller's commit after Task 7 (2026-10-26).
(8) Spec §6.2 left a stale tenon with NO bore of its diameter uncovered: Fit reuses a row another closure rung just bored that it
seats in, else bores a new one (ruling T3b; tested with a socket removed by hand). (9) Final review, ruling TFa: the Height
default now also depends on OTHER parts' tenons (a taken row), but its memo key (`pairSignature`) reads only the two legs. Adding a
rung on a LINKED pair reuses rows without changing the legs, so an undo or redo of that rung while the other pair stays selected
leaves the default stale. That is safe: Add then refuses with the taken sentence, and nothing overlaps; a selection change remounts
the section. `holderOf`'s two exclusions (the rung itself, the leg itself) are unobservable through today's callers (the planned
rung is not in the world; a stale tenon is not seated by definition; a leg's own tenons never sit in its own sockets) and stay as
guards.
**Status:** open (record-only).


## From the box joints round (dovetails chunk 1) — 2026-10-27

**484. Dovetails (box joints spec §11, §12).** Through dovetails, then half-blind: the tails and pins are angled cuts, so the corner is no longer
rectangular cuts and the recogniser, the planner and the cut-list line all need an angled-notch reading (inv 48's bodies stay convex per
notch). Box joints' own spec §11 names the next chunk.
Starting points (2026-10-27, box joints deployed as `975e418`): spec §11 argues the pins' end-face trapezoid has no stored feature today (a curve
cut runs through the whole part, a rectangular cut has square walls), so dovetails likely need a new stored feature and a SCHEMA BUMP (the
first since 25; argue its own harm, CLAUDE.md Versioning). What carries over from box joints (inv 61): the planner shape (select parts, find
corners in pairs, one layout per corner, run out, recognise on read; `boxJointPlan`'s corner finding and run-out), `writeBackParts` (keepWorld,
link post-condition), the claim-before-the-gate machinery in `fingerClaim.ts` (Refine keeps, Repair claims, joined Refine's butt fixing and (c)
guard), joinery's "leaves its size and place alone" rule and the one-line-per-set cut list. Box joints' layout rule (every finger `w`, one odd
leftover at J's world min, the user's ruling after the build) does NOT decide a dovetail's spacing: ask the user (half pins at both edges is the
hand-cut norm; jig-cut spacing is fixed). Box joints' known limits that will bite dovetails too: linked mirrored or opposite-turn users refuse
an asymmetric layout; fu 485 (unequal heights, the drawer-front case half-blind dovetails exist for) and fu 486 (featured parts).
**Status:** open (feature-sized; needs its own spec; the next session's work).
Through dovetails were specced (`docs/superpowers/specs/2026-10-27-sloyd-dovetails-design.md`, approved 2026-10-27) and built on branch
`dovetails` (2026-10-27: schema 26, a STORED feature `Board.dovetails`, inv 62; the shared corner planner `cornerPlan.ts`; the spec's
*Amended (build)* block approved 2026-10-27). Half-blind dovetails, and with them corners of different heights along the joint,
moved to fu 497 (their one home). The round's own follow-ups are 497–513.
**Status:** through dovetails BUILT on branch `dovetails` (2026-10-27), not yet deployed — close at deploy; half-blind is fu 497.
**Status:** CLOSED 2026-10-27 — through dovetails merged `72228cc` and DEPLOYED (`index-BEpsbfAI.js`, schema 26). Half-blind dovetails
remain open as fu 497.

**485. Box joints on parts of different heights along the joint (spec §2, §12).** A corner whose two parts differ in height along the joint (a
drawer front taller than its sides) refuses with `<A> and <B> must be the same height along the joint.`; a layout over the shared span with plain
wood above it needs a rule for the part that sticks out.
**Status:** open (feature-sized).
**Re-worded 2026-10-28 (half-blind dovetails round; spec `2026-10-27-sloyd-half-blind-dovetails-design.md` §2, §11): corners of different
heights along the joint, for box joints AND both dovetail kinds (through and half-blind).** The heights refusal lives in the SHARED corner
finding (`cornerPlan.ts` `planCorners`, `cornerHeights`), which every kind reads, so lifting it is one round for all three: each kind needs
its rule for the wood that sticks out past the shared span (box joints' fingers over the shared span only; a dovetail layout's half pins
at the shared span's edges, with the taller part's extra height plain), and the run-out, corner region and linked signature taught the
unequal spans. The drawer front taller than its sides is the case half-blind fronts most often meet (fu 497's heights half moved here).
**Status:** open (feature-sized; box joints and both dovetail kinds together).

**486. Box joints on featured parts (spec §2, §12).** A part with a lean, angle cut, curve, edge profile, edge band or round tenon refuses
(`<part> has <…> — box joints work on plain stock for now.`). Joining one needs the feature zones (`featureZones.ts`) taught to judge a finger
corner, and the recogniser to read through a feature.
**Status:** open (feature-sized).

**487. Proud fingers and glue clearance (spec §2, §12).** The model is the finished, flush joint: fingers are exactly the other part's thickness
deep and exactly complementary. Real drawers leave fingers proud for sanding flush, and a thou of glue clearance.
**Status:** open (feature-sized).

**488. Add joinery choosing a box joint as a joint kind (spec §7, §12).** Joinery only LEAVES a box-jointed part alone. A joint kind that picks
a corner's fingers (a width from the stock, a phase from the run axes) needs the recipe, `choose.ts` and the design form's words.
**Status:** open (feature-sized).

**489. A three-finger corner (spec §3.3, §12).** The layout's floor is five fingers because three read as a tenon to `findTenons`; teaching the
tenon finder to give way to a claimed set (as `setupLines` already claims first) would allow a three-finger corner on a short side.
**Status:** open (feature-sized).

**490. Pinned box joints (spec §2, §12).** A dowelled or pinned box joint, and a box joint at an angle (a splayed box).
**Status:** open (feature-sized).

**491. Box joints copy review (for the user).** Every new sentence is in `boxJointText.ts` (its ONE home), quoted in the plan's Global
Constraints as the builder's calls: (1) the planner's refusals — `These parts don't meet at a corner.`; `<A> and <B> must be the same height along the
joint.`; `<part> meets two parts at one end.`; `<part> would be box-jointed on two different edges — that isn't supported yet.` (spec §3.1 left
this to copy review); `<A> and <B> are too short for five fingers that wide — try narrower fingers.`; `<part> has a cut where the fingers go — remove
it first.`; `<part> has a hole where the fingers go.`; `<part> has <a lean | an angle cut | a curve | an edge profile | edge banding | a round tenon> —
box joints work on plain stock for now.`; `<A> and <B> must be in the same assembly.`; `Box joints can't reach a part inside a mirrored copy yet:
<part>.`; `<part> is linked to <mate> — select <mate>'s corner too, or Unlink first.`; `These linked parts would need different box joints: <parts>.`;
`Box joints can't keep these linked parts linked: <parts>. Unlink them first.` (the link post-condition, spec difference 3); `A finger width must be
more than zero.`. (2) The success note: `Jointed <n> corner(s): <N> fingers, <w> wide (the odd one <x>).` (the parenthesis dropped when every finger is
`w`; or `Jointed <n> corners:` and a line per corner; Task 9, the equal-fingers ruling, replaced `(the outer two <e>)`), `<part> isn't at a corner with another selected part.`, `<part> is now <x> longer.` / `shorter.`. (3) The section `Box joints`, the field
`Finger width`, the checkbox `Swap fingers`, the button `Box joint the corners`. (4) The cut list and diagram line (Task 9): `Box joint — <N> fingers <w> wide
(the odd one <x> at the <J> <oddEnd> edge), <d> deep, at the <dim> <end> end; this part has a <finger | notch> at the <J> <start> edge.`, the
parenthesis dropped when every finger is `w` (the start edge is then J's max), `<J>` the part's own joint-line dimension (e.g. `width`), so the
words are part-local (`…the width min edge`), never world ones like "bottom" — a wording question for the review (5) The joinery reason `<part> has box
joints, so joinery leaves its size and place alone` (ruling R-T6c; the old `already cut at that end` was false when the set is elsewhere). (6) Refine:
`Refine can't keep <part>'s box joints through its other joints yet.`; the unjoined reason `Joinery would have changed <part>, which Refine keeps as
it is for its box joints, so the design comes back unjoined.`; `Refine can't keep a box-jointed assembly whose parts are linked to parts outside it —
Unlink first: <part>.`; the kept note's header (`These parts lean, have angled holes or have box joints, which the design format cannot describe …`
and the round-tenon variants), its per-placement line `"<placement>" is an assembly with box joints and is kept as is: <bounds>.`, its
footer (unchanged wording, now also covering kept placements) and the dialog's `Kept as is (leans, angled holes, round tenons or box joints): <names>`
and `Replaced by the kept part of the same name: <names>` (now also a loose part or placement that reused a kept PLACEMENT's name). (7) The tie
(spec difference 4): a 4" drawer side at 1/2" fingers gets 3/4" outer fingers, not 1/4": needs the user's sight. **Moot (2026-10-27):** the
equal-fingers ruling replaced the symmetric layout (a 4" side at 1/2" is now 8 fingers, every one 1/2"), so no tie arises.
**Status:** open (owed to the user: wording; the tie is moot).
**Status:** CLOSED 2026-10-27 — reviewed with fu 512; the user approved all nine proposed changes ("Apply all of them"). Box joints'
share: `<A> and <B> are too narrow for five <w> fingers — try narrower fingers.` (was "too short … that wide"); the hole sentence gains
`— move or remove it first.`; `Refine can't yet keep box joints on a part with other joints too: <part>.`; `(one odd finger <x>)` in the
success note and the cut-list line (was `the odd one`); the dialog's kept line (with fu 512's). The part-local edge words (`the width
min edge`) stay, as the cut list's `min end` does. Everything else as built.

**492. Widen kept assemblies to the other kept kinds (spec §7, Amended).** A box-jointed part inside an assembly keeps the WHOLE assembly; a
leaning part, a tilted hole row, a round tenon or a compound end cut inside an assembly still refuses Refine (`lean-assembly`, fu 441's rebuild of
every definition). The same whole-assembly keep would serve them (a splayed stool inside an assembly), with the same cost: an instruction about a
kept assembly does nothing to it.
**Status:** open (feature-sized).

**493. A hand-cut run-out groove is never read as a joint by Refine's gate (pre-existing; found by the box joints probe, 2026-10-27).** A drawer
bottom held by a hand-cut RUN-OUT groove (a groove through the end with the router's run-out) is never read as a joint by `gateUnjoin` (`unjoin.ts`:
the pocket must lie inside the overlap box), so Refine refuses it with `GATE_REFUSAL`, with or without box joints. Joinery's own STOPPED dado reads
back fine. The probe was read-only; no code changed. A fix widens `readJoints`' pocket test (inv 41: the exact re-join must still prove it).
**Status:** open (ask first).
**Dovetails reproduction (2026-10-27, the dovetails round, Task 8 ruling):** the same mechanism bites the COMMON drawer workflow in one
order. Join the drawer bottom into the front and back first (Add joinery: dados), THEN Dovetail the corners (or Box joint the corners):
the corner planner's run-out changes the joined parts (it carries joinery's groove on past the bottom: Task 8's report and ruling), so
`gateUnjoin`'s re-join no longer reproduces them and Refine refuses with `GATE_REFUSAL`. It comes from planning corners on a joined
project (box joints too, and with the dovetail joinery probe off), not from the dovetails round. The other order works: dovetail the corners, THEN join the bottom —
Refine reads and re-applies the joints with every dovetail intact (pinned, `dovetailsRefine.test.ts`, "a dovetailed drawer, then its
bottom joined in grooves"). Not fixed in the round (§7 did not require it). Until this is done, a user who joins first and dovetails
second cannot Refine that drawer; the workaround is to remove the bottom's joints, dovetail, then join again.
**Status:** open (ask first; raised: it is the common drawer order — join the bottom, then cut the corners).

**494. The (c) guard's floor-drop false positive (Task 6 review).** `changedBoxJointed` compares a kept part's finger sets, size and position
before and after the re-join; joinery's uniform floor drop moves every part, so a kept drawer whose position moved by the drop reads as changed and the
design comes back unjoined. Never silent (the reason names the part), but the join is lost when it was harmless. A fix compares positions relative
to the floor drop, or the kept parts' world box.
**Status:** open.

**495. Box joints: deferred minors (2026-10-27, the SDD ledger and task reviews).** (1) `recipes.ts` re-exports the four moved rebase helpers for
unedited tests (`resizeEnd.test.ts` has no turned-part case); retarget the tests' imports and drop the re-export. (2) Recognition: a partial-thickness
cut over the fingers does not stop it (spec §5.1 as written; the planner refuses to make one); the recognised width and a max-end depth may be an ulp
off the planned value, never a consumer's concern today (a possible fix: search a few ulps for a layout that reproduces every notch start). (3) A
cross-end rabbet wider than the corner region passes the corner-region test (as a groove does); fingers are cut through it. (4) The `resizeEnd`
refusal is matched by message text (pinned by a mutation test); shaped users' clone notches are minted then discarded; `nextId` is global, not
per-cut ids. (5) The planner runs twice per click (the StretcherSection pattern); a parse-error width leaves the old notes; the panel test asserts
only the first note line. (6) The diagram's set-loop `ensure()` is not discriminated (the re-stored-notches case); stored versus board recognition
agreement is unasserted; the finger note reuses the curve-note CSS class; `void container`; the cut-list outer-two parenthesis is untested; Task 5's
implementation was written before its tests (stash-verified RED). (7) Task 6b: a loose part's name is compared trimmed but a placement's exact (both safe);
`keptParts` is computed twice and the placed builder is O(n²); the nested-refusal check fires after the taper and angle checks for kept definitions.
(8) Task 4: the section's held-point judging has one test (the planner's `judgeHeld` call); a stale selection would give an infinite default width
(unreachable: the selection is filtered and the section mounts with two parts). (9) The panel's success notes stay visible after an undo:
the selection does not change, so the section does not remount and its held notes are not cleared (final review, 2026-10-27). Cosmetic.
**Status:** open (record-only).

**496. Box joints on real hardware and a paid Refine run (for the user; final review, 2026-10-27).** (1) By eye on real hardware: the
jointed corner in the viewport (fingers' end grain alternating up both faces, flush faces, no z-fighting). The browser check
(`docs/browser-verification-box-joints.md` §5) saw it in software GL only, which hides shader behaviour (fu 26a). (2) ONE paid Refine run on a
project with a box-jointed drawer ASSEMBLY plus a plain root part: the assembly comes back kept whole, the root part refined. Not done in the
browser check because no API key is stored on either dev origin and the key never goes through chat; the kept-assembly round trip is covered
only by the fake-client `runRefine` tests (Tasks 6, 6b). The two images in `docs/img/` (`box-joints-corner.png`, `box-joints-diagram.png`)
show the OLD symmetric layout (before Task 9's equal fingers); retake them with (1) if a screenshot is wanted. Deployed 2026-10-27, so (1) can be
done on production with a throwaway project in a private window (never the user's own production profile: per CLAUDE.md's deployment rule, its storage is their project).
**Status:** open (owed to the user: by eye on real hardware; one paid run).
(2) DONE 2026-10-27 (the user's key typed into the watched dev browser; Opus 5.5, ≈ $0.04): a nightstand case (two sides, top, bottom,
plain root parts) with a box-jointed drawer ASSEMBLY inside, "Make the nightstand case 4 inches taller (the sides 24 inches) and keep the
drawer where it is.": 0 new issues, `Kept as is (… box joints): Drawer`, the sides 20" → 24", the top moved Y +4"; the saved project's
drawer definition and placement byte for byte the original's (every part's 8 finger cuts). The same run on a DOVETAILED drawer (≈ $0.01):
the same changes, `Kept as is (… dovetails): Drawer`, the definition and placement byte for byte (every dovetail's role, count 3, 1:8).
The model swapped the plain top's and bottom's length and width (the same world box; allowed for a plain part).
**Status:** open (owed to the user: (1) by eye on real hardware only).

## From the dovetails round (dovetails chunk 2, through dovetails) — 2026-10-27

Built on branch `dovetails` (commits `e8ca93f`..`a38f216`, schema 26, inv 62); NOT yet deployed when these were written. Spec
`docs/superpowers/specs/2026-10-27-sloyd-dovetails-design.md` (§11's list is 497–504; the build ledger's notes are 505–513; the final
review's are 514–515).
**Status:** (1) CLOSED 2026-10-28 by the user's ruling after the first real-hardware pass (`docs/browser-verification-real-hardware-2026-10-28.md`: the user's own Chrome and GPU, Claude driving): the fingers alternate up both faces, flush, no z-fighting; the half-blind and through dovetail corners read correctly too.

**497. Half-blind dovetails (spec §2, §11; fu 484's other half; with fu 485).** The drawer-front joint: the pins' part is thicker than
the tails are long and the tails stop short of its face, and with it a corner whose parts differ in height along the joint (a drawer front
taller than its sides), which refuses today with `<A> and <B> must be the same height along the joint.`. Needs a stopped pin socket (the
pins part's sockets end inside its thickness: a view curve through the run with a second square stop, or a body of its own), a lap
dimension on the feature (a schema question: argue its own harm), the layout's rule for the part that sticks out, and the bench drawing's
third figure. The one home of half-blind work (fu 484 points here).
**Status:** open (feature-sized; needs its own spec).
**Status:** CLOSED for the joint 2026-10-28 — half-blind dovetails MERGED `33de29a` and DEPLOYED 2026-10-28 (`index-aWJcbSuP.js`; commits `48d2f92..22a66f2`;
schema 27, the `lap` on both entries; spec `2026-10-27-sloyd-half-blind-dovetails-design.md`, inv 62), deployed
(confirmed at deploy). The stopped pin socket rides the view-curve path (no body code); the bench pair carries the lap on figure B,
with no third figure (spec §5.2, my call; fu 517). The HEIGHTS half (a front taller than its sides) moved to fu 485, re-worded for box
joints and both dovetail kinds. New follow-ups 516–521.

**498. Dovetails on featured parts (spec §2, §3.6, §11).** A part with a lean, angle cut, curve, edge profile, edge band, round tenon or
box joint refuses dovetails (`<part> has <…> — dovetails work on plain stock for now.`), and a dovetailed part refuses those features' ADD
(`<part> has dovetails — remove them first.`) and any cut or hole reaching a dovetailed end's zone (`<part> has dovetails there — move it
clear of the joint.`). Lifting either needs every reader taught the combination: `holeFaults` and `holes.ts` (a bore meeting socket air),
`stockProbe`, `featureZones`, the tenon zone, the band strips. fu 486's twin.
**Status:** open (feature-sized).

**499. Proud tails and glue clearance (spec §2, §11; fu 487's dovetail twin).** The model is the finished, flush joint: tails and pins are
exactly the other part's thickness deep and exactly complementary. Real joints leave the tails and pins proud for planing flush, and a
paring allowance.
**Status:** open (feature-sized).

**500. A typed pin width, variable spacing, jig spacing, sliding dovetails, a dovetail at an angle (spec §2, §11).** The pin is fixed at
1/4" (6 mm) by the user's ruling; spacing is the hand-cut rule only. Each of these is a new layout input (and, for a jig, a fixed pitch the
part's height must suit) or a new joint (a sliding dovetail's housing; a splayed box's compound corner).
**Status:** open (feature-sized).

**501. Add joinery, Generate or Refine choosing a dovetail (spec §2, §7, §11; fu 488's twin).** Joinery only LEAVES a dovetailed part
alone and Generate never authors one: the design schema and `toWireDesign` are byte for byte the same. A joint kind that picks dovetails
needs the recipe, `choose.ts` and the design form's words (fu 322: a new design-form shape costs grammar).
**Status:** open (feature-sized).

**502. Dovetail callouts on the Plans sheet (spec §2, §11).** The joint draws on the Plans sheet as geometry, unlabelled (no feature key,
no tag: `drawView` tags no dovetail segment). A callout would name the slope and count beside the corner.
**Status:** open (feature-sized).

**503. A box joint and a dovetail on one part (spec §3.6, §11).** A part with box joints refuses dovetails and a dovetailed part refuses Box
joint the corners (the plain-stock sentences). A drawer whose back is box-jointed and front dovetailed would need the two planners to share
a part's ends, and the cut list's claim order to take both.
**Status:** open (feature-sized).

**504. Following a Remove to the partner (spec §4, §9, §11).** Remove takes off that end's dovetail only; the partner keeps its own, so the
corner reads as overlap in the design check until the user re-plans or removes the partner too (no stored partner link exists to follow;
the corner would have to be re-found). My call in the spec; the user may want Remove to take both.
**Status:** open (ask first).

**505. `updateBoard` on a mirrored linked part throws when its patch carries `tenons` or `dovetails` (pre-existing for tenons; found in
Task 2 of the dovetails round).** A shape-mate's patch with a `tenons` (now also `dovetails`) key reaches the write-back once through each
user's own flip, and the edits disagree (`disagreeing edits`). `lean` is excluded from the shape-mate patch for this reason (inv 45); the
two lists are not. No production caller passes either key to `updateBoard` (each has its own store actions; a grep of the non-test
sources finds none), so it is latent. Fix: exclude them from the shape-mate patch as `lean` is.
**Status:** open (latent bug).

**506. A resize moving an existing hole or cut into a dovetail zone (Task 3 ruling).** Every authoring path refuses a hole or cut that
reaches a dovetailed end's zone (spec §3.6), so `holeFaults` and `holes.ts` never meet socket air — except a later RESIZE of the part (or a
re-plan that shortens it) that carries an existing hole into the zone: the hole wall then meshes through socket air, and no fault or note
says so. Rare (an edited state). Fix: a zone fault on the hole row (kept, noted), or teach `holeFaults` the dovetail waste (fu 498).
**Status:** open.

**507. A linked user mirrored along J at its mate's SAME turn refuses when the Shape takes PINS (Task 4 ruling).** Spec §3.2 and §6 said
linked users mirrored along J succeed. In the build's carcass cases (`dovetailPlan.test.ts`: two upright sides linked to one Shape, J
their width, a flat top between them) Side right mirrored along J at Side left's turn SUCCEEDS when the sides take the tails (Swap), and
unmirrored sides at 90°/270° and Mirror's own pair succeed taking the pins; but Side right mirrored along J at the SAME turn taking the
PINS (the default, tails on the top) would have its pins narrow on its INSIDE face (the reflection keeps the narrow face on the same world
side), so the plan refuses with `These linked parts would need different dovetails: <parts>.`. Workarounds: Swap (the linked parts take the tails,
which succeeds) or Unlink. A fix stores the pins' outside face per user (an OWN field) or lets the write-back split the link by rule.
**Status:** open (ask first).

**508. `fitStretcher` has no dovetail-zone check (Task 5 note).** Add stretcher and Bore leg sockets refuse a socket in a dovetailed leg's
zone; Fit the stretcher again re-bores its rows in place without that check, so a refit could move a socket into a dovetailed end. The
usual trigger is gone (a lean on a dovetailed part is refused), but the refit itself does not check; the guard belongs there too.
**Status:** open (latent; small).

**509. Dovetails on two different dimensions of one part (Task 6 note).** The planner refuses a three-way corner, so only a hand-edited
file can carry dovetails on a length end AND a width end of one part. The checks' inscribed contact boxes could then over-claim wood where
the two zones cross, and nothing faults it. A fault (`dovetailFaults`: a dovetail on the other dimension) would close it.
**Status:** open.

**510. Front and back as one cut-list row (Task 7 ruling).** A dovetailed drawer's front and back read as two rows when their pins are
narrow on different part-local thickness faces (`outside: 'max'` vs `'min'`), though each is the other flipped over. Part-local identity is
the cut list's rule (inv 40); grouping flip-equivalent parts would need a rule for which face the bench line names.
**Status:** open (ask first).

**511. The bench drawings by eye (for the user; Task 7 rulings).** The user judges the bench pair's look in the browser check (Task 10):
the label size equals PartDiagram's; the full chain `p, Te, p, …` is drawn only when every label fits its own span (the spec's mockup
case, a 6" side, 4 tails, 1:8, draws it on TWO tiers where the mockup had one row), otherwise each distinct value once at its first span
with the overall `H` on both figures; the pair never wraps (the figures scale with the row). Close when the user has seen it.
**Status:** open (owed to the user: by eye).
**Status:** CLOSED 2026-10-27 — the user saw the pair ("Yeah those look good"), from headless captures of the dev server's cut list (the
watched browser's X display was gone): a 6" drawer side, 4 tails at 1:8 (the full chain on two tiers, the overall `6"` on the tail figure
only) and a 10" side at Auto (7 tails; each value once, the half pin's and the first pin's `1/4"` side by side, `10"` on both figures),
on screen and printed (Letter, nothing clipped). All three points raised were left as built.

**512. Dovetails copy review (for the user).** Every new sentence, by home (the planner's calls in the plan's Global Constraints and the
build's rulings, for the user's words):
(1) `dovetailText.ts`, the planner: `<part> would be dovetailed on two different edges — that isn't supported yet.`; `<part> has a cut where
the dovetails go — remove it first.`; `<part> has a hole where the dovetails go.`; `<part> has <a lean | an angle cut | a curve | an edge
profile | edge banding | a round tenon | box joints> — dovetails work on plain stock for now.`; `Dovetails can't reach a part inside a mirrored
copy yet: <part>.`; `These linked parts would need different dovetails: <parts>.`; `Dovetails can't keep these linked parts linked: <parts>.
Unlink them first.`; `A slope must be between 1:4 and 1:12.` (also the Slope field's parse error); `A tail count must be a whole number from 1
to 100.` (also the Tails field's error, for a non-whole entry and for more than 100; final review); `<A> and <B> are too narrow for <N> tails at
1:<s> — try fewer tails.` (a count of 2 or more) and `<A> and <B> are too narrow for even one tail at 1:<s> — try a shallower slope or a wider
part.` (one tail; final review); `<part> is too short for its
dovetails.` (ruled 2026-10-27 for a depth or overlap fault). The shared corner sentences (`cornerText.ts`, box joints' words unchanged, now
also dovetails'): `These parts don't meet at a corner.`, `<A> and <B> must be the same height along the joint.`, `<part> meets two parts at one
end.`, `<A> and <B> must be in the same assembly.`, `<part> is linked to <mate> — select <mate>'s corner too, or Unlink first.`.
(2) The success note: `Dovetailed <n> corner(s): <N> tails, 1:<s>.` (or `Dovetailed <n> corners:` and `<A> and <B>: <N> tails, 1:<s>.` per
corner), `Tails on <parts>.`, then `<part> is now <x> longer.` / `shorter.` and `<part> isn't at a corner with another selected part.`.
One tail reads `1 tail` in the success note, the too-narrow sentence and the cut-list line (`tailWord`; final review, 2026-10-27: was
`1 tails`). (3) The refusals on a dovetailed part: `<part> has dovetails — remove them first.`; `<part> has dovetails there — move it clear
of the joint.`; box joints' `<part> has dovetails — box joints work on plain stock for now.`. (4) The fault note: `This dovetail no longer fits:
<a tail is narrower than a pin | the tail count isn't a whole number, 1 or more | the slope is outside 1:4 to 1:12 | it is deeper than the
part>.` (the last also covers two dovetails meeting, a build ruling). (5) The panel: the section `Dovetails`, `Slope` with the prefix `1 :`,
`Tails` with the placeholder `Auto`, `Swap tails and pins`, `Dovetail the corners`; the single-part section `Dovetails · <n>` and `Remove`.
(6) The cut-list lines (part-local words, as box joints'): `Through dovetails — <N> tails, 1:<s>, pins <p> at the narrow end, <depth> deep, at
the <dim> <end> end; this part has the tails, <Te> at the end.` / `…; this part has the pins, narrow on its thickness <min|max> face.`
(lengths print as `formatLength` gives them, `1-3/16"`). (7) The bench drawings: the captions `Dovetails — the tail board's face` and
`Dovetails — the pin board's end grain`; the labels `outside face`, `inside face`, `baseline <depth>`, `both ends`, `<dim> <end> end` (one
end, new in Task 7), the slope `1:<s>` and the overall `H`. (8) Joinery: `<part> has dovetails, so joinery leaves its size and place alone`.
(9) Refine: the why-word `has dovetails`; the (c) reason `Joinery would have changed <name>, which Refine keeps as it is for its dovetails,
so the design comes back unjoined.`; `Refine can't keep an assembly with dovetails whose parts are linked to parts outside it — Unlink first:
<part>.` and `Refine can't keep an assembly with box joints and dovetails whose parts are linked to parts outside it — Unlink first:
<part>.`; the kept note's header gaining `have dovetails`, its per-placement line `"<placement>" is an assembly with dovetails and is kept as
is: <bounds>.` (`with box joints and dovetails` for a mixed one); the dialog's `Kept as is (leans, angled holes, round tenons or dovetails):
<names>` (and `…, box joints or dovetails` when both).
**Status:** open (owed to the user: wording).
**Status:** CLOSED 2026-10-27 — the user approved all nine proposed changes ("Apply all of them"), with fu 491. Dovetails' share: the hole
sentence gains `— move or remove it first.`; `<part> has dovetails at that end — keep cuts and holes clear of the joint.` (was `…there —
move it clear of the joint.`); the cut-list lines `this part has the tails, each <Te> wide at the end.` and `this part has the pins, their
narrow ends on its thickness <min|max> face.`; the fault reason `the part is too short for it` (was `it is deeper than the part`). Both
kinds: Refine's done view now says `Kept exactly as is: <name> (<reasons>), …`, naming only each kept name's own reasons (`keptWhy`:
`leaning`, `angled holes`, `round tenon`, `compound end cut`, `box joints`, `dovetails`, a placement its assembly's kind), replacing the
fixed list `Kept as is (leans, angled holes, round tenons, box joints or dovetails)`; `RefineOutcome.leaning` carries `why` in place of the
`boxJoints`/`dovetails` flags. Everything else as built.

**513. Dovetails: deferred minors (2026-10-27, the SDD ledger and task reviews).** (1) Task 1: `boxJoints.ts` recomputes `displayNames` /
`worldParts` for its notes; `EPS` and `flipEnd` are duplicated in `boxJoints.ts` and `cornerPlan.ts`; `planCorner`'s `ops`/`doc` are unused
by box joints (its doc comment could say why); `EndFlips.thickness` is unreachable (no posture's `mirrorDim` is the thickness, pinned by a
property test) but kept threaded — a dead parameter. (2) Task 2: `dovetailFaults` with `count ≤ 0` may also report `narrow` (unreachable
after load: the loader drops such an entry, and `count` is reported first). (3) Task 3: `dovetailGeometry.test.ts`' "unchanged" snap test
asserts fewer points rather than comparing to the keyless part; the pins part's snap points are asserted present, not all on stock;
`drawing.ts` tags no dovetail segment only because every outline is straight — a future arc-bearing joint view needs the exclusion. (4) Task
4: an import cycle `dovetails → cornerPlan/boxJoints → cuts → profiles → dovetails` (harmless today: nothing reads at load); `dovetailFixtures.ts`
duplicates `dovetailGeometry.test.ts`' partition code (left unedited by rule); a re-plan keeps the TAILS end's count, so a hand-edited
mismatch overwrites the pins end silently. (5) Task 5: no `removeDovetail` test on a linked part; no `updateCut` store test on a mirrored user
(both go through `mapWorld`). (6) Task 6: `dovetailContacts`' `meet` drops zero-length regions (strict, not weak; unreachable behind §3.6's
refusals); the test name "reports an overlap there" understates (two overlaps). (7) Task 7: the full chain's tier-0 labels lack leaders (moot
in single-value mode); the single-mode test's expected count assumes at least five chain entries; figure B's overall label is always
emitted and only hidden by the component in full mode (another consumer would show it). (8) Task 8: the `changedDovetailed` test lacked
width, thickness and reorder cases (added by the final review, 2026-10-27, each clause mutated); `keepsExactly`'s doc comment phrasing overlaps; `keptAssemblyLinkRefusal` names only the FIRST holder's
kind when two kept definitions share a Shape; a kept part's re-applied pockets get new cut ids (the guard ignores ids, as for box joints);
Repair treats a dovetailed part whose cuts are only reordered as unchanged; joinery's half-lap and rabbet zone probes are effectively
defensive (with the corner's mate present the move is refused first).
**Status:** open (record-only).

**514. Dovetails: a misfit GAP is not reported, and the tails' depth goes stale (final review, 2026-10-27; spec Amended SD20).** A
dovetail's `depth` is stored at planning (the partner's thickness). When the pins part is later THINNED (or the tails part's partner
otherwise changes), the tails stick out past it or fall short: an overshoot is not overlap (the pins part's wood is gone), so the design
check reports nothing, and the tails part's cut-list line and bench drawing keep the OLD depth until the corner is dovetailed again. §3.5's
"reports the mismatch with the partner as overlap or a gap" holds only for overlap. Options: a gap check (a new check kind, needs the
user's approval as §5.3 did), or a partner-thickness note on the tails part's Dovetails section and cut-list line (find the partner as the
re-plan does, compare its thickness with `depth`). Escalated to the user.
**Status:** open (ask first: which remedy).

**515. Dovetails: metric bench chain values may not sum to `H` after rounding (final review, 2026-10-27).** The metric bench chain prints
each span (half pin, tail, pin) as bare whole mm (Task 7 ruling, inv 52); each value is rounded on its own, so the printed spans can add up
to a millimetre or two more or less than the printed overall `H` (e.g. 4 tails of 30.2 mm print as 30 each). A shop reader laying out from
the chain accumulates the error. Remedy: cumulative stations (each boundary from J's min, rounded once) instead of or beside the spans, the
way `dovetailLayout` computes every bound directly. Not fixed in the round.
**Status:** open (small; changes the bench drawing's look, so the user judges it with fu 511).

## From the half-blind dovetails round (dovetails chunk 3) — 2026-10-28

Built on branch `half-blind` (commits `48d2f92..7e6beae`, branched from master `48d2f92`, schema 27, inv 62 extended); NOT merged or deployed
when these were written. Spec `docs/superpowers/specs/2026-10-27-sloyd-half-blind-dovetails-design.md` (§2 and §11 name 516–517; the
build ledger's notes are 518–521).

**516. Rabbeted (lipped) and overlay drawer fronts (spec §2, §11).** A half-blind front is flush: its ends meet the sides' outside faces.
A rabbeted (lipped) front sticks out past the sides on its ends and top, with the rabbet's wall as the lap's inside; an overlay front is a
separate false front over a box. Each needs the corner finding taught a front that does not end on the sides' outside faces (the run-out
lands on a rabbet's shoulder, not the outside plane), the lap measured from the rabbet, and a cut-list line that names it. Shares the
"part that sticks out" question with fu 485.
**Status:** open (feature-sized).

**517. A third bench figure for half-blind dovetails (spec §5.2, §11; my call in the spec).** fu 497 anticipated a third figure: the pin
board's inside face, showing the socket depth `tT`. The build keeps the pair (A the tail board's face, B the pin board's end grain with the
lap band and `lap <x>`): the socket depth is already in the cut-list line (`… deep`), and the pair's width share (SD8) is set for two
figures. A third figure would need its own share of the row, or a second row.
**Status:** open (ask first: only if the user wants it after seeing the pair, fu 520).

**518. Half-blind dovetails copy review (for the user).** Every new sentence, by home, as built (drafts in the spec, verbatim in the plan's
Global Constraints; ruled lines marked):
(1) The success note (`dovetailText.ts` `dovetailedLines`): one shared layout `Dovetailed <n> corners, half-blind: <N> tails, 1:<s>, <lap>
lap.` (e.g. `Dovetailed 2 corners, half-blind: 4 tails, 1:8, 1/4" lap.`); per corner `<A> and <B>: <N> tails, 1:<s>, half-blind, <lap>
lap.` (when the corners differ in count, slope, kind or lap; a through corner's line is as before). `1 tail` through `tailWord`.
(2) The cut-list lines (`dovetailLine`; one template for both kinds): tails `Half-blind dovetails — <N> tails, 1:<s>, pins <p> at the
narrow end, <depth> deep, at the <dim> <end> end; this part has the tails, each <Te> wide at the end.`; pins `Half-blind dovetails — <N>
tails, 1:<s>, pins <p> at the narrow end, <depth> deep, at the <dim> <end> end; this part has the pins, their narrow ends <lap> in from its
thickness <min|max> face (the lap).` (e.g. `… their narrow ends 1/4" in from its thickness max face (the lap).`).
(3) The lap refusal (`dovetailTooThin`): `<part> is too thin for a <lap> lap.` (a lap at or past the pin part's thickness: typed, kept, or
Auto on a thin part).
(4) The Lap parse sentence (`DOVETAIL_LAP_PARSE`): `A lap must be a length more than 0.` — the Lap field's parse error, AND (a Task 3
ruling) the planner's answer to a typed lap of 0, below 0 or NaN (it had read `Front is too thin for a 0" lap.`).
(5) The fault reason (`FAULT_REASONS.lap`), inside `This dovetail no longer fits: <reason>.`: `the lap isn't inside the part's thickness`.
(6) The panel (`Dovetails.tsx`): the select `Joint` with `As they are` (default) / `Through` / `Half-blind`; the field `Lap`, placeholder
`Auto` (it reuses the Tails field's placeholder constant, fu 521).
(7) The bench (`benchLap`): figure B's label `lap <x>` (bare mm in metric, `lap 6`).
**Status:** open (owed to the user: wording).
**Status:** CLOSED 2026-10-28 — the user asked Claude to review the copy and labels and make any needed updates. Two changes: the pins
line now reads `this part has the pins, their narrow ends behind a <lap> lap on its thickness <min|max> face.` (was `… their narrow ends
<lap> in from its thickness <face> face (the lap).`: the lap is the wood in front of the pins, so it is named as such); the fault reason
reads `the lap is too thick for the part` (was `the lap isn't inside the part's thickness`; the loader drops a lap ≤ 0, so a stored lap
faults only by reaching the thickness; it parallels `the part is too short for it`). Everything else kept as built: the success lines,
`<part> is too thin for a <lap> lap.`, `A lap must be a length more than 0.`, the panel's words and `lap <x>`.

**519. Mirror-twin sides in a MIXED drawer: half-blind front, through back (Task 6 named-risk finding; pre-existing).** With the sides
linked as mirror twins: (a) Side right mirrored at the SAME turn — the half-blind front's corners refuse (the mate sentence when only the
front's corners are selected; planning all four corners half-blind with a 1/2" back gives different laps at the two ends and the mirror
refuses with the disagreement sentence); (b) Mirror's own pair (mirrored at the inverse turn, 270°) plans, but the cut list shows the
sides as TWO rows, because the row key compares part-local ends and the mirror swaps them. Both are PRE-EXISTING: a THROUGH drawer with a
3/4" front and a 1/2" back on the same pairs refuses and splits the same way (the mirror runs along the sides' length, swapping the
Shape's ends; inv 40's part-local identity, fu 510's class). Linked UNMIRRORED sides at the same turn work (one row, two benches; pinned
in `cutlist.dovetails.test.ts`), and so do mirror twins in an all-half-blind drawer (one row). Making row identity ignore an end flip that
is a congruence, or the linked signature compare ends through the mirror, is a human decision and not half-blind specific.
**Status:** open (ask first).
**Status:** open by decision — the user ruled 2026-10-28 to leave it as is ("Leave fu 519 as is"); do not re-open unasked.

**520. The half-blind bench's lap band and label by eye (for the user; Task 6 review, Task 9's browser check).** Figure B draws the lap as a
`.cutlist-bench-lap` band at fill-opacity 0.06 with a 1.5 stroke along the lap plane (the spec said "a solid band"; the waste fill is 0.22,
so a heavier band could read as waste), and its `lap <x>` label sits on the outside face's label row as free text, without a dimension
tick of its own. The user judges both in the browser check; close when seen.
**Status:** open (owed to the user: by eye).
**Status:** CLOSED 2026-10-28 — Claude judged it at the user's request, from a headless capture of the dev server's cut list: the tinted
band read as neither wood nor waste. Figure B now leaves the lap UNSHADED (it is wood, as the pins are) and draws the lap plane as a
DASHED line (`.cutlist-bench-lap`, styled as figure A's baseline), so the two figures share one convention: a dashed line where the
joint stops. The `lap <x>` label stays on the outside face's row (it reads beside `outside face` as `baseline <x>` does on figure A); no
dimension tick added.

**521. Half-blind dovetails: deferred minors (2026-10-28, the SDD ledger and task reviews).** (1) Task 1: `dovetailGeometry.test.ts` has
a second section-cap helper duplicating the one inside its describe closure (left so the existing block stays untouched); the module-level
half-blind fixture runs at collection (a `beforeAll` would localise it); the edges test lacks a positive check (socket lines on the end and
inside faces, no facet lines); `DIMS3` is declared after its describe. (2) Task 2: stale test titles (`a v27 file is refused` now tests 28,
`above 28` should read `above 27`) in `document.test.ts` (×4) and `squareSet.test.ts`; `document.v27.test.ts`' first test's
`at(26)`/`at(27)` `toEqual` is near-tautological (`not.toContain('lap')` carries it). (3) Task 3: `dovetailCornerStyle` is called three
times per corner (pure, cheap). (4) Task 4: `LapField` is a near-verbatim copy of `TailsField`'s draft logic (a shared blank-is-Auto field
would serve both); it reuses `DOVETAIL_TAILS_PLACEHOLDER` (a lap placeholder constant would be clearer); its text is not re-formatted on a
units change while mounted. (5) Task 5: the "absent for a through one" assertion is partly vacuous (the through drawer is never
slab-checked; the back's check covers it); the carcass guard uses `||` over parts. (6) Task 7: the "no joints → null" Repair test is weak;
the brief's mutation (`cornerJointed` ignoring a lap) reaches only Refine — the joinery and Repair twins assert directly and read
`hasDovetails` / stored fields. (7) Task 7 ruling: `cutRunsThrough`'s through-groove exemption is kept on a half-blind PINS part (the groove
runs on the inside face and leaves through end grain the side covers); a groove deeper than `tP − lap` would breach the lap with no
refusal — an ordinary visible cut, the user may want it refused when the entry has a lap (ask first if raised).
(8) Final review: the bench (`dovetailBench.ts`) and the tails part's cut-list line (`dovetailText.ts`) read the TAILS entry's `lap`, while geometry reads the PINS entry's; spec §8 rules the pins entry decides; the planner always writes both equal, so they disagree only in a hand-edited file (figure B on the tail part's row would then show a lap the pin part does not have). (9) A lap typed under `As they are` on a new (through) corner is silently ignored (spec §4's rule; the success note shows no "half-blind"). (10) Building the classic drawer (half-blind front, through back) takes two actions.
**Status:** open (record-only).

**522. Weight: hardware (weight, 2026-10-28).** Hardware types carry no weight, so a cabinet's hinges, slides and pulls are not in the
piece's weight. A per-type weight (per piece) would join the total and Properties; Buying would not change.
**Status:** open (feature-sized, small; ask first).

**523. Weight: holes subtracted (weight, 2026-10-28).** `woodVolume` ignores holes (`boardBodies` is hole-free, inv 50): four 35 mm hinge
cups are about 0.06 lb of oak against a ±15% density spread. Subtracting each row analytically (count × π r² × depth, clipped; tilted rows
longer) is possible if a real project shows the difference.
**Status:** open (record-only; only when a real project needs it).

**524. Weight on the Plans sheet and in Buying (weight, 2026-10-28).** v1 prints weight in the cut list (each group and the project) and
Properties only (spec §1 non-goals).
**Status:** open (ask first).

**525. Density in the tip check (weight, 2026-10-28).** `partMass` (fu 303) weighs every part at one density, so an oak top on a pine base
puts the centre of mass lower than the check reckons. Using the catalog's density would change check results and Generate's repair loop;
held-and-stable spec §8 left it out of scope and the weight round kept it out (the checks byte for byte).
**Status:** open (ask first).

**526. Weight: the copy, and two calls, for the user (weight, 2026-10-28).** The strings — `12 lb` / `no density` under a group's
subtotal stock; `Weight: about 47 lb`, `…, not counting Ash (no density)`, `Weight: not known (Ash has no density)`; Properties' `about 6.2 lb`,
`…, not counting Ash`, `not known`; the dialog's `Density (lb/ft³)`, placeholder `Unknown`, the built-ins' `Density 44 lb/ft³` and the
refusal `Density must be a number more than 0 and at most 150 lb/ft³, or left empty.` (2402 kg/m³ in metric: the limit is rounded DOWN
so the stated limit is itself accepted). Two calls to confirm: density follows the project's units in Materials & prices while sizes stay
imperial (ruling P1 kept for sizes), and the rounding (one decimal under 10, whole from 10).
**Status:** open (owed to the user: copy).
**Status:** CLOSED 2026-10-28 — seen by the user in their own Chrome (the MobaXterm tunnel, Claude driving through claude-in-chrome):
both calls kept by ruling ("keep both": density in the project's units in Materials & prices; one decimal under 10, whole from 10);
the copy accepted; one change ruled — a weight that would print `0.0` reads `under 0.1 lb` / `under 0.1 kg`, and a sentence never
says `about under` (`approxWeight`).

**527. Weight: deferred minors (2026-10-28, the final whole-branch review).** (1) Spec §4.3's "`weightOf` and the cut list agree by
test" has no direct test (each is tested against hand values; `weightOf` has no production caller). (2) No through-dovetail volume
fixture (the half-blind corner covers the dovetail path; the through builder is test-local in `dovetailGeometry.test.ts`). (3)
Properties' `SelectionWeight` runs `flatDocument` on every document change, drag frames included (the cached `worldParts` would do).
(4) A weighed but tiny selection (a 3/8" dowel) reads `about 0.0 lb`; (5) an empty assembly reads `about 0.0 lb` (copy: fu 526). (6) A
"differs from library" note can show for a pair whose densities differ below display precision (44 vs 44.0118 lb/ft³ both read `44`).
(7) The cut list sorts an unknown material id FIRST in its unweighed list (`indexOf` −1) where `weight.ts`' `rank` sorts it last;
unreachable after load validation.
**Status:** open (record-only).

**528. Part labels: more sticker stock and custom geometry (2026-10-28).** v1 has four presets (Avery 5160, 5163, L7160, L7163).
Other common sheets, or a typed geometry (page, columns, rows, sizes, margins, pitches), would extend `LABEL_STOCKS`.
**Status:** open (ask first).

**529. Part labels: remember the chosen stock (2026-10-28).** The stock and Start at are view state, reset each opening (spec §4.3).
Remembering the stock needs a `StorageAdapter` key (fu 8: nothing else touches `localStorage`).
**Status:** open (ask first).

**530. Part labels: a QR code or barcode (2026-10-28).** Out of scope in v1.
**Status:** open (record-only).

**531. Part labels: hardware labels, and a finished-size line on a banded part's label (2026-10-28).** v1 labels the pieces the cut
list asks you to cut, at their CUT size (a banded part's core).
**Status:** open (ask first).

**532. Part labels: a printed sheet against real stock, and the look (for the user, 2026-10-28).** The print geometry was measured
from the PDF (first and last cells within 0.0001" of each preset); one real sheet of stickers is owed, and the on-screen sheet by eye
(the check ran headless). Includes the copy: `Labels…`, `Start at`, `Enter a label number from 1 to <n>`, `<n> labels on <m> sheets`,
the print note, and the label lines.
**Status:** open (owed to the user: real hardware and by eye).
**Status:** CLOSED 2026-10-28 by the user's ruling ("close the rest"), after watching the Labels sheet in their own Chrome (5160 and
5163, Start at 3). A print on real sticker stock was not made; the PDF geometry (exact to 0.0001") stands as the record.

**533. Part labels: deferred minors (2026-10-28, the final whole-branch review).** (1) `LabelsSheet` builds three strings (the count
line, the Start at refusal, the ` · ` before the grain) that spec §6 puts in `labels.ts`. (2) A long name is truncated from the END,
so a nested path or a strip name loses its most identifying suffix (copies on one row are identical pieces, so no two different
pieces read alike). Options: wrap to two lines on the larger stock, or truncate from the left. (3) Escape in the Start at field reverts
it AND closes the sheet (as every dialog does today; DimensionField does not stop the event). (4) Closing Labels focuses the cut-list
sheet, not its `Labels…` button. (5) A Start at past `Number.MAX_SAFE_INTEGER` shows DimensionField's own `Must be at most …`. (6) No
test that a stock change resets Start at, no App-level Escape test, and no hidden part in the `labelsOf` fixture (hidden-ness is store
state, so it holds by construction).
**Status:** open (record-only).

**534. Align to a guide or the floor (align, 2026-10-28).** v1 aligns to the item selected first; a guide, the floor (y 0) or a typed
coordinate as the target is a follow-up.
**Status:** open (ask first).

**535. Space evenly by equal centres (pitch) (align, 2026-10-28).** v1 makes equal GAPS; equal centres suits parts of different sizes.
**Status:** open (ask first).

**536. Space existing parts at a typed gap or pitch (align, 2026-10-28).** Copy in a row does it for new parts; for existing ones it is a
follow-up.
**Status:** open (ask first).

**537. Align and space evenly: a viewport gesture, and the copy (align, 2026-10-28).** No handle or drag in v1. The copy (`Align`,
`to <name> (selected first)`, the nine button words, `Space evenly` / `Along X`, the refusal) and the panel by eye are owed to the user
(the browser check ran headless).
**Status:** open (owed to the user: copy and by eye; the gesture ask first).
**Status:** copy and look CLOSED 2026-10-28 (the user watched Space evenly and Align front in their own Chrome: "close the rest");
the viewport gesture stays open (ask first).

**538. Align: deferred minors (2026-10-28, the final whole-branch review).** (1) An item with no extent (an EMPTY assembly, reachable only
from an imported or opened file, `dropEmptied`) is dropped silently by `itemExtents`: selected first, the Align section disappears;
otherwise Space evenly can show for 3 selected while only 2 items count, and a click does nothing. Base the panel's thresholds and anchor
on `itemExtents`, or refuse with a sentence. (2) `(selected first)` reads oddly after Select all or a marquee, where the anchor is first in
document order (the name shown is right). (3) No store-level end-to-end test of a leaning leg aligned inside a turned or mirrored open
instance (the reviewer's harness ran 400 trials × every turn, flush to 7e-15).
**Status:** open (record-only).

**539. X-ray: click and snap through a faded part (x-ray, 2026-10-28).** X-ray is draw-only (the user's ruling): a ray still hits the
faded part in front first, so a tenon seen inside a faded leg cannot be clicked or measured — clicking it selects the leg, and Move and
Tape snap to the leg's outside face. Letting a solid (selected) part win the ray over a faded one in front of it touches `BoardMesh`'s
raycast and the snap probes, and needs the spec's anti-goal reworded (a faded part stays clickable where nothing solid is behind it).
**Status:** open (ask first).

**540. Saved views: remember the selection and X-ray (saved views, 2026-10-28).** A view holds the camera, section, explode and hidden
parts only (spec non-goals). Adding the selection and X-ray (X-ray without its selection means nothing) widens `SavedView`, so another
schema bump and a say in `goToView` about selecting parts that may be hidden or gone.
**Status:** open (ask first).

**541. Saved views: Plans sheet and Save image per view (saved views, 2026-10-28).** Views are not read by the Plans sheet, Save image,
drawings or the cut list. A batch of Save images, or a plan sheet figure, per saved view would read `views` from `PlansSheet` and
`capture`.
**Status:** open (ask first).

**542. Saved views: smooth camera transitions and per-view shortcuts (saved views, 2026-10-28).** Going to a view jumps the camera;
there is no animated move and no keyboard shortcut per view (every shortcut lives in `App`'s one keydown effect, inv 27).
**Status:** open (ask first).

**543. X-ray: deferred minors (2026-10-28, the final whole-branch review).** (1) `BoardMesh.tsx`'s `faded` prop comment still names only the
assembly fade; `fadedFor` (`viewport/xray.ts`) is the decider. (2) `store.xray.test.ts` asserts the document is unchanged but has no
explicit no-autosave test. (3) `docs/module-map.md`'s `xray.ts` entry sits after a pre-existing line ending in a dangling "watertight".
**Status:** open (record-only).

**544. Saved views: deferred minors (2026-10-28, per-task and final reviews).** Tests: stale "28" titles on tests asserting 29
(`document.test` ~1709, `bandingLoad`, `document.v26`, `document.v27`, `hardwareLoad`, `squareSet`); untested drops (a missing `section`
key, a non-number `explode`, an id with `/`); `goToView`'s mid-gesture test uses a view with explode 0 and no section (cannot show those
refused); the Group test asserts `endsWith`, not the exact path; `pendingPoseReady(persp, false, false)` unpaired; the footer's
`fieldset[disabled]` test mounts outside App (the browser covered it); the Refine/Generate `[]` tests were never seen red. Code: `SECTION_AXES`
is an untyped `string[]` (tie it to `SectionAxis`); `finite3` aliases `validPosition`; comments wanted at `applyPending`'s TS-only narrowing,
the ortho `height` guard, and `views.ts`' same-doc return (the reason is `editRekeyed`'s identity no-op, fu 231, not inv 4). Behaviour:
`updateView`'s no-op test is `JSON.stringify` (key-order dependent) and a go-to's `controls.update()` may drift a float, so Update can push a
spurious entry (never data loss); Save view / Update do nothing for a frame while the controls rebuild after a projection toggle; undoing a
view write clears a held tape point (as every other document undo does).
**Status:** open (record-only).

**545. Stretch: a stretch line for a single part (parametric resize, 2026-10-28; spec S1).** The Overall size section shows for one
assembly or two or more items, never for one part: a part's own size fields already exist. A part-level stretch line (grow a long apron
at a station, its features following their side) would reuse `stretchPart` with the panel shown for one part.
**Status:** open (ask first).

**546. Stretch: a hole row across the line, re-laid at its pitch (parametric resize, 2026-10-28; spec S2).** A hole row crossing the line
refuses (`<part>'s hole row crosses the stretch line — move the line.`): the pitch can't stretch. Re-laying the row at its pitch (more or
fewer holes, the ends kept) would let it follow. Note: a shelf-pin row running a bookcase side's full height makes every heightening
stretch of that side refuse today, wherever the line goes.
**Status:** open (ask first).

**547. Stretch: corner joints across J, re-planned for both mates in lockstep (parametric resize, 2026-10-28; spec S3).** A box-jointed or
dovetailed corner refuses when the stretch runs along its J (the layout is a function of J's span, and the mate is a partition partner),
or when the line reaches a joint zone on `dim`. Re-planning the corner through `cornerPlan.ts` for both mates at the new span (inv 61's
and 62's ONE layout) would let a drawer box grow taller.
**Status:** open (ask first).

**548. Stretch: a viewport drag handle (parametric resize, 2026-10-28; spec S4).** v1 is typed only (Overall size fields, Stretch at, the
Stretch button); the line is drawn in the viewport (`StretchGuide`) but cannot be dragged, nor can the selection's face.
**Status:** open (ask first).

**549. Stretch: two axes at once (parametric resize, 2026-10-28; spec S5).** One axis per action: changing a second field re-arms to it.
Two stretches make two undo entries.
**Status:** open (ask first).

**550. Stretch: the curves-and-profiles refusal is whole-part (parametric resize, 2026-10-28; Task 2 review).** A spanning part carrying
both curves and profiles refuses (`<part> has curves and profiles, so it can't be stretched — move the line off it.`) even when every
curve and profile sits on one side of the line, or the curve is a prism along `d` (which alone would pass, Ruling 2). A profile on a
curved part follows the outline (`carriesProfiles`), which `stretchPart` does not re-trace.
**Status:** open (record-only).
Re-filed at the final review (2026-10-28, Ruling 8): a top with radiused corners (curves) and a `loop` roundover is a very common part,
and it can never be stretched today, wherever the line goes. Proposed narrow pass: let the part through when every profile is a `loop`
run, or `through` at both ends (so no station sits on `d` to re-trace), and no curve crosses the line (each curve near, far or a prism,
as for a curve alone); the curves follow by `rebaseCurves` as today and the profiles need nothing. Anything else keeps the refusal.
**Status:** open (ask first).

**551. Stretch: curve spans come from chord vertices (parametric resize, 2026-10-28; Task 2 review).** `stretchPart` reads a curve's span
on `d` from `curveOutline`'s chord vertices, which lie up to `CURVE_TOLERANCE` (0.005") inside the true arc, so a curve whose arc bulges
within that of the line is judged on the side its chords are on.
**Status:** open (record-only).

**552. Stretch: deferred minors (2026-10-28, per-task reviews).** Tests: `stretchCut` lacks far === 'min' cases for `across === d` /
`face === d`, shrink cases for across/face, exact-touch, exact-cover and no-mutation cases; no test for a hole row with an inset on `d`, a
far-end `face === d` angle cut, or far === 'min' for curves, profiles and corner joints; the plan's classification boundary (a node face
exactly on the line) is untested; the store's nothing-selected test asserts no `past`, the gesturing half no document identity, and a
non-finite `setStretchGuide` and a same-ids re-select keeping the guide are untested; the panel lacks exploded, metric, unparseable and
deleted-selection tests, and its original tests were never seen red. Code: a `NO_REGION` cut classifies as near (harmless); raw stops shift
unclamped; `stretchCut`'s doc comment says "fixed end" for far cuts; profile stations are judged as points (a run-out's extent not
counted); `stretch.ts`' doc comment calls the grow and move writes "disjoint records", which across placements is not so (the copies
post-condition catches it); the links check keys plain parts by `storageKey` (cornerPlan uses the id; accepted, more correct); the store
does not validate axis, size or line (`stretchPlan`'s `!(size > 0)` covers a NaN size). Panel and viewport: the guide effect sets null on
mount (could clobber another writer); the default line rounds through `formatLength`; `StretchGuide` sits between `AdaptiveGrid`'s doc
comment and its function, subscribes to `doc` while idle, and hardcodes its accent hex. Fixed at the final review (2026-10-28): the
"disjoint records" comment (reworded: across placements the two writes can reach one stored record, and the copies post-condition
refuses), and `StretchGuide`'s place (moved above `AdaptiveGrid`'s doc comment). The rest stands.
**Status:** open (record-only).

**553. Stretch: `stretchPlan` throws inside the panel's `useMemo`, with no ErrorBoundary (2026-10-28, the final whole-branch review,
M4).** `stretchPlan` throws on an internal contradiction (a part count changed, an occurrence appeared, a shaped part lowered with its
links intact) rather than returning a refusal. The panel calls it in a `useMemo` for the live preview, and nothing above it catches,
so a throw would take the app down. No repro in about 7,200 fuzz runs, and the other planners do the same.
**Status:** open (record-only).

**554. Stretch: the guide plane does not come back after explode and un-explode while armed (2026-10-28, the final whole-branch
review, M5).** `setExplode` above 0 clears `stretchGuide` (inv 64), but the panel keeps its armed state; after un-exploding, the panel
still shows the axis and line armed while the viewport draws no plane.
**Status:** open (record-only).

**555. Stretch: the panel's size text — an unparseable entry says nothing, and a retyped rounded value arms a tiny δ (2026-10-28,
the final whole-branch review, M6).** Text the panel cannot parse as a length shows no message (Stretch just stays disabled). The
extent fields show the extent ROUNDED to display precision, so retyping the displayed number can arm a δ below display precision (a
stretch the preview reads as `48" → 48"`).
**Status:** open (record-only).

## From the glue-ups round (fu 268) — 2026-10-29

**556. Glue-ups: a stored glue-up on the part (spec §2, option B; ask first).** `Board.glueUp?: { strips: number }`, SHARED, set in
Properties for any solid long-grain part, so the cut list prints the strips (a setup line) for board-foot hardwood too, and Buying packs
the user's strips instead of deriving them. Costs schema 30 (a build at 29 drops the key and autosaves the loss).
**Status:** open (ask first).
**Status:** open (ask first); 2026-10-29: counterbores takes schema 30, so a stored glue-up would now cost schema 31 (construction lines then took 31: schema 32 now) (the harm argument is the same, against a build at 30).

**557. Glue-ups: typed allowances (spec §9).** `GLUE_WIDTH_ALLOWANCE` (1/8") and `GLUE_LENGTH_ALLOWANCE` (1") are constants; a shop
setting or the document's `stock` would make them typed (a metric shop may want 3 mm and 25 mm).
**Status:** open.

**558. Glue-ups: choosing N, or gluing in place of planing, by price (spec §9).** N is the fewest strips the widest long-enough size
at the thinnest thickness allows; a glue-up never replaces a board a part fits today, even where gluing narrow stock would be cheaper.
(Since fu 564 the thickness needing the FEWEST strips wins, up to 24, which can choose planed thicker stock that costs more: the
band-free identity fixture's Top went from $45 to $48. Price still decides nothing.)
**Status:** open.

**559. Face lamination for a part too thick for every stock (spec §9).** `too thick` stays a refusal.
**Status:** open.

**560. Scarf or finger-jointed length for a part too long for every stock (spec §9).** `too long` stays a refusal.
**Status:** open.

**561. End-grain glue-ups (cutting boards; spec §9).** An end-grain part is still refused in by-the-piece Buying.
**Status:** open.

**562. Glue lines on a glued-up panel in the viewport and on the Plans sheet (spec §9).** Needs option B (fu 556) to know the strips
from the document.
**Status:** open.

**563. A Labels-sheet sticker per glue strip (spec §9).** Labels are built from the document, one per part.
**Status:** open.

**564. Glue-ups: no bound on N, and the thickness rule (final whole-branch review, M1; ask first).** `gluePlan` takes the THINNEST
thickness with any long-enough size wider than 1/8", then that thickness's widest. With 3/4" sizes 1-1/2 × 96 and 11-1/4 × 72 and a
1-1/2 × 11-1/4 × 96, a 3/4 × 22 × 80 top is 16 strips of 1×2 where two planed strips of the thick board would do; a 1/4" bead size in
the list makes it 176. A stored stock width just over 1/8" (only through stored shop JSON) would build thousands of strips and stall
the cut list. Both follow the approved spec (§4 step 2, §10 call 4: uncapped); a bound (skip a thickness whose N exceeds some limit, or
prefer the thickness needing fewest strips) is the user's call.
**Status:** open (ask first).
**Status:** closed 2026-10-29 — the user's ruling "cap the strip count, fewest strips wins": `GLUE_MAX_STRIPS = 24` (the count stops
there, so the stall cannot happen), the thickness needing the fewest strips wins, a tie goes to the thinner; over the cap the part reads
`too wide, and it would take more than 24 strips to glue up`. Spec §4 amended.

**565. Glue-ups: an id containing `#glue:` is trusted (final review, M2).** `CutList`'s layout numbers map any placed id with the tag to
the part before it, even an id that has its own row; and a stored part `a#glue:1` would share an id with glued `a`'s first strip in the
packer's `byId`. Reachable only with hand-crafted ids (`#` is not re-minted, inv 33). Cheap half: skip an id `rowNumbers` already has.
**Status:** open (record-only).

**566. Glue-ups: two tests narrower than they read (final review, M3, M6).** The anti-goal guard checks lines, notes, unplaceable,
layout ids and the total, not cost or positions (the identity hashes carry the rest); the swap-down test's A is priced, so the price
search alone would find the $12 board.
**Status:** open (record-only).

**567. Glue-ups: the note names the across-grain width (final review, M5).** A part grained across its width (3/4 × 30 × 8, grain
`width`) reads `… — no pine stock is 8" wide`, correct but odd beside its `30"`.
**Status:** open (record-only).

**568. Cam-and-bolt (fu 330's chunk 2; feature-sized, needs its own spec).** A cam bore in a panel's face meeting a bolt bore from its edge,
and the dowel or bolt bore in the mating part: a `meets-hole` exemption for a recognised pair (perpendicular, the edge bore's axis through the
face bore), its own preset and bench line, and possibly hardware counted from it (fu 404). Counterbores spec §12.
**Status:** open (feature; needs a spec).

**569. A head on a TILTED row (pocket screws; feature-sized, ask first).** Adding a head to a tilted row and tilting a headed row are refused
both ways (counterbores spec §3.3): a head there needs elliptical head rings, a stepped capsule for `meets-hole` and a tilted cone, so every
tilted branch doubles. A pocket screw is a counterbore at about 15 degrees.
**Status:** open (feature; ask first).

**570. The exploded iso keeps only a headed hole's mouth rim (build ruling, Task 6; cost if wrong: small).** `holeDrawing`'s `visibleOnly`
(the exploded isometric) has no hidden-line pass, and a clean headless hole already omits its walls and bottom there, so a clean headed hole keeps
only its mouth rim: a counterbore reads like a plain hole of radius R. Spec §8 says visibility comes from the one hidden-line pass; this follows
the existing clean-hole rule instead. Adding the step rims needs a visibility test the exploded iso does not have.
**Status:** open (by decision; unapproved build ruling, see the spec's *Amended (build)* block).

**571. AI authoring a head (feature-sized; a `DESIGN_SCHEMA` change, one live compile, fu 322; ask first).** Generate and Refine do not carry a
head: Refine keeps a headed part exactly and its assembly whole (inv 56), so Refine cannot change a headed part, and Generate cannot make one.
Authoring through `holeWorld.ts` would be the route (the ONE converter, inv 50).
**Status:** open (feature; ask first).

**572. A head at a through bore's exit (counterboring from both faces).** One head, at the mouth only; a through bore with a head at each end
is a second head on the row (or a second row) and a `meets-hole` rule for same-axis rows. Counterbores spec non-goals.
**Status:** open (feature; needs a spec).

**573. Plugs as parts.** A counterbore sized for a plug has no plug part and no plug line on the cut list. Counterbores spec non-goals.
**Status:** open (feature; needs a spec).

**574. Oblique cone silhouettes (Task 6 minor).** In the isometric a countersink's silhouette joins the ends of the two mouth and junction
ellipses' major axes, not the true tangents; exact in the entry and side views. Wants the closed form for two coaxial circles' oblique tangents.
**Status:** open (record-only; cosmetic, iso only).

**575. No faulted headed perf case (Task 4 minor; final review to triage).** Spec §6.1 names a faulted headed row at 100 ms; `holesPerf.test.ts`
has headed cases for healthy rows only, so the faulted (clipped) path of a headed part has no wall-clock guard. A faulted-gate "whole holes" mutant also survives (Task 4 review): a faulted head breaking out into a plane that a clean hole opens
into, where the bore does not reach, has no fixture. Add one or keep this as the recorded gap.
**Status:** open (record-only).
**Status:** closed 2026-10-29 (whole-branch review fix wave): `holesPerf.test.ts` times two faulted headed rows of 21 crossing a dado (minimum of 9, at most 100 ms), and `curvesWatertight.test.ts` has the faulted-head-into-a-clean-plane fixture (a head from the width face breaking out through the top, its bore short of it); the "whole holes" mutant fails it.

**576. Counterbores: the build's deferred minors.** Task 1: `validateHoleRows` builds a row twice (the `headProblem` probe and the push), the
v30 comment in `document.ts` is one long line. Task 2: `frustumPrismOf` duplicates `prismOf`'s caps and box block, `piecesOf` assumes headed
implies square (no assert), `headedRegion` recomputes the pieces' boxes per call. Task 3: `meets()` rebuilds envelopes per pair. Task 4:
`cuttingPieces` allocates per face; the too-deep through-counterbore test does not assert the exit face. Task 6: `PartDiagram` infers the
mouth side by float equality (a faulted head-outruns-part draws the mouth at the min end; carry it explicitly), no positional test of
`mouthMin`, the through branch is untested, `visibleOnly` is tested on blind rows only. Task 7: `holeHeadText` of a malformed head prints
garbage (unreachable: the loader drops it). Task 8: `seatedIn`/`isSocketOf` comments do not enumerate the head condition, `holes.test.ts:150`
is a `toBeDefined` no-op, `HEAD_MALFORMED` is missing from the copy test, preset order is untested, the preset bodies duplicate the bore rule,
`DimensionField` gets `?? null` on Head dia/depth, the countersink note reads `Depth ...`. Task 9: `CornerKind` is `string`, `headJoinChanged`
sits in `leanKeep.ts`, a plain part in a heads-only assembly's (c) branch is untested, stale comments at `leanKeep.ts:333` and `run.ts:376`,
`changedBoxJointed` does not compare holes (sound today).
**Status:** open (record-only).
**Status:** 2026-10-29 (whole-branch review fix wave): the Task 6 items are closed — `DiagramHoleSide.head.mouth` carries the mouth side from `dir` (no float-equality inference), a head that outruns a through bore draws no bore walls, and a positional test pins the head's walls blind and through from both faces. Residue: every other minor listed above stays open (record-only).

**577. Counterbores: two residues the whole-branch review's fix wave left (2026-10-29).** (1) `holeRims` (holes.ts) still draws the HEAD
piece's far ring at its stored reach, so a through counterbore whose `headDepth` exceeds the part's face dimension (legal, `too-deep`, kept
and noted) draws one radius-R ring in air past the exit face (inv 16); the mesh, section and drawings already clip or skip there. Clamp the
head's far ring to the hole's depth and test that every rim point lies within the stock. Faulted parts only. (2) `PartDiagram.tsx`'s skip of
zero-length bore walls (a head that outruns a through bore) has no line-count test, so the guard could regress unnoticed (cosmetic).
**Status:** open (record-only).

**578. Construction lines: oblique lines (feature-sized).** Only the three world axes. A line along a leaning leg or between two arbitrary points needs a direction stored on the guide, a general crossing test (skew lines do not meet), and `pickOnLine` without the axis shortcut. Construction-lines spec non-goals.
**Status:** open (feature; ask first).

**579. Construction lines: a line at a typed offset in one gesture.** Today it takes two steps: place a guide point at the offset, then anchor on it and place the line. Construction-lines spec non-goals.
**Status:** open (feature; ask first).

**580. Construction lines: moving or editing a line.** Delete it and place it again, as fu 130 rules for guide points. Construction-lines spec non-goals.
**Status:** open (feature; ask first).

**581. Construction lines: a line meeting a part's face as a snap point.** Line-meets-face is not offered; only line-line crossings are (`lineCrossings`). Construction-lines spec non-goals.
**Status:** open (feature; ask first).

**582. Construction lines: lines on the Plans sheet.** Lines appear in the viewport only, not on Plans, the part diagrams, the cut list or the labels. Construction-lines spec non-goals.
**Status:** open (feature; ask first).
