# Browser verification: multi-select

2026-10-05. Spec: `docs/superpowers/specs/2026-10-05-sloyd-multi-select-design.md`.

## How this was driven

Claude drove the dev server on branch `multi-select` (`npm run dev -- --port 5199`, Chromium) with
the Playwright MCP, and **the user watched the same browser**. The user did the drag gestures
themselves. No paid calls were made.

The harness notes from `docs/browser-verification-joinery-fixes.md` still apply:
- clicks went through `page.mouse.click` at measured coordinates, and modifiers through
  `keyboard.down`/`up`, because locator clicks time out on this host;
- the fixture was imported from `.playwright-mcp/`;
- there are no screenshots, because they time out on this host.

**The fixture.** It had four legs (Leg A to Leg D), a Top and a Shelf with a dado. Leg D sat at
x = −11.99, **0.01in off the 1/16in grid on purpose**, so a group move that rounded each part
separately would show up.

## Driven by Claude

- **Parts list.** Results are the selection after each click.

  | Click | Selection |
  |---|---|
  | plain click on Leg A | [Leg A] |
  | Shift-click Leg B | [A, B] |
  | Ctrl-click Leg C | [A, B, C] |
  | Ctrl-click Leg B | [A, C] |
  | Meta-click Leg D | [A, C, D] |
  | plain click on Top | [Top] |

  Each selected row had `aria-pressed`. Properties read "3 parts selected" while three were
  selected.
- **Ctrl+A** selected all 6 parts and selected no page text.
- **Viewport,** with the dado-split shelf framed by `f`:
  - a Shift-click on its centre toggled it out once (a click reaching two solids of one board
    did not toggle twice);
  - a plain click selected it;
  - a Shift-click on empty space kept the selection;
  - a plain click on empty space cleared it.
- **Move tool:** a viewport click selected nothing, and Escape returned to Select.
- **Group field and Enter:**
  - With Leg A and Leg C selected, Claude typed `30` into the group Length field and pressed
    Enter. Both legs were saved at 30in.
  - The field kept focus. One Ctrl+Z after Escape put both back to 28in.

## Done by the user, reported as passing

1. **Group gizmo drag**, then one Ctrl+Z.
2. **Ctrl+A mid-drag:**
   - the drag was abandoned and nothing moved after the key;
   - one Ctrl+Z undid the earlier motion.
3. **Group Move-tool snap** onto an unselected part, then one Ctrl+Z.
4. **Group Length typed, then a Ctrl-click** on another part: the draft was saved to the group
   that was selected when the field lost focus.

After all four, every part read back from `localStorage` **exactly** at its starting position,
Leg D included at −11.99. So every gesture undid completely, and the off-grid offset survived.

**Not measured by Claude.** Positions were not read between the user's steps. So the group's
in-between position (the min corner on the grid, Leg D still 0.01in off it) rests on the user's
report and on the store tests for `moveGroupTo`, not on a readout.

## Finding: committing a field felt awkward

The user found clicking away to commit step 4's field awkward and asked for Enter as an
alternative. **Enter already commits** (`DimensionField`'s `onKeyDown`, covered by
`DimensionField.test.tsx`), and it was confirmed live above. What it does not do is show
anything: focus stays in the box and the text reformats. That is the likely reason it was not
discovered. See follow-up 212.

**Ruled and fixed:** the user chose blur on Enter. Re-checked live on the same group of legs:
- after Enter, both legs were saved at 30in and focus was on the page body;
- one Ctrl+Z, now the app's undo, put both back at 28in.
