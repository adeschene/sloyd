# Sloyd — X-ray

**Date:** 2026-10-28 · **Status:** approved by the user 2026-10-28; plan `docs/superpowers/plans/2026-10-28-sloyd-xray.md`.

**Origin:** `docs/feature-gaps.md` §2, "X-ray / transparency; saved views". The user picked X-ray on 2026-10-28 (saved views are
NOT part of this round). Choices marked *the user's* were made in the brainstorm; everything else is Claude's call, listed in §8
for checking.

## 1. Intent

*The user's:* to **see joints hidden inside parts** — a round tenon in its socket, tails in their pin sockets, fingers in a box
corner — without cutting a section through the piece.

X-ray draws the **selected part(s) solid and every other part faded**, so the selection's joinery shows through the wood around
it. *The user's:* "the focused part solid, everything else faded", and the existing faded look is the look ("That looks good to
me", after a throwaway spike on the dev server drew non-selected parts with `BoardMesh`'s `faded` styling).

**Goals**

- A view toggle, **X-ray**: while on and something is selected, every part not covered by the selection draws faded.
- *The user's:* turned on and off by **a button and a key** — an `X-ray` button in the view bar next to `Section`, and **R**.
- Walking a piece joint by joint: faded parts stay clickable, so clicking one selects it and makes it the solid one.

**Non-goals**

- Saved views / scenes (the other half of the gap; a separate round).
- A new look: no opacity slider, no new colours, no per-part transparency. The faded look is reused exactly.
- Seeing a part's OWN hidden features (a leg's socket inside the solid leg). Select the mating part instead — the leg then fades
  and the tenon shows inside it. Accepted, seen in the spike.
- Anything on the Plans sheet, the cut list, drawings or labels.

**Anti-goals** (failure even if it works)

- X-ray reaching the document, undo, or autosave; a toggle that moves or edits anything.
- A faded part that can no longer be clicked or snapped to (inv 21's spirit: a part you can see is a part you can click).
- Changing how anything draws with X-ray OFF.

## 2. State

- `xray: boolean` in the store, **view state** like `section` and `explode` (inv 51's shape): never in the document, never
  autosaved, no undo entry. **`setXray(on: boolean)` is its ONE writer.**
- Reset to `false` wherever `section` and `explode` are reset (`replaceDocument`'s reset list, `store.ts` ~1819, and the initial
  state ~1138) — i.e. opening or switching to another project turns it off. Nothing else resets it: undo/redo, selection changes,
  hide/show, explode and section leave it as it is.
- Not refused while exploded or mid-gesture: it writes nothing but itself and moves nothing (inv 47 locks editing; X-ray is not
  editing). Toggling mid-drag only changes what draws.

## 3. Drawing

In `Viewport.tsx`'s `BoardMesh` map, the `faded` prop becomes:

```
assemblyFaded || (xray && selectedSet.size > 0 && !isCovered(board.id, selectedSet))
```

where `assemblyFaded` is today's expression, unchanged (`!clean && openPath !== null && !board.id.startsWith(...)`).

- `isCovered` is the existing selection-coverage test (`selected` uses it), so **selecting an assembly makes all its parts solid**.
- **Nothing selected → nothing fades**, even with X-ray on. Clicking empty space (which clears the selection) is how you get the
  whole model back solid without turning X-ray off.
- **The X-ray term is NOT gated on `clean`**, unlike the assembly fade: Save image's clean frame shows the x-rayed view as it is
  on screen (the selection highlight still drops, as today). (Claude's call — §8.)
- A part faded because it is outside an open assembly stays faded whatever X-ray says (the OR).
- Hidden parts stay hidden (`shown` is already filtered). Section caps on a faded part fade with it — `BoardMesh` already does
  this for `faded`.
- `BoardMesh` is not changed. Everything the faded path already does (no grain map, `FADED_RENDER_ORDER`, depth write, no
  shadow cast, still selectable, still a snap target) comes with it.

**Picking and snapping are unchanged** (*the user's ruling* 2026-10-28, after the builder check): X-ray is a draw change only. A
ray still hits the faded part in front first, so clicking a tenon seen inside a faded leg selects the leg, and Move and Tape snap
to the leg's outside face, not the tenon's shoulder or tip. Letting a solid part win the ray over a faded one in front of it is a
follow-up, recorded when this round ships (§9), not part of it.

**Assemblies keep their click rules** (*the user's ruling* 2026-10-28): a click on a part inside a CLOSED assembly selects the
assembly (`clickTarget`), which, by the coverage rule above, draws all of its parts solid — so to walk the joints inside a grouped
piece, open the assembly first (double-click). Inside an open assembly, clicking empty space closes it and selects it
(`closeAssembly`), so getting everything back solid there takes a second click. Both accepted; X-ray does not touch
`clickPart`/`clickTarget`.

Known, accepted limits of the reused look (seen in the spike, approved as is): a faded part behind another faded part is hidden by
the front one's depth write, not shown through; selecting BOTH parts of a joint draws both solid, so that joint hides again.

## 4. The button

In `ViewportControls.tsx`, an `X-ray` button directly after `Section` (same element shape: `aria-pressed={xray}`, a toggle).
Title: `Fade every part but the selection, to see the joints inside`. Enabled always (including while exploded and with nothing
selected — the state is on, it just has nothing to act on yet).

## 5. The key

**R** toggles X-ray, in `App`'s ONE keydown effect (inv 27), shaped like M and T: after the `modalOpen` guard and the text-entry
guard, modifier chords left alone (`Ctrl+R`/`Cmd+R` reload the page; `Alt+R` likewise passes through), `preventDefault`, then
`setXray(!xray)`. R is free: today's letter keys are M, T, H, F and the tape's X/Y/Z; `canBeginLength` takes only digits, `.`
and `-`, so R never starts a typed tape length.

## 6. Tests

- Store: `setXray` sets the flag; it adds no undo entry (assert `past` unchanged, never a flag of the undo machinery — inv 34's
  rule of thumb); it does not touch the document or trigger autosave; `replaceDocument` resets it to `false`; undo/redo leave it.
- App key: R toggles; Ctrl+R, Meta+R and Alt+R do not; R in a text field does not; R with a modal open does not. Mutate each guard
  and see its test fail.
- ViewportControls: the button reflects and toggles the state (`aria-pressed`).
- The `faded` expression: pull it into a small pure helper (e.g. `viewport/xray.ts`, `fadedFor(...)`) with unit tests — X-ray off is
  exactly today's value; on with an empty selection fades nothing; on with a part selected fades the rest; an assembly selection
  keeps its parts solid; the assembly fade survives X-ray; the X-ray term survives `clean`. The viewport rendering itself is verified
  in the user's Chrome (no r3f unit tests by design).

## 7. Verification (dev server, the user's Chrome)

On a project with a stool (round tenons) and a dovetailed and a box-jointed box (and one of them grouped, opened before walking
its joints): select a stretcher and see its tenons inside the
legs; select a box side and see the mating sockets/fingers; click a faded part and it becomes the solid one; press R and the
button; empty selection; exploded; with the section cut; Save image with X-ray on; open another project and X-ray is off.

## 8. Claude's calls (for the user to check)

1. Nothing selected → nothing fades (rather than everything fading).
2. An assembly selection keeps all its parts solid.
3. The assembly fade wins over X-ray (a part outside an open assembly stays faded).
4. Save image keeps the x-rayed look (the X-ray term ignores `clean`).
5. Reset only on opening/switching projects; enabled while exploded and mid-gesture.
6. The button's label `X-ray` and its title text.
7. No changes to the faded look itself.

## 9. Follow-up to record when this ships

- Picking and snapping through a faded part: under X-ray, a solid (selected) part behind a faded one wins the ray for clicks and
  for Move/Tape snap probes, so a revealed joint can be clicked and measured. Ask first; touches `BoardMesh`'s raycast and the
  snap probes, and needs §1's anti-goal reworded (a faded part must stay clickable where nothing solid is behind it).
