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
| Tapered legs | The most-asked SketchUp furniture question (several Fine Woodworking articles) | open |
| Miters and bevels | Picture-frame and case miters, bevelled panel edges; a miter is faked as a butt today | open |
| Splayed / raked legs, compound angles | Windsor chairs, splayed stools; SketchUp has a dedicated extension | open |
| Curves | Arched aprons, curved stretchers, rounded tops, bandsawn parts | open |
| Edge profiles | Chamfers, roundovers, eased edges; mostly visual, but expected | open |
| Holes | Dowels, shelf-pin rows, hardware bores | open |
| Dovetails, box joints | Joinery generator is rectangular joints only | open |

## 2. Drawings and views — fit the current model

| Gap | Notes | Status |
|---|---|---|
| Dimensioned drawings | The most-cited gap anywhere ("if I don't have a drawing with dimensions, what's the point of having a great model?"). Per-part diagrams exist; no assembly elevations with dimension strings | merged, not deployed (plans-sheet round, 2026-10-11) |
| Exploded view | SketchUp scenes / OpenCutList; also shows joinery | merged, not deployed (plans-sheet round, 2026-10-11) |
| Section cut | Clipping plane to see inside a joint | open |
| Standard views | One-click top/front/side; only a perspective/orthographic toggle exists | open |
| X-ray / transparency; saved views ("scenes") | | open |
| Image export | PNG of the viewport; no export path exists | open |

## 3. Materials and buying — fit, mostly in the cut list

| Gap | Notes | Status |
|---|---|---|
| Solid-lumber yield | Only sheet goods get a nesting layout. OpenCutList applies a 1.2–1.7 rough-lumber waste factor; CutList Plus picks starting board sizes | open |
| Cost | Price per board foot / per sheet, project total (OpenCutList, CutList Plus, SketchList 3D) | open |
| Custom materials | `MATERIALS` is a fixed seven entries; the `SheetStock` doc comment anticipates this round (ash, poplar, 5×5 Baltic birch, ½" ply…) | open |
| Nominal dimensional lumber | A 2×4 is 1½ × 3½ | open |
| Edge banding | Banded edges flagged on the cut list | open |
| Hardware / accessories BOM | Screws, hinges, slides, pulls | open |
| Weight | OpenCutList reports cost and weight together | open |
| Printable part labels | OpenCutList-style stickers; distinct from the diagram label layout | open |
| Metric display | Input already parses metric; `units.display` only allows `'imperial-fractional'` | open |

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
