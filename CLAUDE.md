# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Deployment specifics for this host live in `DEPLOYMENT.local.md` (gitignored).

---

## Status

**v1 shipped**, followed by a polish pass (unique board names, `NameField`,
`Delete`/`Backspace`, origin axes, a settled grid, a stable gizmo), follow-ups 29-30
(a gizmo size ceiling, a separate origin-lines checkbox), **v2** (two-state grain
orientation, schema version 2, the reorient-pivot fix, wood grain textures), and now
**v3**: posture (a board can finally stand up), part-local grain (any of a board's
three dimensions, not just its length), and log-derived grain textures — and then a
short post-v3 pass fixing two bugs found in use (`DimensionField` and `NameField`
both displaying, and in `NameField`'s case writing, stale text after an external
change landed while the field had focus) plus a plywood-grain regression from v3
itself — then **joinery** (a board can have stock removed from it), the **cut list**
(the numbers you take to the bench), **cut list diagrams** (each part's joinery drawn
on the sheet, because the prose setup lines are hard to read at the bench), and now a
**label layout round** closing the diagrams' one user-visible gap: labels that
overlapped or bled past the outline because nothing measured the text being placed.
Static SPA, containerized, 515/515 tests passing.

Host-specific deployment detail — hostname, container name, proxy configuration, and
the manual steps a human has to perform — lives in `DEPLOYMENT.local.md`, which is
gitignored. Read that file before deploying; it is not in the public repo.

**What the cut list did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-cut-list-design.md`, plan in
`docs/superpowers/plans/2026-08-01-sloyd-cut-list.md`:

- **Stock rows, then setup lines.** `buildCutList(doc)` groups parts by material and
  thickness (*Pine — ¾"*), collapses identical parts into one row carrying a
  quantity and the names it covers, and hangs one bench-readable setup line under each
  part that has joinery — *¾" dado, ⅜" deep — into the thickness face (max side), 6"
  from the length min end, running across the width*. Joinery was deliberately
  built first for this reason: a cut list that does not know about dados reports the
  wrong numbers for every part that has one, so a board's cuts join its row identity
  and two otherwise-identical boards split apart the moment one of them is dadoed.
- **Pure derivation, no new state.** `src/document/cutlist.ts` is a pure function of
  the document and `panels/CutList.tsx` calls it on every render — there is no cached
  copy and therefore nothing that can go stale. No schema change: `CURRENT_VERSION`
  is still 4, because everything the sheet reports was already stored.
- **The layering amendment.** `cutlist.ts` is the first thing in `document` to import
  from `units` — see the Architecture section for why identity has to be spelled by
  the same function that does the printing.
- **Asymmetric tolerance.** Dimensions collapse at display precision, cuts must match
  exactly — see invariant 18.
- **Printable, and print is the point.** The sheet is a full-screen modal that
  `@media print` strips to ink on white: toolbar, viewport and panels are hidden, the
  Print and Close buttons with them.
- **A modal is inert twice over, and the second half is easy to miss.** While the sheet
  is open the rest of the app — everything under `.app-shell` — carries the `inert`
  attribute, which takes the whole subtree out of the tab order, out of hit-testing and
  out of the accessibility tree in one attribute; the sheet takes focus on mount and
  `App` gives it back to the opener on close. That is what stops Tab reaching
  `NameField`, the project-name field and the `DimensionField`s behind the scrim, all of
  which commit on change or blur — the failure mode was *silently editing the document
  while reading a sheet that shows no selection*, not merely an aria gap. But `inert`
  cannot touch a **`window` listener**, which never sees which subtree an event came
  from, so every window-level shortcut needs the open flag passed to it explicitly:
  `App`'s own keydown effect early-returns on it (Delete/Backspace, undo/redo), and
  `Viewport` takes it as the `shortcutsSuspended` prop for `f`/`Home` — without which
  `f` re-frames the camera invisibly and hands back a moved view. A prop rather than
  store state on purpose: the open flag is local view state, outside the document and
  the undo stack. **Any new `window` listener must join this list.**

**What the cut list diagrams did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-cut-list-diagrams-design.md`, plan in
`docs/superpowers/plans/2026-08-01-sloyd-cut-list-diagrams.md`:

- **One view per `(face, across)` pair.** `buildDiagrams(board, precision)` groups a
  board's cuts by which face they're cut into and which dimension they run across,
  because within a view the horizontal axis is always the implied position axis and
  every cut is a band touching two opposite edges — one face can admit two `across`
  values with different position axes, so keying on the pair (not the face alone) is
  what keeps every band vertical and every layout the same. Near cuts (`from: 'min'`)
  draw solid and hatched; far cuts (`from: 'max'`) draw dashed and unfilled — both
  share one drawing when a board is dadoed from both sides in the same face, which is
  the point: one glance shows both setups instead of two disconnected prose lines.
- **A schematic, not a scale drawing.** `diagramScale.ts`'s `fitView` maps board
  inches to drawing units uniformly except at two extremes — a sliver clamp
  (`MAX_ASPECT`) keeps a long thin rail's cross-section wide enough to draw a dado on,
  and a height ceiling (`MAX_HEIGHT`) keeps a square panel from growing off the sheet.
  `band`'s own widening (`MIN_FEATURE`) is centred, not left-anchored, so a narrow cut
  still reads as being where the setup line says it is. All four constants are named
  exports precisely so a browser pass can retune them without touching the geometry —
  see the browser-verification report for the ones this pass exercised.
- **`PartDiagram.tsx` formats nothing.** Every label string arrives ready from
  `buildDiagrams`, the same rule `CutList.tsx` already followed for the row text, so
  display rounding stays in one place. The hatch is an SVG `<pattern>` fill —
  foreground content, not a CSS background — specifically so it survives print with
  Chrome's "Background graphics" turned off; a CSS background would not, and the
  near/far distinction would silently collapse to solid-versus-dashed.
- **A three-state toggle, not a boolean.** `CutList.tsx` defaults to drawing only
  parts that have joinery — a plain board's outline adds nothing prose doesn't already
  say — with "All parts" and "None" as the other two states. Local view state, same
  reasoning as `shortcutsSuspended`: it's outside the document and the undo stack.
- **No schema change.** `CURRENT_VERSION` is still 4; the diagrams are derived from
  `cuts`, which was already stored.
- **The second `document → units` import.** `diagram.ts` imports `formatLength` from
  `units` for the same reason `cutlist.ts` does — a label has to be produced by the
  function that does the printing — which makes that edge a settled boundary rather
  than the one-off exception it read as when `cutlist.ts` opened it.
- **Known, deferred, and verified in a real browser** — see
  `docs/follow-ups.md`'s "From the cut list diagrams" section for which constants
  turned out to need browser judgement rather than a test, and what the browser pass
  actually checked versus what it could not. The depth-label collision on close cuts
  was shipped open on purpose; it is closed by the label layout round below, not by
  this one.

**What the label layout round did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-diagram-label-layout-design.md`. Chosen
2026-08-01, after the cut list diagrams shipped and deployed. The subject was
follow-up **59**, whose diagnosis was one sentence: *every `<text>` in
`PartDiagram.tsx` is positioned by geometry alone, and nothing measures the width of
the string being placed — SVG text has extent, and the code treated it as a point.*
Sharpened: a label overflowed whenever its run was shorter than the label was wide.

- **Measured, not estimated — and arithmetic because the obvious tool doesn't exist
  under test.** The fix needed to know how wide a label is before drawing it. The
  obvious way, `getComputedTextLength()`, returns `0` under jsdom — invisible to
  vitest by construction, which is the exact hole the whole defect class came through
  in the first place. So `diagramLabels.ts`'s `labelWidth` is arithmetic instead:
  character count × `CHAR_W`, where `CHAR_W` rests on `--font-num` (the monospace
  stack already used everywhere else numbers print in this app) advancing at a fixed
  rate per glyph. Measured in a real browser: **12.029 units/glyph** at font-size 20,
  identical for digits, punctuation and mixed strings — a real monospace face, not an
  assumption. `CHAR_W = 12.4` bounds that from above with 0.371 units/glyph of
  headroom, so the bound errs toward spacing labels slightly too far apart rather than
  too little (see follow-up 66 for what happens on a machine where the headroom isn't
  enough).
- **One-row-per-cut closes cross-cut collisions by construction.** Every number a cut
  owns now lives in that cut's own stacked leader row, `ROW` units apart with no
  arithmetic involved — two different cuts' labels cannot collide regardless of
  string length, because nothing has to compute whether they do. Only the up-to-three
  labels sharing one row (offset, width, depth) can still collide, and those are
  settled by `packRow`, which measures each label via `labelWidth` and shifts labels
  right, in board order, only as far as a genuine overflow requires.
- **Depth moved into the row for a reason deeper than the collision that prompted
  it.** Depth runs perpendicular to this view — it has no position on the page, so
  centring it on its band was never spatially meaningful in the first place. Placing
  it beside the band, in the row, is honest about that; the collision was the symptom
  that surfaced a placement that was wrong on its own terms even before two labels
  ever got close enough to overlap.
- **End ticks fixed a defect the collision fix hadn't touched.** Adjacent leader-row
  runs (the offset run, the band run) were collinear with identical stroke and read as
  one continuous line, so the offset label appeared to measure all the way to the
  cut's far side. A human looking at a rendered diagram found this, not the sweep
  (which only reads `<text>`) or any test. Fixed with a short tick (`TICK`) at each
  run boundary.
- **The honest boundary: the unit tests cover layout logic, not font metrics.** Eight
  geometries are pinned as unit tests and pass because `packRow`'s arithmetic is
  correct given `CHAR_W` — they cannot, and do not claim to, prove that `--font-num`
  actually advances at that rate in any given browser. That claim is browser-measured
  (above) and re-verified by the sweep (`docs/diagram-overlap-sweep.js`), which came
  back **ALL CLEAN: 8 geometries, 0 issues** at a re-derived `TOL = 0.1` (see follow-up
  65). See follow-ups 59, 62, 65-70 for the full record, including the round's own two
  new instances of plan-supplied code being wrong (68) and what "sweep clean" does and
  does not mean (69).

**Deferred behind it**, from the cut list's §7, recorded as decisions rather than
omissions: **board-feet and sheet totals** (cheap now that `buildCutList` exists, but a
purchasing number rather than a bench number) and **sheet-goods nesting**, a real
packing problem wanting its own spec. CSV/clipboard export and name run-collapsing
(`Leg 1..4`) were looked at and declined, for reasons worth reading before proposing
either again. In the older ledger, **48 and 49** remain the only two entries with a
user-visible consequence, unaffected by the cut list or the diagrams.

**What joinery did**, design in
`docs/superpowers/specs/2026-07-31-sloyd-joinery-design.md`, plan in
`docs/superpowers/plans/2026-07-31-sloyd-joinery.md`:

- **One primitive.** A `Cut` is a rectangular removal that runs fully across one of
  the board's dimensions. A dado is that cut in the middle of a face; a rabbet is the
  same cut at an edge — so the difference is *derived* (`cutLabel`), never stored.
  Fields are part-local (`face`, `from`, `across`, `offset`, `width`, `depth`), named
  in length/width/thickness, so a cut survives posture and rotation the way `grain`
  does. `face` and `across` name two dimensions; the third — the **position axis**
  that `offset` and `width` are measured along — is implied via `positionAxisOf`,
  never stored, so a cut cannot name the same dimension twice.
- **Schema 4.** `addCutsToV4` defaults `cuts` to `[]` on raw data before
  `validateBoard`, extending the chain to 1→2→3→4.
- **Sub-box decomposition, not CSG.** `src/document/cuts.ts` splits the board at
  every cut boundary into a grid of cells, drops each cell whose centre is inside any
  cut, and merges the survivors. Splitting first is what makes the centre test sound;
  dropping against the **union** is the whole of overlap handling, so two overlapping
  dados remove the overlapped stock once with no pairwise intersection case. CSG was
  rejected for a concrete reason: `boardUVs` returns a `Float32Array(48)` keyed to
  `BoxGeometry`'s 24 vertices, so arbitrary triangle counts would have invalidated
  invariants 12, 14 and 15 together. A board with no cuts still yields exactly one
  solid matching `boardExtents`, which is what makes joinery free for boards that
  don't use it.
- **Edges come from the grid**, not from the solids — see invariant 16.
- **UVs stay parent-relative**, so the figure runs continuously across a dado rather
  than restarting at it — see invariant 17.
- **Clamp on load, refuse in the panel.** `validateCuts` clamps a cut back inside a
  board that was later shrunk (a saved document must always open), dropping only what
  has no nearest legal value. The panel refuses out-of-range entry outright, because
  silently correcting a number the user just typed loses a measurement.

**What v2 did:** collapsed the four-value rotation select to a two-state **Grain**
select ("Along X" / "Along Z") — a rectangular box has 2-fold symmetry about the
vertical axis, so 0°/180° and 90°/270° were always literally indistinguishable — and
fixed the reorient-pivot bug (`boardExtents` swapped extents with the min-corner
pinned, so a 24×5½ board jumped sideways when it turned; `reorientedPosition` fixes
that by preserving the footprint's X/Z centre and the Y-min). `CURRENT_VERSION` went
to 2, with a migration folding 180→0 and 270→90. Plus wood grain textures: face, edge
and end grain distinguished per face, with plywood showing veneer on its faces and
visible plies on its edges.

**What v3 actually did**, design in
`docs/superpowers/specs/2026-07-31-sloyd-v3-design.md`, plan in
`docs/superpowers/plans/2026-07-31-sloyd-v3.md`:

- **Posture.** `standing` (boolean) became `posture`
  (`'flat' | 'on-edge' | 'upright'`), naming which dimension points up. One rule
  generates all six orientations — at 0° the earlier of `[length, width, thickness]`
  goes on X, at 90° they swap — and it reproduces all four of v2's rows exactly (that
  agreement is pinned by explicit tests). The two orientations it adds are the
  upright ones: a leg, a post or a stile could not be modelled before.
  `axisDimensions` — the single source for this mapping — moved into
  `src/document/geometry.ts`, with `boardExtents` now a direct expression of it in
  the same file. The viewport's separate copy is gone.
- **Part-local grain.** `grain` is its own field
  (`'length' | 'width' | 'thickness'`), independent of posture. The face whose
  normal runs along the grain shows end grain; face grain goes to the first of
  `[thickness, width, length]` that is not the grain; edge grain to the one left.
  Grain along length reduces to the old fixed map exactly. Grain changes which faces
  show which cut — it never moves a board, and is deliberately absent from the
  store's reorient predicate.
- **Schema 3.** The v2→v3 step maps `standing` to `posture` and defaults `grain`,
  running on raw board data before `validateBoard` — see invariant 11. Migration is
  now a real chain: a v1 file walks 1→2→3, folding 270→90 before it gains a posture.
- **Log-derived grain textures.** Wood is now three cuts through one log: face far
  from the pith (cathedral arches), edge through it (quartersawn lines), end the
  cross-section. The ring maths lives in `src/viewport/grainLog.ts`, pure and
  unit-tested, with `seededRandom`/`hash` moved there from `grainTexture.ts` — this
  closes follow-up 32. See invariant 14 for why `bandRadius` is `hypot(d, k·delta)`.
- **`boardUVSignature`**, added after the browser gate caught a real bug:
  `BoardMesh`'s geometry memo was keyed on a hand-written field list that did not
  include `grain`, so grain changes never reached the screen while the document was
  correct. See invariant 15.

**Post-v3 fixes**, found in use rather than in review: `DimensionField` and `NameField`
both share a display-staleness defect shape, closed in the same session — see
invariant 5 for the full mechanism, and follow-ups 36 and 45 for what each field's
specific consequence was. Separately, `fe4deed` (in the v3 branch above) fixed a real
bug by having sheet goods ignore `grain` entirely in the tiling rank, which also
silently removed the veneer rotation on plywood's face — the rule now promotes grain
among the two non-thickness dimensions for sheet goods, so the ply stack still spans
the true thickness *and* the veneer still turns; see follow-up 46 for the traced case.

## What Sloyd is

Modelling and planning for woodworking projects: lay out the parts of a build in 3D,
see how they fit, and get the numbers you need at the bench (dimensions, cut list).
Not a general-purpose CAD tool — the domain assumptions (boards, stock thickness,
fractional inches) are the point.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education
tradition built around hand woodworking.

## Architecture

Static single-page app. No server, no database, no API, no env vars.

**Governing rule: the plain-JSON document is the source of truth; the Three.js scene
is derived from it and is never authoritative.** A document is
`{ version, name, units, boards: [...] }`. Dragging a board in the viewport computes a
number, writes it to the document, and the scene re-renders from the updated document
— never the reverse. This is what keeps undo, save/load, and export simple: they only
ever serialize or restore the document.

Module dependency order (each layer only depends on the ones before it):

1. **`units`**, then **`document`**. `units` is the bottom layer and imports nothing;
   it parses/formats fractional inches (e.g. `24 1/2"`). `document` sits directly
   above it and owns the document schema, board geometry, validation, and versioned
   migration. `document/names.ts` is a leaf alongside it, importing only the `Board`
   type.

   **The cut list added the one edge between them:** `document/cutlist.ts` imports
   `formatLength` from `units`, because a row's grouping key is built out of formatted
   strings. Part identity is defined as *"prints identically"* — two boards belong on
   one row when the numbers a person reads off the sheet are the same — so the key
   must be produced by the very function that does the printing. Comparing raw floats
   instead would split a row over a difference no one can see or cut to. The edge
   creates no cycle (`units` still imports nothing, and nothing above `document`
   changed), so this is a layer boundary moving by one, not a violation. Injecting the
   formatter as a parameter was considered and rejected: it would move the definition
   of part identity out to whichever call site passed the function, which is exactly
   the decision that should live in one place next to the grouping code.

   **The cut list diagrams made it a settled boundary rather than a one-off.**
   `document/diagram.ts` is the *second* thing in `document` to import `formatLength`
   from `units`, for the identical reason: a diagram's labels have to be produced by
   the same function that prints the row text next to it, or a dimension could read
   differently in the two places a person looks at it on one sheet. One `document →
   units` import could be argued as an exception; two, for the same reason, is the
   edge the layer order actually has.
2. **`store`** (Zustand + snapshot-based undo/redo) and **`storage`** (the
   `StorageAdapter` seam) — both sit above `document`.
3. **`viewport`** (react-three-fiber scene, camera, grid, gizmo) and **`panels`**
   (React forms: toolbar, parts list, properties panel) — both read/write through the
   store, and both also import `document` directly for its exported types and
   constants (`panels` for `MATERIALS`, `DocumentError`, `Rotation`, `uniqueName` and
   `buildCutList`; `viewport` for geometry helpers). `panels` additionally imports the `storage` adapter singleton
   for export/import. These are legitimate downward imports, not a layering
   violation — `document` and `storage` sit below both.

Notable modelling detail: a board's `position` is the **min-corner** of its world
bounding box, not its center. This matters anywhere geometry or the gizmo touches
position math.

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`. Nothing else touches `localStorage` or the filesystem directly. A
future desktop build would be a second implementation of that same interface, not a
parallel code path.

**Versioning:** every document carries a `version` field, and every load path (open,
import, autosave-restore) runs through `migrateDocument` before the document is
trusted. This is what lets the schema evolve (e.g. for the cut list) without breaking
files saved by earlier versions. `CURRENT_VERSION` is 4, and migration is a real
chain: each step runs on raw data, in version order, one version at a time
(`if (d.version < 2) …; if (d.version < 3) …; if (d.version < 4) …`), before any board
reaches `validateBoard`. A v1 file walks 1→2→3→4 — `foldRotationToV2` (180→0, 270→90)
first, then `addPostureToV3` (`standing` → `posture`, `grain` defaulted), then
`addCutsToV4` (`cuts` defaulted to `[]`) — which is the worked example every future
migration step should match. See invariant 11 for why the steps run where they do.
`addCutsToV4` is the mildest step in the chain (its default is empty, and
`validateBoard`'s fallback would be the same empty array) and it runs in the same
place anyway, on purpose: the chain's value is that every step has one shape, so the
next step that *does* have a divergent fallback inherits the correct structure rather
than depending on its author noticing.

Full detail: `docs/superpowers/specs/` (design) and `docs/superpowers/plans/`
(implementation plan). This section is a summary, not a replacement for either.

## Where things live

```
src/
├── units/length.ts          parseLength / formatLength. Imports nothing.
├── document/
│   ├── types.ts             Board, SloydDocument, Rotation, Posture, Grain, MATERIALS
│   ├── geometry.ts          axisDimensions (single source) / boardExtents /
│   │                        boardCenter / reorientedPosition
│   ├── names.ts             uniqueName / dedupeNames. Imports only Board.
│   ├── cuts.ts              cutRegion / boardSolids (split, drop, merge) /
│   │                        boardEdges / solidWorldBox / cutLabel. Pure; imports
│   │                        only ./geometry and ./types, never ./document
│   ├── cutlist.ts           buildCutList: group by material+thickness, collapse
│   │                        identical parts into rows, phrase each cut as a setup
│   │                        line. Pure; imports ./types, ./geometry, ./cuts and
│   │                        ../units/length — never ./document
│   ├── diagram.ts           buildDiagrams: one view per (face, across) pair, board
│   │                        inches, cut bands and labels. Pure; the second thing in
│   │                        ./document to import from ../units/length
│   └── document.ts          create / validate / migrate (v1->v2->v3->v4 chain);
│                            re-exports the other six
├── store/store.ts           Zustand store, snapshot undo/redo, gesture coalescing
├── storage/
│   ├── types.ts             the StorageAdapter interface
│   └── browser.ts           BrowserStorageAdapter + the `storage` singleton
├── viewport/
│   ├── Viewport.tsx         Canvas, lights, grid, shadow receiver, camera keys
│   ├── BoardMesh.tsx        one board, derived from the document each render
│   ├── OriginAxes.tsx       origin axis lines, R=X G=Y(up) B=Z; dashed = negative
│   ├── gridDensity.ts       grid tier ladder (1in -> 1ft -> 12ft). Pure.
│   ├── screenScale.ts       px-per-inch + screen-stable dash scale. Pure.
│   ├── Gizmo.tsx            TransformControls, 1/16" snapping
│   ├── gizmoScale.ts        gizmo size ceiling + grabbable floor. Pure.
│   ├── extent.ts            SCENE_EXTENT, shared by Viewport and OriginAxes
│   ├── grainFaces.ts        faceGrainKinds (per-face cut) + grainFamily; re-exports
│   │                        axisDimensions from document/geometry.ts. Pure.
│   ├── grainTiling.ts       per-face UVs: tile size, swap, per-board offset,
│   │                        boardUVSignature. Pure.
│   ├── grainLog.ts          the log a board was cut from: ring radii (bandRadius),
│   │                        wobble, seededRandom/hash. Pure.
│   └── grainTexture.ts      seeded canvas grain textures, cached, never disposed
├── panels/
│   ├── DimensionField.tsx   the validating fractional-inch input; min/max
│   │                        REFUSE out-of-range entry rather than clamping
│   ├── NameField.tsx        part name; commits on blur/Enter, empty reverts
│   ├── Toolbar.tsx  PartsList.tsx  FileMenu.tsx
│   ├── Properties.tsx       board fields + the Cuts section; CutRow is its own
│   │                        component so a cut's error dies with the cut
│   ├── diagramScale.ts      fitView (uniform scale + sliver clamp + height ceiling) /
│   │                        band (centred widening to MIN_FEATURE, ordering-guarded). Pure.
│   ├── diagramLabels.ts     LABEL_SIZE / CHAR_W / labelWidth (character count ×
│   │                        monospace advance) / packRow (ideal centres in,
│   │                        non-overlapping centres out). Pure; the arithmetic
│   │                        substitute for getComputedTextLength(), which is 0
│   │                        under jsdom.
│   ├── PartDiagram.tsx      one view, drawn as SVG: outline, hatched/dashed cut
│   │                        bands, one stacked leader row per cut (offset/width/
│   │                        depth packed via packRow). Formats nothing — every
│   │                        label string arrives from buildDiagrams
│   └── CutList.tsx          the printable sheet: derives from the document on every
│                            render, owns Escape-to-close and takes focus on mount,
│                            calls formatLength never, and owns the Diagrams toggle
│                            (none / joinery only / all — local view state)
└── App.tsx                  layout, autosave/restore effects, undo keybindings, and
                             the `.app-shell` wrapper that goes `inert` behind the
                             cut list
```

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.

## Invariants — break these and things fail in confusing ways

Each of these cost real debugging during v1. They are load-bearing, not style.

1. **The document is the source of truth.** No component may hold geometry state that
   isn't derived from it, and nothing may write to a Three.js object's transform as a
   way of recording a change.
2. **`position` is the min-corner**, not the center. `boardCenter` exists because
   Three.js meshes are center-origin and the document is not. Reorienting a board
   pivots it about itself — `reorientedPosition` in `document/geometry.ts` is the
   only place that arithmetic lives, and `store.updateBoard` is what applies it,
   whenever a patch changes `rotation` or `posture` without carrying its own
   `position`. `reorientedPosition` takes the whole patch (`Partial<Board>`), not just
   `{ rotation, posture }` — a patch that also changes a dimension needs the pivot
   computed from the *post-patch* extents, and `store.updateBoard` passes the patch
   straight through rather than reconstructing a narrower object, for the same
   undefined-overwrite reason that once justified the narrower one. `grain` is
   deliberately absent from this predicate — it changes which faces show which cut,
   never a board's extents, so reorienting on a grain change would be a no-op pivot.
   **`cuts` is absent for the same reason**, and that is also why cut edits get their
   own store actions (`addCut`/`updateCut`/`removeCut`) instead of going through
   `updateBoard`: a cut removes stock from *inside* the board's AABB, so it changes
   no extent and moves nothing.
3. **The `dragging` ref guard in `Gizmo.tsx`.** `TransformControls` computes motion from
   state captured at drag start; syncing the document into the proxy mid-drag makes it
   fight itself. The symptom is jitter or drift, not a crash.
4. **Gesture snapshots are lazy** — taken on the first `edit()` inside a gesture, not in
   `beginGesture()`. Eager snapshotting leaves no-op undo entries, so `Ctrl+Z` appears
   to do nothing.
5. **A field holding a local draft — `DimensionField` and `NameField` both — skips
   its adopt-external-changes effect while focused, and that effect never re-fires
   afterward, so blur must resync the display from the stored value and must not
   commit when the field was untouched.** Two distinct failure modes if either half
   is missing. Commit an untouched field and it rewrites exact stored values with
   display-rounded ones (0.7" → 11/16") — the original reason for the `dirty` guard.
   Skip the resync instead and the field shows a stale number *indefinitely* once an
   external change (a posture/rotation reorient, an undo, a future gizmo drag) lands
   while the field has focus: the effect is keyed on `[value, precision]` (or on
   `value` alone for `NameField`), so once it's skipped once for being mid-edit,
   nothing makes it re-run just because focus later leaves — only a remount (e.g.
   reselecting the part) shows the correct value again. Stored values are exact;
   display rounds.
6. **`add_header` does not merge across nginx levels.** A `location` block containing any
   `add_header` discards everything inherited — which is why `security-headers.conf` is
   `include`d in every block rather than set once on the server.
7. **`autoSave` must never throw.** It reports failure via `storage.available`, which
   drives the warning banner.
8. **Board names are unique, and enforced in four places** — `addBoard`,
   `duplicateBoard`, the name-field commit, and `migrateDocument`. Creation-only
   enforcement is not enough: an imported or hand-edited file would violate it.
   `createBoard` cannot dedupe (it has no view of the document), so any new call
   site that adds a board must pass its name through `uniqueName` itself.
   `validateBoard` trims before checking for blank — a whitespace-only name is
   blank too — so `migrateDocument` never hands `dedupeNames` something that
   trims to `''`.
9. **`NameField` commits once, on blur or Enter — never per keystroke.** An
   emptied name reverts, and that is only possible with a single commit: writing
   per keystroke and correcting on blur takes the gesture's undo snapshot before
   the correction lands, leaving an entry that undoes to nothing. Its `onCommit`
   returns the stored name because dedup can store something other than what was
   typed. The `dirty` guard (invariant 5) buys a second thing beyond the display
   staleness: without it, `commit()` ran unconditionally on every blur, so an
   untouched field blurring after an external rename landed wrote the *stale local
   text back over it* — a silent write, not just a stale display, and worse for
   being invisible until the next time something read the name.
10. **The gizmo size clamp writes `size` *before* the library's `updateMatrixWorld`,
    never `handle.scale` after it.** `size` is an input to three-stdlib's scale
    computation, so the library bakes the correction itself and nothing needs
    recomposing. Correcting the output instead lands in the re-bake trap that
    invariant 3's neighbouring comment block documents at length. Related: the clamp
    is two-sided *and* has a floor on the cap itself (`GIZMO_MIN_CAP_INCHES`) — a
    board-relative ceiling alone governs close range too and shrinks the gizmo for
    small parts the moment they are selected.
11. **Migration steps run on raw data, before `validateBoard`, in version order.**
    `validateBoard` falls back to `0` for an unknown rotation, so a fold that ran
    after it would turn every saved 270° board a quarter turn the wrong way — and
    unlike 0-vs-180, that is a different shape on screen, not just a redundant one.
    The v2→v3 step (`addPostureToV3`) has the same failure mode: `validateBoard`'s
    posture fallback is `'flat'`, a perfectly legal value, so a `standing: true`
    board that reached the validator before gaining a `posture` would come out lying
    down — silently, and only for files that already exist. Upgrade first, validate
    second, one version at a time.
12. **Grain textures are cached at module level and never disposed; per-board
    variation lives in the `uv` attribute, never on the texture.** `texture.repeat`/
    `offset`/`rotation` are per-texture state on an object every board shares —
    writing them per board would make every board on screen fight over one mapping.
    The per-board offset in `boardUVs` is zeroed on any axis a `FacePlan` marks
    `fit`: the whole tile is shown either way on a `FIT` axis, so an offset there
    buys no variation and only shifts the pattern's seam into the middle of the
    face — exactly what `FIT` exists to avoid on wood ends and plywood's ply stack.
13. **~~`axisDimensions` had a second copy in the viewport, kept from drifting off
    `document`'s `boardExtents` only by a dedicated test.~~ RETIRED in v3.** Before
    v3 the mapping from board dimensions to world axes was implicit in a boolean and
    had to be restated in two files that could disagree; a test existed solely to
    catch that drift. v3 moved `axisDimensions` into `document/geometry.ts` as the
    single source, with `boardExtents` now a direct expression of it in the same
    file and the viewport importing rather than reimplementing it. The drift test
    was deleted, not forgotten — there is nothing left for it to catch, since the
    two things it compared are now one thing.
14. **`bandRadius` is `hypot(d, k·delta)`, not an arbitrary choice of curve — and
    the tile is seamless by two different mechanisms, not one.** Because
    `r = hypot(d, k·delta)`, the in-plane offset `sqrt(r² − d²)` comes out as
    exactly `k·delta` — evenly spaced, whatever the cut distance `d`. A "simpler"
    radius (e.g. `r = k·delta` directly) reintroduces a seam that only shows up on
    a wide board, because the in-plane spacing would then vary with `d`. That
    property alone does not make the tile seamless, though: it is what the *u*
    direction (along the grain) relies on. The *v* direction (across the grain,
    the tile's two edges) is seamless for a different reason — `bandRadius` is
    even in `k` and the seed bucket is `Math.abs(k) % half`, so band `−k` is the
    exact mirror of band `+k` about the pith line, and the tile's two v edges
    carry that same mirrored curve. That is mirror symmetry, not translational
    periodicity — the pattern does not repeat every `SIZE`, it folds about the
    pith line. `grainTexture.ts`'s `woodCut` comment says this precisely; treat
    this entry as agreeing with that comment, not restating a looser version of it.
15. **Anything that memoises on what `boardUVs` reads must key on
    `boardUVSignature`, not a hand-written field list.** v3 added `grain` to what
    `boardUVs` reads (via `facePlans` → `ranks`) without updating `BoardMesh`'s memo
    dependency array, so a board's grain silently stopped turning on screen while the
    document stayed correct and the per-face material maps updated normally — which
    is exactly what made it look like it worked. No single per-task review could see
    it: the field was added in one task and consumed by the stale memo in another.
    The browser gate caught it by pixel-diffing before/after screenshots; the fix
    keys the memo on `boardUVSignature`, a derived signature that lives next to the
    code deciding what it must cover, and deliberately excludes `position`/`name` so
    dragging a board does not rebuild its geometry every frame. Joinery added `cuts`
    to it for exactly the same reason — cuts change which solids exist, so a memo
    that missed them would leave a dado invisible while the document stayed correct.
    One more thing the signature is *not*: it is identical for every solid of a
    board, because it describes the board. Anything caching per solid must not key
    on it alone. `BoardMesh` sidesteps this by building all the geometries in one
    memo that returns an array, so they are rebuilt together.
16. **Edge lines come from the cell grid, not from the solids.** The remainder around
    a dado is L-shaped in section, and an L is not a box — so the canonical case (a
    ¾"-wide, ¼"-deep dado at 6" across a 24" board) leaves three abutting solids
    covering the board's *continuous* uncut bottom face, and per-solid `EdgesGeometry`
    draws lines across it at 6 and 6¾ that correspond to no real edge. Merging in
    `boardSolids` reduces the solid count; it cannot fix this, and it is not meant to.
    `boardEdges` instead tests the up-to-four cells around each candidate segment and
    draws unless the configuration is flat (all four filled, none filled, or exactly
    two sharing a face). Cells outside the board count as empty, which is what makes
    the outer silhouette, the convex corners and the concave dado shoulders all fall
    out of one rule. `BoardMesh`'s own comment calls edge lines "the single biggest
    readability win", so this is legibility, not polish. Contiguous drawn cells on a
    line are merged into one segment — without that, a cut anywhere on the board
    fragments the lines on faces it never touches.
17. **UVs are parent-relative, and `FIT` resolves against the board, not the solid.**
    `boardUVs(board, solid)` looks a sub-box's coordinates up in the *board's* tiling,
    so the grain figure runs continuously across a dado instead of restarting at its
    edges — which is what makes a cut read as stock removed from one board rather than
    two boards pushed together. The per-board UV offset stays the board's (invariant
    12) for the same reason. `FIT` is where this is easy to get backwards: it means
    "show the whole tile on this axis", and the tile belongs to the board, so fitting
    it to the solid would squeeze plywood's whole five-ply stack into the stock that
    survived a ¼" dado when the correct picture is the plies the cut left behind.
    `FacePlan` carries `tileInches` (tile *size*) rather than a tile count precisely
    so that `FIT` and fixed tiling are one division: `u = coordinate / tileInches`.
18. **On the cut list, dimensions collapse at display precision and cuts must match
    exactly.** The two halves of a row key are built by two deliberately different
    code paths — `formatLength(n, doc.units.precision)` for every dimension, and for a
    cut the three enum fields (`face`, `from`, `across`) verbatim with raw `String(n)`
    on the three numbers (`offset`, `width`, `depth`) — and neither may be relaxed to
    match the other, in either direction. The reason is what each error costs at the bench. A
    stock dimension rounded to the nearest 1/16" costs nothing: two boards 0.02" apart
    are one board to anyone cutting them, and splitting them into two rows over a
    difference no saw can hold makes the sheet lie about how much stock to buy. A
    *cut* rounded the same way costs the joint — two dados 0.02" apart are two setups,
    and collapsing them onto one row tells the user to run one, which is a part that
    does not fit and stock already consumed. So: round what is bought, never what is
    machined. This is **not** the float-`===` hazard `cutLabel` had (see joinery's
    lesson list, item 3). That bug compared a *subtraction result* against a bound,
    where the arithmetic itself introduces the error; here both sides are stored
    values compared to stored values, and two cuts a user entered identically hold
    identical doubles. Exact comparison is the correct tool precisely because nothing
    computes these numbers on the way in.
19. **`LABEL_SIZE` has exactly one home, and `--font-num` on diagram text is
    load-bearing, not cosmetic.** `LABEL_SIZE` (`diagramLabels.ts`) is applied to the
    `<svg>` element as a `fontSize` attribute; `styles.css` must never set a
    `font-size` on diagram text (`.cutlist-diagram-overall`,
    `.cutlist-diagram-leader text`). The reason is stronger than the usual
    single-source-of-truth argument: `labelWidth`'s arithmetic (character count ×
    `CHAR_W`) is only true of the size the browser actually renders, so a second
    `font-size` living in the CSS — even one that happened to agree with
    `LABEL_SIZE` today — would be a value a future edit could drift out of step with
    silently, exactly the shape follow-up 64 already recorded once for spacing
    constants. The font-family matters for the same load-bearing reason: `--font-num`
    is a monospace stack, which is what makes a fixed units-per-glyph advance true in
    the first place. Swap it for a proportional face and every glyph's width varies,
    `labelWidth` returns a number with no relationship to what's drawn, and `packRow`
    starts placing labels on top of each other while every unit test still passes —
    because the tests assert the arithmetic, not the render. See follow-up 66 for the
    bounded, not universal, headroom that arithmetic rests on.

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 515 tests
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck. A green suite proves nothing about `tsc`; run
`npm run build` before claiming anything compiles.

## Open follow-ups

`docs/follow-ups.md` lists everything found during v1 review, the two polish passes,
v2, v3, the post-v3 fixes, joinery, and the cut list, consciously deferred rather than missed,
numbered 1-30 plus the per-release additions. Read it before starting new work in the
same area — several items are "correct but untested", which is exactly what a
refactor breaks silently.

**29 and 30 are closed** — the gizmo now has a size ceiling tied to the selected board
(with a floor that keeps it grabbable when zoomed far out), and the origin lines have
their own toolbar checkbox. **5 is closed** — the version gate now rejects versions
below 1 and non-integer versions. **32 is closed** — `hash` and `seededRandom` moved
to `src/viewport/grainLog.ts` and are unit-tested there. **36, 45 (the `NameField`
stale-write), and 46 (the plywood-grain regression) are closed** — see invariant 5
(display staleness, both fields), invariant 9 (`NameField`'s additional stale-write
mode), and the "Post-v3 fixes" paragraph above (plywood grain). All closures are
written up in place. **47 is open**: the toolbar's project-name field was checked
against the same display-staleness shape and does **not** have it — see
`docs/follow-ups.md` for why.

Joinery added **48-53**, all open and all recorded rather than fixed. The one to read
before touching the panel is **48**: shrinking a board's dimensions through the
*Dimensions* fields can store a cut that removes the whole board, because that write
goes through `updateBoard` and never meets the Cuts section's guard — the board
vanishes in-session and comes back whole on reload, since `validateCuts` drops the cut
on load. **49** is the same end state reached by two individually-legal cuts, and one
fix — a placeholder render whenever `boardSolids` is empty — would close both.

The joinery section also ends with a lesson rather than a defect, worth reading before
executing another plan: **seven of joinery's defects were in code the plan supplied
verbatim.** They were caught because implementers were told to fix the code rather than
the expectation, and to stop and escalate when they believed an expectation was itself
wrong — which happened once, correctly, and changed the plan.

The cut list added **54-58**. **56 and 58 are closed** by the branch's final review pass
— the modal is now contained (`inert` shell, focus on mount, focus restored on close)
and the print block no longer leaves `body` or `.cutlist-empty` dark; 54 and 55 were
also *corrected* rather than closed, 54 having overstated its risk and 55 having gained
55a, the one place the representative rule reaches a printed word. **48 and
49 are unaffected by it** and stay open: the cut list reports *stock* dimensions, and
a board whose cuts happen to remove all of it still has the stock it was cut from, so
it appears on the sheet correctly even while it renders as nothing in the viewport.

The cut list diagrams added **59-64**. **59 is now closed** by the label layout round
below — depth labels no longer collide, because every number a cut owns lives in that
cut's own stacked leader row (cross-cut collisions close by construction) and the
up-to-three labels sharing a row are settled by `packRow` (collisions within a row
close by arithmetic on a measured monospace advance). **60** records
`MAX_ASPECT`/`MAX_HEIGHT`/`MIN_WIDTH` as browser-settled rather than test-settled — the
label layout round re-checked all three extremes with the new layout in place and
changed no constant. **61** confirms the §2 non-goal (one view per `(face, across)`
pair, cuts that name the same dimension twice) survived verification — the panel's own
`setFace` already prevents the degenerate case, so `diagram.ts`'s guard is
belt-and-suspenders, not load-bearing, in the UI path. **62 is now closed** — an
ordering guard on `band()`'s `Span` argument, added opportunistically while that
function was already open for another fix. **63** is latent-not-live still:
`DiagramCut.v`/`.kind`/`DiagramFit.sy` are unused by `PartDiagram` today. **64** is a
lesson, not a defect — Task 4's plan-supplied spacing constants overlapped a label with
the outline before review caught it, the same failure shape as joinery's "seven defects
in code the plan supplied verbatim," now with a second instance from a different
feature.

The label layout round closed **59 and 62**, amended **60, 63 and 65**, and added
**66-70** — see `docs/follow-ups.md`'s "From the label layout round" section. **68** is
a second lesson entry worth reading beside 64: this round produced a *third and
fourth* instance of plan-supplied code being wrong, both shaped the same way — a guard
written for one direction, and a test written to the guard rather than to the
requirement. **69** records what the sweep's green does and does not mean: it collects
only `<text>`, so a defect made of two fused `<line>`s (found by a human, not any
guard or test) was invisible to it. **70** records what was *not* verified — an actual
print-to-PDF render, which the Playwright MCP on this host cannot produce.

One entry is a lesson rather than a defect and is worth reading before touching anything
in the viewport: **26a**. Browser verification on this host runs on software GL
(llvmpipe, no GPU), which returns 1.0 for `pow(0.0, 0.0)` where real hardware returns
NaN. That difference hid a grid bug completely — it looked correct in every screenshot
and shipped as a camera-following disc. Anything resting on undefined or
precision-sensitive shader behaviour needs a human looking at real hardware.

Host-level open items (proxy auth, Cloudflare, monitoring) are in
`DEPLOYMENT.local.md`, not in the public repo.

## Deployment

Sloyd builds to static files served by nginx from a multi-stage image
(`docker compose up -d --build`). No bind mounts, no named volumes, no `.env` — there
is deliberately no server-side state to persist, because the document lives entirely in
the browser behind `StorageAdapter`. The nginx config does SPA-fallback routing so a
refresh on a deep route resolves to `index.html` rather than 404ing.

**Everything host-specific — hostname, container name, network, proxy setup, and the
manual steps only a human can do — is in `DEPLOYMENT.local.md` (gitignored).** Read it
before deploying or touching anything on the host.

## Working agreements

- Build incrementally: small v1, then widen. Prefer shipping a narrow thing that works.
- Design docs live in `docs/superpowers/specs/`; read the latest before changing behavior.
- **No pull requests.** Solo repo — commit to `master`, or branch and merge locally
  (`git merge --no-ff`, verify the merged tree, then delete the branch). Don't open PRs.
- TDD where it pays. `units` is tested hardest on purpose: a quiet bug there produces
  wrong measurements, and wrong measurements waste lumber. The r3f viewport has no unit
  tests by design — verify it by driving a real browser, not by asserting on mocks.
- When a review finding conflicts with what a plan or spec says, that's a human
  decision, not one to resolve silently either way.
- Prefer closing latent bugs over deferring them, including ones only reachable on a
  future platform — the storage seam exists precisely so a desktop build stays cheap.
