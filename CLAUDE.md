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
on the sheet, because the prose setup lines are hard to read at the bench), a
**label layout round** closing the diagrams' one user-visible gap: labels that
overlapped or bled past the outline because nothing measured the text being placed —
a **per-face diagrams round**, closing the diagrams' other one: perpendicular
cuts on the same face used to fragment into two disconnected figures instead of
drawing together, crossing, in one — a **board-feet round**, adding the
purchasing number (board feet for solid stock, square feet for sheet goods) beside the
bench numbers already on the sheet — and now a **sheet-nesting round**, closing the cut
list's last §7 non-goal: a sheet count and a guillotine-cuttable layout drawing for
every sheet-goods group, schema version 5. Static SPA, containerized, 617/617 tests
passing.

Host-specific deployment detail — hostname, container name, proxy configuration, and
the manual steps a human has to perform — lives in `DEPLOYMENT.local.md`, which is
gitignored. Read that file before deploying; it is not in the public repo.

**The cut list line of work is CLOSED as of 2026-08-01** — cut list, diagrams, label
layout, per-face views and board feet are all shipped and merged to `master`. Do not
treat any of the five as in-flight.

**Production matches `master` as of 2026-08-02.** The three-round gap is closed — the
empty-solids placeholder, board feet and sheet-goods nesting all deployed together. One
consequence worth knowing before any rollback: this was the first deploy to ship a schema
bump (v5) to production, so a document saved by the live build is *refused* by the
previous image rather than silently downgraded. See `DEPLOYMENT.local.md`. The paragraph
below is kept as the record of the deferral that preceded it.

~~**`master` is AHEAD of production.**~~ Everything through the per-face diagrams round is
deployed. The two rounds after it — the **empty-solids placeholder** and **board feet** —
are merged and verified but have **not** been deployed; the user deferred the deploy
deliberately, it is not an oversight. Production therefore still renders a fully-consumed
board as nothing and still prints a cut list with no stock totals. Anyone picking this up
should either run `docker compose up -d --build` (see `DEPLOYMENT.local.md` first) or
leave it alone knowingly — but must not assume production matches `master`.

What is deliberately *not* built sits in two places, and both are decisions rather than
omissions: the **"Deferred behind it"** paragraph below (CSV export and name
run-collapsing — the only two items left there now that sheet-goods nesting is closed
by the round below — both declined with reasons worth reading before re-proposing),
and `docs/follow-ups.md`'s open entries. **48 and 49 — a board whose cuts remove all its
stock rendering as nothing — are now CLOSED**, by the empty-solids placeholder described
below; one open follow-up now has a user-visible consequence — see 92 below, bounded to
near-1:1-aspect-ratio parts under free rotation. Two things about the
diagrams remain unverified rather than fixed: a **print-to-PDF render** (this host's
Playwright exposes no `pdf()`) and **hatch-versus-cross-hatch legibility at screen
size**, which is a recorded negative finding, not an assumption — see follow-ups 76
and 79.

**What the sheet-nesting round did**, design in
`docs/superpowers/specs/2026-08-02-sloyd-sheet-nesting-design.md`. Chosen 2026-08-01,
closing the cut list's last §7 non-goal — nesting was deferred with a reason (a real 2D
packing problem, not a cheap addition; the cut list declined it outright and the
board-feet round chose square feet over a sheet *count* for the identical reason), and
that reason is now answered rather than expired. For every sheet-goods group, one
purchasing number and its evidence: a sheet count (*3 sheets (96" × 48")*) beside the
square feet already there, and, behind its own toggle, one SVG drawing per sheet
showing where each part sits — guillotine-cuttable by construction, so it is a sheet a
reader can actually take to the panel saw.

- **Three facts, three homes.** Sheet size and rotation policy are facts about the
  *material*, not the project: `MATERIALS.sheet` changed from `boolean` to a
  `SheetStock` object (`{ length, width, rotate: 'grain' | 'free' }`) — plywood is
  `{ 96, 48, 'grain' }` (a part turned 90° would run its face veneer the wrong way),
  MDF is `{ 96, 48, 'free' }` (no grain to protect). `isSheetGood` keeps its exact
  signature; `sheetStockOf` is new. Kerf is a fact about the *shop*, so it lives on the
  document as `stock: { kerf: number }`, default 1/8". A part's orientation is a fact
  about the *part*, and nothing new was stored for it — `Board.grain`, already
  part-local since v3, is what `footprintsOf` reads to decide whether a part lies on
  the sheet turned.
- **Schema 5, and the first migration step in the chain that is not a per-board
  upgrade.** `stock` is document-level, so unlike `foldRotationToV2`,
  `addPostureToV3` and `addCutsToV4` it has no `rawBoards.map` step at all — it is
  read defensively off the raw document and defaulted to `0.125` when absent,
  non-numeric, or outside `[0, 1)` (not clamped to that range's nearest boundary —
  a `kerf: 1.5` becomes `0.125`, not `0.999`), exactly the way `units.precision`
  already was, rather than joining the per-board chain. The version
  bump exists for the gate at the *other* end, not for upgrading old files (an absent
  `stock` simply defaults): without it, a v4 build would open a file with a
  user-set kerf, silently drop the field, and print a different sheet count than the
  build that saved it. See the Architecture section for the worked contrast with the
  four `rawBoards.map` steps before it.
- **`src/document/nesting.ts` — shelf first-fit-decreasing, because guillotine
  cuttability is a domain fact, not a quality tier chosen for simplicity.** Every cut a
  shop makes on a sheet runs edge to edge; a denser maxrects packer routinely produces
  placements — an L-shaped remainder needing a cut that stops mid-sheet — nobody can
  actually cut. `buildNesting` takes `doc.boards`, never `CutListRow`s — the fourth
  instance of the 55/55a representative-row shape (follow-up 82), resolved the way
  board feet resolved it: a row's rounded, representative dimensions can overflow a
  real sheet, so every rectangle carries its own board's exact footprint, and
  `buildCutList` packs each sheet-goods group from that group's boards in the same
  pass that already accumulates its square footage. Stock, not remainder — `cuts` are
  never read, the same rule `stockInchesOf` states for board feet, for the identical
  reason: a part is cut from the sheet at its stock size, and joinery happens
  afterward, out of material already on the bench. A part too big for any sheet is
  recorded in `Nesting.unplaceable` and named on the printed sheet, never dropped —
  follow-ups 48/49's shape, applied here rather than repeated.
- **`src/panels/SheetLayout.tsx` draws one SVG per sheet**, deliberately not an
  extension of `PartDiagram` — a sheet with parts on it and a board with cuts in it are
  different drawings that happen to both be SVG. `fitLabel` (in `diagramLabels.ts`)
  degrades a label through a three-tier fallback ladder — name and dimensions stacked,
  then name alone, then a bare index keyed to a list printed beside the sheet — using
  the same measured `labelWidth`/`LABEL_BOX_H` the diagrams already rely on, because
  every label here lives inside its own disjoint rect and so needs a fallback rather
  than `packRow`'s collision arithmetic.
- **`MATERIALS.sheet`'s new shape is deliberately what a future custom-materials round
  fills in.** Customisable ply count, veneer colour, grain on/off, custom sheet
  sizing are planned but not part of this round; when they land, `MATERIALS` entries
  move from a module constant into document data, and nothing in `nesting.ts` changes
  when that happens — it already reads `sheet.length`/`.width`/`.rotate` off whatever
  entry it's handed.
- **No UI for editing kerf.** The field is migrated, defaulted, validated, undoable and
  used by the packer — but changing it means editing the saved JSON directly. This is
  a deliberate deferral to the custom-materials round's own settings surface, not an
  oversight: a kerf control needs a store action and a toolbar or preferences panel
  that nothing else in this round needs.
- **Known, deferred, and verified in a real browser** — see
  `docs/browser-verification-sheet-nesting.md` for what Task 8's pass checked (sheet
  counts against rendered figure counts, zero label bleeds across ten placed parts,
  the unplaceable line and its exclusion from every sheet's part list, zero overlaps
  and zero out-of-bounds rects, print colours including the exact two-class selector
  that broke in follow-up 81) and `docs/follow-ups.md`'s "From the sheet-nesting
  round" section (85-94) for what it found in review before that pass — including a
  test whose own stated justification didn't reproduce (the sixth instance of that
  lesson, follow-ups 64/68/80) and a guillotine-cuttability test that could not fail
  until its bound stopped being self-derived.

There is no next line of work chosen yet. Sheet-nesting closes the cut list's §7 list
entirely — see the updated "Deferred behind it" paragraph below — and no successor has
been picked.

Start with `superpowers:brainstorming`, and read the cut list design's §7 and the
board-feet design's §4 first — both record *why* this was deferred, and those reasons
are the design constraints.

**What the empty-solids placeholder did** (2026-08-01, closing follow-ups 48 and 49; no
spec — the diagnosis and the chosen fix were already in the ledger). A board whose own
cuts consumed all of its stock drew *nothing*: no meshes, and no edges either, since
`boardEdges`' rule draws only where filled and empty cells meet. It sat in the parts
list showing its dimensions while being invisible and unclickable, and a reload silently
repaired it (`validateCuts` drops the cut), which made the state read as a rendering
glitch rather than as something the user did. `BoardMesh` now falls back to one
translucent ghost box at the board's AABB whenever `boardSolids` returns `[]`.

- **The ghost is a mesh because "selectable" demands one.** `THREE.Line` raycasting
  only hits within ~1" of a drawn line, so the wireframe the ledger first sketched
  would have made the part legible without making it clickable — half of what 48 asked
  for. The fill is what makes the whole face pickable; the outline (taken from the
  ghost's own box, since `boardEdges` yields nothing here) is what carries its shape.
- **It rides in the existing `geometries` memo**, which is now `{ placeholder, items }`
  rather than a bare array. A separate memo would have needed its own hand-written
  dependency list — invariant 15's exact failure mode — where riding along inherits the
  `boardUVSignature` key and the disposal effect unchanged.
- **No guard was added to dimension writes**, 48's other candidate fix. One state, one
  mechanism: the placeholder covers both routes and any future one, and a dimension
  guard would have to refuse an edit the user is entitled to make.
- **Verified in a browser, both routes, before and after** — the repo's rule for
  viewport work. `GHOST_OPACITY` is a browser-settled constant in the sense of
  follow-up 60, not something a test could fix. No schema change, no new tests: the
  precondition (`boardSolids` returning `[]`) was already pinned in `cuts.test.ts`.

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

- **One view per `(face, across)` pair — SUPERSEDED by the per-face diagrams round,
  below.** `buildDiagrams(board, precision)` grouped a board's cuts by which face they
  were cut into and which dimension they ran across, because within a view the
  horizontal axis was always the implied position axis and every cut was a band
  touching two opposite edges. This fragmented a face carrying perpendicular cuts into
  two figures instead of one — see follow-up 72. The per-face diagrams round re-keys on
  `(face, from)` instead; near/far is now which figure you're looking at, not a dash
  inside one, so read this bullet as history, not current behaviour.
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
  rate per glyph. Measured in a real browser: **≈12.03 units/glyph** at font-size 20
  (two independent probes, 12.042 and 12.029, identical for digits, punctuation and
  mixed strings) — a real monospace face, not an assumption. `CHAR_W = 12.4` bounds
  that from above with **0.358** units/glyph of headroom against the higher of the two
  probes, so the bound errs toward spacing labels slightly too far apart rather than
  too little (see follow-up 66 for what happens on a machine where the headroom isn't
  enough).
- **One-row-per-cut closes cross-cut collisions by construction.** Every number a cut
  owns now lives in that cut's own stacked leader row, `ROW` units apart with no
  arithmetic involved — two different cuts' labels cannot collide regardless of
  string length, because nothing has to compute whether they do. Only the up-to-three
  labels sharing one row (offset, width, depth) can still collide, and those are
  settled by `packRow`, which measures each label via `labelWidth` and runs in two
  phases: labels cascade RIGHT, in board order, during the left-to-right sweep; only
  if the row still overflows `max` afterward does the WHOLE row then shift LEFT as
  one, which is what preserves every gap. See follow-up 71 for a worked case
  (`flush-max`) where that left shift pulls a label past the band it names.
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

**What the per-face diagrams round did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-per-face-diagrams-design.md`. Chosen
2026-08-01, after the label layout round shipped. The subject was a defect the label
layout round didn't touch: a board with perpendicular cuts on one face — a dado across
the length and another across the width of the same broad face — wasn't having a cut
dropped, it was having the face **fragmented** into two figures, both headed the same
thing, each showing one cut and neither showing where they cross. Verified in a real
browser with a twelve-cut board before any code changed — see follow-up 72.

- **One view per physical face, not per `(face, across)` pair.** `buildDiagrams` now
  keys on `(face, from)`: six possible views, drawn only where that physical face has at
  least one cut. Splitting on `from` (near versus far) rather than `across` means every
  cut made into a given face-and-side appears in the same drawing regardless of which
  in-plane dimension it runs across, so two perpendicular dados on one face draw
  together, crossing, in one figure — see follow-up 72 for the fragmentation this
  replaces and follow-up 73 for what the re-key retires.
- **The depth field: `cuts.ts`'s split-cover skeleton, one dimension down, with the
  cover step assigning a maximum instead of dropping a boolean.** `boardSolids` splits
  the board into cells and drops each one whose centre falls inside any cut — a boolean
  decision. A face's depth field splits the same way in 2D, and each surviving cell
  takes the **maximum** depth among the cuts covering it (0 if none) — emitted as one
  cell per grid rect, with no merge step. Same skeleton, different operation — this is
  deliberately **not** `cuts.ts` reused, and the distinction is load-bearing: reaching
  for `boardSolids` here would not fit, because a depth field needs a number where
  `boardSolids` only ever needed a keep/drop bit. One rule produces the crossing case,
  the parallel-overlap case, and the three-or-more-way overlap case together, the same
  way invariant 16's `boardEdges` rule makes the outer silhouette, the convex corners
  and the concave dado shoulders fall out of one rule.
- **Agreement with `boardSolids` is asserted by a test, not argued as a property.** A
  cell has depth > 0 exactly when the corresponding 3D column has stock removed at that
  face — design §4 states this as the reason the drawing and the 3D model can't
  disagree, and `depthField.agreement.test.ts` turns the claim into a test across a set
  of boards rather than leaving it as prose. See the new invariant below for how that
  test earned its current shape: it originally asserted only which cells were cut
  (coverage), not their depth, and a `Math.max → depths[0]` mutation passed silently
  until the test was corrected to pin depth too.
- **Rotated leader columns for the vertical axis.** A cut positioned along the
  horizontal axis keeps the existing leader rows below the drawing; a cut positioned
  along the vertical axis now gets a leader **column** at the left, its text rotated
  `-90°`. `packRow` is reused verbatim for both — it's axis-agnostic 1-D arithmetic, so
  feeding it y-coordinates works unchanged. This needed one new measured constant
  (`labelHeight`, alongside `CHAR_W`) because a rotated label's extent along the page's
  x-axis is the glyph box's **height**, not its character-count advance — nothing in
  `diagramLabels.ts` modelled that before. See that file's own doc comment on
  `LABEL_ASCENT`/`LABEL_DESCENT` for how it was measured (23.68 units, identical across
  every string tested, because `getBBox()` on `<text>` returns the font's EM box rather
  than the tight ink box) and follow-ups 74-75 for a harness trap and a harness bug this
  measurement work ran into.
- **Two fills, and a legend line only where crossing cuts actually disagree.** A
  crossing region is cross-hatched, and gets one legend line (*overlap: 1/4" deep
  governs*), only when the depth field's cover step assigns a cell a depth that differs
  from at least one of the covering cuts' own depths — which falls out of the depth
  field's own maximum rule rather than needing a separate check. Two crossing cuts at
  the same depth produce uniform-depth cells and correctly show nothing extra: there is
  no distinction to report. `diagram.ts` still de-duplicates by depth before printing a
  legend line, which is what keeps two *separate* crossings at the same governing depth
  to one line, not two — there is no merge step upstream doing that collapsing for it.
  See follow-up 76 for a negative browser finding on how well the two fills read at
  screen size on their own, independent of the legend line.
- **No schema change.** `CURRENT_VERSION` is still 4; the depth field derives entirely
  from `cuts`, which was already stored.
- **Known, deferred, and verified in a real browser** — see `docs/follow-ups.md`'s "From
  the per-face diagrams round" section (72-80) for the fragmentation defect and how it
  was found, the `getBBox()` transform trap and the harness bug in its own fix, the
  negative hatch-legibility finding, the measured sheet-length numbers, a benign
  float-dedup gap next to invariant 18, and the round's own (fifth) instance of a
  plan-supplied constant shipping with a justification that didn't reproduce.

**What the board-feet round did**, design in
`docs/superpowers/specs/2026-08-01-sloyd-board-feet-design.md`. Chosen 2026-08-01,
closing the first half of the cut list's §7 non-goal — board-feet and sheet totals had
been deferred with a reason, not omitted, and that reason (*"a purchasing number, not a
bench number, and this release is about the bench"*) had expired once the bench release
shipped. Adds one purchasing number beside the bench numbers already on the sheet: board
feet per row and per group for solid stock, square feet for sheet goods (keyed off the
existing `isSheetGood`), with no document-wide grand total — pine and walnut board feet
sum to a real number but not a useful one, and board feet cannot be added to square feet
at all.

- **Stock, not remainder.** The volume comes from a board's stock dimensions;
  `cuts` are ignored entirely. A dado does not reduce the board you buy — the stock
  leaves the yard whole and the joinery happens afterward, out of material already paid
  for. This is the inverse of what every other consumer of `cuts` does (`boardSolids`
  removes stock, `buildDepthField` reports how much, `buildDiagrams` draws it), which is
  exactly why the rule is stated as a comment in `cutlist.ts`, not left to be inferred
  from the pattern everything else follows.
- **Exact, not representative — the third instance of the 55/55a shape, resolved the
  *other* way.** A cut-list row is representative: two boards belong on one row when
  they *print* identically, not when they are equal (follow-up 55, invariant 18). For a
  printed dimension that's invisible by construction, but board feet is a sum, so the
  error would multiply by `qty` and then accumulate again across the group. The
  accumulator sums each board's *exact* volume as the existing grouping loop visits it —
  no second pass, and a row and its group subtotal come from the same numbers in the
  same pass, so they cannot disagree. The visible consequence is stated rather than
  hidden: a row's board feet may not exactly equal `qty ×` the dimensions printed beside
  it, because the printed dimensions are rounded and the total is not. Rounding the
  total to match was considered and rejected — it would make the sheet self-consistent
  by making the purchasing number wrong, which is the wrong direction for a number whose
  whole job is telling you how much lumber to buy.
- **A new leaf, not a widened one.** `src/units/quantity.ts` exports
  `formatBoardFeet`/`formatSquareFeet`, fixed at two decimal places and not
  user-configurable — the document's `units.precision` is a fractional-inch denominator,
  meaningless applied to a decimal volume. `cutlist.ts` already imported from `units`
  (for `formatLength`), so this widens an existing layer edge rather than opening a new
  one; see the Architecture section.
- **The panel formats nothing**, the same rule the row text and the diagram labels
  already follow — `row.stock`/`group.stock` arrive ready to print from `buildCutList`.
- **A print-block gap that survived one task review and one implementer self-review,
  caught only by rendering the fix.** Follow-up 58's exact defect shape recurred:
  `.cutlist-subtotal .cutlist-stock`'s two-class screen rule (brass) outranked the print
  block's enumerated single-class `.cutlist-stock` override, so the group subtotal —
  the number most likely to be read at the bench — kept printing brass on white while
  every row total printed correctly black. The enumeration itself was done correctly;
  it just wasn't the most specific rule in the cascade. Fixed by adding a matching
  two-class override, verified both by `getComputedStyle` (`rgb(0, 0, 0)`) and by eye on
  a rendered screenshot. See follow-up 81 for why this is a new wrinkle on 58, not a
  restatement of it.
- **No schema change.** `CURRENT_VERSION` is still 4; board feet derives entirely from
  dimensions already stored.
- **Known, deferred, and verified in a real browser** — see `docs/follow-ups.md`'s
  "From the board-feet round" section for the print-block finding above, what
  `formatBoardFeet` deliberately does not do (no rounding up, no waste factor, no
  user-configurable precision), and confirmation this pass used media emulation, not a
  real PDF render (follow-ups 70 and 79 still apply — this host's Playwright exposes no
  `pdf()`).

**Deferred behind it**, from the cut list's §7, recorded as decisions rather than
omissions: board-feet and sheet totals are no longer deferred — see the board-feet round
above — and sheet-goods nesting is no longer deferred either — see the sheet-nesting
round above. That closes the cut list's §7 list entirely, leaving only the two items
looked at and declined on purpose: CSV/clipboard export and name run-collapsing
(`Leg 1..4`), for reasons worth reading before proposing either again. In the older
ledger, **48 and 49** were the only two entries with a user-visible consequence —
unaffected by the cut list or the diagrams, and closed separately by the empty-solids
placeholder.

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
`{ version, name, units, stock, boards: [...] }` — `stock` (the sheet-nesting round's
addition, `{ kerf: number }`) is the first document-level field alongside `units` that
isn't `boards`. Dragging a board in the viewport computes a
number, writes it to the document, and the scene re-renders from the updated document
— never the reverse. This is what keeps undo, save/load, and export simple: they only
ever serialize or restore the document.

Module dependency order (each layer only depends on the ones before it):

1. **`units`**, then **`document`**. `units` is the bottom layer and imports nothing;
   `length.ts` parses/formats fractional inches (e.g. `24 1/2"`) and `quantity.ts` — the
   board-feet round's addition, a second leaf beside it — formats decimal board-feet and
   square-feet quantities. `document` sits directly above it and owns the document
   schema, board geometry, validation, and versioned migration. `document/names.ts` is a
   leaf alongside it, importing only the `Board` type.

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

   **The board-feet round widened the same edge rather than opening a new one.**
   `cutlist.ts` also imports `formatBoardFeet`/`formatSquareFeet` from
   `units/quantity.ts`. This is a different justification from the `formatLength` edge
   above — board feet is not a grouping key, so the "prints identically" argument
   doesn't reach it — but `cutlist.ts` already crossed into `units`, so nothing new
   opens: it is the cheapest available answer to "where does this go."

   **The sheet-nesting round opened its own `document → units` import rather than
   widening an existing one, because `nesting.ts` isn't `cutlist.ts`.** `document/
   nesting.ts` imports `formatLength` directly, for the same reason `cutlist.ts` and
   `diagram.ts` did: `PlacedPart.dims` and `UnplaceablePart.dims` are printed strings,
   and the function that prints a dimension anywhere on the sheet has to be the one
   that prints it here too, or a turned part's layout label could read differently
   from the cut-list row for the same board (this exact defect shipped in Task 7's
   first draft and was fixed — see follow-up 90). This is now the *third* leaf under
   `document` making the identical `formatLength` import, which is what makes it a
   settled boundary rather than something to keep re-litigating per file.
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
files saved by earlier versions. `CURRENT_VERSION` is 5, and migration is a real
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

**The v4→v5 step breaks that shape on purpose, and is the first step in the chain that
is NOT a `rawBoards.map` call.** `foldRotationToV2`, `addPostureToV3` and `addCutsToV4`
are all per-board upgrades, run before `validateBoard` because that validator's
fallback for a missing field is a legal-but-wrong value rather than an absence
(invariant 11). `stock: { kerf: number }` is a **document-level** field — there is no
per-board version of a kerf — so it has no `rawBoards.map` step at all. It is handled
the way `units.precision` already was: read defensively off the raw document
(`d.stock`), and defaulted to `0.125` when absent, non-numeric, or outside `[0, 1)`.
The version bump is not needed to upgrade an old file — an absent `stock` defaults
cleanly regardless of `CURRENT_VERSION`. It is needed for the refusal gate at the
*other* end: without the bump, a v4 build would open a file carrying a user-set kerf,
silently drop the field on save, and print a different sheet count than the build that
wrote it — a wrong purchasing number with nothing to indicate anything was lost. See
the sheet-nesting design's §2.2 for the full argument, which is the same one that
justified `addCutsToV4` despite its default matching the validator's own fallback: the
chain's value is that every version number means something definite, not that every
step changes what a fresh document looks like.

Full detail: `docs/superpowers/specs/` (design) and `docs/superpowers/plans/`
(implementation plan). This section is a summary, not a replacement for either.

## Where things live

```
src/
├── units/
│   ├── length.ts             parseLength / formatLength. Imports nothing.
│   └── quantity.ts           formatBoardFeet / formatSquareFeet — decimal quantities,
│                             two places fixed, not the fractional-inch precision
│                             length.ts uses. Imports nothing; a sibling leaf, not a
│                             widening of length.ts (a volume is not a length)
├── document/
│   ├── types.ts             Board, SloydDocument (now carries `stock: { kerf }`),
│   │                        Rotation, Posture, Grain, MATERIALS (`sheet` is now a
│   │                        `SheetStock` object, not a boolean), SheetStock,
│   │                        isSheetGood, sheetStockOf
│   ├── geometry.ts          axisDimensions (single source) / boardExtents /
│   │                        boardCenter / reorientedPosition
│   ├── names.ts             uniqueName / dedupeNames. Imports only Board.
│   ├── cuts.ts              cutRegion / boardSolids (split, drop, merge) /
│   │                        boardEdges / solidWorldBox / cutLabel. Pure; imports
│   │                        only ./geometry and ./types, never ./document
│   ├── cutlist.ts           buildCutList: group by material+thickness, collapse
│   │                        identical parts into rows, phrase each cut as a setup
│   │                        line; accumulates each row's and group's exact stock
│   │                        (board feet, or square feet for sheet goods) as the
│   │                        grouping loop visits each board — never from the row's
│   │                        rounded, representative dimensions. Pure; imports
│   │                        ./types, ./geometry, ./cuts, ../units/length and
│   │                        ../units/quantity — never ./document
│   ├── depthField.ts        buildDepthField: split a face at every cut boundary on
│   │                        both in-plane axes, cover each cell with the MAXIMUM
│   │                        depth among covering cuts (0 if none), emitted one rect
│   │                        per cell — no merge step. Same split/cover skeleton as
│   │                        cuts.ts's boardSolids, one dimension down, with a
│   │                        different cover operation — see invariant 20. Pure;
│   │                        imports only ./geometry and ./types
│   ├── diagram.ts           buildDiagrams: one view per (face, from) — near/far
│   │                        split into separate views so perpendicular cuts on one
│   │                        face draw together instead of fragmenting it (follow-up
│   │                        72) — board inches, cut bands and labels, built on
│   │                        depthField for crossing regions. Pure; the second thing
│   │                        in ./document to import from ../units/length
│   ├── nesting.ts           buildNesting: shelf first-fit-decreasing packer for one
│   │                        sheet-goods group's boards (never CutListRows — the
│   │                        fourth 55/55a instance). Takes stock size, rotation
│   │                        policy and kerf; emits placed parts, an unplaceable list
│   │                        and formatted labels. The fits-test carries an epsilon —
│   │                        see the new invariant below. Pure; imports ./types and
│   │                        ../units/length — the third leaf under ./document to
│   │                        import from units, never ./document
│   └── document.ts          create / validate / migrate (v1->v2->v3->v4->v5 chain,
│                            v5 document-level rather than per-board — see
│                            Architecture); re-exports the other eight
├── store/store.ts           Zustand store, snapshot undo/redo, gesture coalescing
├── storage/
│   ├── types.ts             the StorageAdapter interface
│   └── browser.ts           BrowserStorageAdapter + the `storage` singleton
├── viewport/
│   ├── Viewport.tsx         Canvas, lights, grid, shadow receiver, camera keys
│   ├── BoardMesh.tsx        one board, derived from the document each render;
│   │                        falls back to a translucent ghost box at the AABB
│   │                        when boardSolids is empty — see invariant 21
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
│   │                        bandOn (axis-agnostic centred widening to MIN_FEATURE,
│   │                        ordering-guarded). Pure.
│   ├── diagramLabels.ts     LABEL_SIZE / CHAR_W / labelHeight (LABEL_BOX_H = 25, a
│   │                        rounded-up bound on the measured 23.68-unit glyph box,
│   │                        argument-free — see invariant on why) / labelWidth
│   │                        (character count × monospace advance)
│   │                        / packRow (ideal centres in, non-overlapping centres
│   │                        out, axis-agnostic) / fitLabel (the sheet-nesting
│   │                        round's addition — a three-tier fallback ladder, full
│   │                        / name / index, for a label that has no neighbour to
│   │                        pack against because it lives inside its own disjoint
│   │                        rect). Pure; the arithmetic substitute for
│   │                        getComputedTextLength(), which is 0 under jsdom.
│   ├── PartDiagram.tsx      one view, drawn as SVG: outline, hatched/cross-hatched
│   │                        cut and crossing regions, leader rows below for
│   │                        horizontal-axis cuts and rotated (-90°) leader columns
│   │                        at left for vertical-axis cuts (both packed via
│   │                        packRow). Formats nothing — every label string arrives
│   │                        from buildDiagrams
│   ├── SheetLayout.tsx      one SVG per sheet in a nesting: outlined parts, light
│   │                        fill, waste left white; labels via fitLabel's ladder,
│   │                        never packRow (every label's rect is already disjoint).
│   │                        NOT an extension of PartDiagram — a sheet with parts on
│   │                        it and a board with cuts in it are different drawings
│   │                        that happen to both be SVG. Formats nothing — every
│   │                        string, including a placed part's dims, arrives from
│   │                        buildNesting
│   └── CutList.tsx          the printable sheet: derives from the document on every
│                            render, owns Escape-to-close and takes focus on mount,
│                            calls formatLength never, and owns the Diagrams toggle
│                            (none / joinery only / all) and the Sheet layouts toggle
│                            (on / off) — both local view state
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
20. **`depthField.ts` shares `cuts.ts`'s split/cover skeleton but not its
    operation, and `boardSolids` is not reusable here.** Both split a board (or a
    face) at every cut boundary into a grid of cells. `boardSolids` then **drops**
    each cell whose centre falls inside any cut — a boolean keep/drop decision, one
    dimension (3D). `buildDepthField` instead **assigns** each cell the maximum depth
    among the cuts covering it, 0 if none — a numeric decision, one dimension down
    (2D, one face). Reaching for `boardSolids` to compute a face's depth field would
    not fit: it has no maximum to report, only a bit. Unlike `boardSolids`,
    `buildDepthField` has no merge step: it emits one `FaceCell` per grid rect and
    stops there, which is correct rather than incomplete — the hatch each cell renders
    with is an SVG `<pattern>` (`patternUnits="userSpaceOnUse"`), so adjacent cells of
    equal depth already render indistinguishably from one merged region, and the one
    place a *count* of distinct regions matters (the crossing legend) is handled by
    `diagram.ts` deduplicating crossing depths into a `Set`, not by merging cells.
    Agreement between the two is asserted by a test, `depthField.agreement.test.ts`,
    not assumed from the shared skeleton — a cell must have depth > 0 exactly when
    `boardSolids` removed stock at the corresponding column. That test's first version
    passed with the cover step broken: it asserted only *coverage* (which cells were
    cut), and a `Math.max → depths[0]` mutation — reporting the depth of an arbitrary
    covering cut instead of the correct maximum — passed all cases, because coverage
    agreement doesn't imply depth agreement. The fix asserts each region's actual
    depth value against `boardSolids`, not merely whether it was cut; after the fix,
    the same mutation fails with the exact wrong number (`0.375` where `0.125` was
    expected). Any future agreement test between a 2D derivation and its 3D source must assert
    the value the derivation claims to compute, not just where it claims to differ
    from zero.
21. **The empty-solids placeholder must stay a mesh, not a wireframe.** When
    `boardSolids` returns `[]` — a board its own cuts have consumed, follow-ups 48
    and 49 — `BoardMesh` draws a translucent ghost box at the board's AABB. The
    obvious "simplification" is to drop the fill and keep only the outline, since
    the outline is what carries the shape. That silently breaks selection:
    `THREE.Line` raycasting registers a hit only within
    `raycaster.params.Line.threshold` (default 1 world unit, so 1 inch here) of a
    drawn line, which leaves the whole interior of the ghost dead to the pointer.
    The part would look right in every screenshot and be unclickable everywhere
    except within an inch of an edge. That is a viewport-parity rule, not a
    recovery-path one: a part you can see is a part you can click, everywhere
    else in this app. (Recovery never depended on it — the parts list has always
    selected a consumed board by id, and Ctrl+Z has always reverted the edit that
    caused it. The pre-fix defect was that the part was invisible, not that it
    was unreachable.) The fill is the hit target; the outline is the legibility.
    Keep both, and test
    a change here by clicking the MIDDLE of a ghost face, never its edge. Related:
    the ghost's `depthWrite` is off so a part with no stock never occludes one that
    has some, and the placeholder deliberately rides in the existing `geometries`
    memo rather than a new one — a second memo would need its own hand-written
    dependency list, which is invariant 15's failure mode exactly.
22. **`nesting.ts`'s fits-test carries an epsilon, and this is the deliberate OPPOSITE
    of invariant 18 — not a relaxation of it.** Invariant 18 says a cut-list row's
    dimensions collapse at display precision but its cuts must match exactly, because
    both sides of that comparison are stored values a user typed, and two cuts entered
    identically hold identical doubles — nothing computes them on the way in. Here one
    side of the comparison *is* computed: `shelf.used` accumulates by addition as each
    part is placed (`x = shelf.used + kerf`, `shelf.used = x + f.w`), so `fits(x + f.w,
    stock.length)` compares a running sum against a bound — the same shape
    `cutSignature`'s comment names as the hazard that made `cutLabel` wrong 2.8% of the
    time. Tolerating float error here is the same rule as invariant 18's, applied to
    the opposite arithmetic: round nothing that is machined, tolerate float error where
    float error is what you actually have. **What actually reaches the tolerance is
    narrower than it first looks, and the round's own plan got this wrong.** A plan
    comment claimed reverting the fits-test to an exact `<=` would fail "this test and
    nothing else" — false, because the fixture it pointed at (four 24" parts on a 96"
    sheet) sums to exactly `96` in binary float, so it never touched `EPS` at all. A
    15,298-case sweep across every 1/16" and 1/64" up to 96", against four kerfs, came
    back bit-identical with and without the epsilon: sixteenths and sixty-fourths are
    dyadic rationals, and sums of dyadic rationals are exact in IEEE 754. `EPS` earns
    its keep only because `parseLength` also accepts plain decimals and millimetres
    (÷25.4, not exact in binary) — fifteen 6.4"-decimal parts summed on one shelf land
    at `96.00000000000001"`, a hair over the sheet, and only the tolerance keeps the
    fifteenth part off a second one. See follow-up 87 — the sixth instance of the
    plan-supplied-justification lesson (64, 68, 80), and the first one caught by a
    mutation sweep rather than by a human reading the fixture.
23. **The shelf-height guard (`placeOn`'s `fits(f.h, shelf.h)`) is the SOLE enforcer of
    guillotine cuttability, and a self-derived test bound cannot catch its removal.**
    The whole justification for shelf packing over a denser maxrects layout (design §4)
    is that every cut a shop makes runs edge to edge — which is only true if a shelf
    never holds a part taller than the part that opened it. That one guard is the only
    line in `nesting.ts` enforcing it; nothing about the sort order guarantees it (the
    sort only orders sheets' *first* parts by height, `placeOn`'s guard is what keeps
    every later part on the shelf no taller). The obvious way to test the property —
    derive each shelf's band from the parts placed inside it — silently can't fail: a
    part that spills past its shelf just grows that shelf's own recorded band to match,
    so "every part falls inside its band" stays true by construction. Deleting the
    guard entirely passed the task's full test file, 19/19. The fix bounds each part
    against the *next* shelf's start (or the sheet edge for the last shelf) — a bound
    the parts under test cannot move — plus a dedicated regression fixture (an MDF
    rail wide enough to open a shelf, and a stick whose flipped orientation would stand
    taller than that shelf). Any future test of a "cannot exceed its container" property
    must bound against a value the thing under test does not itself produce; see
    follow-up 88 for the full account.

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 617 tests
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck. A green suite proves nothing about `tsc`; run
`npm run build` before claiming anything compiles.

## Open follow-ups

`docs/follow-ups.md` lists everything found during v1 review, the two polish passes,
v2, v3, the post-v3 fixes, joinery, the cut list and its diagrams rounds, the
board-feet round, and the sheet-nesting round, consciously deferred rather than
missed, numbered 1-30 plus the per-release additions. Read it before starting new work
in the same area — several items are "correct but untested", which is exactly what a
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

Joinery added **48-53**. **48 and 49 are now CLOSED**, together, by the single fix 48
itself predicted would cover both: a placeholder render whenever `boardSolids` is empty.
Both routes into the state are still reachable and still worth knowing before touching
the panel — 48's is a *Dimensions* write, which goes through `updateBoard` and never
meets the Cuts section's guard, so shrinking a board can leave a cut that removes all of
it; 49's is two individually-legal cuts that jointly do the same. What changed is the
consequence: the part now draws as a ghost, stays selectable, and can be recovered by
removing the offending cut, instead of vanishing until a reload silently repaired it.
**50-53 remain open**, all hygiene. See `docs/follow-ups.md` for the closure write-up,
including why a wireframe would have closed only half of 48 and why no guard was added
to dimension writes.

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
49 were unaffected by it** (they were closed separately, in the viewport): the cut list
reports *stock* dimensions, and a board whose cuts happen to remove all of it still has
the stock it was cut from, so it appeared on the sheet correctly even back when it
rendered as nothing in the viewport.

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

The per-face diagrams round **supersedes follow-up 61** (the `(face, across)` key's
non-goal no longer applies, because a face can no longer produce two figures at all —
see follow-up 72) and added **72-80** — see `docs/follow-ups.md`'s "From the per-face
diagrams round" section. **72** is the fragmentation defect itself, found by driving a
real browser with a twelve-cut board rather than by reading code. **73** records what
the re-key retired (`hasFar`, `DiagramCut.side`, the far-side dash) and why that isn't
a regression. **74** and **75** are harness entries: `getBBox()` ignoring an element's
own transform, and the harness's own first fix for that being written backwards
(`elCTM.multiply(svgInv)` instead of `svgInv.multiply(elCTM)`) — an identity for
unrotated text, so it produced false failures on rotated labels only, caught by
sanity-checking an absurd coordinate rather than by a failing assertion. **76** is a
negative browser finding: hatch versus cross-hatch alone isn't reliably
distinguishable at screen size — the legend line carries the distinction. **77**
confirms design §10's view-count risk as real but mild with measured sheet-length
numbers. **78** is a benign float-dedup gap in `boundaries()`, recorded next to
invariant 18's reasoning. **79** carries forward the still-unverified print-to-PDF
render. **80** is a fifth instance of the plan-supplied-constant lesson (64, 68): a
task report's justification for a replacement layout constant didn't reproduce under
review, closed by adding a real guard rather than trusting the arithmetic on its own.

The board-feet round added **81-84** — see `docs/follow-ups.md`'s "From the board-feet
round" section. **81** is a new wrinkle on follow-up 58, not a restatement: the print
block's `.cutlist-stock` was correctly enumerated into the `@media print` black-text
list, but a more specific two-class screen rule (`.cutlist-subtotal .cutlist-stock`,
brass) still outranked it, so the group subtotal printed brass on white through one task
review and one implementer self-review — caught only when task 4's browser pass actually
rendered the page, and closed by adding a matching two-class print override (`a54a086`).
**82** is the third instance of the 55/55a representative-row shape, resolved the
*other* way on purpose: board feet accumulates each board's exact volume rather than
`qty ×` the row's representative dimensions, so a row's total may not exactly equal what
a reader would compute from the rounded dimensions printed beside it — correct, because
rounding the total would make the purchasing number wrong. **83** records what
`formatBoardFeet`/`formatSquareFeet` deliberately don't do: no rounding up, no waste
factor, no user-configurable precision. **84** carries forward the still-unverified
print-to-PDF render (70, 79) — this round's browser pass used `emulateMedia`, not a real
PDF.

The sheet-nesting round added **85-94** — see `docs/follow-ups.md`'s "From the
sheet-nesting round" section. **85** records shelf FFD's density cost against a
maxrects packer as the design's deliberate choice, not a shortfall — guillotine
cuttability is a domain fact, not a quality tier. **86** carries follow-up 83's rule
forward from board feet to sheets: no offcut tracking, no waste factor, no rounding
up, plus this round's own non-goals (no solid-stock nesting, no hand-rearranging, no
mixed sheet sizes per material). **87** and **88** are the sixth and (a second,
related) instance of the plan-supplied-justification lesson (64, 68, 80) — an epsilon
test whose fixture never touched `EPS` at all, and a guillotine-cuttability test that
could not fail because its bound was derived from the parts it was checking; see
invariants 22 and 23 above for the mechanism of each. **89** is a pure-derivation
lesson: a first review-fix pass added a `throw` to `buildNesting`, which is called on
every cut-list render with no error boundary, and the actual fix collapsed two
predicates into one path instead. **90** is the round's own instance of the
cut-list-must-agree-with-itself defect the diagrams and board-feet rounds already hit
in different shapes — a placed part's dims printed as an unformatted, possibly
transposed float — closed by moving formatting into `nesting.ts`. **91** upgrades a
label-centring finding filed MINOR to load-bearing: the old baseline placed ink 3
units past the box `fitLabel` had just measured it against. **92** records two
deferred minors: a formatted-dims expression duplicated verbatim in two places in
`nesting.ts` with nothing pinning agreement, and no rendered sheet ever says "turned"
in words, so a near-square part's rotation is ambiguous on the page. **93** and **94**
are the Task 8 browser pass: no defect found, the exact `.cutlist-subtotal
.cutlist-stock` selector that broke in follow-up 81 re-checked and held, and the
still-open gaps (print-to-PDF, carrying 70/79/84; a 3+-shelf sheet's rendering, not
just its packing, unexercised).

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
