# Browser verification — selectable guides (fu 591, no schema change)

Not yet run. The user's own Chrome over the MobaXterm tunnel (`localhost:5199`, real GPU), Claude driving through
claude-in-chrome, the user watching. Dev server on branch `selectable-guides` (or `master` after the merge). Use a NEW
project, left in place afterwards (dev profile rule), holding at least: two or three parts (one an assembly, for the
double-click check), guide points in clear space and over a part, an axis line and an oblique line, one of them running
in FRONT of a part and one BEHIND a part, and one lying ON a part's face.

Run the viewport checks in perspective AND in ortho. Record each step's input (real mouse/keyboard, or a store action)
and read results off the page's own store module (`selectedGuideIds`, `hiddenGuideIds`, `selectedIds`, `past.length`).
Spec: `docs/superpowers/specs/2026-10-30-sloyd-selectable-guides-design.md` §10.

## Spec §10

| # | Check | Result |
|---|---|---|
| 1 | Click a guide point, then a line, in clear space: each is selected (`selectedGuideIds`), its row highlighted (`aria-pressed`), the Guides footer opens if closed | |
| 2 | Click a line where it crosses in FRONT of a part: the line is selected. Click where the part hides it: the PART is selected | |
| 3 | An orbit drag that starts or ends on a line selects nothing | |
| 4 | Delete (and Backspace) removes the guide selection as ONE undo entry; Ctrl+Z restores it | |
| 5 | H hides the selected guide (gone from the viewport, row dimmed, select disabled, left the selection); it no longer snaps in Tape (no point, crossing or face hit); Alt+H shows it; Ctrl+Z after H shows it | |
| 6 | Exploding clears the guide selection | |
| 7 | In Tape and in Move, a click on a guide snaps and does not change the selection | |

## Further checks (the build's own list, task 4)

| # | Check | Result |
|---|---|---|
| 8 | A line lying ON a part's face is pickable on the face (the 1/16" occluder allowance) | |
| 9 | A guide point over a part: the point wins | |
| 10 | Double-click on a guide in front of an assembly selects the guide and does NOT open the assembly; double-click on a guide over empty space leaves it selected | |
| 11 | Shift / Ctrl / Cmd-click toggles guides in the viewport and in the list; a click on a part after a guide selection selects the part (the kinds never mix) | |
| 12 | In the Guides list, a click in a line's coordinate field or on × does not select; the eye hides and shows | |
| 13 | Shift+H with a guide selection hides every other guide, parts untouched; Escape with a guide selection (and nothing else to back out of) clears it | |
| 14 | Section on: a line behind a part's REMOVED half is pickable; behind the cap, not | |
| 15 | Hover cursor: a pointer over a pickable guide in Select, the default elsewhere and in Tape/Move; no visible lag on a large or curved project (if it lags, hover is dropped per the plan and recorded here) | |
| 16 | Save image with a guide selected: no selected emphasis in the captured image (`emphasise` false in the clean frame) | |
| 17 | Properties with a guide selected: the empty state plus the guide line (count, keys) | |
| 18 | A Gizmo handle overlapping a line: a still click on the handle within 12 px of the line selects the LINE (the Gizmo is not an occluder; fu 595 (2)) — judge whether that is acceptable | |
| 19 | Console | |

## By eye (the user)

| # | Item | Result |
|---|---|---|
| A | The selected line's look: `SELECTED_OPACITY` 1, `SELECTED_WIDTH` 2.4, dashed | |
| B | The selected point's look: a full-size `SnapMarker` over its resting marker | |
| C | The Guides list row: selected style, the eye, a hidden row's dimming | |
| D | The Properties guide line's wording | |
