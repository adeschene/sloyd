# Browser verification — box joints (dovetails chunk 1)

Date: 2026-10-27. Dev server (Vite, port 5180, origin `http://127.0.0.1:5180`), Playwright, software GL (fu 26a: layout
and DOM, not shading). Spec: `docs/superpowers/specs/2026-10-26-sloyd-box-joints-design.md`. Plan:
`docs/superpowers/plans/2026-10-27-sloyd-box-joints.md` (Task 8). Branch `box-joints`, tip `eae1086` when checked.
The test project **"Box joints check"** was created and is LEFT in place (dev-profile rule, 2026-10-17). `localStorage`
was not cleared. Console: 0 errors; the warnings are the known Three.js deprecations.

## 1. The drawer, modelled by hand

Four parts, all On edge, 4" tall, 1/2" thick: Front and Back 13" long at z 0 and z 16-1/2; Side left and Side right 16"
long, turned 90°, at x 0 and x 12-1/2, z 1/2 (butt corners: the sides run between Front and Back). All four were
selected in the Parts list. The **Box joints** section showed, with Finger width defaulting to `1/2"` (the thinner
part's thickness).

## 2. Box joint the corners (DOM readout)

The section's notes after the click:

- `Jointed 4 corners: 7 fingers, 1/2" wide (the outer two 3/4").` (4" at 1/2": a tie, gone down: spec difference 4)
- `Side left is now 1" longer.` / `Side right is now 1" longer.` (each side runs out 1/2" at each end, to the outside
  faces of Front and Back)

## 3. Cut list (DOM readout)

Two rows: `2 × 17" × 4"` Side left, Side right and `2 × 13" × 4"` Front, Back (the linked-free copies group exactly).
Each row's setup lines are exactly two `Box joint — …` lines, one per end, for example
`Box joint — 7 fingers 1/2" wide (the outer two 3/4"), 1/2" deep, at the length min end; this part has the outer fingers.`
The sides have the outer fingers (run axis Z ranks first), Front and Back the outer notches. No notch, dado or rabbet
line appears for the finger cuts.

## 4. Part diagrams (screenshot `docs/img/box-joints-diagram.png`)

Each end view draws its notches (three hatched notches on the sides, four on Front/Back, complementary) with ONE note
under the figure, the same text as the setup line, and no leaders or labels per notch. The note's DOM text carries the
inch mark (`3/4"`); at the screenshot's scale it is hard to see.

## 5. Viewport (screenshot `docs/img/box-joints-corner.png`)

The near corner, close up in perspective: the end grain of the fingers alternates up both faces of the corner (seven
fingers), the faces meet flush, and there is no z-fighting. Software GL; the user's own look on real hardware is owed
(fu 496; the copy review is fu 491).

## 6. Undo, redo, re-run, Swap

- Undo: Side left's length read back `16"` (the butt corner restored). Redo: `17"`.
- Finger width `3/8`, run again: `Jointed 4 corners: 11 fingers, 3/8" wide (the outer two 5/16").`; lengths unchanged
  (17", 13"); the cut list lines name 11 fingers.
- Swap fingers ticked, run again: the cut list now gives Front/Back the outer fingers and the sides the outer notches.

## 7. Joinery and Refine (no paid run)

- **Add joinery** on the jointed drawer: `No joints to add — no parts meet end-to-face, face-to-edge, or crossing.` The
  jointed corners are not offered as sites (spec §7).
- The design check has no standalone UI; `checkDesign` returning `[]` for the jointed drawer is pinned by the unit tests
  (Task 3).
- The drawer was grouped into `Assembly 1` and a plain root `Shelf` added. **Refine…** opened with no refusal (only the
  API-key prompt), so a box-jointed assembly no longer blocks Refine (Task 6b).
- **The paid Refine run (plan Step 4b) was NOT done:** no API key is stored on either dev origin
  (`127.0.0.1:5180`, `localhost:5180`), and the key never goes through chat. The kept-assembly round trip is covered by
  the fake-client `runRefine` tests (Tasks 6, 6b). One real Refine on a project like this one is owed (fu 496).
