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

**5. ~~`migrateDocument` does not reject `version < 1` or fractional versions.~~
CLOSED — folded into the v2 schema work, since it sits inside the version gate that
work was already editing.** The gate now rejects `version < 1` and non-integer
versions with a clear `DocumentError` before any migration step runs.

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

**32. ~~`grainTexture`'s `hash()` and `seededRandom()` are pure, DOM-free functions that
could have had cheap unit tests without a canvas.~~ CLOSED in v3.** Both moved to
`src/viewport/grainLog.ts` — the module `grainTexture.ts` now imports them from — and
are unit-tested there alongside the rest of the log maths.

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

**34. The grain constants (streak counts, alpha ranges, tile sizes) have not been
tuned on real hardware.** They were chosen and screenshotted on this host's software GL
(llvmpipe, no GPU) — see 26a on why that is not sufficient by itself for anything visual
— so the aesthetic judgement (does it read as wood at actual viewing distance, is the
end-grain ring density right) is still open pending a check on real hardware.

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

**37. `Math.abs(k) % half` in `grainTexture.ts`'s `woodCut` maps `k = 0` to the same
seed bucket as the two edge bands (`k = -half` and `k = +half`), a three-way
collision where a pair was intended.** The centre band ends up sharing its width,
alpha and harmonics with both edge bands instead of getting its own. No effect on the
seam invariant (14) — the edge bands still match each other, which is all that
property requires — and the centre band is spatially far from the edges, so it reads
as cosmetic. A distinct seed for `k === 0` is the fix, worth doing the next time this
file is touched.

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

**39. The grain constants introduced or changed in v3 (wobble amplitude, the face
v-tile size, band width/alpha ranges) have not been judged on real hardware.** Same
caveat as follow-up 34, now covering the ring maths too — chosen and screenshotted on
this host's software GL (llvmpipe, no GPU; see 26a). The final aesthetic call — does
it read as wood at actual viewing distance — is the user's, on real hardware.

**40. `DIMENSION_ORDER` in `src/document/geometry.ts` is exported mutable** (not
`readonly` or `as const`), though it is now the single source every board's geometry
flows through — `axisDimensions`, `boardExtents`, and `grainTiling.ts`'s `ranks` all
read it. Nothing in the codebase mutates it today; the risk is purely that nothing
stops a future caller from doing so.

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

**42. The `FIT` scale argument on large end faces is calibrated for a ~5-1/2in end,
and degrades linearly with face size.** `grainTiling.ts`'s `FIT` puts exactly one ring
pattern across an end face whatever its size — right for a typical ~5-1/2in end
(~0.27in per ring, plausible softwood spacing), but on an end-grain cutting board's
broad face (18 × 12) the same one-ring-set stretches to roughly 0.9in per ring, which
reads as coarse. The alternative is worse: concentric rings cannot tile without a hard
discontinuity mid-face, so `FIT` stays — this is recording the calibration, not
proposing a fix. Revisit if end-grain cutting-board-scale parts become common.

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

**49. `boardSolids` returning `[]` is reachable through two individually-legal cuts.**
`validateCuts`'s full-removal guard is per-cut, so two cuts that each leave stock but
jointly remove everything (`offset 0, width 12, depth 3/4` plus `offset 12, width 12,
depth 3/4` on a 24" board) both survive load. This is the same end state as 48 by a
different route, and the same placeholder fix would cover it. Documented and tested in
`cuts.ts` as correct behaviour rather than left to be discovered.

**50. The merge in `boardSolids` is not proven maximal.** `mergeAlong` runs once per
axis in `DIMENSION_ORDER`, which is deterministic and always correct — every merge
unions two abutting boxes with identical other-spans, so disjointness and total coverage
are preserved — but it is not proven to produce the fewest possible solids. A residual
missed merge costs draw calls, never correctness, and edge lines come from the grid
(invariant 16) so it cannot show up as a visible seam either. Left alone deliberately;
if it is ever revisited, the thing to measure is solid count on a realistic multi-cut
part, not the algorithm's elegance.

**51. Cut ids share the `b_` prefix with board ids.** `addCut` mints ids with the same
`nextId()` counter the boards use, which is what guarantees uniqueness within a board
and matches how `validateCuts` re-mints on load. The prefix is now just cosmetically
misleading. Grepped when it was introduced: nothing depends on the prefix.

**52. `DimensionField`'s new `min`/`max` props have no direct unit tests.** They are
exercised indirectly through the Cuts panel tests (offset 0 must be accepted, depth past
the board must be refused), but `DimensionField.test.tsx` itself does not cover them —
including the specific reason `min` exists rather than reusing `allowNegative`, which is
that `min={0}` must still refuse a negative. This is the "correct but untested" shape
that the top of this file warns about.

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

**57. The overlay scrim is a hardcoded colour, not a token.** `.cutlist-overlay` uses
`rgba(12, 14, 16, 0.72)` directly because `:root` defines no scrim or alpha-surface
custom property — there has never been a second overlay to justify one. The print
block's `#fff`/`#ccc`/`#999` are deliberately outside the token system (ink on paper is
not the screen palette) and should stay that way; the scrim is the one value that
*should* be a token the moment a second overlay exists. Brief-origin, kept verbatim,
recorded rather than quietly changed.

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

**73. `hasFar`, `DiagramCut.side`, and the far-side dash were retired one round after
being added — not a regression.** The dashed leader line and the near/far hatch
distinction were added in the label layout round as the replacement encoding for
near/far after depth moved off the outline. Splitting diagram views on `from` (follow-up
72's fix) means every view now shows exactly one side of one face, so there is nothing
left for a second encoding to distinguish within a single drawing — the near/far
question is answered by which figure you're looking at, not by a mark inside it. A
reviewer checking this round should confirm the fields and the dash are **gone**, not
that they survived; their removal is the point, not an oversight.

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

**77. Sheet length rises with view count — real but mild, confirming design §10.** The
twelve-cut worst case (follow-up 72's board) now draws **2 figures at 1122px** combined,
against roughly **299px** for a simple cut-free part. A ten-part sheet carrying a mix of
plain and heavily-joined parts measured at **4654px total**. Long, but not impractical —
scrolling a sheet, not paginating past a reasonable print length. Design §10 flagged
view count as a risk worth a browser look before calling the round done; this is that
look, and the risk is confirmed real but mild rather than disproved or escalated.

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

**79. Print-to-PDF is still not verified on this host.** Carried forward again, not
re-promised: the Playwright MCP available here exposes no `pdf()` call, so no PDF was
produced or inspected for the rotated leader columns, the depth field's fills, or the
crossing legend. This is the same tooling limitation recorded at follow-up 70
(the label layout round) and it applies unchanged to this round's renderer changes.

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

**99. Cut shoulders are not snap points.** A dado's shoulders are real corners a
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

**101. No axis inference and no axis locking**, because there is no free movement to
constrain. SketchUp constrains a move to the red/green/blue axis when the drag runs
near one and locks it with an arrow key; both exist to make an otherwise-unconstrained
drag land somewhere predictable. Here the landing position is a point the user clicked,
so there is nothing for a constraint to add. This entry is recorded rather than left
unsaid because "SketchUp has axis locking and this doesn't" reads as a missing feature
until you notice it is downstream of 100 — it becomes worth building the moment free
movement does, and not before.

**102. No ghost preview of the landing position.** Rejected with the user rather than
skipped: with snap-targets-only, the result is fully determined by the marker already
sitting under the cursor, so a preview would restate information the screen is already
showing. It also costs a second render of the board's geometry — the same meshes, the
same `boardUVs` work, at a second transform — for a frame that is discarded on every
pointer move. If 100 ever lands, this one lands with it: a free move genuinely is not
legible without a preview, which is why the two are recorded as one decision made
twice rather than as two independent deferrals.

**103. Single-board moves only.** The store holds one `selectedId`, and the grab holds
one `SnapPoint` whose `owner` names one board. Moving several parts at once is a
selection-model change — a set of ids, a rule for what the parts list shows, a rule for
what the Properties panel shows when two parts disagree — not a tool change.
`commitSnapMove` would need almost nothing new (it already applies a delta rather than
an absolute position, so it would loop), which is precisely why this is filed as
depending on selection rather than on the tool.

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
