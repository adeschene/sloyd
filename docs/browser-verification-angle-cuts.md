# Browser verification — angle cuts, chunk 1 (tapers) (2026-10-12)

Dev server only (the deployment rule): `npm run dev -- --port 5180` on branch `angle-cuts` at `79d33c5`, driven through
the Playwright MCP. Software GL (llvmpipe), so shading and grain on sloped faces are **not** judged here (26a).
The origin already held two of the owner's projects (`Untitled`, `Drawer check`). The check created one project,
`angle-cuts check`, through the project menu and deleted it the same way at the end.

## Fixture

`Leg`: 28 × 1-3/4 × 1-3/4 pine, upright, with **+ Add taper**. Later a stopped groove (a mortise-shaped pocket, 2" × 1" ×
7/8" deep, 24"–26" from the min end) near the untapered end. `Leg (1)` is its duplicate in a reversed pose (On edge, Turn
180°). `Leg` was grouped (`Assembly 1`) and copied with **More ▾ → Copy mirrored** (`Assembly 1 (1)`, ⇋, shared ×2).

## Checked

| Check | Result |
|---|---|
| + Add taper (step 2) | Row `Taper 7/16" off the width face (min side), from 21" from the length min end to that end`; fields `Width face — min side`, `Length min end`, Starts `21"`, Removes `7/16"` |
| 3D view of the taper | The slope runs from the 21" line to the foot on one face, with an edge line at its start and none across the neighbouring faces; no seam visible on the untouched faces (`docs/img/angle-cuts-taper-viewport.png`) |
| Edits (step 3) | Thickness face — max side, Length max end, Starts 22, Removes 5/8 → `Taper 5/8" off the thickness face (max side), from 22" from the length max end to that end` |
| Undo × 4 | Each undo reverted exactly one field, in reverse order: Removes → Starts → From → Face, back to the step-2 row. Each edit made one undo entry |
| Cut list (step 4) | Two setup lines, the taper **after** the pocket line: `1" blind groove, 7/8" deep — … stopped 24" short of the min end and 2" short of the max end` then `Taper 7/16" off the width face (min side), …` |
| Part diagram | `Thickness face — min side` view: a hatched wedge from the foot to about 21", with the taper note under the view (`docs/img/angle-cuts-diagram.png`) |
| Reversed pose (`Leg (1)`, On edge + Turn 180°) | Row unchanged (`… width face (min side) … length min end`). The slope is on the **bottom** face at the end **opposite** the mortise (the min end, which Turn 180° puts at +X), with an edge line where it starts and no seam (`docs/img/angle-cuts-reversed-pose.png`, from below) |
| Mirrored copy (step 5) | The copy's taper is on the opposite outer face. Original slopes on −X, copy on +X, so the pair narrows symmetrically (`docs/img/angle-cuts-mirrored.png`). The copy's row reads `… width face (max side) …` |
| Copy follows | Original Removes → 3/4: original `Taper 3/4" off the width face (min side) …`, copy `Taper 3/4" off the width face (max side) …`; both slopes deepen in the view |
| Flat ↔ upright on the ORIGINAL | Upright → Flat: original keeps `width face (min side), … length min end`; the mirrored copy reads `width face (min side), … length max end`. In flat, the mirror plane runs across the length, so the end flips, not the side. Undo restored both rows and Upright exactly |
| Flat ↔ upright on the MIRRORED copy (df2ce47's path) | The copy (the edited occurrence) **keeps** `width face (max side), … length min end` as seen before the switch. The original becomes `width face (max side), … length max end`, because the stored cut is re-reflected. Undo restored both rows exactly |
| Plans (step 5) | Piece elevations: the front view shows both legs tapering outward as a mirrored pair and `Leg (1)`'s bottom slope at its min end. The plan and side views draw the hidden taper-start line and the hidden pocket dashed (`plan-hidden` paths). Assembly figure: the front view shows the taper; the side view has the dashed pocket and the dashed taper start (`docs/img/angle-cuts-plans-piece.png`, `docs/img/angle-cuts-plans-assembly.png`) |
| Exploded (step 6) | At Explode 25%: `fieldset.edit-lock` disabled and it contains the Angles section. Remove (✕), Face, From, Starts, Removes and + Add taper all `:disabled`. Slider back to 0 → lock released, Select pressed |
| Add joinery (step 7) | `Add joinery doesn't handle angled parts yet (Leg (1), Assembly 1 › Leg, Assembly 1 (1) › Leg). Add joinery before tapering, or remove the angles first.` No estimate. Run button: see Findings 3 |
| Refine | `Refine doesn't handle angled parts yet (Leg (1), Assembly 1 › Leg, Assembly 1 (1) › Leg). Refine before tapering, or remove the angles first.` |
| Tape snap at the foot (step 8) | Hovering the tapered feet of the mirrored pair: markers sit on the drawn foot corners (the original's outer corner, the shared edge's midpoint, the copy's outer corners). The control is a plain corner of `Leg (1)` (`docs/img/angle-cuts-tape-foot.png`). Markers appear only after a stepped pointer move followed by a second small move; that is a harness effect (a single synthetic jump showed nothing even on plain corners) |
| Removes 0 | Refused with `Must be greater than zero`; Escape/blur restored `3/4"` (refuses, never writes) |
| Console | No errors. Only the existing Three.js deprecations (`PCFSoftShadowMap`, `THREE.Clock`) |

## Findings

1. **Step 9's expectation is not reachable from the UI (brief defect, not a code bug).** Shortening the tapered leg to
   4" does **not** produce "This taper removes nothing at this size." The line is stored from its own end (stations
   from `alongFrom`, spec §2.2), so the end still loses the full amount and a short part keeps a full-length wedge.
   - Readout at 4": `Taper off the width face (min side): 3/4" at the length min end, 5/8" at the length max end`;
     fields stay `21"` / `3/4"`.
   - The cut list prints the same general line for both 4" legs.
   - The same happens with From = Length max end: `3/4" at the length max end, 5/8" at the length min end`.
   - Removes = 0 is refused, so a UI-made taper always removes something at its end. The note is reachable only from
     a hand-edited file (as `AngleCuts.test.tsx` does with `[[0, 0], [5, -1]]`).
   - Both 4" states were undone back to 28" and the stored row.
   - Open question for the spec: should the long-start case (Starts 21" on a 4" part) read in the general form, as it
     does now, or as something shorter?
2. **Part diagrams draw the wedge in one view only.** The taper on the width face (min side) is hatched in the
   `Thickness face — min side` view, but the `Thickness face — max side` view (which also shows the slope's profile)
   draws a full rectangle with no wedge and no note. `buildDiagrams` puts the wedge only in `ensure(throughOf(c), 'min')`.
   Spec §4.3 says "in each face view where a slope shows as a line", so this is a spec-vs-code question for the
   controller, not changed here.
3. **Add joinery / Refine with a key not exercised.** This browser profile has no API key, so both dialogs show "Set up
   your API key" in place of the run button. The refusal text shows, with no estimate. Whether the run button is
   *disabled* with a key present was not seen live.
4. Observed, not this round:
   - With an assembly part selected, a click on empty floor selected the enclosing assembly rather than clearing
     (assembly selection, inv 46).
   - The cut list's Buying section reports 1-3/4" pine as `fits no pine stock — too thick` (lumber round's stock
     table).
   - The blind groove row shows "The cut list reads this cut as running across the length" (cut-word note).
   - Deleting the project re-activated `Drawer check`, whose index `savedAt` was refreshed on adoption; its content
     was not edited.

## Cleanup

`angle-cuts check` was deleted through the project menu (Delete → Delete?). The library index read back afterward holds
only `Untitled` (`b_mux5h2nw_1`) and `Drawer check` (`b_mux5jd03_2`). `localStorage` keys are exactly the four present
before the check (`sloyd.project.b_mux5h2nw_1`, `sloyd.library.v1`, `sloyd.autosave.v1`, `sloyd.project.b_mux5jd03_2`).
Read, not cleared. The dev server on 5180 was stopped.

## Not verified — needs the user on real hardware

- **Shading and grain on sloped faces** (software GL hides shader behaviour, 26a). The slope faces render, but whether
  their lighting and grain figure read right can only be judged on a real GPU.
- Z-fighting between overlapping parts (seen when both legs went flat on top of each other) was not judged; it is a
  property of overlapping geometry, not of tapers.
- A real print-to-PDF of the diagram and the Plans sheet (fu 70/79/84).

## Re-check after the final fix wave

Dev server on 5181 (software GL, llvmpipe), Playwright MCP, new project `angle-cuts recheck`. After the fix wave in
BoardMesh, MoveTool, TapeTool and the part diagrams (`67d1921`, `df45e9a`).

1. **Taper renders.** Part 28 × 1-3/4 × 1-3/4, Upright, then `+ Add taper`: the Properties card reads "Taper 7/16" off
   the width face (min side), from 21" from the length min end to that end"; the foot of the post narrows
   (`docs/img/angle-cuts-recheck-taper.png`; the thin edge lines are hard to judge at this size on software GL).
   Console: 0 errors, no React warnings. The only warnings are the known environmental ones (`THREE.Clock` deprecated,
   `PCFSoftShadowMap` deprecated, GL "GPU stall due to ReadPixels").
2. **Select drag and resize.** Three gizmo drags along X moved the part (X `13-1/8"` → `15-5/16"` → `12-13/16"` →
   `14-1/8"`); Length 28 → 30 through Properties: the mesh followed and stayed tapered, the taper card kept its values
   (Starts 21", Removes 7/16"). 0 console errors.
3. **Move tool.** Hovering the foot corners shows the snap marker (green dot,
   `docs/img/angle-cuts-recheck-move-foot.png`, two corners). Escape returned to Select (`aria-pressed` Select true,
   Move false).
4. **Tape tool.** `tapeHover` read back from the store (`import('/src/store/store.ts')`) while hovering: the taper's
   foot corners `[14.5625,0,1.75] corner` (14-1/8" plus the 7/16" inset, i.e. the tapered corner, not the box
   corner), `[15.875,0,1.75]`, `[15.875,0,0]`, and the top corner `[15.875,30,0]`. Escape returned to Select.
   **Caveat:** a Playwright screenshot clears the hover (TapeTool clears it on pointer leave), so no screenshot shows
   the Tape marker; the evidence for Tape is the store readout, not an image.
5. **Cut list.** With a dado (`Cut into Face`, `From Far side`: the thickness face, max side) and the taper set to
   "Thickness face — max side", the row reads "3/4" dado, 7/8" deep — into the thickness face (max side) …" and
   "Taper 7/16" off the thickness face (max side) …". Two diagram views: "Width face — min side" shows the hatched
   wedge (`url(#hatchrf)`) and its "Taper …" note under the figure; "Thickness face — max side" shows the dado with
   its dimensions and no wedge or note (a taper on that face is seen in profile, not face-on).
   `docs/img/angle-cuts-recheck-cutlist.png`. Buying still says `fits no pine stock — too thick`, as before.
6. **Undo/redo.** Taper "Removes at that end" 7/16" → 1/4": Undo shows `7/16"`, Redo `1/4"`, Undo again `7/16"`.
7. **Cleanup.** `angle-cuts recheck` deleted through the project menu (Delete → Delete?). The library index afterwards
   holds only the `Untitled` project the fresh 5181 origin created on first load; keys are `sloyd.library.v1`,
   `sloyd.autosave.v1` and that one project key. `localStorage` read, never cleared. Dev server stopped.

**Concerns:** none found in the code paths checked. Tape-marker pixels are not evidenced (above).
