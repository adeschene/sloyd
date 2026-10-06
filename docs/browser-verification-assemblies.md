# Browser verification: assemblies

2026-10-06. Spec: `docs/superpowers/specs/2026-10-06-sloyd-assemblies-design.md`.

## How this was driven

Claude drove the dev server on branch `assemblies` (`npm run dev -- --port 5180`, Chromium) with
the Playwright MCP, in a browser the user could watch. **The user's own hands-on pass is still to
come** (see "For the user" below). No paid calls were made.

**Where this departs from the plan's script** (Task 15 Step 2, Task 12 Step 6):
- the drawer was imported as a v9 file rather than built from five added boards, which also
  covers the script's "import a v9 project";
- it was duplicated once, not twice;
- the cabinet was hidden, not one drawer;
- the plan's `assemblyDoc()` import was not used, because the drawer gave the same tree.

- **Input.** Real mouse clicks, double-clicks and drags (`page.mouse`) and real key presses
  (`page.keyboard`), so focus, blur and the gizmo's pointer handling are a real browser's.
- **Fixture.** "Drawer check", a **v9** file imported from `.playwright-mcp/`. It is a 16 × 18 ×
  6in drawer: Front and Back (16 × 6 × 3/4 maple, on edge), two Sides (16-1/2 × 6 × 1/2, on edge,
  turned 90°, one with a 1/4in groove) and a 1/4in plywood Bottom.
- **Reading state.** State was read back from `localStorage` (`sloyd.project.<activeId>`) about a
  second after each step, once autosave had run.
- **Timeouts.** Software GL (follow-up 26a) made Playwright's default 5s screenshot timeout too
  short, so screenshots were taken with a 60s timeout.

## Driven by Claude, read back from storage

- **A v9 file loads unchanged.** All five parts drew as before. The first edit saved it as
  version 10.
- **Group (Ctrl+A, Ctrl+G).**
  - The root came back with no parts and one instance, "Assembly 1", at `[0, 0, 0]` turn 0.
  - Its definition held the five parts with **every position bit-identical** to the file, the
    groove included.
  - The parts list showed the tree (an assembly row with a caret and the five parts indented).
  - The assembly panel showed the name, the hint "Assembly — double-click it in the view to edit
    its parts.", Turn, and Duplicate / Ungroup / Group / Hide others / Delete / Copy in a row.
- **Rename and Duplicate.**
  - The assembly was renamed "Drawer".
  - Duplicate made "Drawer (1)" in place, with its **own definition** (a second id holding the
    same five parts). That is round 1's independent copy.
- **Gizmo move of the assembly.** A drag on the red arrow moved Drawer (1) to x = 5-9/16, then
  12-1/8. Each was a whole-sixteenth position (invariant 42's rounding), and every part moved
  with the assembly.
- **Turn 90° in Properties.**
  - The origin became `[11.125, 0, 17]` turn 90.
  - The footprint stayed centred at (20-1/8, 9). That is the same centre as before the turn,
    so the assembly turned in place.
- **Double-click opens.**
  - Double-clicking Drawer (1) opened it. The other drawer faded but stayed visible.
  - Drawer (1)'s eye was disabled, and the selection was empty.
  - Screenshot: `docs/img/assemblies-open-fade.png`.
- **Edit inside a turned assembly.**
  - A click selected Drawer (1)'s Front. Properties showed it in world terms: X 28-3/8, Y 0,
    Z 1, turn 90°.
  - Length 16 → 14 kept the STORED local position (`[0, 0, 17.25]`) and moved the world Z min
    to 3. That is spec §5.2, exactly as predicted from the frame.
  - **The other Drawer's Front stayed at 16.** The copies are independent.
  - Ctrl+Z restored 16.
- **Gizmo on a part inside the turned assembly.**
  - Dragging the Front's red arrow moved it +2-3/16 in world X only.
  - Its stored LOCAL position moved +2-3/16 in Z. That is the world delta rotated into the
    container frame (spec §10 amendment 4).
  - Ctrl+Z restored it.
- **Escape closes.** Escape closed the assembly, removed the fade and left Drawer (1) selected,
  the way SketchUp does.
- **Nesting.**
  - Ctrl+A then Ctrl+G at the root wrapped both drawers in a new assembly.
  - It was renamed "Cabinet". Its definition holds no parts and two instances:
    Drawer `[0, 0, 0]` turn 0 and Drawer (1) `[11.125, 0, 17]` turn 90.
- **Cut list.**
  - Rows group across both drawers and name parts by display path. For example: "4 × 16" × 6"
    Cabinet › Drawer › Front, Cabinet › Drawer › Back, Cabinet › Drawer (1) › Front, Cabinet ›
    Drawer (1) › Back".
  - The grooved sides kept their own row with the setup line and drawing.
  - Both plywood bottoms nest on one sheet. Their path names are too long for the rectangles, so
    they demote to numbered boxes with the full name in the key. That is invariant 19's ladder
    working as designed.
- **Hide the cabinet (its eye).**
  - Everything under it left the view, and Show all (1) appeared.
  - Every descendant row dimmed, and its eye was disabled.
  - Show all brought it back.
- **Add joinery….** The dialog listed **12 sites**, each named by its path, e.g. "Cabinet ›
  Drawer (1) › Bottom → Cabinet › Drawer (1) › Side (1): end into face". Before the final
  review's fix it found none on a grouped design.
- **Reload.** The saved project was **byte-identical** before and after, and the tree came back.
- **Ungroup (Ctrl+Shift+G) of Cabinet.**
  - Both drawers returned to the root at exactly their positions and turns.
  - Cabinet's definition was pruned (2 definitions left).
  - Both drawers were selected.
- **Click selection.**
  - A single click on a drawer selects the whole drawer: all five parts take the brass tint,
    and the gizmo sits at its centre.
  - With Drawer (1) open, a click on the faded other drawer closed Drawer (1) and selected that
    drawer. That is SketchUp's behaviour: the click selects at the new level, so the drawer
    rather than its part.

## The separator, measured (Task 11 Step 1b)

**` › ` stays.** It was measured inside the cut list's own SVG text, by cloning a drawn `<text>`
node so the clone inherits its styling:
- the font is `--font-num`'s stack, at 20px;
- `›` advances **12.0253** in one view and **12.0348** in another;
- that is the same as `a`, `0`, `>`, `/`, `×` and `"` in that view, so the face is monospace and
  `›` is not from a fallback face (a fallback would advance differently);
- `CHAR_W` is 12.4, so the over-estimate is on the safe side (invariant 19).

A first attempt appended a bare `<text>` to the SVG. That measured a proportional face (`›` 7.99,
`>` 16.74), because a bare element does not get the diagram's font rule. **Measure by cloning a
drawn node, never by appending a fresh one.**

## Found and fixed during the pass

- **The assembly's action row clipped Delete.** Five buttons (Duplicate, Ungroup, Group, Hide
  others, Delete) overflowed the 280px Properties column, and Delete sat past its right edge. A
  part's row had four buttons once Group was added, so it was barely in.
- **The fix.** `.row` now has `flex-wrap: wrap` (`1cb478f`). The assembly row wraps 3 + 2, and a
  part's row wraps 3 + Delete. Screenshot: `docs/img/assemblies-panel-row.png`.

- **An orbit followed by a click opened an assembly** (deferred from Task 12's review).
  - **The first check proved nothing.** Two 30px drags raised no `dblclick`, but only because
    Playwright's `mouse.down()` sends `clickCount: 1` unless told otherwise.
  - **The real check.** A 20px orbit, then a press with `clickCount: 2`. That is what a browser
    sends when the second press falls inside its double-click time and distance. It **opened
    the drawer** (its eye went disabled). With a real mouse this needs a short orbit, a few
    pixels, but it is reachable.
  - **A dblclick cannot guard itself.** Its `e.delta` is measured from its SECOND press.
  - **The first fix failed live.** It recorded the drag in a mesh's `onClick`, but an orbit
    usually releases over another mesh, or none, so no handler ran.
  - **The fix** (`4814900`). `pointer.ts` tracks click pairs on the canvas element itself
    (`watchClickPairs`, mounted by Viewport's `ClickPairs`). `BoardMesh` ignores a
    double-click whose first click travelled more than `CLICK_DRAG_SLOP_PX`.
  - **Verified live, read from the disabled eye.**
    - Orbit then click: stays closed.
    - Orbit then a click somewhere else: stays closed.
    - A plain double-click: opens.
    - A double-click with a 1px twitch: opens.
    - An orbit, a pause, then a double-click: opens.
## After the deploy: the fade, reported by the user on production

- **The report.** The grid showed over faded parts in some spots, and the fade was too solid
  and too close to the open assembly's colour.
- **The cause.** Faded parts were transparent without writing depth. The grid is a transparent
  object too, and three.js sorts transparent objects by distance. Wherever the grid sorted
  after a faded part, its lines were painted over it.
- **The fix.**
  - Faded parts draw at render order -1, before the grid, and write depth, so the grid behind
    them is hidden. Opaque parts behind still show through, because they draw in the earlier
    opaque pass.
  - Opacity drops from 0.35 to 0.15.
  - No grain map, and the colour is the material's hue at 15% of its saturation.
  - Faded parts cast no shadow.
- **Checked on the dev server** with each drawer open in turn: no grid lines through the
  ghost, and the open drawer shows through the ghost's walls. Screenshot:
  `docs/img/assemblies-fade-v2.png`.

**A click on empty space inside an assembly moves up a level** (the user's request, same day).
`clearOnMiss` calls `closeAssembly` when an assembly is open, so it does exactly what Escape's last
rung does: it closes one level and selects the assembly it left. At the root it still clears the
selection. Checked live: an orbit drag starting on the floor stays inside (R3F's 2px miss
threshold). One floor click closes the drawer and selects it, and a second click clears the
selection. A double-click on empty floor therefore climbs two levels, like Escape pressed twice.

## Found, filed, not fixed

- **The eye on a row covered by a hidden ancestor** draws struck through and is disabled, but
  its accessible name still reads "Hide Drawer". Follow-up 227.

## For the user (pending)

The user approved the merge (`699cc45`) without reporting results for these.

- **The fade, on real hardware.** Software GL can lie about blending (follow-up 26a), so the open
  assembly's fade has only been seen on llvmpipe.
- **Double-click and orbit with a real mouse,** after the fix: two quick short orbits on a
  drawer should not open it, and a double-click should.
- **Anything else in this list,** by hand.

## Not exercised

- **A paid joinery run on an assembled design.** This browser has no API key, and a run is the
  user's call. The write-back is pinned by `writeBackFlat`'s tests at all four turns (the
  Task 11 critical fix), and the dialog's site list was checked above.
- **The Move tool's snap move and the Tape inside an open assembly.** Both read `worldParts`,
  and the store's snap move is unit-tested through `translateItems`. Nothing in this pass armed
  them.
- **Copy in a row of an assembly.** It is offered, and unit-tested; it was not driven here.
