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

**15. `dampingFactor = 0.3` has not had a hands-on check.** "Motion during a drag is
still smooth" was reasoned analytically — `dampingFactor` doubles as the per-frame
follow fraction during an active drag, so lag goes from roughly 130ms at 0.12 to 46ms
at 0.3, both under the ~100ms perceptible threshold — but no human has actually
orbited with it. Screenshots cannot capture feel. If an orbit reads as twitchy,
`dampingFactor` is the first value to reconsider.

**16. Neither `dampingFactor = 0.3` nor `fadeDistance = 150` was swept to a minimum.**
Each is sufficient, not proven minimal; intermediate values (0.2/0.25, and 130/140)
were not tried.

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
default-camera tweak would fix it.

**22. `uniqueName`'s next-free-number search is unbounded.** Fine at board-list sizes;
worth a note if it is ever called on unbounded input.

## Deliberately out of scope, not defects

Joinery (dados/rabbets) is v2. Cut list, board-feet, and sheet-goods layout are v3.
Multi-select, free-angle rotation, curves, and accounts are unscheduled. The parametric
board model exists specifically to make the first two cheap — see
`docs/superpowers/specs/2026-07-29-sloyd-v1-design.md` for why that beats a mesh kernel.
