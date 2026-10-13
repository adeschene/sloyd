# Browser verification — standard views and image export

**Date:** 2026-10-13 · **Branch:** `standard-views` · **Where:** the dev server (`localhost:5199`), driven through the
Playwright MCP at 1440×900 (and 1024×768), WebGL on llvmpipe (software GL, fu 26a).
**Spec:** `docs/superpowers/specs/2026-10-13-sloyd-standard-views-image-design.md`.

Screenshots and the saved PNGs are in the git-ignored SDD workspace
(`.superpowers/sdd/2026-10-13-sloyd-standard-views-image/`) and will not survive a `git clean -fdx`; this text, with
its measured values, is the record.

## Fixture

Imported as a new project "SV check": an oak base 30 × 20 × ¾ at the origin; a walnut 3in cube "Back-right post" at
(27, ¾, 0); a cherry 2 × 2 × 6 "Front-left marker" at (0, ¾, 18) (front = +Z); and an assembly "Pair" (two pine 3in
cubes A, C) at (10, ¾, 8). Chiral by construction: each view puts the marker and the post somewhere different.

## Results

| Check | Seen |
|---|---|
| Front, Perspective and Orthographic | marker left, post right, looking along −Z — the sheet's `FRONT` |
| Side | marker (front) LEFT, post right: screen right is −Z, as `SIDE` |
| Top | front edge at the bottom: marker bottom-left, post top-right, as `TOP` (up = −Z) |
| Iso | from front-right-above, the front-right corner nearest; as `ISO` |
| Top, then a real 20 px mouse drag | the view turned by a few degrees about the vertical; no spin, front still at the bottom |
| fu 260, explode 100% | before: the camera still on the assembled framing, post and marker out of frame. Home: every exploded part in frame. Front: likewise. F with Pair selected: frames A and C at their exploded (lifted) positions |
| Save image with A selected, Pair open, Tape anchored on the base's corner | `SV-check.png`, 2120 × 1694 (the 1060 × 847 canvas at dpr 2), alpha 255 everywhere. No selection tint (A and C drawn alike), no fading (every part full colour), no tape marker; grid and origin axes present (both toggled on) |
| …and afterwards | readout still "Type a distance, Enter to place" (anchor held), A still selected, Pair still open (`aria-current`), no alert, button enabled |
| Double-click Save image | one download |
| Save image at explode 100% | the PNG shows the exploded parts; the slider still reads 100% afterwards |
| Empty project | `Untitled.png` of the empty scene; Front/Side/Top/Iso do nothing and log nothing |
| 1024 × 768 | the View group wraps to three rows, right-aligned, its left edge at 208 px; the Tools group ends at 183 px — no overlap. The `220px` allowance holds |
| Console | no errors; only the pre-existing three.js `PCFSoftShadowMap` / `THREE.Clock` deprecation warnings |

A harness artifact, not a defect: the first fu 260 attempt pressed Home while the Explode slider had focus, and a
focused range input takes Home as "go to minimum" (CameraKeys rightly ignores keys aimed at inputs). Re-run with the
slider blurred, as above.

## After the final review (the gizmo patch)

The whole-branch review found that the clean frame unmounts Gizmo's `<TransformControls>` child, that drei builds a
fresh controls instance on remount, and that `stabilizeTranslateGizmo` (the fu 29 size ceiling, the hidden 'bwd'
handles, the flip fix) was re-installed only on a selection or camera change. Checked live with temporary
instrumentation (removed before commit) that tested whether the gizmo's `updateMatrixWorld` was the patched function:
**before the fix**, patched → Save image → unpatched → re-select → patched (RED). **After** adding `hidden` to the patch
effect's dependencies, three saves in a row each gave a fresh instance, unpatched for the first frame or two (the
download fires before React commits the remount) and patched by 300 ms, and it stayed patched (GREEN). One more save
with the Capture-cleanup and file-name fixes in place: the download arrived, no alert, gizmo patched. Dev profile
cleaned again (the check's project deleted; 16 projects, "Live links — legs" active).

## For the user's eye

- **The View group wraps even at 1440 px** (Save image on a second row; three rows at 1024). It works and overlaps
  nothing, but it is a judgement on looks.
- **One saved PNG on real hardware** (fu 26a): the capture reads what the GPU drew, and only software GL was seen here.

## Cleanup

The dev origin `:5199` held the user's 16 projects and the stored key before the check (not a fresh origin, contrary
to the plan's assumption). Only the two projects this check created ("SV check", "Untitled") were deleted, through the
project menu; the active project was switched back to "Live links — legs". Read back afterwards: the same 16
`sloyd.project.*` keys, `sloyd.library.v1`, `sloyd.autosave.v1` and `sloyd.llm.v1` (presence only), nothing else.
