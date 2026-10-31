# Browser verification — Fit the cam-and-bolt joint again (fu 602, no schema change)

Not yet run. To be run in the user's Chrome: Claude drives it through claude-in-chrome on the dev server (a MobaXterm tunnel to
`localhost:5199`, branch `cam-fit`); real clicks and keys for every panel action, results read off the page's own store module. Test
projects are LEFT in place on dev (the dev profile rule); never clear the dev profile. Spec:
`docs/superpowers/specs/2026-10-31-sloyd-cam-joint-fit-again-design.md` (§4, §6) and its Amended (build) block. DOM readouts quoted below
are the words from `src/document/camJointText.ts` and `src/panels/CamJoint.tsx`.

Setup: a project named `Cam joint fit check`: the carcass of the joint check (two sides 3/4" thick, upright, 12" deep, 30" tall, 24"
apart outside to outside; a flat shelf 3/4 × 12 × 22-1/2" between their inner faces at 10" high, the shape of `camJointFixtures.ts`
`carcass()`), with the sides as a MIRRORED link: give the left side a chiral hole, set the right side to Turn 270, select both sides and
Link them; the Parts list shows the mirror mark on the right side. Then join the shelf to the left side (Add joint at the shelf's min end);
select the shelf and the right side and Add joint again (the shelf's max end; the right side already has the bores through its link).
Fittings stay at the default 2.

| # | Check | Steps | Expected readout | Result |
|---|---|---|---|---|
| 1 | Joined, nothing stale | Select `Shelf` alone; read the single-part panel below Round tenons. Select `Shelf` and `Left side` and read the two-part section | The single-part panel has no `Cam-and-bolt joint` heading and no note. The section reads `Shelf and Left side are already joined here.`, `Add joint` disabled | pending |
| 2 | Move the shelf up 2" | Select `Shelf`, set its Y position to 12 (from 10) | The panel under Round tenons shows the heading `Cam-and-bolt joint` and TWO notes in order: `No longer lines up with Left side's bores — select both to fit the joint again.` and `No longer lines up with Right side's bores — select both to fit the joint again.` Store `past` grew by 1 (the move) | pending |
| 3 | The two-part section offers the fit | Ctrl-click `Left side` too. Read the section | Heading `Cam-and-bolt joint`; the joint line `Shelf's min end into Left side`; the stale line `Left side's bores no longer line up with Shelf's cam locks.` under it; the `Cam face` and `Fittings` fields hidden; the button reads `Fit the joint again`, enabled; no alert | pending |
| 4 | Fit the joint again | Click `Fit the joint again`. Read the notes under the button | One note: `Right side's bores moved there too, through its link.`; the button now reads `Add joint` and disabled with `Shelf and Left side are already joined here.`; store `past` grew by exactly 1 | pending |
| 5 | Both sides' bores line up | Read each side's Holes rows and each shelf bolt row (store module): the world mouth of every side bore against its shelf bolt's mouth. Turn X-ray on (R) and look at the left and right inner faces. Set a Front section through a bore (the section plane at the bore's depth) | Left and right bore rows keep their ids and their list index; their world y is 12.375 (was 10.375), z unchanged (1.4567 and 10.5433); each bore's axis coincides with its bolt's (`boreAlongAxis`); no `meets-hole` note anywhere. X-ray and the section show the bolt running down each bore at both ends, the cam and bolt passages one void on the shelf side | pending |
| 6 | The shelf's note is gone | Select `Shelf` alone | No `Cam-and-bolt joint` heading and no note | pending |
| 7 | Undo | Press Ctrl+Z once | Both sides' bore rows are back at world y 10.375 in ONE step (store `past` shrinks by 1); the shelf's panel again shows both notes from check 2 | pending |
| 8 | Redo, then the other pair | Press Ctrl+Shift+Z. Select `Shelf` and `Right side` | The section reads `Shelf and Right side are already joined here.` (the link carried the fit) with `Add joint` disabled | pending |
| 9 | A tie refuses | Undo the fit again (Ctrl+Z). On the left side add a second set of loose bores by hand: copy BOTH of its joint bores (same 5 × 12 mm, same face) and set each copy's Y so it sits exactly as far from the shelf's NEW bolt axis on the other side as the original is (the originals are 2" below the new axis, at 10.375; put the copies 2" above it, at 14.375). Select `Shelf` and `Left side` | The section shows the stale line and `Cam face` and `Fittings` hidden; a note `Left side has two sets of bores this joint could fit — remove the ones you don't want first.`; the button reads `Fit the joint again` and is DISABLED; nothing is written (past unchanged). Delete the extra bores afterwards and the fit is offered again | pending |
| 10 | A part that is not stale shows nothing | Select `Left side` alone | No `Cam-and-bolt joint` heading in its panel (the note belongs to A, fu 609 for B) | pending |
| 11 | Console | Read the console after every check | No errors or warnings (an expected `console.error` appears only for a planner throw, R14: none should) | pending |

After the run: fill the Result column, one line each; list anything found and fixed; the Amended (build) block in the spec awaits approval.
