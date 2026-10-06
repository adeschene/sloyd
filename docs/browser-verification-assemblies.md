# Browser verification: assemblies

2026-10-06. Spec: `docs/superpowers/specs/2026-10-06-sloyd-assemblies-design.md`.

## How this was driven

Claude drove the dev server on branch `assemblies` (`npm run dev -- --port 5180`, Chromium) with
the Playwright MCP, and **the user watched the same browser**. No paid calls were made.

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

## Checked and closed without a change

- **Double-click after a short orbit (deferred from Task 12's review).** A browser reports a
  double-click only when both presses land within a few pixels of each other. A press that
  travelled further than the 2px `CLICK_DRAG_SLOP_PX` orbited, and it is not counted as the
  first click of a pair. Two 30px orbit drags in a row raised no `dblclick` at all. A
  double-click with a twitch smaller than that is still a double-click, and opening is what was
  meant. A guard on `e.delta` would not help anyway, since a dblclick's delta is measured from
  its own second press.

## Found, filed, not fixed

- **The eye on a row covered by a hidden ancestor** draws struck through and is disabled, but
  its accessible name still reads "Hide Drawer". Follow-up 227.

## Not exercised

- **A paid joinery run on an assembled design.** This browser has no API key, and a run is the
  user's call. The write-back is pinned by `writeBackFlat`'s tests at all four turns (the
  Task 11 critical fix), and the dialog's site list was checked above.
- **Tape, Move tool and snap points inside an open assembly.** They read `worldParts`, which is
  unit-tested. Nothing in this pass armed them.
