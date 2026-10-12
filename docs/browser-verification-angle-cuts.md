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

## Chunk 2: miters (2026-10-12)

Dev server only: `npm run dev -- --port 5182` on branch `angle-cuts-2` at `9d53aaf`, driven through the Playwright MCP.
Software GL (llvmpipe): shading and grain on the miter faces are **not** judged (26a, fu 282). The fresh 5182 origin
held only the `Untitled` project it creates on first load. The check made one project, `miter check`, through the
project menu and deleted it the same way. Readouts are from the DOM and the store (`import('/src/store/store.ts')`).

### Checked

| Check | Result |
|---|---|
| **+ Add ▾** menu | Three items: `Taper — Slope one face along the length`, `Miter — 45° across the width at one end`, `Miter both ends — A picture-frame rail, in one step` |
| Miter both ends (step 1) on a 24 × 2-1/2 × 3/4 flat rail | `Angles · 2`: rows `Miter 45.0° across the width at the length max end` and `… at the length min end`; both `Across Width`, `Long point Width — min side`, `Angle 45.0°`. Stored points `[[0,0],[2.5,2.5]]` for both (depth = run exactly) |
| Cut list | One row: the two miter lines, then `Short point 19"` (= 24 − 2 × 2-1/2, the trapezoid, not a parallelogram) |
| One undo entry | `past` 4 → Undo → 3 with `angleCuts` 0 → Redo → 4 with both back |
| 3D view | A trapezoid: long edge on the min-Z side, the miter faces drawn with edge lines, no square-end edge across them (`docs/img/angle-cuts-miter-rail.png`) |
| Edits (step 2), max-end miter | Angle 22.5 → `Miter 22.5° across the width at the length max end`; Long point → max side → line **unchanged** (fu 294); Across → Thickness → `Miter 22.5° across the thickness at the length max end`, stored `along: thickness, alongFrom: max, points [[0,0],[0.75,0.3107]]`. Each edit one undo entry (`past` 4 → 7) |
| Back to 45 by typing | Across Width, Long point min, Angle `45` → stored `[[0,0],[2.5,2.5]]` exactly again (no `tan` round trip) |
| The 84.1 item (Task 3 review) | Min-end miter on the 24 × 2-1/2 rail: typed `90`, `85` and `84.1` each refused, field `aria-invalid`, focus kept, message `Must be at most 84.1°`, nothing written (`past` unchanged). `84.05` accepted (depth 23.987, displays `84.0°`); `84` accepted. **Confirmed: the stated max is not typeable** (fu 293) |
| Short part (3 × 2-1/2 × 3/4, + Add ▾ → Miter) | `90` and `85` refused, `Must be at most 50.2°`, focus kept; `50.2` also refused; Escape restored `45.0°` |
| Width ↔ thickness on the short part | Across Thickness at 75° (depth 2.799 < 3) is written; switching back to Width (depth 9.33 > 3) is refused with `Removes more than the length — reduce the angle first.`, the select stays `Thickness`, the stored cut and `past` unchanged |
| Frame (step 3) | `Rail` duplicated three times: `Rail (1)` turn 180° at Z 21-1/2, `Rail (2)` turn 90° at X 0, `Rail (3)` turn 270° at X 21-1/2. The four close as a picture frame with mitered corners (`docs/img/angle-cuts-miter-frame.png`) |
| Cut list, frame | One row `4 × 24" × 2-1/2"`, `Rail, Rail (1), Rail (2), Rail (3)`, both miter lines and `Short point 19"`. Buying packs the four as 24" stock (stock, not remainder; inv 18) |
| Plans, frame | Plan view: the 24" square with the four 45° corner seams and 19" inner dimensions; front and side views carry dashed hidden lines (`.plan-hidden`, dash `4px, 3px`: 16 segments in the plan, 34 in each elevation) (`docs/img/angle-cuts-miter-plans.png`) |
| Exploded (step 4) | Explode 25%: `fieldset.edit-lock` disabled and contains the Angles section; both rows' ✕, End, Across, Long point, the angle field and `+ Add ▾` all `:disabled`. Clicking Select (already pressed) leaves Explode at 25% and the lock on; the slider back to 0 (Home) released the lock, tool `select` |
| Shortened part (fu 296) | Rail Length 24 → 2 is accepted with both miters stored (depth 2-1/2); the next Long point edit is refused (`Removes more than the length — reduce the angle first.`), nothing written. Undone |
| Console | 0 errors; only the known warnings (`PCFSoftShadowMap` deprecated ×91, `THREE.Clock` deprecated) |

### Cleanup

`miter check` deleted through the project menu (× → Delete?). The library index afterwards holds only `Untitled`
(`b_mv4xmphc_1`); keys are `sloyd.project.b_mv4xmphc_1`, `sloyd.library.v1`, `sloyd.autosave.v1`, exactly the three
present before the check. `localStorage` read, never cleared. Dev server stopped; `.playwright-mcp/` removed.

### Not verified — needs the user on real hardware

- Shading and grain on miter faces (26a, fu 282).
- A real print of the Plans sheet with mitered corners (fu 70/79/84).

**Findings:** fu 293 (the max message rounds up past what it accepts), fu 294 (the bench line omits the long-point
side), fu 296 (a resize does not re-check stored miter depths; fails safe).

## Chunk 3: bevels and chamfers (2026-10-12)

Dev server only: `npm run dev -- --port 5183` on branch `angle-cuts-3` at `593aa9c`, driven through the Playwright MCP.
Software GL (llvmpipe): shading and grain on the sloped faces are **not** judged (26a; the user approved sloped faces
on real hardware in chunk 1). The fresh 5183 origin held only the `Untitled` project it creates on first load. The
check made one project, `bevel chamfer check`, through the project menu and deleted it the same way. Readouts are
from the DOM and the store (`import('/src/store/store.ts')`); no paid calls.

### Checked

| Check | Result |
|---|---|
| **+ Add ▾** menu | Five items: `Taper`, `Miter`, `Miter both ends`, `Bevel — 15° along one edge`, `Chamfer — Knock off one edge at 45°` |
| Bevel on each long edge of a 30 × 18 × 3/4 flat `Panel` (step 1) | Bevel added (one undo entry, `past` 5 → 6), Face → `Width face — min side`; a second Bevel left on `Width face — max side`; its Angle typed `30`. Lines: `Bevel 15.0° off the width face (min side), across the thickness, long point on the thickness min side` and `Bevel 30.0° off the width face (max side), across the thickness, long point on the thickness min side`. Stored: `face: width, along: thickness, alongFrom: min`, points `[[0,0],[0.75,0.20096…]]` and `[[0,0],[0.75,0.43301…]]` (= 3/4 × tan 15° and 3/4 × tan 30° exactly as computed in the page) (`docs/img/angle-cuts-bevel-panel.png`) |
| 45° bevel, long point only | Angle `45` → points `[[0,0],[0.75,0.75]]`; Long point → max side → `alongFrom: max`, points still `[[0,0],[0.75,0.75]]` (depth = run exactly), line `… long point on the thickness max side`. Returned to min side and 15° |
| Bevel face switch refused | The 15° bevel's Face → `Thickness face — min side` (depth 18 × tan 15° = 4.82" > 3/4"): refused, `Removes more than the thickness — reduce the angle first.`, select stays `width|min`, stored cuts and `past` unchanged |
| Bevel angle max | `89` refused: `Must be at most 87.6°` (atan 18/0.75), `aria-invalid`, focus kept, `past` unchanged; Escape restored `15.0°` |
| End bevels | Bevels run along the length only (Global Constraints): the Face select offers width and thickness faces, never a length face. An end bevel is the Miter row with Across → Thickness (chunk 2 checked that it is written and drawn) |
| Chamfer on the four long edges of a 29 × 1-1/2 × 1-1/2 `Leg` (step 2) | Four Chamfers added; Edge select (twelve options, `Width min / thickness min edge (along the length)` … `Length max / width max edge (along the thickness)`) set to the four "along the length" edges. Lines: `Chamfer 1/8" on the edge between the width face (min side) and the thickness face (min side), along the length`, and the same for (min, max), (max, min), (max, max). Stored `face: width, along: thickness`, points `[[0,0.125],[0.125,0]]` each |
| Chamfer size | Size `3/16` on the first → `[[0,0.1875],[0.1875,0]]`, line `Chamfer 3/16" …`. Size `2` refused: `Must be at most 1-1/2"`, `aria-invalid`, focus kept, `past` and the stored cut unchanged; Escape restored `3/16"` |
| Chamfer edge change refused (Task 3 review) | On the Panel (thickness 3/4): a Chamfer set to `Length max / width max edge (along the thickness)`, Size `1` (stored `[[0,1],[1,0]]`, legal: both faces ≥ 1"). Edge → `Width max / thickness max edge (along the length)` (a 1" leg into the 3/4" thickness): refused, `Too big for that edge — reduce the size first.`, select stays on the stored edge, the stored cut and `past` unchanged. Edge → `Length min / width min edge (along the thickness)` is written (one entry) and clears the note. That chamfer was then removed |
| 3D view | The leg's end shows the chamfered corners (`docs/img/angle-cuts-chamfer-leg.png`, crop `docs/img/angle-cuts-chamfer-leg-end.png`); the panel's near long edge shows its bevel. At this zoom on software GL the chamfer edge lines are not distinguishable from the grain lines in the 3D view; the Plans drawing below (lines from `boardEdges`) shows them |
| Cut list (step 3) | `Leg` row: `1 × 29" × 1-1/2"`, 0.45 bd ft, the four chamfer lines; its diagram `Length face — min side` draws a hatched (`url(#hatchrt)`) triangle at each of the four corners plus the four notes. `Panel` row: `1 × 30" × 18"`, 2.81 bd ft (stock, not remainder; inv 18), both bevel lines; its diagram `Length face — min side` draws both end-on wedges hatched (`url(#hatchru)`) with the notes (`docs/img/angle-cuts-bevel-cutlist.png`) |
| Plans | Exploded isometric shows the bevel lines along the panel's long edges and the chamfer lines along the leg; the elevations carry dashed hidden lines (three `.plan-hidden` paths, dash `4px, 3px`); the side view shows the panel's bevelled profile and the leg's chamfered end (`docs/img/angle-cuts-chamfer-plans.png`) |
| Exploded | Viewport Explode 25% (store `explode: 0.25`, tool `select`): `fieldset.edit-lock` disabled and contains the Angles rows; with the Panel selected all 8 bevel controls and `+ Add ▾` `:disabled`, with the Leg all 12 chamfer controls and `+ Add ▾` `:disabled`. Slider back to 0 (Home) released the lock |
| Console | 0 errors; only the known warnings (`PCFSoftShadowMap` deprecated, GL driver "GPU stall") |

### Cleanup

`bevel chamfer check` deleted through the project menu (× → Delete?). The library index afterwards holds only
`Untitled` (`b_mv5075hk_1`); keys are `sloyd.library.v1`, `sloyd.autosave.v1` and `sloyd.project.b_mv5075hk_1`, exactly
the three present before the check. `localStorage` read, never cleared. Dev server stopped; `.playwright-mcp/` removed.

### Not verified — needs the user on real hardware

- Shading and grain on bevel and chamfer faces (26a).
- A real print of the Plans sheet with bevels and chamfers (fu 70/79/84).

**Findings:** fu 298 (a raised-panel field bevel has no preset of its own), fu 299 (the chamfer Edge select's option
text is clipped at the panel's width).

## fu 299 / fu 300: wording (2026-10-12)

Dev server (port 5184), the app's own empty "Untitled" project (the only one in the dev library); a board and a chamfer
added, read, then both undone (the project is empty again; same two keys before and after, nothing cleared).
- The chamfer row's bench line: `Chamfer 1/8" on the edge between the width face (max side) and the thickness face (max
  side), along the length`.
- The Edge select's twelve options read `Width max side · thickness max side`, `Length min end · width max side`, …; the
  widest measures 224 px in the select's 315 px content box, so the closed select no longer clips (fu 299).
- 0 console errors.
