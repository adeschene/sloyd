# Browser verification — through dovetails (dovetails chunk 2, fu 484)

Date: 2026-10-27. Dev server (`npm run dev -- --port 5199`, origin `http://localhost:5199`) on branch `dovetails` at
`11fed59`, driven through the Playwright browser (software GL: layout and DOM, not shading — fu 26a). DOM readouts first;
the design check has no standalone UI, so it was read by loading `/src/document/designCheck.ts` (`checkDesign`) and
`/src/generate/joints/tapers.ts` (`jointFaults`) in the page and running them on `flatDocument(migrateDocument(<the stored
project>))`. No paid call was made; production was not touched. The test project **"Dovetails check"** (made with
`+ New project`) is LEFT in the dev profile; `localStorage` was not cleared. The stored document reads `version: 26`.

Screenshots, the PDF and its render are in the session scratchpad (gitignored, not durable):
`/tmp/claude-1000/-home-alec-docker-sloyd/fbbeffca-2cfd-42dd-962d-36a9ca333c5d/scratchpad/` —
`dovetails-iso.png`, `dovetails-corner.png`, `dovetails-cutlist-bench.png`, `dovetails-cutlist.pdf`,
`dovetails-cutlist-print-p2.png`. The prose below, with its measured values, is the record.

| # | Check | Result |
|---|---|---|
| 1 | Drawer built by hand, Dovetail the corners with defaults: success notes | PASS (verbatim) |
| 2 | Design check on the dovetailed drawer | PASS (clean) |
| 3 | Cut list lines, bench drawings, chain labels, label size | PASS |
| 4 | Viewport corner screenshot | PASS (taken; owed to the user's eye) |
| 5 | Undo / redo, Slope 6, Swap, single-part Remove → overlap | PASS |
| 6 | Real print (`page.pdf`, Letter) | PASS (both bench drawings on page 2, unclipped) |
| 7 | Console | PASS (0 errors) |

## 1. The drawer, and Dovetail the corners

Four parts, all `On edge`, 6" wide (tall), set through the Properties fields: Front and Back 18" × 6" × 3/4" at z 19-1/4
and z 0; Left side and Right side 18-1/2" × 6" × 1/2", Turn 90°, at x 0 and x 17-1/2, z 3/4 (butt corners: the sides run
between Front and Back). All four selected in the Parts list (click, then Shift-click). The multi-selection view showed
**Dovetails** with Slope `1 :` `8`, Tails empty (placeholder `Auto`), `Swap tails and pins` unticked, and `Dovetail the
corners`. After the click, the notes under it, verbatim:

- `Dovetailed 4 corners: 4 tails, 1:8.`
- `Tails on Left side, Right side.`
- `Left side is now 1-1/2" longer.`
- `Right side is now 1-1/2" longer.`

Stored: each part carries two `dovetails` entries; the sides 20" long (each runs out 3/4" at each end, to the outside faces
of Front and Back). Front's pins are `outside: "min"`, Back's `"max"`; `axisFrame` gives an On-edge, turn-0 part
`thickness reversed` along Z, so Front's thickness min face is world +Z (the drawer's front) and Back's max face is world −Z:
both pin boards are narrow on their OUTSIDE faces, as they should be.

## 2. The design check

`checkDesign` → `[]` and `jointFaults` → `[]` on the dovetailed drawer (the two boxes at each corner interpenetrate; the
bodies partition them, spec §5.3).

## 3. Cut list (DOM readout)

Rows: `1 × 18" × 6"` Back, `1 × 18" × 6"` Front (Pine — 3/4"), `2 × 20" × 6"` Left side, Right side (Pine — 1/2").
The sides' lines, verbatim:

- `Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 3/4" deep, at the length min end; this part has the tails, 1-3/16" at the end.`
- `Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 3/4" deep, at the length max end; this part has the tails, 1-3/16" at the end.`

Front's: the same with `1/2" deep` and `this part has the pins, narrow on its thickness min face.`; Back's with `narrow on
its thickness max face.` No notch, dado or rabbet lines appear.

**Bench drawings.** Exactly two `.cutlist-bench-figure`s on the sheet, both inside the sides' row (`.cutlist-bench` in that
`.cutlist-row`), directly under its `Thickness face — min side` diagram and side by side (x 607 and x 909, each 297 px
wide, top at the same y). Captions: `Dovetails — the tail board's face` and `Dovetails — the pin board's end grain`. Front and
Back's rows have none.

Chain label texts (the `<text>` elements, in order):

- Tail board's face: `1/4"`, `1-3/16"`, `1/4"`, `1-3/16"`, `1/4"`, `1-3/16"`, `1/4"`, `1-3/16"`, `1/4"`, then `baseline 3/4"`,
  `6"`, `1:8`, `both ends`.
- Pin board's end grain: `outside face`, the same nine-value chain, `inside face`.

The chain sums to the width (5 × 1/4 + 4 × 1-3/16 = 6). **At 6" the full chain draws on TWO tiers**, not one row: every
`1/4"` at one y (1328 px, tail drawing) and every `1-3/16"` 15 px lower (1343); no two labels on a tier overlap (e.g.
`1/4"` 623–650 then 683; `1-3/16"` 643–689 then 702).

**Label size.** Every label's computed `font-size` is `20px` in SVG user units, so the rendered size is 20 × rendered width
/ viewBox width: the PartDiagram 20 × 600 / 1090 = **11.0 px**; the tail drawing 20 × 297 / 540 = **11.0 px**; the pin drawing
the same. The bench labels render at PartDiagram's size.

## 4. Viewport

`dovetails-iso.png` (Iso) and `dovetails-corner.png` (the front-right corner panned to the canvas centre with a real
right-drag and zoomed with the wheel): the tails' end grain shows through the front face and the pins' through the side,
four tails up the corner, flush. Software GL; how the corner reads on real hardware is owed to the user.

## 5. Undo, redo, Slope 6, Swap, Remove

- **Undo** (one entry): the stored parts read `Front L=18`, `Back L=18`, `Left side L=18.5`, `Right side L=18.5`, no
  `dovetails` key on any part; the cut list has no `Through dovetails` line and no bench drawing (rows 18" × 6" ×3 groups).
- **Redo**: sides 20" again, two entries per part, eight `Through dovetails` lines.
- **Slope 6**, run again on the four: `Dovetailed 4 corners: 4 tails, 1:6.` / `Tails on Left side, Right side.` — no
  "longer" notes; lengths unchanged (20", 18"); every entry `count: 4, slope: 6`.
- **Swap tails and pins** ticked, run again: `Dovetailed 4 corners: 4 tails, 1:6.` / `Tails on Front, Back.`; stored roles
  Front/Back `tails` (1/2" deep), the sides `pins` (3/4" deep); lengths unchanged; `checkDesign` → `[]`.
- **Remove** (single-part view, Left side; its section heads `Dovetails · 2` with each end's line and a `Remove` button): the
  `length min end` entry removed → `Dovetails · 1`; `checkDesign` → one violation, `kind: overlap`, parts
  `["Left side", "Front"]`, `Left side passes 0.5in into Front along X.` (the corner at Left side's length min end is the
  front one: its length is reversed along Z). `jointFaults` → `[]`.
- Three Undos then restored the default state (sides tails, 1:8) for the print.

## 6. Real print

`page.emulateMedia({ media: 'print' })`, `page.pdf({ format: 'Letter' })` with the cut list open, then
`emulateMedia({ media: null })`. Read back with PyMuPDF: 3 pages. Page 1: the 3/4" rows; **page 2: the sides' row with both
bench drawings** (captions at y 326 pt, the tail drawing x 99–319 pt, the pin drawing x 369–589 pt; the rightmost chain label
ends at x 596.7 pt of 612); page 3: Buying. Both drawings are whole on page 2 — no break through either, nothing clipped —
and every chain label and `baseline 3/4"`, `outside face`, `inside face`, `both ends` is present in the page text.
Rendered to `dovetails-cutlist-print-p2.png`. (`page.pdf` prints with no page margin by default, so the sheet runs to the
paper edge; that is the harness, not the app.)

## 7. Console

0 errors throughout. Warnings only: three.js deprecations (`PCFSoftShadowMap`, `Clock`) and the llvmpipe `GPU stall due to
ReadPixels` driver note around screenshots.

**No defects found.**

**Owed to the user's eye:** the bench drawings' look, on screen and printed (fu 511: the two-tier chain at 6" measured
above; `dovetails-cutlist-bench.png`, `dovetails-cutlist-print-p2.png`); the copy review (fu 512); the jointed corner on
real hardware (software GL here; `dovetails-corner.png` is only a preview).
