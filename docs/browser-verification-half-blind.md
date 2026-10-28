# Browser verification — half-blind dovetails

Date: 2026-10-28. Dev server (`npm run dev -- --port 5199`, origin `http://localhost:5199`) on branch `half-blind` at
`d05dbc2`. **Nobody watched this run.** The X display was gone (`/tmp/.X11-unix` empty), so the Playwright MCP's headed browser
could not start. The pass was driven headless from node scripts using the MCP's own Playwright library (the memory's
documented fallback): `/opt/google/chrome/chrome` with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`,
and a persistent profile in a scratch directory.

**New harness finding:** WebGL failed in that path at first (`THREE.WebGLRenderer: Error creating WebGL context`). The shell
still had `DISPLAY=localhost:10.0` from the dead X forward, so ANGLE tried `xcb_connect()`, failed, and the GPU process exited.
Removing `DISPLAY` from the script's environment fixed it (`WebGL 2.0 … SwiftShader driver`). Every run below has WebGL; each
script checks for a `webgl2` context before it does anything.

Software GL throughout: these screenshots show layout, not shading (fu 26a).

DOM and store readouts come first. The design check has no standalone UI. To read it, `checkDesign` and `jointFaults` were
loaded in the page and run on `flatDocument(migrateDocument(<the stored project>))`. Section caps and body faces were read the
same way, from `/src/document/section.ts` and `/src/document/bodies.ts`. No paid call was made, and production was not touched.

**Where the test projects are.** The project is **"Half-blind check"**, imported twice: the first run's output was truncated,
so the steps were repeated on a fresh import. Both copies sit in the SCRATCH profile on origin `:5199`
(`/tmp/claude-1000/-home-alec-docker-sloyd/hb9/profile`), **not in the user's dev browser profile**. Both are left in place,
and `localStorage` was not cleared. Both read `version: 27`. The second import is the one every step below reads.

Screenshots were under `.superpowers/sdd/2026-10-27-sloyd-half-blind-dovetails/img/` (gitignored; **deleted** with the workspace at the round's close, 2026-10-28; figure B's lap was since redrawn dashed, fu 520). The prose
below, with its measured values, is the record.

| # | Check | Result |
|---|---|---|
| 1 | Drawer; Front + sides `Half-blind`, Back + sides `Through`: success notes | PASS (verbatim) |
| 2 | Stored dovetails, sizes, positions; design check; cut-list lines | PASS |
| 3a | Front shows no socket on its face | PASS (face area 108 = 18 × 6; the through Back reads 103.25; Front view and Plans draw only hidden lines) |
| 3b | Sockets in a section through the corner | PASS (cap readout and Plans Section A–A, measured; in the viewport the seam is in the outline data but not visible in software GL — owed to the eye) |
| 3c | Bench pair shows the lap band | PASS (band, line, label read from the DOM; **the look is owed to the user**) |
| 3d | Plans sheet draws the joint | PASS |
| 4 | Re-run `As they are`, slope 1:6, all four parts | PASS (stays half-blind at the front, through at the back; one undo entry) |
| 5 | Console | PASS (0 app errors) |

**No defects found.**

## 1. The drawer, and the two runs

The drawer is four `On edge` parts, all 6" wide (tall):

- Front 18" × 6" × 3/4" at z 19-1/4.
- Back 18" × 6" × 1/2" at z 0.
- Left side and Right side 18-3/4" × 6" × 1/2", Turn 90°, at x 0 and x 17-1/2, z 1/2. These are butt corners: the sides run
  between Front and Back.

It was built as a plain `.sloyd` file, made in the page with `createDocument`/`createBoard`, and brought in with the Project
menu's `⬆ Import…` through the file chooser. The through record typed the drawer into the Properties fields instead. Every
dovetail step below went through the panel.

**Run 1.** In the Parts list, click Front, then Shift-click Left side and Right side. Before the run, the Dovetails section
read: Slope `1 :` `8`; Tails empty (placeholder `Auto`); **Joint `As they are`**; **Lap empty (placeholder `Auto`)**. With
`Joint` set to `Half-blind`, Lap stayed enabled. After `Dovetail the corners`, the section's notes were, verbatim:

- `Dovetailed 2 corners, half-blind: 4 tails, 1:8, 1/4" lap.`
- `Tails on Left side, Right side.`
- `Left side is now 1/2" longer.`
- `Right side is now 1/2" longer.`

(The multi-selection panel also shows the Link section's preview, `Linking makes 2 parts match Front: …`. That line was there
before the click and is not a dovetail note.) Panel screenshot: `hb-01-panel-halfblind.png`.

**Run 2.** Select Back, Left side and Right side, with `Joint` set to `Through`. The Lap field went **disabled**. The notes:

- `Dovetailed 2 corners: 4 tails, 1:8.`
- `Tails on Left side, Right side.`
- `Left side is now 1/2" longer.`
- `Right side is now 1/2" longer.`

This is the through success form, unchanged. Screenshot: `hb-02-panel-through.png`.

## 2. Read back

**Store** (`sloyd.project.<activeId>`, after both runs):

- **Front:** L 18, position [0, 0, 19.25]. Two entries, `length` min and max: `pins`, count 4, slope 8, pin 1/4, **depth
  1/2**, `outside: "min"`, **`lap: 0.25`**. On-edge at turn 0, the thickness runs reversed along Z, so the min face is world +Z,
  the drawer's front: the lap is on the outside.
- **Back:** L 18, position [0, 0, 0]. Two entries: `pins`, count 4, 1:8, depth 1/2, `outside: "max"`. **No `lap` key.**
- **Left side and Right side:** **L 19-3/4**, positions [0, 0, 0] and [17.5, 0, 0].
  - `length min` (the front corner): `tails`, count 4, 1:8, **depth 1/2**, `lap: 0.25`.
  - `length max` (the back corner): `tails`, count 4, 1:8, depth 1/2, **no `lap` key**.
- These match the hand figures:
  - Auto lap = round(3/4 ÷ 3 to 1/16) = 1/4.
  - Tails depth = 3/4 − 1/4 = 1/2.
  - Each side runs out 1/2" at the front (to the lap plane, z 19-3/4 = 20 − 1/4) and 1/2" at the back (to the back's
    outside face, z 0): 18-3/4 + 1 = 19-3/4.
  - N = 4 at 6": Te = (6 − 5 × 1/4) / 4 = 1-3/16.

**Design check:** `checkDesign` → `[]`, `jointFaults` → `[]`, and `dovetailFaults` → `[]` for all eight entries.

**Cut list** (DOM readout). The rows are `1 × 18" × 6"` (Front), `2 × 19-3/4" × 6"` (the sides) and `1 × 18" × 6"` (Back).
Each part's lines, verbatim:

- **Front:**
  - `Half-blind dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length min end; this part has the pins, their narrow ends 1/4" in from its thickness min face (the lap).`
  - The same line `at the length max end`.
- **Sides:**
  - `Half-blind dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length min end; this part has the tails, each 1-3/16" wide at the end.`
  - `Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the tails, each 1-3/16" wide at the end.`
- **Back:**
  - `Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length min end; this part has the pins, their narrow ends on its thickness max face.`
  - The same line `at the length max end`.

The through pin line matches production's template, `c6f60bc` `dovetailText.ts:125`, byte for byte.

## 3. Look

### 3a. No socket on the front face

**Measured.** The area of each part's wood lying in a thickness plane was summed over `partGeometry(b).bodies` faces, in
part-local coordinates. Results:

| Face | Area (in²) | Faces |
|---|---|---|
| Front's outside face (local thickness 0) | **108** = 18 × 6, the whole face | 3 |
| Front's inside face (local thickness 3/4) | 103.75 | 11 |
| **Control:** Back's outside face, through pins | **103.25** | 11 |
| Back's inside face | 103.75 | 11 |

The figures check by hand:

- **Front's inside face.** Each socket at the inside face is a tail's narrow width, Te − 2·(1/2)/8 = 1-1/16, by 1/2 (the
  side's thickness). That is 4 × 1-1/16 × 1/2 × 2 ends = 4.25 removed, leaving 103.75.
- **Back's outside face.** The through sockets show at full width Te: 4 × 1-3/16 × 1/2 × 2 = 4.75 removed, leaving 103.25.

So the measure can fail: it reads the through sockets on the Back. On the Front it reads a whole face.

**Viewport.** Orthographic, Front view: `hb-20-front.png`, plus `hb-23-front-corner.png` with the front's left end panned to
the centre and zoomed. The front face is plain grain to its end, with no tail end grain and no socket lines.

**Plans, Front view.** The Front view's `plan-visible` path holds exactly **4 segments**, the 18" × 6" outline. Every joint line
at its ends is in the `plan-hidden` path (1px, dash 4 3). See `hb-30-plans-1.png` and the zoom `hb-31-plans-front-corner-zoom.png`.
At this scale the short horizontal hidden segments are shorter than one dash, so they read as thin grey ticks.

### 3b. The sockets in a section

The Section was set through the panel: `Section` → `Top` → Position typed `27/32`. The store reads `{ axis: 'top', at:
0.84375, flip: false }`. The field displays `7/8"`, rounded for display; the stored value is exact. 27/32 is the centre of tail
0, whose span is [1/4, 1-7/16] up the 6" width.

The caps were read from `sectionCaps`, in world x/z extents per piece:

- **Front:**
  - x 1/2–17-1/2, z 19-1/4–20.
  - **x 0–1/2, z 19-3/4–20** and x 17-1/2–18, z 19-3/4–20. At each corner only the **1/4" lap** is Front's wood. The socket
    behind it, z 19-1/4–19-3/4, is the side's.
- **Left side** (and Right, mirrored): x 0–1/2, with pieces z 0–1/2, 1/2–4-3/4, 4-3/4–19-1/4 and **19-1/4–19-3/4**. The tail
  stops at z 19-3/4, **1/4" short of the front face (z 20)**. At the back, the piece z 0–1/2 runs to the back's outside face:
  through.
- **Back:** x 1/2–17-1/2 only. At this height the side's through tail fills the corner square.

**The viewport, honestly:** `hb-24-section-front-left.png` (front-left corner, zoomed) and `hb-25-section-back-left.png` (the
through back-left corner, as a control) show the cut.

- In these screenshots the caps of the front and the side read as one continuous hatched fill, with no seam visible between
  them at either corner.
- The seam IS in the data the viewport draws. `BoardMesh.tsx` builds the cap's line geometry from `sectionCaps(…).outline`,
  and near the front-left corner (x ≤ 1/2, z ≥ 19) those outlines hold these segments:
  - Front: (1/2, 19-3/4)–(1/2, 19-1/4), (0, 19-3/4)–(1/2, 19-3/4) and (0, 20)–(0, 19-3/4). These outline the lap strip and the
    socket's side.
  - Left side: (1/2, 19-3/4)–(0, 19-3/4), which is the tail's end at the lap plane.
- So what is missing is the line's visibility on screen, in the darkened cap colour under software GL, not the geometry. The
  through corner reads the same. **Owed to the user's eye on real hardware**, not a defect found.

The Plans sheet's section draws the corner: see 3d.

### 3c. The bench pair and the lap band

The sides' row carries **two bench pairs, four figures**, both inside the row:

- **Pair 1, the front, half-blind corner:** the tail figure ends `1:8`, `length min end`. Its pin figure (B) has the lap band.
- **Pair 2, the back, through corner:** `length max end`. Its B has no band.

`layoutKey` keeps them apart (spec §5.2), as the spec intends. Front's and Back's rows have none.

**Figure A (half-blind).** Labels: the chain `1/4"`, `1-3/16"` ×4, `1/4"` on two tiers; `baseline 1/2"`; `6"`; `1:8`;
`length min end`. It is identical in form to the through A, whose baseline is also 1/2".

**Figure B (half-blind)**, at `deviceScaleFactor: 2`: `hb-10-bench-0.png`, `hb-11-lapfig-0.png`.

- One `.cutlist-bench-lap` polygon, points `45.4,113 494.6,113 494.6,131.72 45.4,131.72` (viewBox units). That is the full
  joint width by 18.72 units, which is 1/4" at the drawing's scale, against the outside face.
  - Computed fill `rgb(236, 228, 214)`, **fill-opacity 0.06**, stroke the same colour at 1.5px.
  - The waste polygons are fill-opacity 0.22.
  - On screen the band is 247 × 10.3 CSS px.
- The sockets are shaded from the lap plane to the inside face. The chain's ticks run down to the lap plane, not to the
  outside face. The outline is 3/4" deep (depth + lap).
- Labels: `outside face`, then **`lap 1/4"` on the same row** (x 955–1008 px against `outside face` 860–940), then the
  chain and `inside face`. Every label's computed font-size is 20 in a 540-unit viewBox drawn 297 px wide, so 20 × 297 / 540
  = 11.0 px. That is the size the through record measured for the PartDiagram.
- **Figure B (through)**, `hb-10-bench-1.png`, is unchanged in form: no band, no `lap` label.

**Owed to the user's eye (HB-SD4, fu 520). Not judged here:**
1. **The lap band's look.** It is a light tint (fill-opacity 0.06) with a solid 1.5px line along the lap plane, where the spec
   asked for "a solid band". In `hb-10-bench-0.png` the tint is barely visible against the dark sheet. What reads as the lap is
   mostly the extra line, plus the ticks stopping at it.
2. **The `lap 1/4"` label** sits as free text on the outside face's row, after `outside face`, with no dimension tick or
   arrow tying it to the band.

### 3d. The Plans sheet

The sheet is `Plans — Half-blind check`. Screenshots: `hb-30-plans-1.png`, and with the section on, `hb-30-plans-2.png`
(Section A–A).

- **Plan:** dimensions `17"`, `18-3/4"`, `20"`, `18"`. The overall depth, 20", runs from the back's outside face (z 0) to the
  front's (z 20).
- **Front view:** 4 visible segments (3a), with the joint in hidden lines.
- **Side view:** the side's outline with the tails drawn at both ends. Zooms: `hb-32-plans-side-back-zoom.png` (through, back)
  and `hb-33-plans-side-front-zoom.png` (half-blind, front).
- **Section A–A** (section Top at 27/32), headed `Section A–A — Plan cut 7/8" from the bottom, looking down`. The display rounds
  27/32 to 7/8. The `path.plans-cap` elements were read in part order, each polygon mapped back to inches. The scale is
  19.789 px/in on both axes: the caps' overall extent ÷ 18" and ÷ 20".

  | Cap | `data-hatch` | Polygons (x, depth z, in) |
  |---|---|---|
  | Front | 0 | x 1/2–17-1/2, z 19-1/4–20; **x 0–1/2, z 19-3/4–20**; x 17-1/2–18, z 19-3/4–20 |
  | Back | 0 | x 1/2–17-1/2, z 0–1/2 |
  | Left side | 1 | x 0–1/2: z 0–1/2, 1/2–3.562, 3.562–19-1/4, **19-1/4–19-3/4** |
  | Right side | 1 | the same at x 17-1/2–18 |

  So the drawing has Front's wood at the corner as only the 1/4" lap strip, and the side's tail stopping at z 19-3/4, 1/4" short
  of the front's outside line (z 20). At the back, the side's cap runs to z 0, through. The sides' hatch (1) differs from the
  front's and back's (0). The side's internal split at 3.562 differs from the viewport caps' 4-3/4. That split is a seam inside
  one part's cap, which the union outline cancels, so it changes nothing drawn.

  Images, at `deviceScaleFactor: 3`: `hb-34-plans-section.png`, with crops `hb-35-plans-section-front-left.png` and
  `hb-36-plans-section-back-left.png`.
  - **Front-left:** the side's hatched cap ends at a line, and Front's thin strip, hatched the other way, wraps across the
    side's end.
  - **Back-left:** the side's cap runs out to the outside line, with Back butting it.

The four `… small … spacings not labelled` notes are the existing behaviour for 1/2" and 3/4" spacings.

## 4. Re-run: `As they are`, slope 1:6

All four parts were selected. Joint read `As they are`; Slope was typed `6`; Tails stayed `Auto`. Notes, verbatim:

- `Dovetailed 4 corners:`
- `Front and Left side: 4 tails, 1:6, half-blind, 1/4" lap.`
- `Front and Right side: 4 tails, 1:6, half-blind, 1/4" lap.`
- `Back and Left side: 4 tails, 1:6.`
- `Back and Right side: 4 tails, 1:6.`
- `Tails on Left side, Right side.`

This is the per-corner form, as specified for a mix of kinds. There are no "longer" notes. Screenshot:
`hb-40-panel-keep-1to6.png`.

Stored afterwards:

- Every entry is `slope: 6`, with count 4 and pin 1/4 kept.
- The front corners keep `lap: 0.25` on both entries (the stored lap is kept: the pins part is unchanged). Depths are
  unchanged (1/2).
- The back corners still have no `lap` key.
- Lengths and positions are unchanged: sides 19-3/4 at z 0.

**It stays half-blind.**

- **Undo** (Ctrl+Z, once) restores every entry to 1:8 with nothing else changed: one undo entry. **Redo** (Ctrl+Shift+Z) gives
  1:6 again.
- The cut list then reads the six lines of §2 with `1:6`: two `Half-blind` pin lines, the sides' `Half-blind` and `Through`
  tail lines, and two `Through` pin lines. There are still 4 bench figures, 1 lap band and 1 `lap 1/4"` label.
- `checkDesign` → `[]`, `jointFaults` → `[]`.

## 5. Console

0 app errors in every WebGL-enabled run: every script's output was grepped for `error`. The warnings are three.js deprecations only (`PCFSoftShadowMap`, `Clock`). One
`404` came from the harness's own probe of a module path that does not exist (`/src/document/box.ts`), not from the app.

**Owed to the user:** the lap band's look and the `lap <x>` label's placement (3c, fu 520); how the dovetailed corners and the
section cut read on real hardware (software GL here, and nobody watched).
