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
would restore one responsibility per file.

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

**26. The bounded 20ft floor has a visible hard edge.** Deliberate — an infinite grid
piles into an unreadable haze at the horizon, which is what the old distance fade was
really hiding — but it does mean zooming far out shows the floor ending in space rather
than continuing. If that reads badly, the options are a larger extent (at the aliasing
cost measured above) or fading only the outermost ring, which reintroduces a softer
version of what was just removed.

**27. Nothing pins the `e.delta` click guard.** `BoardMesh` ignores clicks that travelled
more than 2px, which is what stops a gizmo drag or a camera orbit from selecting whatever
it happened to end over. Verified by driving the real app, but the r3f viewport has no
unit tests by design, so a refactor could drop the guard silently. The guard's value is
`CLICK_DRAG_SLOP_PX` in `src/viewport/BoardMesh.tsx`.

**28. The gizmo's hover highlight is too close to the board's selection colour.**
Reported and consciously skipped as a nit: three-stdlib highlights a hovered axis in
`0xffff00` while a selected board is brass `#c99a4e`, both warm yellows, so it is not
obvious which axis a click will grab. The gizmo materials are already reachable from the
patch in `Gizmo.tsx`, so recolouring the hover state is cheap when it becomes annoying.
