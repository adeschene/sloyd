# Browser verification: hide and unhide

2026-10-05. Spec: `docs/superpowers/specs/2026-10-05-sloyd-hide-unhide-design.md`.

## How this was driven

Claude drove the dev server on branch `hide-unhide` (`npm run dev -- --port 5199`, Chromium) with
the Playwright MCP, and **the user watched the same browser**. The user did the viewport gestures
themselves. No paid calls were made.

**The fixture** was the user's workbench (`src/document/fixtures/simple-workbench.sloyd`, 14 parts),
imported as "Live hide" from `.playwright-mcp/`.

The harness notes from `docs/browser-verification-joinery-fixes.md` still apply: no screenshots,
clicks through `page.mouse` or `.click()`. One new note: the parts list scrolls, so a row must be
scrolled into view before a coordinate click. The first eye click on Benchtop missed for that reason
and hit the Properties panel. The check reads `document.elementFromPoint` before clicking now.

## Driven by Claude, read from the page

Each check below passed.

**The eye**
- **Hiding.** Clicking Benchtop's eye hid it: its row was dimmed and its label became "Show
  Benchtop". It was deselected (13 selected → 12).
- **A hidden row's name is disabled,** and a click on it selected nothing.
- **Showing.** The Show eye brought it back.

**Keys**
- **H** on the selected Front left leg hid and deselected it, and **Show all (1)** appeared.
- **Ctrl+A** then selected 13 parts, skipping the hidden leg.

**Undo and redo**
- **Ctrl+Z** showed the leg again, unselected (the selection is not undone).
- **Ctrl+Shift+Z** hid it again.

**Show all and hide others**
- **Alt+H** showed all.
- **Hide others** in the single-part Properties panel, with Lower shelf selected, hid the other 13,
  and **Show all (13)** brought them back.
- **Shift+H** with Front left leg selected hid the other 13, and one **Ctrl+Z** undid it.

**Hidden parts stay in the design**
- **The cut list** still listed Benchtop while it was hidden.
- **A reload** brought every part back (hidden-ness is not saved).

## Done by the user, reported as passing

1. **The eye in the 3D view:** a hidden part disappears, and a click goes through to the part behind
   it. The placement of Show all (N) is acceptable.
2. **Move tool:** a hidden part offers no markers, and H while a grab is held drops the grab.
3. **Tape tool:** an anchor survives hiding its own part, the measurement can still be finished, and
   a hidden part offers no points.
4. **Gizmo drag:** H during a drag does nothing, and after release one Ctrl+Z undoes the whole drag.
5. **Home** frames only the visible parts, and does nothing with every part hidden.

## Finding: the projection swap framed beside the model (fixed, pre-existing)

**What the user saw.** With parts hidden, the ortho/perspective toggle zoomed in and looked off to
the side of the visible parts.

**Diagnosis.** Temporary console logging found the cause, and it reproduced with nothing hidden:
- the swap effect ran while drei's OrbitControls were still bound to the outgoing camera, so the
  framed target ([0, 17.4, 0]) went into the old controls;
- the rebuilt controls came up at [0, 0, 0].

**The fix** (`99e0566`) waits for `controls.object === camera` and frames once per swap.

**Re-measured** with only Front left leg visible: both directions framed on the leg's centre,
(−28.3, 16.6, −10.3), and the live controls kept it 400 ms later. **The user confirmed the framing
by eye.**

## Not exercised

- **Option+H on a Mac** (no Mac available). It is covered by the App test that delivers
  `key: '˙', code: 'KeyH'`.
