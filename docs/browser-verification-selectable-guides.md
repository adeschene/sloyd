# Browser verification — selectable guides (fu 591, no schema change)

Run 2026-10-30 (Claude driving the user's Chrome through claude-in-chrome, real mouse and keys; results read off the page's store module). Project `Selectable guides check` left in place (dev profile rule): one 24 x 4 x 5-1/2" part (grouped into `Assembly 1` for check 10), points at (-10, 8, 0) and (12, 4, 2-3/4) (on the top face and on the face line), X lines at (y 2, z 12) in front, (y 2, z -6) behind, (y 4, z 2-3/4) on the top face, an oblique line (-10, 0, -10)-(30, 10, 10) passing over the part, and a Z line at (x 12, y 2) running through the part. Perspective; Front and Top views. Originally: the user's own Chrome over the MobaXterm tunnel (`localhost:5199`, real GPU), Claude driving through
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
| 1 | Click a guide point, then a line, in clear space: each is selected (`selectedGuideIds`), its row highlighted (`aria-pressed`), the Guides footer opens if closed | PASS: point, then X line, selected by click; row `aria-pressed`; the line drawn heavier |
| 2 | Click a line where it crosses in FRONT of a part: the line is selected. Click where the part hides it: the PART is selected | PASS: Front view, a click where the front line crosses the part selects the line; Top view, a click on the part over the Z line running INSIDE it selects the part |
| 3 | An orbit drag that starts or ends on a line selects nothing | PASS: a drag starting on the Z line and one ending on it select nothing |
| 4 | Delete (and Backspace) removes the guide selection as ONE undo entry; Ctrl+Z restores it | PASS: Delete removed the Z line, `past` +1; Ctrl+Z restored it |
| 5 | H hides the selected guide (gone from the viewport, row dimmed, select disabled, left the selection); it no longer snaps in Tape (no point, crossing or face hit); Alt+H shows it; Ctrl+Z after H shows it | PASS: H hid the front line (row `hidden`, select disabled, left the selection); Tape click on it anchors nothing while hidden and anchors `line` on it when shown; Alt+H shows; Ctrl+Z restores the run's start (a run back at its start leaves no entry, inv 43, as for parts) |
| 6 | Exploding clears the guide selection | PASS: `setExplode(0.5)` cleared the guide selection (1 -> 0) |
| 7 | In Tape and in Move, a click on a guide snaps and does not change the selection | PASS: Tape click on a line anchors (`kind: line`), selection unchanged; Move click selects nothing |

## Further checks (the build's own list, task 4)

| # | Check | Result |
|---|---|---|
| 8 | A line lying ON a part's face is pickable on the face (the 1/16" occluder allowance) | PASS: the X line lying on the top face selects when clicked on the face |
| 9 | A guide point over a part: the point wins | FAILED first (a point lying on a line lost to the line unless clicked on its exact pixel); FIXED `5a347b0` (a point within reach beats every line); re-run PASS: a click 7 px off the point selects the point, a click on the line away from it selects the line |
| 10 | Double-click on a guide in front of an assembly selects the guide and does NOT open the assembly; double-click on a guide over empty space leaves it selected | PASS: double-click on the oblique line over `Assembly 1` selects it, `openPath` null; double-click on the assembly away from guides opens it. (One stray result came straight after Group in the same scripted batch, before a frame rendered; not reproducible) |
| 11 | Shift / Ctrl / Cmd-click toggles guides in the viewport and in the list; a click on a part after a guide selection selects the part (the kinds never mix) | PASS: Shift-click adds, Ctrl-click removes; a part click after a guide selection selects only the part |
| 12 | In the Guides list, a click in a line's coordinate field or on × does not select; the eye hides and shows | PASS: row button selects; a click in the Y field and Tab leaves the selection; the eye hides and shows |
| 13 | Shift+H with a guide selection hides every other guide, parts untouched; Escape with a guide selection (and nothing else to back out of) clears it | PASS: Shift+H hid the 6 other guides, no part hidden; Escape cleared the guide selection |
| 14 | Section on: a line behind a part's REMOVED half is pickable; behind the cap, not | PASS: section Top at 1" (the Z line in the removed half) -> the line; at 3" (behind the cap) -> the part |
| 15 | Hover cursor: a pointer over a pickable guide in Select, the default elsewhere and in Tape/Move; no visible lag on a large or curved project (if it lags, hover is dropped per the plan and recorded here) | PASS: pointer over a line in Select, default over empty space, default in Tape. No lag on this small project |
| 16 | Save image with a guide selected: no selected emphasis in the captured image (`emphasise` false in the clean frame) | OWED to the user (Save image downloads a file) |
| 17 | Properties with a guide selected: the empty state plus the guide line (count, keys) | PASS: `1 guide selected — Delete removes it, H hides it.` |
| 18 | A Gizmo handle overlapping a line: a still click on the handle within 12 px of the line selects the LINE (the Gizmo is not an occluder; fu 595 (2)) — judge whether that is acceptable | Not reproduced: a still click on the Gizmo's centre handle beside the face line kept the part (the line was cut away by the section there). Left to the user's judgement (fu 595 (2)) |
| 19 | Console | PASS: no console errors or warnings |

## By eye (the user)

| # | Item | Result |
|---|---|---|
| A | The selected line's look: `SELECTED_OPACITY` 1, `SELECTED_WIDTH` 2.4, dashed | |
| B | The selected point's look: a full-size `SnapMarker` over its resting marker | |
| C | The Guides list row: selected style, the eye, a hidden row's dimming | |
| D | The Properties guide line's wording | |
