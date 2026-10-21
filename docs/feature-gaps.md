# Feature gaps — what woodworkers would miss, coming from SketchUp and similar apps

Researched 2026-10-11 against SketchUp and its woodworking extensions (OpenCutList,
CutList Bridge, CabinetSense, Fredo Round Corner, the rake-and-splay tool), Fusion 360,
Shapr3D, SketchList 3D, CutList Plus fx and Mozaik. Each gap was checked against the code
and `docs/follow-ups.md` before being listed.

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
| Splayed / raked legs, compound angles | Windsor chairs, splayed stools; SketchUp has a dedicated extension | open |
| Curves | Arched aprons, curved stretchers, rounded tops, bandsawn parts | chunk 1 shipped 2026-10-15 (schema 17: Arch, Half-round notch, Bow, Rounded corner(s) cut through a part; viewport, section, snap, cut list), deployed 2026-10-15; chunk 2 (drawings: finer arcs, silhouettes, part diagrams; fu 361) deployed 2026-10-15 (no schema change); Claude features on curves fu 363 |
| Edge profiles | Chamfers, roundovers, eased edges; mostly visual, but expected | chamfers shipped 2026-10-12 (angle cuts chunk 3); roundovers and other profiles shipped 2026-10-17 to 10-19 (edge profiles chunk 1, profile runs a1–c2; deployed `index-Cqf9kRT7.js` and later) |
| Holes | Dowels, shelf-pin rows, hardware bores | shipped 2026-10-14: chunk 1 (schema 16: bores and shelf-pin rows, cut list) and chunk 2 (drawings, Hinge cup), both deployed 2026-10-14; holes through joinery/Refine and Generate still open (fu 328, 329) |
| Dovetails, box joints | Joinery generator is rectangular joints only | open |
| Claude features on angled parts | Generate/Refine/Add joinery refused angle cuts after they shipped | tapers shipped 2026-10-13 (AI tapers chunks 1–2, turned links); miters, bevels and chamfers shipped 2026-10-13/14 (AI angles chunks 1–2); splined/biscuited miter joints still open (fu 276) |

## 2. Drawings and views — fit the current model

| Gap | Notes | Status |
|---|---|---|
| Dimensioned drawings | The most-cited gap anywhere ("if I don't have a drawing with dimensions, what's the point of having a great model?"). Per-part diagrams exist; no assembly elevations with dimension strings | shipped (plans-sheet round, deployed 2026-10-12) |
| Exploded view | SketchUp scenes / OpenCutList; also shows joinery | shipped (plans-sheet round, deployed 2026-10-12) |
| Section cut | Clipping plane to see inside a joint | shipped 2026-10-15 (section cut: Front/Side/Top plane, exact caps with bores, viewport only), deployed 2026-10-15 |
| Standard views | One-click top/front/side; only a perspective/orthographic toggle exists | merged 2026-10-13 (standard views + image export: Front/Side/Top/Iso), deployed 2026-10-13 |
| X-ray / transparency; saved views ("scenes") | | open |
| Image export | PNG of the viewport; no export path exists | merged 2026-10-13 (Save image: a clean PNG of the view), deployed 2026-10-13 |

## 3. Materials and buying — fit, mostly in the cut list

| Gap | Notes | Status |
|---|---|---|
| Solid-lumber yield | Only sheet goods get a nesting layout. OpenCutList applies a 1.2–1.7 rough-lumber waste factor; CutList Plus picks starting board sizes | shipped (lumber yield & cost round, deployed 2026-10-12) |
| Cost | Price per board foot / per sheet, project total (OpenCutList, CutList Plus, SketchList 3D) | shipped (lumber yield & cost round, deployed 2026-10-12) |
| Custom materials | `MATERIALS` is a fixed seven entries; the `SheetStock` doc comment anticipates this round (ash, poplar, 5×5 Baltic birch, ½" ply…) | merged 2026-10-14 (custom materials chunk 1, schema 15: library + per-project copies, Materials & prices dialog, Refine keeps them) |
| Nominal dimensional lumber | A 2×4 is 1½ × 3½ | merged 2026-10-14 (custom materials chunk 2: names in the cut list and Buying, a Nominal size select, a per-material switch) |
| Edge banding | Banded edges flagged on the cut list | shipped 2026-10-20 (schema 19: band types, bands, core sizes, strips and tape in Buying, looks, glue lines; deployed `index-QDQAnB8n.js`) |
| Hardware / accessories BOM | Screws, hinges, slides, pulls | deployed 2026-10-21 (schema 20: per-project types with pack size and price, counts on parts, assemblies and the project, the cut list's Hardware section, Buying's block); pending merge and deploy |
| Weight | OpenCutList reports cost and weight together | open |
| Printable part labels | OpenCutList-style stickers; distinct from the diagram label layout | open |
| Metric display | Input already parses metric; `units.display` only allows `'imperial-fractional'` | shipped 2026-10-15 in two chunks (Units switch, fields, typing, tape, cut list, bench lines; drawings bare mm + sheet note, Buying brackets, metric grid) |

## 4. Ergonomics

| Gap | Notes | Status |
|---|---|---|
| Parametric resize | Fusion users praise resizing a piece and having parts follow | open |
| Align / distribute | Equal shelf spacing etc.; copy in a row covers part of it | open |
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
