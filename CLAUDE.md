# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Deployment specifics for this host live in `DEPLOYMENT.local.md` (gitignored).
>
> **This file holds the rules that govern new work, condensed.** The record — what each
> round did, why, what its browser pass could and could not confirm, and the full text of
> every section as it stood before the 2026-10-07 trim — is `docs/history.md`. Where the
> two disagree, this file wins.

---

## What Sloyd is

Modelling and planning for woodworking projects: lay out the parts of a build in 3D, see
how they fit, and get the numbers you need at the bench (dimensions, cut list). Not a
general-purpose CAD tool — the domain assumptions (boards, stock thickness, fractional
inches) are the point. The name is from *sloyd* (Swedish *slöjd*), the Scandinavian
handicraft education tradition built around hand woodworking.

## Status

- **Production matches `master`** as of 2026-10-15: curves chunk 1 (merge `54ea740`) — bundle `index-D4nh2vvL.js`, CSS
  `index-B_EfuaB_.css`, **SCHEMA 17**: rolling back to fu 357 (`7f851f9`, `index-BZDp6iOz.js`, schema 16) or earlier REFUSES
  every project saved since — export first. Test count is under Commands.
- **Curves chunk 1 (spec `2026-10-15-sloyd-curves-design.md`, plan `…-curves-chunk1.md`, inv 53)**: deployed. Arch,
  Half-round notch, Bow, Rounded corner(s) cut through a part; viewport, edges, section caps, snap points, cut list, Properties.
  The execution rulings marked *Amended (implementation, chunk 1)* in the spec await the user's review. Open near it:
  361 closed on the branch (chunk 2), 362–367 (spec §12), 368–373 (residue; 370 real-hardware looks: smooth shading, the grain seam).
- **Curves chunk 2 (drawings; plan `…-curves-chunk2.md`, inv 47/53, fu 361 closed)**: BUILT on branch `curves-2` (HEAD
  `3f6fba4`), **NOT merged or deployed** — merge and deploy on the user's word. **No schema change** (17), so rolling back is
  free. The Plans sheet draws arcs at 0.001" and the silhouettes of curved surfaces (a live defect on master: open rounded-top
  ends, no arch crown); part diagrams draw the waste, sharp-vertex lines and curve notes. Rulings Q1–Q6 (marked *Amended
  (implementation, chunk 2)* in the spec) await the user's review. Open near it: 374–379 (residue).
- **Metric display (spec `2026-10-15-sloyd-metric-display-design.md`, inv 52)**: deployed. 354 closed (metric parts match the nominal
  sections and stock they read the same as). Open near it: 359 (the
  imperial plane note can read the same on both sides), 356/358 record-only. 355, 357 and 360 closed and deployed (357's real Brave print is owed for the user's eye).
- **Section cut (spec `2026-10-14-sloyd-section-cut-design.md`, inv 51)**: deployed. Open near it: 347 (cap look on real
  hardware), 348 (cap cost on drilled parts), 349–350, 352 record-only (351 closed: inv 43 amended).
- **Holes (spec `2026-10-14-sloyd-holes-design.md`, inv 50)**: both chunks deployed (schema 16; fu 327 and 343 closed).
  Open near it: 328–342 (336: the wall-grain seam, deferred by the user to a texture/shader session; 337: real-hardware
  looks owed), 344–346.
- **NEXT: curves chunk 2 awaits the user's merge word; after it, ask.** Custom materials (fu 266) closed; open near it 324–326. Other open items:
  314–320, angle-cut residue 295–298; 241 (open by decision), 251 (record-only), 221, 225, 232, 234, 247.
- **The deployed commit always trails `HEAD`**: a deploy's own record is committed after
  it. Docs-only commits past the hash above are not unreleased work, and some rounds ship
  byte-identical bundles (test-only). Check what a later commit touches before reading
  `git log` as a pending release.
- Every runbook entry and bundle hash: `DEPLOYMENT.local.md`. Per-round narrative and the
  deployment record: `docs/history.md`. Design specs:
  `docs/superpowers/specs/<date>-sloyd-<slug>-design.md`; live checks:
  `docs/browser-verification-<slug>.md`; screenshots: `docs/img/` (prefer a DOM readout,
  add an image when the finding is spatial).
- **Do not re-propose** two items declined on purpose: CSV/clipboard export and name
  run-collapsing (`Leg 1..4`).

### Rounds shipped

One line each; the full narrative per round is in `docs/history.md`.

| Round | Date | Schema | What it added |
|---|---|---|---|
| v1–v3 | 07-29/31 | 1–3 | boards, gizmo, names, grid; grain orientation, textures; posture, part-local grain |
| joinery (cuts) | 07-31 | 4 | `Cut`: stock removed by sub-box decomposition |
| cut list line | 08-01 | — | printable sheet, diagrams, label layout, per-face views, board feet, ghost box |
| sheet nesting | 08-02 | 5 | guillotine-cuttable layout; `stock: { kerf }` |
| snap-move, grabs, cut points | 08-02/03 | — | the Move tool; snap points on cuts |
| guides + tape, type-anywhere, cardinal guides | 08-04 | 6 | the Tape tool, `guides` |
| project library | 08-14 | — | multiple projects; `sloyd.library.v1` (layout 1) |
| 08-31 batch | 08-31 | — | fu 157/158, 97/131, 148, 92, 140, 159–163 (163 from a bug report: ply UV sign) |
| generate, batch variety, held and stable, key check | 10-03 | — | prototypes via Claude (inv 36, 39) |
| stopped cuts, phantom cut, joinery | 10-04 | 7 | `stopMin`/`stopMax`; "Add joinery…" (inv 40, 41) |
| cut words / lines / storage, 198–200, 197 | 10-04/05 | — | `cutShape`, `storedAsShape`, `clippedRegion` |
| joinery fixes, joinery residues | 10-05 | — | fu 182–191, 201–203 |
| multi-select, hide/unhide | 10-05 | — | `selectedIds` (inv 42), `hiddenIds` (inv 43) |
| quarter turns | 10-05 | 8 | true 0/90/180/270 turns, `axisFrame` (inv 44) |
| copy in a row | 10-05 | — | `rowLayout`, `copyInRow` (inv 25) |
| linking | 10-06 | 9 | `Board.link` (retired in 11) |
| assemblies | 10-06 | 10 | `instances` + `definitions`, Group/Ungroup (inv 46) |
| components | 10-07 | 11 | shared definitions, links as `Shape`s (inv 45, 46) |
| generate assemblies | 10-09 | — | generated assemblies + role-linked components, distinct-part cap |
| refine | 10-09 | — | refine by instruction: new project + change list (fu 179) |
| refine joined | 10-09 | — | refine keeps joints: unjoin + exact gate, fixed choices (fu 238) |
| repair joints | 10-09 | — | Repair joints: prune pre-a899b51 strays, prove by the gate (fu 240) |
| estimate range | 10-09 | — | Refine/joinery cost shown as a measured range (fu 236) |
| refined name | 10-10 | — | Derived project names count a repeat ("— refined 2", "copy 2"; fu 237) |
| join repair text | 10-10 | — | A joined Refine labels joinery's repair rounds "Choosing joints — …" (fu 242) |
| record-only 243/244 | 10-10 | — | Dialog memos refuse instead of throwing; residue tests; live pass (fu 243, 244) |
| older record-only | 10-10 | — | Fu 211–239 triaged and closed: eye toggles share one undo entry, no-op edits push none, guards, ~140 tests |
| joinery end cuts | 10-10 | — | A cut at a resized end follows the part in any storage form (fu 205); 206 pinned; residue fu 245 |
| opposite-end cut | 10-10 | — | A full-span cut stored into the far end runs out the grown length too (fu 245) |
| posture handedness | 10-10 | 12 | On-edge reverses thickness so all postures share one hand; v12 mirrors on-edge cuts; every sheet view true (fu 215) |
| 246/226/227 | 10-11 | — | Deleting an assembly's last part removes it; dead eyes say why; `›` reserved in written names; sweep re-run on flipped views |
| 229/233 | 10-11 | — | Ungroup keeps the other copy's hidden assembly hidden (as its children); one cap report for one fault |
| mirrored instances | 10-11 | 13 | `Instance.mirrored`: a live mirrored copy through the one composition; Mirrored checkbox, Copy mirrored, ⇋ badge |
| ui polish | 10-11 | — | Grey/walnut palette; tools and view float over the viewport; Claude ▾; action row with More ▾ and a trash icon; Guides footer |
| 248–250 | 10-11 | — | Viewport colours approved on real hardware; ProjectMenu gets Popover's Safari focusout guard; snap markers in muted milk-paint tones |
| plans sheet | 10-11 | — | Printable Plans sheet (exploded isometric, dimensioned third-angle elevations of the piece and each assembly); viewport Explode slider, read-only while exploded (inv 47) |
| lumber yield & cost | 10-12 | — | Cut list Buying section: board feet × waste factor, by-the-piece boards packed and swapped to the cheapest size, sheets; prices per browser (`sloyd.shop.v1`) in a Lumber & prices dialog |
| 254/264/273 | 10-12 | — | Plans trio height cap (tall pieces print on one page); a one-child container is not an explode level and its drawing is not repeated; a note when a smaller unpriced size would hold a board |
| angle cuts (chunk 1) | 10-12 | 14 | `Board.angleCuts` (half-space plane cuts, stored `kind`); `boardBodies` clips pocket cells; tapers drawn, edged, snapped, on the Plans sheet, cut list (bench lines, short point) and part diagrams; Taper preset; joinery/Refine refuse angled projects |
| angle cuts (chunk 2) | 10-12 | — | Miter preset: "+ Add ▾" (Taper, Miter, Miter both ends — one undo entry), End/Across/Long point/Angle controls (ratio stored, 45° exact), AngleField (DimensionField with a degree parse/format), the miter line names the long point |
| angle cuts (chunk 3) | 10-12 | — | Bevel (Face, Long point, Angle; along the length) and Chamfer (any of 12 edges, Size; exact legs) presets and their final bench wording; the angle-cuts feature is complete |
| AI tapers (chunk 1) | 10-13 | — | Add joinery and Repair accept tapers; the taper-at-joint refusal; checks trust only a taper's flat wood (`contactSolids`) |
| AI tapers (chunk 2) | 10-13 | — | Generate and Refine read/write tapers in world words (`taperWorld.ts`); the taper-joint design fault; joined Refine with tapers |
| turned links | 10-13 | — | Role linking aligns angle-cut ids and tries quarter turns: four tapered legs are one component (fu 301); cut order is not geometry |
| 309–313 | 10-13 | — | AI-tapers residue: Refine refuses a taper the converter would reject; the change list diffs tapers face by face; an unjoined Refine states its fault once; taper tests in every pose |
| 302/303 | 10-13 | — | Overlap and the tip check read a tapered part's real bodies (`clipConvex`, `partMass`); untapered results byte-for-byte unchanged |
| standard views + image | 10-13 | — | Front/Side/Top/Iso (the Plans sheet's views; camera up stays +Y, Top tilted 1e-4 rad); Save image (one clean frame, `toBlob`, `StorageAdapter.exportImage`); framing frames exploded parts where drawn (fu 260) |
| AI angles (chunk 1) | 10-13 | — | Add joinery and Repair accept miters, bevels and chamfers: contact trusts their flat wood (`touchedRegion`/`splitRegion`), a cut running into a joint refuses unless it clears the tenon (`angleConflicts`), joinery keeps angle cuts on their wood (`rebaseAngleCuts`, fu 307) |
| AI angles (chunk 2) | 10-14 | — | Generate and Refine write miters, bevels and chamfers in world words (`angleWorld.ts`); exact untouched angles (`angleRatiosOf`); `angle-joint` design fault; the change list names them; chamfered legs link through turns; the design schema in `$defs` (the API's compiled-grammar cap) |
| custom materials (chunk 1) | 10-14 | 15 | User-defined solid and sheet materials (kind in the id, inv 49): a browser library and per-project copies (`doc.materials`, pruned to what parts use); Materials & prices (was Lumber & prices); Properties picks project/library materials and New material…; Refine keeps them (per-project schema enum; Generate's byte-identical) |
| custom materials (chunk 2) | 10-14 | — | Nominal lumber names (`units/nominal.ts`, exact match): cut-list rows named when every board is the section, Buying `2×4 × 8′`, a Properties Nominal size select, the Sold in nominal sizes switch; pine is nominal |
| holes (chunk 1) | 10-14 | 16 | `HoleRow` (blind/through, a row of `count` at `pitch`, inv 50): rendered open (walls, bottoms, rims), centre snap points, `holeFaults`' strict rule, bench lines (32 mm pitch at 1/64 + mm) and cut-list grouping; Holes section (Hole, Shelf-pin row); joinery/Refine/Repair refuse holed projects |
| holes (chunk 2) | 10-14 | — | Plans sheet: hole rims (96-gons; edge-on as one segment) and wall silhouettes through the one hidden-line pass, occluded by the hole-free bodies; plan paths chain within a part; part diagrams: ellipses, centre marks, dashed depth sides, each row's bench line as a note; the Hinge cup preset |
| section cut | 10-15 | — | Viewport section: one Front/Side/Top plane (slider, exact field, Flip), GPU-clipped parts and edges, exact solid caps from the bodies minus bores (one winding, outline = union boundary), picking/snapping on the kept side (guides exempt); view state only (inv 51) |
| metric display (chunks 1–2) | 10-15 | — | Per-project `in \| mm` Units switch; whole mm for fields, typing (a bare number is mm), tape, cut list, bench lines (holes to 0.1 mm), drag snap; drawings bare mm + "Dimensions in mm" note; Buying parts in mm, trade sizes with mm brackets; metric grid (inv 52) |
| fu 354 | 10-15 | — | Metric parts match nominal sections and stock when they READ the same whole mm (`nominalName`, `fitsStock`, one `mmTicks` rounding); imperial exact |
| fu 360 + 355 | 10-15 | — | Built-in pine's default stock adds the nominal 2× and 4×4 sizes (36); metric design faults show mm in the Joinery/Refine dialogs (`Violation.shown`), the model's text unchanged |
| fu 357 | 10-15 | — | A metric sheet's `Dimensions in mm` repeats in every printed page's top margin (`@page metric-sheet`, margin box) |
| curves (chunk 1) | 10-15 | 17 | `Board.curves` (`CurveCut`: a closed waste outline of lines and minor arcs in a face's (u, v), cut clean through one dimension; inv 53): clipped or split bodies, built edges, smooth normals, a watertight mesh and cap; arc snap points; bench lines and grouping; Curves section (Arch, Half-round notch, Bow, Rounded corner(s)); holes into a curve's waste fault; joinery/Refine/Repair refuse curved projects; an unknown segment type refuses the document |
| curves (chunk 2) — ON BRANCH `curves-2`, not merged | 10-15 | — | Plans sheet: arcs at `DRAWING_CURVE_TOLERANCE` 0.001" (≤96 chords) through `curveDrawEdges`, visibility on the model chord, edge-on views unrefined; silhouettes of curved surfaces (`silhouetteLines`; fixes open rounded-top ends and the missing arch crown). Part diagrams: hatched waste, sharp-vertex lines on their own face, curve notes (`curveLineEntries`). Fu 361 |

### The deployment rule

**Production is verified by loading the page only.** Sloyd has no server-side state:
`localStorage` in the user's browser *is* their project, and exercising a feature against
production would overwrite it with nothing to restore from. So new behaviour is verified
against the **dev server** (Claude drives the Playwright browser; the user can watch), and
the deploy is confirmed by **bundle hash** at the edge and in-network, plus the edge's
**CSP header** (`connect-src 'self' https://api.anthropic.com`), which the dev server does
not send. `localStorage` is confirmed cleared in the verifying browser afterward, checked
rather than assumed. A paid Generate/joinery run needs the user's approval each time; the
key never goes into chat or a committed file. (Generate was once exercised on production
because it only ever adds unactivated projects, inv 36. That is not a precedent.)

**Rollback cost is a schema question.** A build understanding less than `version: 16`
refuses the document. Rolling back past a schema bump strands every project saved since;
export first. A round with no schema change costs nothing to roll back. The library
round changed the storage *layout*, not the schema: rolling past it loses only projects
created after adoption (inv 30).

## Architecture

Static single-page app. No server, no database, no backend API, no env vars. **One
outbound call**: Generate/joinery call `api.anthropic.com` from the browser with the
user's own key (`dangerouslyAllowBrowser`), stored only in `sloyd.llm.v1`; the CSP's
`connect-src` allows only that origin.

**The plain-JSON document is the source of truth; the Three.js scene is derived from it
and is never authoritative.** A document is
`{ version, name, units, stock, guides, boards, instances, definitions, shapes, materials }`.
Dragging computes a number, writes it to the document, and the scene re-renders — never
the reverse. That keeps undo, save/load and export simple. **A board's `position` is its
min corner**, not its centre (inv 2).

### Layer order

Each layer depends only on the ones before it:

1. **`units`** — imports nothing. `length.ts` (fractional inches), `quantity.ts`.
2. **`document`** — schema, geometry, tree, validation, versioned migration.
3. **`store`** (Zustand + snapshot undo/redo) and **`storage`** (the `StorageAdapter` seam).
4. **`llm`** — the provider seam (`LlmClient`, opaque `LlmMessage`). Imports NOTHING from
   the app.
5. **`generate`** — prompt and run loop; imports only `document` and `llm`.
   `useGenerations.ts` / `useJoinery.ts` sit beside `App.tsx` because they own React state
   and storage writes.
6. **`viewport`** (react-three-fiber) and **`panels`** (React) — read/write through the
   store, import `document` directly; `panels` also imports the `storage` singleton.

**The `→ units` edge rule: a module imports `units` when it produces a string a person
reads off the page, and not otherwise.** `cutlist.ts`, `diagram.ts`, `nesting.ts`
(`formatLength`, so one dimension never reads two ways on one sheet) and
`viewport/TapeTool.tsx` (`parseLength`, for the live preview) take it, and so does `designCheck.ts` (a metric violation's
`shown` copy, fu 355; its model `message` stays decimal inches).
`snapPoints.ts` and `row.ts` deliberately do not. Do not generalise to "everything under
`document` imports `formatLength`". A TYPE-only import of `Units` is not an edge (`types.ts`, `geometry.ts`' `snapStep`), nor is `gridDensity.ts`' `isMetric` (the
ground grid's ladder is a display choice of the project's units, not a string).

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`. Nothing else touches `localStorage` or the filesystem. A desktop build
would be a second implementation, not a parallel path.

### Versioning

Every load path (open, import, autosave-restore) runs `migrateDocument` before the
document is trusted. `CURRENT_VERSION` is **17**. Steps run one version at a time, in
order, on RAW data before `validateBoard` (inv 11) — except v10→v11 and v11→v12, which run after.

| Step | Adds | Shape | Harm a build one version back would do |
|---|---|---|---|
| 1→2 `foldRotationToV2` | rotation fold | per-board, raw | — |
| 2→3 `addPostureToV3` | `posture` | per-board, raw | — |
| 3→4 `addCutsToV4` | `cuts` | per-board, raw | — |
| 4→5 | `stock.kerf` (default 0.125 if absent/non-numeric/outside [0,1) — defaulted, not clamped) | document-level | wrong number (sheet count) |
| 5→6 | `guides` (default `[]`; malformed guide dropped) | document-level | silent loss on round-trip |
| 6→7 | `Cut.stopMin`/`stopMax` (default 0) | document-level | wrong geometry |
| 7→8 `trueTurnsToV8` | true turns; mirrors cuts of 90° parts | per-board, raw | wrong geometry |
| 8→9 | `Board.link` | document-level | silent loss |
| 9→10 | `instances`, `definitions` (default `[]`) | document-level | every part in an assembly vanishes |
| 10→11 `linksToShapes` | `shapes` (default `[]`) | **after validation** | un-shares every component |
| 11→12 `onEdgeToV12` | on-edge cuts mirrored along thickness | **after validation** | wrong geometry (on-edge one-handed cuts mirrored) |
| 12→13 | `Instance.mirrored` (only `true` stored) | document-level, no step | wrong geometry (a mirrored copy drawn unmirrored) |
| 13→14 | `angleCuts` on parts and shapes (default `[]`; malformed or non-finite entry dropped, missing `kind` derived) | document-level, no step | silent loss on round trip (every taper/miter dropped) |
| 14→15 | `materials` (custom materials the parts and shapes use; default `[]`; validated BEFORE the parts so they see them; malformed entry or one whose `kind` disagrees with its id dropped; pruned on load and in `edit()`) | document-level, no step | silent loss (a custom material becomes pine, and the next save writes pine) |
| 15→16 | `holes` on parts and shapes (default `[]`; malformed entry dropped — non-finite, non-positive diameter or depth, non-integer count, negative pitch/station/inset, `along === face`, unknown enum; a faulted but well-formed row KEPT) | document-level, no step | silent loss on round trip (every hole dropped) |
| 16→17 | `curves` on parts and shapes (default `[]`; malformed entry dropped — non-finite number, unknown enum, no segments or more than 64, an arc with both/neither of `rise`/`radius`, a non-positive one, a zero chord, a rise over half its chord or a radius under half, an outline not closing EXACTLY at `start` (P1), crossing itself or enclosing no area; a faulted but well-formed curve KEPT); a string segment `type` other than `line`/`arc` REFUSES THE DOCUMENT (the newer-version gate keyed on content: a spline needs no bump) | document-level, no step | silent loss on round trip (every curve dropped) |

- **A bump exists for the refusal gate, not for upgrading** — absent fields default
  regardless. Argue *your* field's harm; don't inherit another bump's argument.
- **v8's and v12's steps are NOT idempotent** (they mirror): the `d.version < 8` and
  `d.version < 12` guards are all that stop a file being re-mirrored on every load.
- **v10→v11 runs after validation**, guarded by `d.version < 11`, before `repairTree`,
  because it needs validated values and world order to judge equal link members (spec
  §8.3). Each link becomes one `Shape` from its first member; equal members become shaped
  parts; a differing member stays plain. `link` is read only from a file below v11.
- `validateShapes` drops a malformed shape (claiming no id) and a duplicate id (first
  wins); a definition whose id is literally `ROOT` is dropped (the write-back's root id).
  `repairTree(doc, { copyShared: version < 11 })` runs on every load (inv 46).

## Where things live

An index; the rules are in Invariants (`inv N`). The fully annotated tree as of
2026-10-07 is in `docs/history.md`. Where a file's own doc comment is the stated single
source of truth — `tapeHover`'s clearing enumeration, `tapeAxis`'s structural rule,
`TapeAxis`'s world-vs-board-local argument, `woodCut`'s seam argument, `App.tsx`'s
`pending` — **read it there.**

```
src/
├── units/            length.ts (Units; parseLength/formatLength(…, units)/canBeginLength; capture set {0-9 . -}; formatMm,
│                     formatLengthBare, formatSize, floorToTick; inv 52), nominal.ts
│                     (NOMINAL_SECTIONS, nominalName — EXACT at 1e-9, either order —, stockLengthText: whole feet `8′`),
│                     quantity.ts (board/square feet, two decimals fixed)
├── document/
│   ├── types.ts          Board, Cut, Shape, ShapedBoard, StoredBoard, Instance, Definition,
│   │                     SloydDocument, FlatDocument, MATERIALS, sheet stock, HoleRow (`Board.holes`, `Shape.holes`)
│   ├── document.ts       create/validate/migrate (inv 11); takeId (inv 33); trueTurnsToV8 /
│   │                     mirrorCutAlong (inv 44); validateGuides, validateShapes
│   ├── ids.ts            nextId, the one id minter
│   ├── names.ts          uniqueName / dedupeNames among siblings (inv 8); derivedName,
│   │                     the derived-PROJECT name ("— refined 2", fu 237)
│   ├── geometry.ts       axisFrame, the ONE turn table, and its crossings (inv 44);
│   │                     boardExtents/boardCenter/reorientedPosition (inv 2), boardsBounds
│   ├── frames.ts         placeBoard / placeInstance, the ONE composition (inv 46); mirrorPart/withMirror/toLocal (mirrored frames)
│   ├── mirrorCut.ts      mirrorCutAlong (moved verbatim), mirrorCut, clamp (inv 44)
│   ├── tree.ts           occurrence paths, isCovered, worldParts (THE walk), flatDocument
│   ├── treeEdit.ts       every write-back: applyWorldEdits (storageKey), lowerEdit,
│   │                     translateItems, writeBackFlat (inv 46); lower/lowerCuts are the exact inverse
│   │                     of a mirrored placement; postureRefusal (flat<->upright across a mirror), sameSideFirst
│   ├── treeOps.ts        group/ungroup, shareInstance, makeUniqueItem, removeItems, turnInstance;
│   │                     setMirrored / mirroredCopy over placedBox / replaceKeepingBox (mirrored instances)
│   ├── treeRepair.ts     repairTree, dropUnresolved (load repair)
│   ├── shapes.ts         resolveBoard (THE shape reader), shapeUsers, prune/dissolveShapes (inv 45)
│   ├── links.ts          LINK_FIELDS (the ONE shared/own table), sameShared, linkPlan (inv 45; refuses
│   │                     a member with no occurrence on the source's side of a mirror)
│   ├── linksToShapes.ts  the v10→v11 step
│   ├── cuts.ts           cutRegion, pocketCells, pocketEdges (inv 16's exact grid path), clippedRegion (THE clip),
│   │                     cutShape (THE description of a cut), cutLabel, openSides,
│   │                     storedAsShape, cutsThatRemoveStock, CUT_GEOMETRY_FIELDS (inv 40)
│   ├── angleCuts.ts      AngleCut model (inv 48): ANGLE_CUT_FIELDS (inv 40), keptHalfSpace, depthAt/zeroStation, touchedRegion
│   │                     (the box a cut can remove) / splitRegion (a cell split around it: contact's flat wood),
│   │                     mirrorAngleCut (inv 44), deriveKind; the shop-field conversions per kind — taperFields,
│   │                     MiterFields/BevelFields (stored slope RATIO, miterRatio 45° → 1), ChamferFields (12 canonical
│   │                     CHAMFER_EDGES, exact legs) — each with its xCut writer and default; imports only types/geometry
│   ├── angleText.ts      angleLine (THE bench line for every angle cut; faceName: a length face is an END),
│   │                     shortPointLine (corner minimum, fu 281), angleDegrees (→ units)
│   ├── angledRefusal.ts  TaperConflict / taperJointRefusal; AngleConflict / jointRefusal (THE joint-refusal message, one sentence per part)
│   ├── holes.ts          THE hole geometry (inv 50): HOLE_FIELDS (inv 40), sameHoleRow, copyHoleRow, mirrorHoleRow (inv 44),
│   │                     mm (n / 25.4, as parseLength), defaultHole/defaultShelfPinRow/defaultHingeCup (35 mm × 1/2", 3" from
│   │                     the min end of the LONGER in-face dimension, 22.5 mm in; fu 343), holeInstances/boardHoles, holeRing/
│   │                     holePrism (memoised by frozen Hole identity), clipPolygon/clipPlan/minusPrism/minusCover, holeRims, insideHole
│   ├── holeFaults.ts     holeFaults (THE strict rule: breaks-out, off-flat, meets-hole, too-deep), stockChecks, holeInStock (clean);
│   │                     intoCurve: a hole meeting a curve's waste is a breaks-out carrying `curve` (not `edge`)
│   ├── holeText.ts       holeLine (THE bench line; pitch at 1/64 at least, whole mm shown; a faulted row's `— check:`),
│   │                     holeFaultText (THE fault words), distinctFaults (too-deep once), endWord/edgeName (→ units);
│   │                     faultKey (a breaks-out keyed `:edge` or `:curve:<id>`, distinctFaults on the same key)
│   ├── holedRefusal.ts   holedParts / holedRefusal: joinery, Refine and Repair refuse a holed project, naming the parts
│   ├── holeDrawing.ts    holeDrawingSegments: one part's hole lines for the Plans sheet (inv 50), world space — every rim as a
│   │                     DRAWING_HOLE_SEGMENTS (96)-gon, a rim edge-on to the view as ONE segment (chunk 2 R2), then the wall's two
│   │                     silhouettes (none looking down the axis); built only through `toWorld` (inv 44); decides nothing hidden
│   ├── curves.ts         THE curve model (inv 53): CURVE_FIELDS (inv 40), CURVE_TOLERANCE 0.005 / SEGMENTS_MAX
│   │                     24 / STORED_MAX 64, copyCurve, mirrorCurveCut (inv 44), localSegments/arcOf (LocalArc: centre, radius,
│   │                     rise, crown), curveOutline (chords ON the arc), smoothLines, bowsInto, wasteContains/isAir (P3),
│   │                     circleMeetsWaste/rectMeetsWaste, curveFaults (THE decider: runs-off, cuts-through), convexPieces (ear
│   │                     clip), curvePlan (CLIP or SPLIT; the strengthened P6), splitPieces; writers/readers archCurve/archFields,
│   │                     bowCurve/bowFields, cornerCurve/cornerFields, deriveCurveKind, curveKindWord, presets defaultArch/
│   │                     Notch/Bow/Corner/Corners; runtime imports `geometry` only
│   ├── curveDrawing.ts   [branch `curves-2`] curves on paper (inv 47, 53): DRAWING_CURVE_TOLERANCE 0.001 / DRAWING_CURVE_SEGMENTS_MAX 96,
│   │                     curveDrawEdges (each model chord + a fine path of nodes ON the true arc; ends stay on the chord, Q4;
│   │                     deep-frozen, memoised), curveSilhouettes / silhouetteLines (Q1; the probe offset); imports geometry, bodies, snapPoints, curves
│   ├── curveText.ts      curveLine/curveLines (THE bench lines; four equal corners collapse), curveFaultText
│   │                     (THE fault words) (→ units)
│   ├── curvedRefusal.ts  curvedParts / curvedRefusal: joinery, Refine and Repair refuse a curved project (after holes')
│   ├── outline.ts        unionOutline + SECTION_EPS, moved from section.ts (re-exported there): the caps' and
│   │                     curvedEdges' boundary of coplanar convex pieces
│   ├── angleWorld.ts     WorldMiter/WorldBevel/WorldChamfer: design miters, bevels, chamfers in world words; angleCutsFor (design →
│   │                     stored via the Properties writers), worldAngles (structural standard forms), angleRatiosOf (the exact-angle
│   │                     map), ratioFor, sortAngleCuts (the one stored order)
│   ├── taperWorld.ts     Dir/WorldTaper: design tapers in world words; dirToLocal/localToDir (inv 44), worldTapers
│   │                     (stored → design form, structural standard form), taperCutsFor (design → taperCuts, §2.2 rules)
│   ├── bodies.ts         boardBodies (pocket cells clipped by angle cuts), bodyEdges, boardEdges (inv 16);
│   │                     partGeometry: THE cached reader of both, plus the frozen `holes` (shared, frozen; see per-file rules);
│   │                     curve waste clipped or split (`BodyFace.curve` on chord faces), curvedEdges (BUILT
│   │                     edges, inv 53), edgesOf (THE three-way choice: pocketEdges / curvedEdges / bodyEdges), SMOOTH_EPS
│   ├── tenons.ts         findTenons
│   ├── cutlist.ts        buildCutList (inv 18) — stock, not remainder
│   ├── depthField.ts     buildDepthField (inv 20)
│   ├── diagram.ts        buildDiagrams, one view per (face, from); per view `holes` (circles down the axis), `holeSides`
│   │                     ({axis, bottomAt}: dashed depth boxes across it) and `holeNotes` ({row, text}: bench lines), in THREE
│   │                     passes — every row's entry view opened first, then circles and sides, notes last in STORED row order (chunk 2 R3);
│   │                     [branch `curves-2`] per view `curves` (waste polygons, hatched), `curveLines` (sharp-vertex lines, only on a face
│   │                     the vertex lies on) and `curveNotes` (`curveLineEntries`); a curve opens its through face's min view only when
│   │                     neither side exists, AFTER holes' entry views
│   ├── nesting.ts        buildNesting, shelf FFD; formatDims (invs 19, 22, 23); packOnto (by-the-piece boards,
│                         grain locked, largest size opened first) and grainFootprint
│   ├── materials.ts      custom materials (inv 49): validateCustomMaterial(s), mintMaterialId, MaterialCatalog —
│   │                     catalogOf(doc) (built-ins + doc.materials, memoised on the array) / builtInCatalog; materialUses,
│   │                     pruneMaterials, upsertMaterials (same object when unchanged), pickerLibrary (one label per picker)
│   ├── purchase.ts       ShopSettings + defaultShop/validateShop (browser-level prices; built-in AND custom-shaped ids
│   │                     validated by kind; a top-level `extra` folded back on read); buildPurchase: the cut
│                         list's Buying section (bd ft × waste, packed boards swapped down to the cheapest size
│                         that still holds them — a heuristic, sheets × price), every string built here (→ units)
│   ├── snapPoints.ts     board/cut/guide snap points, towardFor, offsetPoint (inv 26); hole centres ('face-center', entry
│   │                     and through exit); stockProbe treats a hole's mouth as air (inv 16's exception)
│   ├── row.ts            rowLayout (gap/pitch/fit-across; refusal CODES; no rounding, inv 25)
│   ├── generated.ts      DESIGN_SCHEMA (part + direction in `$defs`: the API's grammar cap), parseDesign, designToDocument (assemblies → a TREE;
│   │                     `Authored` maps flat names back to what the model wrote; MAX_MAGNITUDE)
│   ├── roleLinks.ts      linkByRole: role + sameShared classes → linksToShapes (inv 45);
│                     turnCandidates (other quarter turns keeping the world box and grain axis; every kind re-stored via taperWorld/angleWorld; none
│                     for rectangular cuts or a cut either cannot describe), alignedTo (adopts the representative's angle-cut ids)
│   ├── assemblyChecks.ts distinctParts, distinctPartsViolation, collapseViolations (one report
│   │                     per authored fault; "fix the assembly" only for overlaps)
│   ├── refineDesign.ts   documentToDesign (Refine's input + refusals, incl. 'taper-form'/'angle-form'; definitions normalised),
│   │                     carryGrain, designValues (exact values kept; angles via the exact-angle map), definitionCorner
│   ├── designDiff.ts     diffDesigns — what a refine changed, by flat display name (→ units); taperLines/angleLines (kind `angle`;
│   │                     a bevel placed by face AND long point)
│   ├── designCheck.ts    checkDesign; worldSolids, the ONE world-solid mapping (invs 38, 39); partMass and the body overlap
│   │                     for angled parts (fu 302/303); jointViolations (the model-facing `angle-joint` fault);
│   │                     contactRegions / contactSolids / isAngled: the checks' flat-wood-only reader (invs 38, 48)
│   ├── drawing.ts        drawView: exact hidden-line vector drawing; edges from boardEdges (inv 16) plus hole lines from
│   │                     holeDrawingSegments, occluders from worldBodies (the bodies, angle cuts included, holes not), via partGeometry;
│   │                     [branch `curves-2`] a curved part's edges come through `curveDrawEdges`, plus `silhouetteLines`
│   ├── explode.ts        explodeOffsets (hierarchical, floor-lifted), EXPLODE_SPREAD/INNER
│   ├── section.ts        THE section cut (inv 51): Section, keptBySection (THE side test), sectionPlaneOf, sectionSpan,
│   │                     sectionCaps (board-local caps minus bores, a per-part local cache), unionOutline
│   │                     (moved to outline.ts and re-exported)
│   ├── dimensions.ts     overall + chain dimension values and strings per axis (fitting is panels/planDims.ts)
│   ├── plans.ts          planAssemblies: what the sheet draws (copies, mirrored parity)
│   └── treeFixtures.ts, turnFixtures.ts   TEST-ONLY (assemblyDoc; chiralPart, inv 44; chiralCurved);
│                         curveFixtures.ts (TEST-ONLY ARCH, CORNER: never import a test module, it re-registers its suite);
│                         shakerTableFixture.ts (the generated, joined, refined Shaker table)
├── store/
│   ├── store.ts          state, edit(), undo/redo/restore, selectionPatch, held points,
│   │                     hiddenIds, copyInRow, group/link/unique actions (invs 4, 24, 34, 42–46);
│   │                     addHoleRows/updateHoleRow/removeHoleRow (one edit, held points re-judged after);
│   │                     addCurves/updateCurve/removeCurve, the same shape
│   ├── assemblyPick.ts   clickTarget (inv 46)
│   ├── selectionGesture.ts  selectByClick, clearOnMiss (shared by viewport and parts list)
│   └── visibility.ts     visibleBoards, the ONE visibility filter (inv 43)
├── storage/          types.ts (StorageAdapter), browser.ts, libraryIndex.ts (invs 7, 29–31); get/setShopSettings
│                     (`sloyd.shop.v1`: reading never writes, so a newer build's value survives a rollback; a write
│                     folds `extra` into `materials`); get/setMaterialLibrary (`sloyd.materials.v1`, layout 1; an
│                     unusable or newer value reads empty with `readFailed`, and the dialog never saves over it);
│                     exportProject/exportImage share ONE anchor download helper
├── llm/              types.ts (LlmClient, opaque LlmMessage, inv 37), anthropic.ts
├── generate/         prompt.ts (limitLines), concepts.ts (batch planning), estimate.ts (cost ranges: measured
│                     chars/token, cached prefix, every repair round high; fu 236), refine.ts (refineMessage,
│                     detailFor), run.ts (runRepairLoop, evaluateDesign — THE design evaluation
│                     shared by Generate and Refine, runRefine, runJoinery),
│                     joints/{pocket,sites,recipes,choose,unjoin,repair,tapers}.ts (tapers.ts: taperConflicts, angleConflicts + clearsTenon, jointFaults (model-facing `angle-joint`, for evaluateDesign), joineryRefusal — the ONE joinery refusal decider; inv 41; recipes' `refaceFromEnd` re-stores an end cut from another face, fu 205, and `rebaseAngleCuts` keeps angle cuts on their wood, fu 307); unjoin + gateUnjoin
│                     read joints back, proved by an exact (1e-9in) re-join (readJoints = the lenient
│                     body); runJoinery's `fixed` keeps recorded joints passing validChoice, `alsoPresent`
│                     = original's problems; repair.ts = fu 240's prune-and-prove (a stray must be empty
│                     and its twin the same stored part; evidence rule); joints/fixtures/ = damaged docs made by the buggy 4a340f7
├── useGenerations.ts, useJoinery.ts, useRefine.ts, useRepair.ts   write only via createProject(…, {activate:false}) (inv 36)
├── viewport/         NO unit tests by design. Viewport, BoardMesh (inv 21), MoveTool +
│                     moveCandidates, TapeTool, Gizmo (invs 3, 10, 42), GuideMarkers,
│                     SnapMarker, snapPick (screen-space nearest, on purpose), grain*.ts,
│                     framing.ts (pure, TESTED: STANDARD_VIEWS = the Plans sheet's views, viewDirection, subsetBounds
│                     with explode offsets, zoom/distance); Viewport's `ViewportHandle` (showView, capture — the clean
│                     frame hides Gizmo/MoveTool/TapeTool by a `hidden` prop, NEVER by unmounting them)
│                     (invs 12, 14, 15, 17, 35), pointer.ts, gridDensity, screenScale, extent;
│                     grainTiling.ts' hole path (inv 50): bodyMesh (holed faces; seam faces subtracted only in holed
│                     bodies), faceTriangles (rings as holes, clip-split fallback), holeMesh (one hole's wall + bottom;
│                     clean = unclipped), holesMesh (every hole of a part, ONE geometry); holesPerf.test.ts (the guard)
│                     sectionPlane.ts (THE shared clipping plane, inv 51); BoardMesh draws its part's cap; sectionPerf.test.ts
│                     grainTiling's drawsAsBox (THE BoxGeometry-or-bodyMesh routing: a box no hole reaches,
│                     on a part WITHOUT curves), bodyMesh's radial normals on chord faces and curvedPart (seams dropped, welded,
│                     conformed); conform.ts (insertOnEdges, centroidFan, welder, CONFORM_EPS 1e-7); capFill.ts (THE cap fan,
│                     moved out of BoardMesh; conformed for a curved part); curvesPerf.test.ts (the guard),
│                     curvesWatertight.test.ts (every directed edge matched), bodyMeshIdentity.test.ts (holed, uncurved: master's bytes)
├── panels/           DimensionField/NameField (invs 5, 9), Properties, CopyInRow, PartsList,
│                     Toolbar, TapeReadout (invs 27, 28), GuidesList, ProjectMenu,
│                     SettingsDialog, GenerateDialog, JoineryDialog, RefineDialog, RepairNotice, CutList, PartDiagram,
│                     SheetLayout, diagramScale, diagramLabels (inv 19); Popover (Claude ▾, More ▾),
│                     ViewportControls (tools/view over the canvas), ActionBar (three actions, More ▾,
│                     trash), GuidesFooter (opens itself when the guide count goes up), PlansSheet / PlanFigure /
│                     planLayout / planDims (the Plans sheet: figures, one-scale third-angle layout, dimension fitting;
│                     PlanFigure's `pathOf` chains a segment into the previous subpath only when its start meets the previous
│                     end AND it is the same part, so a hidden rim dashes continuously); PartDiagram draws hole ellipses
│                     (rx = r·sx, ry = r·sy), centre crosses, dashed sides and the hole notes (keyed by row);
│                     MaterialsDialog ("Materials & prices": built-in prices, custom definitions + prices, library rows;
│                     one Save = one project edit + library + prices; refuses, never clamps) on materialsDraft.ts (THE
│                     pure rows/refusals/planSave/rebaseRows) and MaterialDefinition; CutList's Buying section
│                     AngleCuts (the Angles section: "+ Add ▾" — Taper, Miter, Miter both ends, Bevel, Chamfer —
│                     and one row per kind), AngleField (DimensionField with a degree parse/format; max floored to 0.1°);
│                     Holes (the Holes section: "+ Add hole ▾" — Hole, Shelf-pin row, Hinge cup —, one row type; an edit refused
│                     when it ADDS a fault; Count 1→more seeds a pitch, chunk 1 R5), CountField (DimensionField, whole numbers);
│                     Curves (the Curves section: "+ Add curve ▾" — Arch, Half-round notch, Bow, Rounded
│                     corner, Rounded corners —; rows by derived kind; refusalFor: half circle first, then an ADDED curve fault,
│                     then a hole into the waste)
├── styles.css        surface ROLES over --grey-*/--walnut-*; palette.test.ts pins contrast (4.5:1)
└── App.tsx           layout, autosave/restore, the ONE keydown effect (inv 27), `pending`
                      (inv 29), switchToken (inv 32), `.app-shell` inert behind any modal
```

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.

### Per-file rules not covered by an invariant

- **`snapPoints.ts`**: local→world is `position[axis] + toWorldOffset(board, axis,
  local[axisFrame(board)[axis].dim])`. `pointToLocalXYZ` and `solidWorldBox` are
  CENTRE-relative and both look like they do this — using either puts every point off by
  half the board, plausibly. Pin with a rotated, non-flat pose. `towardFor` is the tape's
  ONE direction source (preview and commit); a locked axis wins over a hover, never falls
  back to it. `sameSnapPoint` lives here because the store needs it.
- **`cutlist.ts` / `diagram.ts`**: format from `cutShape`, never from stored
  `across`/`offset`/`width`/stops (fu 192). The cut list accumulates EXACT stock, never
  qty × rounded dimensions, and ignores cuts (stock, not remainder). `storedAsShape`
  returns an already-aligned cut as the same object.
- **`bodies.ts`**: read bodies and edges through `partGeometry` wherever it runs per frame or per part (snap
  points, drawings, BoardMesh). Its results are SHARED between parts with one `geometryKey` and deep-frozen:
  never mutate them. The key is board-local (dimensions, cut geometry, angle cuts, hole rows) — no pose — and carries each
  angle cut's and hole row's ID, because a clipped face names its cut (`BodyFace.cut`) and `bodyMesh` looks it up by id.
- **`angleCuts.ts` field conversions**: the row's fields carry STORED values — a miter/bevel its slope ratio, a chamfer
  its legs, a taper its stations and depths — never re-derived through `atan`/`tan`, so an edit of side, end or face keeps
  a 45° cut at depth = run exactly. Degrees exist only in display and typed input, and reach a writer only through
  `miterRatio`. A reader returns null for a stored line its row cannot represent (an offset bevel line; a line that
  never reaches 0 inside the part) — the row then shows the bench line and Remove, never a control that would rewrite it.
- **`AngleCuts.tsx`**: every hook sits above every `kind` branch (a fixed crash class). Every refusal reads `Removes more
  than the <dimension> — reduce the <control> first.`, is decided before `updateAngleCut`, and leaves the select on the
  stored value. A menu preset whose default would be refused on this part is withheld, not added and then refused.
- **`nesting.ts`** takes `doc.boards`, NEVER `CutListRows`; too-big parts go in
  `unplaceable`, never dropped. The word `turned` rides on `dims` (inv 19).
- **`SheetLayout.tsx`** is the only caller of `fitLabel`'s `requireDetail`; the tier
  decision stays in `fitLabel`, not as a panel override. The sheet key list is NOT an
  `<ol>` (the number comes from `nextIndex`, not DOM position; fu 162).
- **`prompt.ts`**: a batch concept rides in the USER turn, never in `SYSTEM_PROMPT`, which
  must stay a fixed prefix. `Concept` lives in `prompt.ts` so it never imports
  `concepts.ts`. **`concepts.ts`**' parse is all-or-nothing (never mixes planned and
  built-in concepts).
- **`SettingsDialog.tsx`**: a new key is shape-checked and verified with one free
  `GET /v1/models`; 401/403 refuses, anything else saves with a note. **There is
  deliberately no prefix rule.**
- **`useGenerations.ts`**: auth or cancel during planning starts no run; a cancel landing
  as planning resolves is caught before the runs (its test asserts run CALLS).
- **`store.ts`**: `copyInRow` and `duplicateBoards` share `copyBoard` so they cannot drift.
  `tapeAxis` is NOT a held point (an enum cannot go stale; do not give it clearing rules).
- **`MoveTool` / `moveCandidates`**: pre-grab candidates are the SELECTED parts' points,
  post-grab the UNSELECTED parts'; a selected part is never a target; guides are targets
  only, never grab sources. Its dep list is inv 15's failure mode.
- **`TapeTool.tsx`** subscribes to `tapeAxis`; locked with nothing typed draws NO line (a
  decision; fu 130 is the alternative). A click while locked re-anchors and keeps the lock.
- **`BoardMesh.tsx`**: its `stopPropagation` is load-bearing (a toggle reaching two solids
  is a no-op); `selectable` is required so Move's commit click cannot select its target.
- **`Viewport.tsx`**: the projection swap re-frames only once `controls.object === camera`,
  or it aims the new camera at the origin.
- **`DimensionField.tsx`**: min/max REFUSE out-of-range input, never clamp. Enter commits
  and blurs (fu 212); a refused entry keeps focus. `onCommit` may return a refusal MESSAGE (a string): the field shows
  it as its OWN error (same element, role and `aria-invalid` as min/max), keeps focus and the typed text, and keeps it
  until its own next commit or an external resync — no sibling clears it (holes chunk 1 R7, R8). AngleCuts has not adopted it (fu 339).
- **`ProjectMenu.tsx`**: deliberately not an ARIA menu. The arm/disarm swap renders a
  `<button>` at the same sibling index in both branches — giving either a `key` breaks
  focus. Rendered only when `libraryAvailable`. A duplicate error's cause is read off
  `storage.available` (the ADAPTER flag, never React's `available`; fu 159).
- **`GuidesList.tsx`** has no selection model, deliberately.
- **`Popover.tsx`**: focuses the trigger BEFORE running an item (App records the opener);
  Escape is bound on its subtree with `stopPropagation`, never on window (inv 27).
  ProjectMenu keeps its own copy, with the same fu 250 guard (a null-`relatedTarget` focusout ignored while a
  pointer is down inside); its caret, Duplicate and arm buttons focus themselves on click.
- **`styles.css`**: rules read surface ROLES (`--surface`, `--control`, `--rule`, `--ink`…),
  never raw `--grey-*`/`--walnut-*`; grey chrome re-points the roles in one context selector.
- **`App.tsx` keys**: plain and Shift+H match by `e.key`; only Alt+H by `e.code === 'KeyH'`;
  Ctrl/Cmd+H is unbound. Escape's ladder: grabbed → tapeAxis → tapeAnchor → tool.

## Invariants — break these and things fail in confusing ways

Each cost real debugging. **Do not renumber them** — the numbers are cited from code
comments, specs and `docs/follow-ups.md`. These are condensed; the full text with its
worked examples is in `docs/history.md` ("Removed from CLAUDE.md, 2026-10-07").

1. **The document is the source of truth.** No component holds geometry state not derived
   from it; nothing writes a Three.js transform as a way of recording a change.
2. **`position` is the min corner.** `boardCenter` bridges to centre-origin meshes.
   `reorientedPosition` is the only home of the reorient pivot and takes the whole patch
   (post-patch extents). `grain` and `cuts` are absent from the reorient predicate, so cut
   edits have their own store actions. A future tool that moves *and* turns in one gesture
   must carry its own `position` in the same patch.
    `angleCuts` and `holes` are absent from the reorient predicate too (a slope or a bore moves nothing), and so are
    `curves`.
3. **The `dragging` ref guard in `Gizmo.tsx`**: never sync the document into the proxy
   mid-drag (jitter/drift).
4. **Gesture snapshots are lazy** — taken on the first `edit()` in a gesture, never in
   `beginGesture()`, or undo gets no-op entries.
5. **A field with a local draft (`DimensionField`, `NameField`) skips adopting external
   changes while focused, so blur must resync from the stored value and must not commit
   when untouched.** Stored values are exact; display rounds. A MIXED field (`value: null`)
   must write nothing on an untouched blur; its test asserts the error state too.
6. **`add_header` does not merge across nginx levels** — `security-headers.conf` is
   `include`d in every block.
7. **`autoSave` must never throw**; it reports via `storage.available`.
8. **Names are unique among SIBLINGS** (the parts and assemblies of one container),
   enforced at add, duplicate, the name commit, Group, Ungroup and `migrateDocument`. Any
   new call site adding a part passes its name through `uniqueName`. New assemblies are
   `Assembly N`. So paths, and `flatDocument`'s names, are unique. **The separator glyph `›` is
   reserved: `cleanName` turns it into `>` where a name is WRITTEN (`renameItem`, Generate), and
   PROHIBITION: never in `uniqueName`, `dedupeNames` or on load** — a flat document names parts
   "Front › Leg" by construction and runs through `migrateDocument` (fu 227).
9. **`NameField` commits once, on blur or Enter — never per keystroke**; an emptied name
   reverts; `onCommit` returns the *stored* name.
10. **The gizmo clamp writes `size` before `updateMatrixWorld`, never `handle.scale`
    after**; two-sided, with a floor (`GIZMO_MIN_CAP_INCHES`).
11. **Migration steps run on raw data, before `validateBoard`, in version order**, because
    the validator's fallbacks are legal-but-wrong values. Upgrade first, validate second
    (the exceptions, v10→v11 and v11→v12, are in Versioning).
12. **Grain textures are cached and never disposed; per-board variation lives in the `uv`
    attribute, never on the texture.** Offset is zeroed on a `fit` axis.
13. *Retired in v3* (`axisDimensions` is single-sourced; since v8 derived from `axisFrame`,
    inv 44). Number kept.
14. **`bandRadius` is `hypot(d, k·delta)`**; u is seamless by that, v by folding about the
    pith line. `grainTexture.ts`'s `woodCut` comment is the statement — agree with it.
15. **Anything memoising on what `boardUVs` reads keys on `boardUVSignature`, never a
    hand-written field list.** The signature is the same for every solid of a board, so
    don't cache per solid on it alone. A dep entry over a value nothing subscribes to is
    the same failure. It includes every hole row (BoardMesh's memo keys on it) and every curve (its
    id and `CURVE_FIELDS` values, as `geometryKey` does).
16. **Edge lines come from `boardEdges` (the cell grid's `pocketEdges`, or `bodyEdges` once a part has angle
    cuts), not from the solids.** General
    rule: a marker or line must sit on a feature that is actually drawn. A hole draws its rim on its entry face (and exit
    face when through) and, when blind, its bottom rim (a crease); its wall draws no facet lines. The exception: a hole's
    centre snap point sits in air (the mouth is air to `stockProbe`) — it is the centre of a drawn rim.
    A curve draws its outline on every plane square to its `through` and a line along `through` only at
    a SHARP outline vertex judged on the true arc — no facet lines, none at a tangent end or a bow's crown; a smooth
    point's line is suppressed per INTERVAL (where its wings are that curve's chord faces and the tangent-continuing face),
    never as a whole line, or a real crease where another feature meets the tangent point is erased. An arc's centre snap
    point may sit in air (the hole-centre exception, extended; a centre off the face is not offered); ends are `'corner'`,
    the crown `'edge-mid'`, the centre `'face-center'` (P5). The waste is air to `stockProbe` except a point ON an arc or
    on a straight side off the face boundary (P3: the middle of an arched edge is gone, an arc's end is kept).
17. **UVs are parent-relative and `FIT` resolves against the board, not the solid**, so
    figure runs continuously across a cut.
18. **On the cut list, stock dimensions collapse at display precision; cuts match
    EXACTLY.** Round what is bought, never what is machined.
19. **`LABEL_SIZE` has one home (the `<svg>` attribute); CSS never sets a font-size on
    diagram text, and `--font-num` must stay monospace.** The measured string and the drawn
    string must be the same string: assemble it in the module that builds it
    (`nesting.ts`, `diagram.ts`), never in the component. A non-ASCII glyph must be
    measured in a browser before it is trusted. A hole row's diagram label is its bench line (`holeLine`) as an HTML
    note under the figure, as angle cuts' notes are — never a measured SVG label (holes spec §4.3, amended). A curve's notes
    are HTML notes too, built by `curveLineEntries` ([branch `curves-2`]; one note per entry, four equal corners one note).
20. **`depthField.ts` is not `pocketCells`**: it assigns max depth per cell in 2D; it does
    not drop cells. An agreement test must assert the value the derivation computes, not
    just where it is non-zero.
21. **The empty-solids placeholder stays a mesh, not a wireframe** — a part you can see is
    a part you can click. Test by clicking the middle of a ghost face.
22. **`nesting.ts`'s fits-test carries an epsilon** because one side is computed (a running
    sum). Apply the tolerance that matches the arithmetic you actually have.
23. **The shelf-height guard is the SOLE enforcer of guillotine cuttability.** A test of a
    "cannot exceed its container" property must bound against a value the code under test
    does not produce.
24. **A held point (`grabbed`, `tapeAnchor`, `tapeHover`) holds a world position, so
    anything that moves the boards under it must drop it**, through `dropHeldIfGone`
    (guard-first shape). Three reasons to clear: the world moved (undo/redo when the
    restored doc is a DIFFERENT object, `replaceDocument`, delete/update); the feature
    underneath went (point-precise, `===`, called AFTER `edit()`); the user retargeted
    (`grabbed` only, via `selectionPatch`).
    - **PROHIBITION: no selection write may clear `tapeAnchor` or `tapeHover`.**
    - `clearGuides` clears both tape fields; that licence is not to be extended.
    - At `updateBoard`, `grabbed` keeps a board-precise clause and the tape fields are
      point-precise. Deleting the former or adding one for the latter breaks behaviour that
      only the "keeps" tests catch.
    - The enumeration lives only at `tapeHover`'s declaration in `store.ts`; never restate it.
25. **Exact moves are never rounded to the drag grid (`SNAP_INCHES`, or 1 mm in a metric project — `snapToGrid`)**: snap move, click-placed guide,
    ray-typed guide, axis-placed guide and copy in a row (copy k = original + k·step·sign,
    never from the previous copy). Round what a free drag produced, nothing else.
26. **`grabbed` is a `BoardSnapPoint`**, so a guide-owned grab cannot be constructed. Do
    not add a runtime owner-type guard to `commitSnapMove`; the self-snap guard's
    `target.owner.type === 'board'` check is real and stays. `tapeAnchor`/`tapeHover` are
    wide `SnapPoint`s on purpose.
27. **Every window-level shortcut lives in `App`'s ONE keydown effect; any new `window`
    listener takes the modal flag (`modalOpen`) explicitly**, because `inert` cannot reach
    a window listener. `Viewport` gets it as `shortcutsSuspended`. The modifier test is
    part of the condition, not an early return, or Ctrl+Z is swallowed. `TapeReadout`'s own
    X/Y/Z branch is forced, not redundant.
28. **`TapeReadout` stays unconditionally mounted** (it owns `tapeTyped`'s anchor-loss
    clear), and typed capture APPENDS. The displayed text and the next keystroke's effect
    must not disagree.
29. **`autoSave(id, doc)` takes the id as an argument, never adapter state.** The
    `activeId` dep entry is load-bearing (the edit-wins restore path); do not remove it.
    Every switch FLUSHES the pending write first. The pending record is `{ write, timer }`
    with `write` a thunk capturing the matched pair. **PROHIBITION: do not split it into
    refs, read `activeId` back in the flush, or put the id or doc back on the record.**
30. **`sloyd.autosave.v1` is never deleted and never written after adoption; adoption fires
    only when the index key is ABSENT** (raw `getItem`, before parsing). An unusable or
    newer index refuses and writes nothing (read-only, banner shown). A missing `activeId`
    or empty `projects` is not adoption.
31. **Write the project key, verify it reads back, THEN commit the index — in one
    primitive, `writeVerifiedProject`.** `autoSave` refuses an id with no index row. Every
    mutation reads through `readIndexForWrite` and refuses on an unusable index;
    `deleteProject` refuses before touching the project key.
32. **Every adopting handler bumps ONE `switchToken`; the last to start owns the
    outcome.** Never decline a second click. The token check sits on the same side as the
    persisted-id write (hence `createProject(…, { activate: false })` then
    `setActiveProject`). `onDeleteProject` is the documented exception; `deleteProject`'s
    index writes stay synchronous with its read.
33. **Duplicate ids are repaired on LOAD by `takeId`; the FIRST keeps its id**, the later
    is re-minted (never all of them), and `seen.add` lives inside `takeId`. Scopes: part and instance ids per
    container; definition and shape ids per document; cut ids per board (per shape for a
    shape), and so angle-cut, hole and curve ids. `/` in an id is re-minted. A guide with no id is dropped. References
    (`Instance.definition`, `ShapedBoard.shape`) are resolved by DROPPING the duplicate or
    the dangling part, never by re-minting, so nothing is rewritten. A future field pointing
    at a board by id breaks the single-pass repair.
34. **`gesturing`/`gestureSnapshotTaken` are store state so `replaceDocument` can reset
    them — the only reset.** **PROHIBITION: they must not join `restore`'s clear list, and
    no component may read either.** A test of this asserts an undo entry, never a flag.
35. **`FACE_AXES` carries each UV axis's SIGN, applied BEFORE the swap**, in the table
    itself, read back off a real `BoxGeometry` (three of twelve axes run backwards). A UV
    test must check an interior number (`uv − position/tileInches` constant per board), not
    only extremes.
    A SLOPED face (angle cuts) takes the plan of the world axis its normal is nearest, a tie going to the cut's `face`
    (a miter reads as end grain, a taper as long grain); `bodyMesh` reads UVs off vertex world offsets through the same plans.
    A curve's chord face takes the plan of its nearest world axis too; around an arc the plan switches
    partway, and the grain seam there is ACCEPTED (the user's ruling, recorded with fu 336 for a texture/shader session).
36. **Generation never adopts a project**: `createProject(doc, { activate: false })` and
    nothing else. "Open when done" must call `openProject`.
37. **The generation history is append-only; `LlmMessage` is opaque so it stays that way.**
    Assistant turns go back verbatim (thinking and fallback blocks included); do not
    "clean" them.
38. **`overlap` and joinery's blockers/trims are measured between SOLIDS via `worldSolids`**, never
    `solidWorldBox`; `worldSolids` are pocket-cell BOXES, angle cuts ignored (the drawings occlude with
    `worldBodies` instead, inv 47). **A pair with a tapered part is measured on real bodies** (fu 302: the
    intersection of the two parts' world bodies via `clipConvex`, its extents reported as today's box overlap; only when
    their boxes overlap; `worldBodyFaces` is the checks' body crossing, pinned against `worldBox`), and
    **the tip check weighs a tapered part by its real bodies** (fu 303, `partMass`); an untapered pair's overlap and an
    untapered part's weight (a notched part included: its box) are byte-for-byte as before. **Held/hangs contacts, grounding's `connected` and the tip footprint read
    `contactSolids` when a part is tapered** (a tapered part counts only where it is still flat); a pair of
    untapered parts keeps its BOXES in `connected`, and an untapered part keeps its box as its footprint,
    byte-for-byte. Contact reads `contactSolids` for any ANGLED part (`isAngled`): a taper's flat wood as before, then every
    miter, bevel and chamfer splits it around its touched box (`touchedRegion`/`splitRegion`), so a sloped face is never a
    contact (the user's ruling: a miter does not hold). `faceContacts` stays on boxes. Joinery refuses any angle cut running
    into a joint (`joineryRefusal`); Refine accepts every kind in standard form (`worldTapers`, `worldAngles`) and refuses the rest (`'taper-form'`, `'angle-form'`). Do not raise `TOUCH` to make joints
    pass; do not drop the check. **Holes are ignored** by overlap, held/hangs, tip, contact and grounding: a hole never
    decides support.
39. **Support means HELD: every part off the floor is resting, between (≥ 50% coverage of
    both faces of X or Z) or lapped (a broad face; a top contact only under the stated
    one-level conditions), and the piece must not tip.** **PROHIBITION: do not drop (c),
    the coverage threshold, or either half of the top-face clause.** One fault, one report.
    `groundedSet` is the ONE grounding walk. Known limits: follow-up 176.
40. **Anything deciding "same cut" derives from `CUT_GEOMETRY_FIELDS` (`cuts.ts`), checked
    against `Cut` by `satisfies`.** Do not replace the table with a list in a function body
    or add an exclusion without a written reason. `cutsThatRemoveStock` decides which cuts
    are compared; the resulting row split on exact dimensions is correct — do not round.
    Angle cuts have their own table, `ANGLE_CUT_FIELDS` (`angleCuts.ts`), every field but `id` — `kind` INCLUDED — exact.
    Hole rows have `HOLE_FIELDS` (`holes.ts`), every field but `id`, exact (a count-1 row's ignored `pitch` included, fu
    338): the cut list groups by them as a multiset, ids ignored (`holeSignature`); `sameShared` compares rows in order,
    ids included, as it does cuts and angle cuts.
    Curves have `CURVE_FIELDS` (`curves.ts`, `satisfies`), every field but `id`, exact, the segment list
    compared field by field in order: the cut list groups by them as a multiset, ids ignored; `sameShared` in order, ids included.
41. **Joinery has one converter (`pocketFor`), never adopts, and is blamed only for what it
    caused.** `pocketFor` is tested against the box in every pose, stores via
    `storedAsShape`. Problems compare by `kind` + `parts`, never message text. Every
    refusal is decided before ANY mutation, and every `resize` is pre-checked by
    `cutIntoEnd`. Joinery accepts tapers and refuses, through the ONE decider `joineryRefusal` (`joints/tapers.ts`), any
    site whose patch lies on tapered wood (`taperConflicts`; `start` itself allowed, compared with a 1e-9 float tolerance,
    inv 22) — and, for a miter, bevel or chamfer, any site whose patch its touched box overlaps by more than TOUCH
    (`angleConflicts`), except a cut on the ENTERING part of an end-into-face site that runs straight through the joined end
    and clears the tenon's section (`clearsTenon`), and a MITER on the receiving part of a face-against-edge (rabbet) site (the
    rabbet runs out through the mitered end); on that growing part a cut measured along or into the growth that removes
    wood at the joined end refuses however small (final review I2: the rebase keeps its line fixed while the part grows). One sentence per part (`jointRefusal`). `resize` re-anchors angle cuts
    measured from the moving end (`rebaseAngleCuts`, fu 307), and `readJoints`' `resizeAt` undoes it exactly (the gate's
    round trip). Sites stay on box contacts on purpose. The unjoin gate (`sameJoined`) compares a part's cuts as a MULTISET (`sameCutSet`; order is not geometry, still exact at 1e-9; angle cuts stay in order). A joined Refine is refused up front (`plainForRefine`, `'angle-joint'`) when the original's angle cut already runs into a joint; a result the model leaves conflicting comes back UNJOINED (`JointsSummary.notJoined`), never joined over an angle cut.
42. **A group move rounds the GROUP's min corner once and adds one delta
    (`moveGroupTo` → `translateBoards`); one selected part keeps the separate single-part
    path.** Do not unify them; do not round inside `translateBoards`. `selectionPatch` is
    the ONE writer of a user's selection change. A selection change mid-drag ends the
    gizmo's gesture and commits nothing.
43. **Hidden-ness is view state with one gate, and a hide moves nothing.** The four user
    actions go through `applyHidden` (one entry per run, the SAME `doc`, no autosave); others only
    reconcile. `selectionPatch` drops hidden ids — do not move that to callers. A hide is
    refused while `gesturing`. **PROHIBITION: no hide or show may clear `tapeAnchor` or
    `tapeHover`.** Never return `visibleBoards`' array (or anything built from it) from a selector — a fresh array every store write
    re-renders every frame; filter in a memo or handler. A selector may reduce it to a PRIMITIVE (the Section toggle's
    "any part visible", fu 351).
    Hidden parts are still in the cut list, joinery, checks, export and autosave.
    Consecutive hide/show toggles share ONE undo entry (the run is the top of `past`, by identity;
    any edit, gesture snapshot, undo or redo ends it; a run back at its start leaves no entry).
44. **`axisFrame` is the ONE turn table; every part↔world crossing goes through its helpers**
    (`toWorldOffset`, `fromWorldOffset`, `spanToWorldOffset`, `spanFromWorldOffset`,
    `endFacing`). **Never `board[dim] - u` at a call site.** Nothing branches on
    `rotation`'s value except `axisFrame`, the migrations, `generated.ts`'s `orient` and
    Properties' Turn select. The one legitimate hand
    reflection is `mirrorCutAlong` (clip first, one sum, no snap); do not tidy it onto the
    helpers. Flat and upright keep the pre-v8 mapping at turn 0; on-edge reverses thickness
    (fu 215, v12), so every posture shares ONE hand and a posture change no longer mirrors
    cuts. Equivariance tests use `chiralPart`, never a symmetric fixture; mutate any new one.
    In `boardUVs` the reflection is per geometry axis, before inv 35's sign and swap. Generate's
    converter (`orient`) encodes at 0° or 90°; role linking may store any quarter turn that leaves the world part unchanged
    (`turnCandidates`, fu 301; every kind re-stored through `taperWorld`/`angleWorld` with the part's own slopes). The composition is the second caller of `mirrorCutAlong` (`mirrorCut`,
    moved verbatim to `mirrorCut.ts`): a mirrored frame reflects a part (`mirrorPart`: turn
    negated, cuts along the posture's turn-0 X dimension, min corner reflected).
    An angle cut reflects by a FLAG FLIP (`mirrorAngleCut`: `from` if `face` is the mirrored dimension, `alongFrom` if
    `along` is) — never arithmetic on stations; `lowerAngleCuts` is its exact inverse and is written back only when the user
    edited it or a d0-moving posture change re-reflected it (`changedKeys`), never as a shared world array.
    A hole row reflects by flag flips too (`mirrorHoleRow`: `from`, `alongFrom` or `acrossFrom`, whichever of face, along
    and across is the mirrored dimension); `lowerHoles` is its exact inverse, reusing an untouched stored array.
    A curve reflects by flag flips too (`mirrorCurveCut`: `uFrom` when u is the mirrored dimension,
    `vFrom` when v is, nothing when `through` is) — never arithmetic on coordinates, and `side` never flips (it is defined on
    STORED numbers); `lowerCurves` is its exact inverse, reusing an untouched stored array. Pinned with `chiralCurved`.
45. **A link is a SHAPE its users point to; shared fields are stored once.** `LINK_FIELDS`
    is the ONE shared/own table (classify an optional own field with care, fu 231).
    `resolveBoard` is the ONE place a shape is read into a part. `linksToShapes` is the ONE
    label→shape builder, with two callers (the v10→v11 step and generation's `linkByRole`);
    both judge equality by `sameShared` only. `linkByRole` aligns a member's angle-cut ids to the representative's (only when
    `sameAngleCut` matches; never loosen `sameShared`) and may re-turn a member through `turnCandidates` first. Shared-field edits are written to the Shape (`applyWorldEdits`); the only propagation left is `shapeMates`
    re-pivoting posture. `linkPlan` is the ONE Link decider. A one-user shape dissolves
    (users counted as STORED parts). Joinery keeps sharing where cuts are identical by
    geometry. **`Board.link`, `repairLinks`, `dissolveSingletons` and `mates` propagation
    must not come back.** `curves` is SHARED in `LINK_FIELDS` (an array, so excluded from `_sharedPrimitives`' primitive check as cuts, angle cuts and holes are).
46. **The tree has ONE composition (`placeBoard`/`placeInstance`), ONE walk
    (`worldParts`), and every edit is written back through `treeEdit.ts`**, changed fields
    only, a moved position lowered as a delta. Path names come only from `flatDocument`.
    - **Two write-back rules: a Properties edit keeps the stored local position; joinery
      passes `keepWorld`.** Do not unify; a new caller picks one.
    - Group moves nothing (identity frame); Ungroup is exact for direct child parts only.
    - Joinery runs on `flatDocument`, maps back by index; anything reading sites/joints uses
      the flat document.
    - `regroupShapes` groups a shape's users by geometry (`groupSignature`): cut ORDER is ignored (joinery appends mortises in site order, a turned user's list differs); the Shape keeps its first member's order and ids.
    - A selection is one level (`isCovered` is the ancestor test).
    - Write-back keys on the STORAGE target (`storageKey`); disagreeing edits throw, so the
      store sends one edit per target (`oneEditPerTarget`). An edit in a definition moves
      every copy, so held points are re-judged (`judgeHeld`) and hidden ids/held points are
      re-keyed under every placement (`rekeyEverywhere`); a hidden assembly that Ungroup dissolves
      lifts to its children under every placement (`Lift`, fu 229) — a re-key, not a fifth hide writer.
    - Make Unique copies one level and keeps ids. A twin placement of a selected part is
      never a Move target. `writeBackFlat` splits definitions shallowest-first by deepest
      placement.
    - **A mirrored instance (schema 13) is a step inside the ONE composition**
      (`placeBoard`/`placeInstance` reflect first); write-back is its exact inverse (`lower`:
      positions as deltas, turn negated, `lowerCuts` reuses an untouched stored cut object).
      A Properties resize keeps the stored cuts; with `keepWorld` (joinery) cuts are
      re-mirrored at the new size. `setMirrored`/`mirroredCopy`/`replaceKeepingBox` (with
      `placedBox`) change handedness while preserving the placed box; Ungroup lifts a shaped
      part through a mirror as plain. World→local vectors go through
      `toLocal(containerLinear(…))`, never a hand-written turn. Refine refuses a mirrored
      assembly. **Across a mirror:** `linkPlan` refuses a picked part on the other side, or a
      member whose STORED part has no occurrence on the source's side (`mirroredAt`; a live
      mirrored copy of a same-side part is fine); `postureRefusal` refuses a d0-moving posture
      change (flat/on-edge ↔ upright) when a user of the Shape has no occurrence on the edited
      part's side. Both decided before any mutation, one decider shared by store and panel.
      Link builds the Shape once from the source's STORED fields, never the world part, and
      writes members' OWN fields only (each lowered alone); a shared posture write goes
      through `sameSideFirst` before `oneEditPerTarget`, so a Shape is never lowered through
      two parities in one edit.
47. **Exploded is read-only.** `explode > 0` means the model cannot change: `edit()`, `undo` and `redo` are the
    gate; any action with side effects outside `edit()` also refuses at entry (`readOnly()`: re-key, Group,
    Ungroup, guide and board deletes, `addBoard`); `setTool` refuses all but Select; `renameItem` returns the
    stored name. `setExplode` is the one writer, and leaving 0 goes only through `setTool('select')`. The
    UI lock is a `<fieldset class="edit-lock" disabled>` with `display: contents` (layout-transparent). The explode
    offset is a render-time translation, never written back (inv 1). Drawings take lines from `boardEdges` and hole
    lines from `holeDrawingSegments` (one list, one hidden-line pass), and occluders from `worldBodies` (each body CLOSED: a box, or its faces as half-spaces): a ray along a seam between
    solids is inside. The exploded set is
    lifted so its lowest part never goes below the assembled lowest point. Occluders are the HOLE-FREE bodies: you
    cannot see through a hole (a rule, not an accident; a through-bore's far rim seen down its axis is hidden, pinned).
    [branch `curves-2`] **A curved part's drawing edges come through `curveDrawEdges`** (inv 53): each model chord drawn as a
    fine path on the true arc, but **visibility is judged on the MODEL chord** (the path only changes what is drawn; the
    visible/hidden split is chunk 1's), and a view whose direction lies in the outline's plane (**edge-on**) keeps the model
    chords unrefined (a 96-chord arc folds back over itself). A chord split by another feature keeps its split end on the
    chord (Q4). **Curved surfaces' silhouettes come from `silhouetteLines`** (a line along `through` at each smooth model
    vertex whose faces turn opposite ways to the view), each probed from **4×`DRAW_EPS` along the outward normals of the
    viewer-facing adjacent faces** — never lifted toward the viewer (a fixed lift failed gentle bows) and never probed from the
    vertex itself (DRAW_EPS grazing reads it hidden).

48. **`boardBodies` is the ONE place angle cuts become geometry; `pocketCells` is stock minus RECTANGULAR cuts only.**
    Anything that draws, edges, occludes or probes stock reads bodies (through the `partGeometry` cache); anything that
    describes or joins rectangular cuts (`cutShape`, joinery, the cut list's pocket lines) stays on `pocketCells`. A body no
    angle cut clips keeps the box path byte-for-byte (`body.box`). Joinery and Repair stay box-based and accept
    every kind, refusing only an angle cut running into a joint (inv 41). Generate and Refine read and write every kind in
    WORLD words — `tapers` (`taperWorld.ts`, through `taperCut`) and `miters`/`bevels`/`chamfers` (`angleWorld.ts`, through
    `miterCut`/`bevelCut`/`chamferCut`) — recognised STRUCTURALLY (`isStandardTaper`, `worldAngles`); Refine refuses, before
    any call, a cut it cannot describe or the converter would reject on the re-encoded part (`'taper-form'`, `'angle-form'`),
    and keeps untouched angles exactly through the exact-angle map (`angleRatiosOf`). **The design schema defines the part
    and the direction ONCE in `$defs`** — the API refuses a schema whose compiled grammar grows too large (measured
    2026-10-14: the inline form with the three angle arrays was refused). `contactSolids` is the second, narrower reader of
    angle cuts: box-valued, never over-claiming wood.
    `boardBodies` is the ONE place curves become bodies too, and bodies stay CONVEX: each curve's waste
    is CLIPPED by its chords' half-planes when the kept wood is convex (`curvePlan`: every arc bows into the waste, every
    straight side lies on the face boundary, AND the arcs form ONE run with the wood convex at every off-boundary vertex and
    arc–arc join — the
    strengthened P6; without that guard two arcs meeting in a reflex wood corner lost real wood), else SPLIT along the
    waste's ear-clipped convex pieces (`convexPieces`; a body wholly outside any one piece plane stays whole). Both give the
    same wood (volume and containment, pinned). A chord face carries `curve: <id>`. A body no curve touches is unchanged.

49. **A custom material's KIND is in its id** (`m-s-…` solid, `m-v-…` veneered sheet, `m-p-…` plain sheet), so
    `isSheetGood`, `grainFamily`, `hasGrain` and shop validation read it off the id with no catalog; a stored `kind` that
    disagrees with its id drops the entry, and nothing may change a stored material's kind (only an UNSAVED new dialog row
    has a kind select). Label, colour and sheet size come only from a `MaterialCatalog` (`catalogOf(doc)`) — no global
    registry: a background Refine or joinery run reads its own document's. **A document carries exactly the custom
    materials its parts and shapes use**: `pruneMaterials` runs at the end of the load and inside `edit()` (same object
    when nothing goes, inv 4); a part change that adopts a library material does it in the SAME edit
    (`updateBoards(…, adopt)`, `applyMaterials`). Every path that makes a project from another carries them; Refine's
    converter gets them BEFORE `migrateDocument` (`designToDocument(…, { materials })`), or they become pine. Generate's
    schema stays byte-identical (built-in catalog, fixture-pinned); Refine's adds the project's ids (fu 322: a per-project
    grammar, compiled live 2026-10-14). The library and prices are browser state: undo reverts a project's copy only.
    **Nominal names** (chunk 2) show only for a material whose catalog entry is `nominal` (pine; a custom solid with the
    switch), only on an EXACT section match (in a METRIC project: both sides read the same whole mm, fu 354 — a 38 × 89 mm part is a
    2×4; Buying and sheet nesting likewise fit a metric part when it READS no more than the stock at whole mm — `fitsStock`, one
    rounding with the fields (`mmTicks`); shelves stay exact, inv 23), and on a cut-list row only when EVERY board on it is that section; drawings
    keep actual dimensions. The switch never touches a stored material's prices.

50. **`holes.ts` is the ONE place holes become geometry (`holeInstances`, through `boardHoles` and `partGeometry`'s
    frozen `holes`); `boardBodies` stays hole-free and convex**, so every `Body` reader (`clip`, `clipConvex`, `bodyEdges`,
    occluders, contact) keeps its convexity assumption. **`holeFaults` is the ONE strict-rule decider** (`breaks-out`,
    `off-flat` — zero skin at a cut's floor counts —, `meets-hole`, `too-deep`; exact closed forms, tangent passes): an add
    is refused on any fault, an edit only when it ADDS a (hole, kind) fault the stored row lacks (so a row a resize faulted
    can be edited back), decided before any mutation; a fault a later edit causes is KEPT, noted, drawn approximately,
    never clamped or trimmed. Fault words have one home (`holeFaultText`; `distinctFaults` counts too-deep once). Joinery,
    Refine and Repair refuse a holed project at entry (`holedRefusal`); `turnCandidates` returns none for a holed part.
    A part with no holes keeps its geometry byte-for-byte (the `BoxGeometry` path included; a part with no
    holes AND no curves — `drawsAsBox` is the ONE routing decision, `bodyMeshIdentity.test.ts` pins holed uncurved parts to
    master's bytes). `holeFaults`' `breaks-out` includes a hole meeting a curve's waste (`intoCurve`;
    touching is meeting; `holeInStock` counts it), keyed apart from an edge's (`faultKey` `:edge` / `:curve:<id>`, and
    `distinctFaults` on the SAME key, or a hole past an edge and in a curve could never be edited back). **A curved part's
    mesh is WATERTIGHT**: every body through `bodyMesh`, vertices welded (`CONFORM_EPS`), every part vertex strictly inside
    a face's edge inserted (the candidate's own object, never a projection), faces fanned from their CENTROID (a vertex-0
    fan's zero-area triangles are dropped and reopen the crack); a split curve's T-junctions otherwise show as pinholes in
    the shadow and on the cap. `curvesWatertight.test.ts` pins it (exact Float32 keys, every directed edge matched); a face
    a hole reaches still goes through `faceTriangles` (fu 369). **Rebuild performance —
    a resize drag rebuilds a holed part every frame; these break silently:** per-hole prisms and rings are memoised by
    the deep-frozen `Hole`'s IDENTITY (a WeakMap; an unfrozen hole computes fresh — never memoise one that can change);
    seam faces (what a coplanar, opposite-facing face of another body covers) are subtracted ONLY in holed bodies (and in EVERY body of a curved part, box cells included); a
    CLEAN hole's (`holeInStock`: no breaks-out, off-flat or too-deep) wall and bottom are emitted UNCLIPPED, a faulted
    hole's clipped to the bodies; all of a part's holes are ONE geometry, one mesh (`holesMesh`), never a mesh per hole.
    `viewport/holesPerf.test.ts` guards it (≤40 ms per healthy case, ≤100 ms faulted, the MINIMUM of 9 runs — load only
    inflates a run; still wall-clock, fu 340). **On the Plans sheet** a rim is a `DRAWING_HOLE_SEGMENTS` (96)-gon (the viewport keeps
    `HOLE_SEGMENTS`, 48), except a rim whose plane is EDGE-ON to the view, which is ONE segment across its diameter — 96
    chords folded onto one line restart the dash and draw a hidden rim solid (chunk 2 R2). For a part with no holes `drawView` and
    `buildDiagrams` are byte-for-byte unchanged; its SVG path differs only by chaining (chunk 2 R2: within one part) — do not undo the chaining to
    "restore" it.

51. **The section cut is view state with ONE writer (`setSection`), never in the document, undo or autosave; reset only
    where `explode` is (initial state, `replaceDocument`).** One shared `THREE.Plane` (`viewport/sectionPlane.ts`) clips
    every part material (`clipShadows` too) and edge line on the GPU, so a slider move changes one uniform and rebuilds no
    part geometry. **Caps come only from `sectionCaps` (`document/section.ts`)**: board-local — a placed part's cut is one
    of its own axis planes (quarter turns, mirroring resolved by the composition; inv 44) — each convex body clipped by
    `clipConvex`, a body face lying ON the plane and facing the removed side capped too (a holed body's mesh drops seam
    faces; spec §3.1 as amended), every piece normalised to ONE winding before `minusPrism` (pocketCells merges cells, so
    clip caps and face caps mix; `unionOutline`'s cancellation needs one winding), bores subtracted, the outline the boundary
    of the union. World cap pieces wind clockwise as the viewer sees them (board frames are improper): the cap fan rewinds
    each by its Newell normal before fanning, or a DoubleSide cap is lit from behind (in `viewport/capFill.ts`, which for a curved part also inserts the other pieces' vertices on each piece's
    edges and fans from the centroid — no specks; a part without curves fans byte-for-byte as before). The cap material takes no clipping plane and
    is keyed on `faded`. **Picking and snapping read only `keptBySection`** (a raycast wrapper on part meshes; Move/Tape
    candidates), guide points exempt — guides are drawn unclipped. The per-part local-cap cache is hit only on the same
    `geometryKey` and the exact local plane coordinate; never hand out its arrays.

52. **A length becomes text — and text becomes a length — only through `units/length.ts`, with the DOCUMENT's own `Units`**
    (`formatLength`/`parseLength` take `Units`; there is no module- or browser-level unit setting, so a background run or a
    sheet formats with its own document). Stored values are inches always; a units switch (`setUnitsDisplay`, one edit,
    locked while exploded) moves no number. Imperial output is byte-for-byte what it was. Metric: whole mm (half away from
    zero after the fraction path's nudge), a bare typed number is mm (marks, fractions and feet stay inches — so switching
    units reinterprets a pending typed tape entry, preview and commit alike), hole diameter and pitch to 0.1 mm through
    `holeLengthText` (one home for the bench line and the fields, inv 19), stock collapsing at whole mm (inv 18), free drags
    on whole mm via `snapToGrid` (`Math.round(v * 25.4) / 25.4`, the SAME float a typed value stores). Field bounds are
    compared with a 1e-9 tolerance (inv 22): a metric max like `posDim − offset` is not exact. Imperial on purpose: the
    Materials dialog's sheet and stock sizes (trade units), Generate's limits, model-facing text (a design fault's `message`; the dialogs show its `shown` copy, mm to 0.1 — taper
    advice floored to whole mm — except `too-large`, which reads in the inches its limit was typed in; fu 355), `stockLengthText`
    (`8′`). Drawings (Plans sheet, part diagrams, nesting labels) read BARE mm via `formatLengthBare`, with one
    `Dimensions in mm` note in the sheet header, repeated in every printed page's top margin by the named page `metric-sheet`
    (`.sheet-metric`; an `@page` margin box, Chromium 131+ — a header group was measured not to repeat; fu 357); Buying reads parts in the project's units and trade sizes imperial with
    mm in brackets (`tradeLength`/`tradeSize`/`mmBracket`, one home); the grid ladder is 10 mm / 100 mm / 1 m.

53. **`curves.ts` is the ONE place curves become outlines; `curveFaults` is the ONE fault decider.** A
    `CurveCut` is a closed WASTE outline (`start`, then `line`/`arc` segments, the last ending EXACTLY at `start`, P1) in a
    face's stored (u, v) from named ends, cut clean through `through`; an arc is a MINOR arc fixed by `rise` OR `radius`
    (whichever was typed; the other derived, never written back), bowing toward `side` of its chord in STORED numbers. No
    stored kind: Arch/Notch/Bow/Corner are derived structurally (`deriveCurveKind`); a curve no row can represent renders,
    prints, and shows its line and Remove. Faults: `runs-off` (leaves the face rectangle; a too-deep curve reads this) and
    `cuts-through` (the kept face falls apart or empties), exact against the true arcs. Authoring refuses a fault an edit
    ADDS (or a hole it puts into the waste), decided before any mutation; a fault a later resize causes is KEPT and noted
    (`… at this size.`, `— check: …`), never clamped. **Every edit, typed or selected, is refused when an arc would pass a
    half circle** (`pastHalfCircle`, the loader's own exact rule), because the loader DROPS such an arc — silent loss. A
    Bow is stored at its edge's length when written and refit by every edit; a resize never stretches it (P2). **A curved
    part's edges are BUILT** (`curvedEdges`: `unionOutline` on the planes square to `through`, then `bodyEdges` on the rest
    with smooth lines dropped per interval), never `bodyEdges` over its slices (25 ms at 18 chords, 135 at 48). **An unknown
    segment `type` refuses the whole document** with the newer-version message (a spline needs no schema bump). Joinery,
    Refine and Repair refuse a curved project at entry (`curvedRefusal`, after holes'); `turnCandidates` none; the design
    checks never see a curve. `viewport/curvesPerf.test.ts` guards the rebuild (≤40 ms per preset and a two-axis part,
    ≤100 ms for a hand-edited non-convex waste — fu 368; MINIMUM of 9, wall-clock).
    [branch `curves-2`] **On paper:** `DRAWING_CURVE_TOLERANCE` 0.001" and `DRAWING_CURVE_SEGMENTS_MAX` 96 (`curveDrawing.ts`;
    inv 47 for edges and silhouettes). **Part diagrams:** the waste is hatched in the through-face view (clipped to the part); a
    curve opens its through face's MIN view only when neither side exists, decided after holes' entry views; a sharp-vertex
    line is drawn only in the view of a face the vertex lies on, never along the outline's own edges; notes are
    `curveLineEntries` (`{ ids, text }`; a view lists the entries any of whose ids it draws, a curve run wholly off its face
    still in the view it opened); a part with no curves keeps its diagrams byte-for-byte.

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 4436 across 151 files on branch `curves-2` (4374 across 148 on master)
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck; run `npm run build` before claiming anything compiles.

## Open follow-ups

**`docs/follow-ups.md` is authoritative** (1–373, each with its closure). Read the entries
for the area you are about to touch; several are "correct but untested". Open items worth
knowing without opening it:

- **179** is closed (refine shipped 2026-10-09); still read invs 38, 41 and fu 180–206 before
  touching `generate/joints/`.
- **221** — a hand-edited linked file whose cuts lack ids stays plain on load (fails safe).
- **225** — assemblies/components residue, out of scope by decision (its mirrored-instances item
  shipped as schema 13). **232** — Generate emits no mirrored or nested assemblies, by decision;
  since schema 13 a mirrored pair is expressible if prototypes come to need it.
- **247** — the mirrored-instances residue: `sameSideFirst` is dead in `linkBoards` (still needed
  for the shared posture write) and three texts overstate its role there; small unpinned guards.
- **248–251** — ui-polish residue: 248 (viewport colours, the user approved them on real hardware), 249 (snap
  markers recoloured to muted tones; keep the floors in `SnapMarker.tsx` if retuning) and 250 (Popover and
  ProjectMenu focusout; simulated only, no Safari here) are closed; deferred minors (251) are record-only.
- **252–264** — plans-sheet residue: 252 (callouts), 253 (user-placed dimensions, schema bump), 255 (explode constants
  seen only on software GL), 256–258 (section views, joint-direction explode, live viewport dimensions) and 261–263
  (parts-list rename reverts silently while exploded; the lock disables view-only controls; the sheet slider lags) are
  open; 260 (F/Home framed unexploded positions) closed 2026-10-13. 254 is open only for a real print (the tall-sheet overflow is fixed);
  264 is closed; 259 is record-only.
- **265–274** — lumber yield & cost residue: 265 (per-project price overrides),
  267 (edge banding, hardware BOM), 268 (glue-ups), 269 (packer is a heuristic — measure before optimising), 270 (USD
  only), 271 (rough thickness classes), 272 (dialog length on a phone), 274 (end-grain parts are not priced by the
  piece) are open; 273 is closed (the note), 266 closed 2026-10-14 (below).
- **275–292** — angle-cuts residue: 275–280 (stopped angle cuts; 276 angle-aware joinery — open only for the joint kinds
  (splined/biscuited miters): joinery accepts angled projects since AI angles chunk 1; 277 Generate emitting angles — closed
  2026-10-14 (AI angles chunk 2); "taper all four faces", Plans-sheet angle callouts, compound angles), 281 closed (short point: corner minimum), 282 closed (approved on real
  hardware), 283 (joinery dialog with a key on an angled project, unseen), 284–292 recorded minors.
- **293–297** — miter residue: 293 and 294 closed (angle max floored; the line names the long point), 295 (a row control to add
  the matching miter, by decision), 296 (a part shortened past its miter refuses edits until the angle is reduced; presets
  withheld on parts wider than long), 297 (a hand-edited offset miter is moved to canonical form on its first edit).
- **298–300** — bevel/chamfer residue: 298 (no raised-panel field-bevel preset; unequal chamfer legs not editable), 299
  and 300 closed 2026-10-12 (short Edge labels; one face vocabulary and refusal pattern).
- **301–318** — AI-tapers residue (301–308 chunk 1; 309–313 chunk 2; 314–318 turned links): 301 closed 2026-10-13 (role linking aligns angle-cut ids and tries quarter turns, so four tapered legs are one component; also fixed identical tapered parts never linking; cut order ruled not geometry), 302 and 303 closed 2026-10-13 (overlap and the
  tip check's weight read a tapered part's real bodies), 304 (taper-at-joint rule is all-or-nothing, by decision), 305
  (Generate/Refine tapers) closed 2026-10-13, 306 (deferred minors, record-only), 308 ("taper the other end" is impossible for a part joined at both ends; record-only), 307 closed 2026-10-13 (`rebaseAngleCuts`), 309 closed 2026-10-13 (Refine refuses, before any call, a taper the converter would reject), 310 closed 2026-10-13 (tapers diffed face
  by face at display precision), 311 closed 2026-10-13 (an unjoined Refine lists its taper fault once, in the note), 312 closed 2026-10-13
  (`plainForRefine` calls `joineryRefusal`), 313 closed 2026-10-13 (test and wording residue; same face in two entries allowed by decision),
  314 (parts with rectangular cuts are not turned), 315 (mirror-only matches need fu 232's mirrored placements), 316 (`splitAssemblies`' `resultSignature` is order-sensitive), 317 (record-only turned-links minors), 318 (a width-only edit on one turned linked leg grows legs along different axes; accepted by the user).
- **319–320** — standard views + image export residue: 319 (the View group wraps even at 1440 px; open for the user's
  eye), 320 (record-only: no view shortcuts, one-frame selection blink, a saved PNG owed a real-hardware look).
- **321** — AI angles chunk 1 minors (record-only): the receiving part's "reaches" test uses the entering face at 1e-9;
  test gaps (no turned chamfer, no bevel case).
- **323** — AI angles chunk 2 minors (record-only): generic `angle-joint` advice; refusal-kind found by text search; turned
  candidates' angle-cut ids by index (latent); test gaps; multi-decimal angles fall back to 0.1°.
- **322** — the design schema's compiled-grammar margin (record): the API caps the compiled schema (unpublished); the part
  and direction live in `$defs`; any `DESIGN_SCHEMA` change needs one live compile before it ships.
- **266** — closed 2026-10-14 (custom materials, both chunks). **324**/**326** — chunk 1/chunk 2 minors (record-only).
  **325** — two tabs overwrite each other's library/prices (record); the v14-rollback `extra` round trip is covered.
- **327–342** — holes chunk 1 residue: 327 closed 2026-10-14 (chunk 2: drawings, Hinge cup), 328–335 (spec §11: holes through
  joinery/Refine/Repair, Generate/Refine authoring them, counterbores/cam-and-bolt, half-holes, dowels as hardware, Plans
  callouts, pointed bottoms, metric display), 336 (wall-grain seam inside a bore, deferred by the user to a texture/shader
  session), 337 (real-hardware looks owed: rims, drag smoothness, faded holed parts, overlapping holes), 338 (count-1 rows
  compare `pitch`, for the user), 339 (AngleCuts adopting the refusal message), 340 (the perf guard is wall-clock), 341–342
  (record-only minors).
- **343–346** — holes chunk 2 residue: 343 (Hinge cup along the LONGER in-face dimension, R5) closed — the user kept it; 344
  (the exploded view computes hidden hole lines it never draws; ties to 263's slider lag), 345 (dash look of chained paths
  and corner joins on a real print, for the user's eye; fu 254), 346 (record-only minors).
- **361–379** — curves: 361 closed on branch `curves-2` (chunk 2: arcs at 0.001", silhouettes — a live defect on master —, part
  diagrams); residue 374 (the edge-on fold, Q3), 375 (a silhouette drawn through another cut's air), 376 (a split chord's end up
  to 0.005" off the arc, Q4; Q2's split likewise; record-only), 377 (the unreachable (0, 1) node guard; record-only), 378
  (chunk 2 deferred minors; record-only), 379 (drawView timing ~6 ms/view, unchanged). Chunk 1: 362 (curve callouts; with 252, 333), 363 (Claude
  features on curves: joinery/Repair, Generate/Refine, the design checks), 364 (splines: a segment type, no bump), 365
  (stopped curves, edge profiles), 366 (compound curves), 367 (a row control to change kind); residue — 368 (a non-convex
  waste rebuilds in ~65 ms: merge ear-clip triangles, bucket bodyEdges' line lookup, frozen bodies slow bodyEdges), 369 (a
  holed face of a curved part keeps T-junctions), 370 (real-hardware looks owed: smooth shading, the grain seam, arch-end
  lines, a faded curved part beside a dado), 371–373 (record-only minors). The curved-face grain seam is filed with **336**.
- **176/177** — the held rules' known limits (mutual lapping) and an unseen live repair.
- **130** — semi-infinite construction lines; picked and set aside 2026-08-31 without a
  reason. Ask before assuming it's wanted; it needs real hardware (26a).
- **147** — open by decision (the user ruled ship as-is).
- **163's residue** — ply legibility at 3/4in, open by decision; do not re-open unasked.
- **26a** — **read before touching the viewport.** Browser checks here run on software GL
  (llvmpipe), which hides undefined/precision-sensitive shader behaviour; such changes need
  a human on real hardware.
- **70/79/84** — real print-to-PDF is unverified (only `emulateMedia`). **76**: hatch vs
  cross-hatch is not distinguishable at screen size; the legend carries it.

## Deployment

Static files served by nginx from a multi-stage image (`docker compose up -d --build`).
No bind mounts, volumes or `.env` — there is no server-side state. nginx does SPA
fallback. **Everything host-specific is in `DEPLOYMENT.local.md` (gitignored); read it
before deploying.** Verify per the deployment rule above.

## Working agreements

- Build incrementally: small v1, then widen. Prefer shipping a narrow thing that works.
- Design docs live in `docs/superpowers/specs/`; read the latest before changing behaviour.
- **No pull requests.** Commit to `master`, or branch and merge locally
  (`git merge --no-ff`, verify the merged tree, delete the branch).
- TDD where it pays; `units` is tested hardest (wrong measurements waste lumber). **The r3f
  viewport has no unit tests by design — verify it in a real browser.**
- A review finding that conflicts with a plan or spec is a human decision; don't resolve it
  silently either way.
- Prefer closing latent bugs over deferring them, including future-platform ones.
- **Plan-, spec-, brief- and reviewer-supplied code and justifications have been wrong
  more than ten times** (fixtures passing for the wrong reason, bounds derived from the code
  under test, constants whose justification doesn't reproduce). Fix the code, not the
  expectation; escalate when an expectation itself looks wrong.
- **Mutate the test, don't just run it**, for anything justified by an ordering, a refusal
  or a "cannot exceed" property (six plan-supplied tests in one round could not fail, fu 155).
- **A remedy a follow-up NAMES is a hypothesis.** Ask: is it possible, is the problem
  reachable, does it address the actual cause? Measure before adopting (fu 140, 160).
- **This file is the rules; `docs/history.md` is the record.** When a round ships, update
  Status, add one table row, and promote any new prohibition into a condensed invariant.
  Put the narrative in `docs/history.md`, not here.
