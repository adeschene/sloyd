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

**59. Depth labels collide when two cuts sit close together on one view — open,
unsolved on purpose.** Spec §5 records this as a known gap and names the fix: move the
depth label into the leader row instead of hanging it off the outline. Reproduced in
the browser with two near-side dados 3/4" apart on a 24" × 24" panel — both say
`3/8" deep`, both centre on their own band, and at that spacing the two strings
overlap into unreadable text. The same shape showed up unprompted on a board with one
cut offset only 3/16" from the edge: the depth label collided with the leader row's own
offset/width labels underneath it, which is a second instance of the identical root
cause (labels placed by band centre, with no collision awareness of any other text on
the page) rather than a second bug. Left open because the fix is a real layout change
(the leader row already carries offset and width per cut; adding depth is mechanical
but touches `ROW`'s height and the leader loop in `PartDiagram.tsx`), not something to
improvise mid-verification-pass.

**A third instance of the same root cause, found in the final review pass: bands and
labels can bleed past the outline at the extremes.** A cut at `offset: 0` narrower
than `MIN_FEATURE` gets `x = centre − 3`, left of the board's edge (`fit.offsetX`);
its depth label extends further still. `overflow: visible` keeps it drawn rather than
clipped, so it is visible, not hidden-but-wrong. This is not a fourth bug — it is
labels placed by band centre with no awareness of the outline's own boundary, which
is the identical shape the two collisions above already describe — so it is folded
into this entry rather than opened separately. Left unfixed for the same reason: the
fix is the same real layout change already deferred here.

**59a. Pagination outcome, recorded.** Spec §7 named "does a drawn row survive a
printed page break" as a browser-verification item; it was checked (task 6's check 9)
but the outcome had gone unrecorded here. Checked against a real PDF, backgrounds
suppressed: the page break landed cleanly between two rows — the 24"×24" panel's row
and the following `24" × 5-1/2"` board's row — with no drawn diagram split across the
boundary and no row's text separated from its own figure. **PASS**, confirming
`break-inside: avoid` holds on both `.cutlist-row` and `.cutlist-diagram`.

**60. `MAX_ASPECT` (8) and `MAX_HEIGHT` (420) are browser-settled, not test-settled.**
The unit tests pin `fitView`'s *behaviour* — that a sliver clamps, that a tall drawing
shrinks uniformly and centres — but nothing in the suite asserts that the result is
*readable*, because readability is a browser judgement, not a computable property. This
pass exercised both extremes named in the plan: a 96" × 3-1/2" rail (drawn aspect ≈
7.9:1 against the 8:1 floor, dado clearly visible) and a 24" × 24" panel (drawn as a
centred square, not squashed, against the 420-unit ceiling). Both read as legible at
the sizes checked; neither constant was changed. That is a judgement call recorded
here, not a proof — a future part with more extreme proportions, or a screen/print size
this pass did not check, could still call the same constants into question, and they
stay named exports in `diagramScale.ts` for exactly that reason.

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

**62. `band()` has no ordering guard on its `Span` argument — latent, not live.** A
`Span` with `[max, min]` instead of `[min, max]` would produce a negative `width`,
which the `width < MIN_FEATURE` branch would then silently re-centre as if it were a
legitimate narrow cut, drawing a plausible-looking band in the wrong place with no
error. Every current producer of a `Span` reaching `band()` is `cutRegion`, which
always emits min-then-max, so this is unreachable today rather than deferred-and-risky.
Recorded because `band()` is a small pure function a future caller could reach with a
hand-built `Span` without reading `cutRegion`'s contract first.

**63. `DiagramCut.v`, `DiagramCut.kind`, and now `DiagramFit.sy` are carried but
unused by their only consumer.** `v` is redundant by construction — every band in the
current layout spans the view's full height, so nothing consumes the explicit span —
and `kind` (`'dado' | 'rabbet'`, from `cutLabel`) is computed and attached but never
read by the renderer. `PartDiagram` uses `drawnV` and `sx` (via `band`); `sy` is
exported and tested but never read there either — it is the third member of the same
family. Not dead weight in the sense of being pointless: `DiagramView`/`DiagramCut`
are `diagram.ts`'s own exported shape and `DiagramFit` is `diagramScale.ts`'s, all
tested directly and independently of `PartDiagram`, and a future caller (or a future
renderer variant) reading `kind` to label a band "dado" vs "rabbet" directly, or `sy`
to document/assert non-uniform scaling, is a plausible next use rather than a
hypothetical one. Left as is — trimming any of the three would save nothing
`PartDiagram` currently needs and would narrow a tested, documented shape for no
behavioural gain.

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
