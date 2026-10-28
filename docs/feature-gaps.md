# Feature gaps — what woodworkers would miss, coming from SketchUp and similar apps

Researched 2026-10-11 against SketchUp and its woodworking extensions (OpenCutList,
CutList Bridge, CabinetSense, Fredo Round Corner, the rake-and-splay tool), Fusion 360,
Shapr3D, SketchList 3D, CutList Plus fx and Mozaik. Each gap was checked against the code
and `docs/follow-ups.md` before being listed. Statuses last brought up to date 2026-10-28
(production `ee43d69`, schema 29: weight, part labels, align, X-ray and saved views deployed); `docs/follow-ups.md` wins on any follow-up's status.

**This is a candidate list, not a roadmap.** Nothing here is chosen until the user picks it.
Excluded on purpose: CSV/clipboard export and name run-collapsing (`Leg 1..4`), both
declined; fu 147 and fu 163's ply residue, open by decision.

Status column: `open` = not started; otherwise the round that took it up.

## 1. Inexpressible in the box + rectangular-cut model

Biggest woodworker gaps and the biggest architectural asks. The v1 spec logs free-angle
rotation and curves as *unscheduled, not declined* ("angled parts can arrive later as an
explicit feature with compound-angle math"; a mesh kernel is to be revisited "only if
curves" arrive). Most of these need a schema bump, with the rollback cost that brings.

| Gap | Notes | Status |
|---|---|---|
| Tapered legs | The most-asked SketchUp furniture question (several Fine Woodworking articles) | shipped 2026-10-12 (angle cuts chunk 1, schema 14) |
| Miters and bevels | Picture-frame and case miters, bevelled panel edges; a miter is faked as a butt today | shipped 2026-10-12: Miter (chunk 2), Bevel and Chamfer (chunk 3) |
| Splayed / raked legs, compound angles | Windsor chairs, splayed stools; SketchUp has a dedicated extension | chunk 1 shipped 2026-10-24 (schema 22: a part leans by typed rake and splay; Level the ends; resultant and sightline in Properties and on the Plans sheet; checks read the lean; joinery refuses, Refine keeps), deployed `index-B3SCZcHR.js`. Chunk 2 angled holes shipped 2026-10-25 (schema 23: a hole row's bit tilts; Bore leg sockets bores a seat along its leaning legs; holes on leaning parts; Level the ends keeps holes), deployed `index-B114iN-Y.js`. Chunk 2b round tenons (fu 447) shipped 2026-10-25 (schema 24: a part's end carries a round tenon; a tenon seated in a matching socket is a joint the checks hold; Bore leg sockets tenons the legs; joinery refuses, Refine keeps), deployed `index-ObjqEMR0.js`. Chunk 2c square-set legs shipped 2026-10-26 (schema 25: a lean may be square to the sides, the default for a new lean, and Level the ends cuts a square-set leg's ends as compound miters; joinery refuses, Refine keeps a compound cut), deployed `index-3F79fb4S.js`. Chunk 3 stretchers (fu 438) shipped 2026-10-26, deployed `index-D-XnmIBh.js` (no schema change: Add stretcher puts a square rung with two round tenons between two upright legs at a typed height, its sockets bored along the rung in the legs, held by the joint's clause (d); Fit the stretcher again re-fits it after a lean edit). Open: diagonal/X and H stretchers, round rung stock, a shoulder cut to the leg, aprons, three-legged stools' rungs (fu 475–481) |
| Curves | Arched aprons, curved stretchers, rounded tops, bandsawn parts | chunk 1 shipped 2026-10-15 (schema 17: Arch, Half-round notch, Bow, Rounded corner(s) cut through a part; viewport, section, snap, cut list), deployed 2026-10-15; chunk 2 (drawings: finer arcs, silhouettes, part diagrams; fu 361) deployed 2026-10-15 (no schema change); Add joinery and Repair accept curved parts (joinery-features chunk 2, deployed 2026-10-22) and Refine carries curves (refine-features, deployed 2026-10-23); Generate/Refine authoring curves and design checks reading curved bodies still open (fu 363) |
| Edge profiles | Chamfers, roundovers, eased edges; mostly visual, but expected | chamfers shipped 2026-10-12 (angle cuts chunk 3); roundovers and other profiles shipped 2026-10-17 to 10-19 (edge profiles chunk 1, profile runs a1–c2; deployed `index-Cqf9kRT7.js` and later); Add joinery and Repair accept them (joinery-features chunk 2, deployed 2026-10-22); Generate and Refine author them (AI profiles, fu 430 chunk 2, deployed 2026-10-23) |
| Holes | Dowels, shelf-pin rows, hardware bores | shipped 2026-10-14: chunk 1 (schema 16: bores and shelf-pin rows, cut list) and chunk 2 (drawings, Hinge cup), both deployed 2026-10-14; Add joinery and Repair accept holed parts (joinery-features chunk 1, deployed 2026-10-22; fu 328); Generate and Refine author hole rows (AI holes, deployed 2026-10-23; fu 329) |
| Dovetails, box joints | Joinery generator is rectangular joints only | box joints DEPLOYED 2026-10-27 (Box joint the corners, `boxJoints.ts`, inv 61; `975e418`); through dovetails DEPLOYED 2026-10-27 (`72228cc`, schema 26: Dovetail the corners with a typed slope and tail count, hand-cut layout with half pins at both edges, the cut list line and two bench drawings, the checks read real bodies, joinery leaves them alone, Refine keeps them; `dovetails.ts`, inv 62; fu 484); half-blind dovetails DEPLOYED 2026-10-28 (`33de29a`, `index-aWJcbSuP.js`) (schema 27: a Joint select — As they are / Through / Half-blind — and a Lap field, Auto a third of the front's thickness; the stopped pin sockets, the cut-list lap and the bench's lap line; fu 497 closed for the joint); open: corners of different heights along the joint, box joints and both dovetail kinds (fu 485), rabbeted and overlay fronts (fu 516), dovetails on featured parts, proud tails, typed spacing, joinery choosing one, Plans callouts (fu 498–503) |
| Claude features on angled parts | Generate/Refine/Add joinery refused angle cuts after they shipped | tapers shipped 2026-10-13 (AI tapers chunks 1–2, turned links); miters, bevels and chamfers shipped 2026-10-13/14 (AI angles chunks 1–2); splined/biscuited miter joints still open (fu 276) |

## 2. Drawings and views — fit the current model

| Gap | Notes | Status |
|---|---|---|
| Dimensioned drawings | The most-cited gap anywhere ("if I don't have a drawing with dimensions, what's the point of having a great model?"). Per-part diagrams exist; no assembly elevations with dimension strings | shipped (plans-sheet round, deployed 2026-10-12) |
| Exploded view | SketchUp scenes / OpenCutList; also shows joinery | shipped (plans-sheet round, deployed 2026-10-12) |
| Section cut | Clipping plane to see inside a joint | shipped 2026-10-15 (section cut: Front/Side/Top plane, exact caps with bores, viewport only), deployed 2026-10-15 |
| Standard views | One-click top/front/side; only a perspective/orthographic toggle exists | merged 2026-10-13 (standard views + image export: Front/Side/Top/Iso), deployed 2026-10-13 |
| X-ray / transparency; saved views ("scenes") | | X-ray DEPLOYED 2026-10-28 (`c0d3b30`, `index-DQJDNnyg.js`) (no schema change: an `X-ray` button and R draw the selection solid and every other part faded, to see joints inside; draw-only — clicking through a faded part is fu 539); saved views DEPLOYED 2026-10-28 (`ee43d69`, `index-CaZZjZyz.js`) (schema 29: `views` on the document — camera, section, explode, hidden parts; a `Views · N` footer to save, go to, rename, update, delete; allowed while exploded; residue fu 540–542) |
| Image export | PNG of the viewport; no export path exists | merged 2026-10-13 (Save image: a clean PNG of the view), deployed 2026-10-13 |

## 3. Materials and buying — fit, mostly in the cut list

| Gap | Notes | Status |
|---|---|---|
| Solid-lumber yield | Only sheet goods get a nesting layout. OpenCutList applies a 1.2–1.7 rough-lumber waste factor; CutList Plus picks starting board sizes | shipped (lumber yield & cost round, deployed 2026-10-12) |
| Cost | Price per board foot / per sheet, project total (OpenCutList, CutList Plus, SketchList 3D) | shipped (lumber yield & cost round, deployed 2026-10-12) |
| Custom materials | `MATERIALS` is a fixed seven entries; the `SheetStock` doc comment anticipates this round (ash, poplar, 5×5 Baltic birch, ½" ply…) | merged 2026-10-14 (custom materials chunk 1, schema 15: library + per-project copies, Materials & prices dialog, Refine keeps them) |
| Nominal dimensional lumber | A 2×4 is 1½ × 3½ | merged 2026-10-14 (custom materials chunk 2: names in the cut list and Buying, a Nominal size select, a per-material switch) |
| Edge banding | Banded edges flagged on the cut list | shipped 2026-10-20 (schema 19: band types, bands, core sizes, strips and tape in Buying, looks, glue lines; deployed `index-QDQAnB8n.js`); Add joinery and Repair accept banded parts (joinery-features chunk 3, deployed 2026-10-22); Generate and Refine author bands (AI bands, fu 430 chunk 1, deployed 2026-10-23) |
| Hardware / accessories BOM | Screws, hinges, slides, pulls | deployed 2026-10-21 (schema 20: per-project types with pack size and price, counts on parts, assemblies and the project, the cut list's Hardware section, Buying's block); residue: hardware from holes, a cross-project library, hardware on the Plans sheet, multi-selection (fu 404–407, open); handedness and parsed sizes (fu 408, open by decision); fu 410–412 closed 2026-10-23 |
| Weight | OpenCutList reports cost and weight together | DEPLOYED 2026-10-28 (`5395a21`, `index-DawoF3J5.js`) (schema 28: a density on every material — fixed on the built-ins, typed on a custom one; each cut-list group's weight and the project's, Properties' Weight for the selection; edging at its own species; a material with no density named, never silently left out); residue: hardware weight, holes, the Plans sheet and Buying, density in the tip check (fu 522–525) |
| Printable part labels | OpenCutList-style stickers; distinct from the diagram label layout | DEPLOYED 2026-10-28 (`582ce1e`, `index-CvkZOxnI.js`) (no schema change: `Labels…` in the cut list opens a Labels sheet — one sticker per piece with the row number, name, cut size, material, grain, project and copy, on Avery 5160/5163 or L7160/L7163 at true size, a Start at for a part-used sheet); residue fu 528–532 |
| Metric display | Input already parses metric; `units.display` only allows `'imperial-fractional'` | shipped 2026-10-15 in two chunks (Units switch, fields, typing, tape, cut list, bench lines; drawings bare mm + sheet note, Buying brackets, metric grid) |

## 4. Ergonomics

| Gap | Notes | Status |
|---|---|---|
| Parametric resize | Fusion users praise resizing a piece and having parts follow | BUILT 2026-10-28 on branch `stretch`, not deployed (no schema change, inv 64: "stretch", not stored constraints — the assembly and multi-selection panels' Overall size section: type a new width, height or depth, place the stretch line (the middle by default), see what grows, moves and stays, and Stretch; the min side fixed, everything past the line moves exactly, spanning parts grow and their features follow their side or refuse; one undo entry); residue fu 545–552 |
| Align / distribute | Equal shelf spacing etc.; copy in a row covers part of it | DEPLOYED 2026-10-28 (`cf911cc`, `index-5OtJpPqw.js`) (no schema change: the multi-selection panel's Align section — align left/centre/right, bottom/middle/top, back/centre/front to the part selected first; Space evenly along X/Y/Z with the outer two fixed; exact, one undo entry); residue fu 534–537 |
| Construction lines | fu 130 — ask before assuming it's wanted; needs real hardware (26a) | open |

## Sources

- OpenCutList: https://forums.sketchup.com/t/opencutlist-a-crowdfunded-extension/301089 ,
  https://forums.sketchup.com/t/opencutlist-5-0-ideas-exploded-views/222670
- https://forums.sketchup.com/t/cut-list-extension-recommendation/183795
- https://www.finewoodworking.com/forum/extensions
- https://www.finewoodworking.com/2016/01/09/extensions-for-sketchup
- https://www.finewoodworking.com/2023/07/11/modeling-curved-and-tapered-legs-in-sketchup
- https://www.finewoodworking.com/2026/06/05/raked-and-splayed-legs-in-sketchup
- https://forums.sketchup.com/t/rounding-a-tapered-leg-question/42925
- https://forums.sketchup.com/t/sketchup-and-fusion-360-for-woodworking-furniture-design/185939
- https://popularwoodworking.com/editors-blog/sketchup-fusion-360
- https://discourse.shapr3d.com/t/features-for-woodworking/14634
- https://shapr3d.com/industry/woodworking
- https://www.capterra.ca/software/204375/sketchlist-3d
- https://forestsource.io/software/cutlist-plus-fx
- https://www.mozaiksoftware.com/en-uk/products
- https://forums.sketchup.com/t/the-sketchup-wish-list/33695?page=18
