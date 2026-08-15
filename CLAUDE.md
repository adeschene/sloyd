# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Deployment specifics for this host live in `DEPLOYMENT.local.md` (gitignored).
>
> **This file holds the rules that govern new work.** The reasoning behind each round —
> what it did, why, what its browser pass could and could not confirm — lives in
> `docs/history.md`, split out on 2026-08-14 when this file passed 195KB. Prohibitions
> that were embedded in those narratives have been promoted into the Invariants section
> below; where the two disagree, this file wins.

---

## What Sloyd is

Modelling and planning for woodworking projects: lay out the parts of a build in 3D,
see how they fit, and get the numbers you need at the bench (dimensions, cut list).
Not a general-purpose CAD tool — the domain assumptions (boards, stock thickness,
fractional inches) are the point.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education
tradition built around hand woodworking.

## Status

Static SPA, containerized, **907/907 tests passing across 35 files**, schema
`CURRENT_VERSION` **6**.

**Production matches `master` as of 2026-08-04**, all three of that day's rounds
included. `DEPLOYMENT.local.md` carries every runbook entry and bundle hash. The project
library round (08-14) is on `master` and **not yet deployed**.

**The project library changed the storage layout, and NOT the schema.** There are now two
things carrying a version: the document's `version` (still **6**) and the library index's
`layout` (**1**), and they change for unrelated reasons. The consequence to hold on to:
**rolling back past this round costs nothing at the document level** — a `.sloyd` file this
build writes is byte-identical to one written before the library existed, and a pre-round
build finds `sloyd.autosave.v1` exactly as it left it. The one thing a rollback loses is any
project created *after* adoption, which lives in `sloyd.project.<id>` keys the old build
cannot see. Export first. This is not true of the two rounds before it — see the rollback
paragraph below.

**The tape line of work is complete for now** — three rounds landed on that surface on 08-04
and all three are live. **The project library (08-14) was the successor**, chosen from the
user's own critique that there was no clear way to store, switch or create projects; it is
merged to `master` and awaiting deployment. No successor to *it* has been chosen. The next
conversation should start from `docs/follow-ups.md`'s open entries — see the pointer section
below.

**The cut list line of work is CLOSED as of 2026-08-01.** Cut list, diagrams, label
layout, per-face views, board feet and sheet nesting are all shipped and merged. Do not
treat any of them as in-flight, and do not re-propose the two items declined on purpose:
CSV/clipboard export and name run-collapsing (`Leg 1..4`).

### Rounds shipped

Each row's design spec is `docs/superpowers/specs/<date>-sloyd-<slug>-design.md` and, for
the later ones, a browser pass at `docs/browser-verification-<slug>.md`. The full
narrative for every row is in `docs/history.md`.

| Round | Date | Schema | What it added |
|---|---|---|---|
| v1 + polish | 07-29/30 | 1 | boards, gizmo, unique names, origin axes, grid |
| v2 | 07-30 | 2 | two-state grain orientation, reorient-pivot fix, wood textures |
| v3 | 07-31 | 3 | posture, part-local grain, log-derived grain textures |
| post-v3 fixes | 07-31 | — | `DimensionField`/`NameField` staleness (invariant 5), plywood grain |
| joinery | 07-31 | 4 | `Cut` — stock removed from a board, by sub-box decomposition |
| cut list | 08-01 | — | the printable bench sheet, derived not stored |
| cut list diagrams | 08-01 | — | each part's joinery drawn on the sheet |
| label layout | 08-01 | — | measured labels; nothing overlaps or bleeds (invariant 19) |
| per-face diagrams | 08-01 | — | re-key on `(face, from)`; perpendicular cuts draw together |
| board feet | 08-01 | — | the purchasing number beside the bench numbers |
| empty-solids placeholder | 08-01 | — | *no spec* — ghost box for a fully-consumed board (invariant 21) |
| sheet nesting | 08-02 | 5 | sheet count + guillotine-cuttable layout; `stock: { kerf }` |
| snap-move | 08-02 | — | the Move tool: point-to-point board placement |
| selected-board grabs | 08-03 | — | grab candidates narrowed to the selected board |
| cut-aware snap points | 08-03 | — | every `Cut` contributes snap points; fixed an older rabbet defect |
| guide points + tape | 08-04 | 6 | the Tape tool, `guides: GuidePoint[]` |
| type-anywhere entry | 08-04 | — | *no spec* — typing a digit anywhere routes into the readout |
| cardinal guides | 08-04 | — | `X`/`Y`/`Z` lock a world axis for a typed distance |
| project library | 08-14 | — | multiple projects in the browser; `sloyd.library.v1` |

### The deployment rule, stated once

**Production is verified by loading the page only.** Sloyd has no server-side state, so
`sloyd.autosave.v1` in the user's browser *is* their project; exercising a new feature
against production would overwrite it with a demo document and there is nothing to
restore from. So: **new rendering is verified against the dev server** (that is what
every `docs/browser-verification-*.md` is), and **the deploy itself is confirmed by
bundle hash**. Whether a round's own change is confirmable live depends on whether
exercising it writes a document — arming a tool writes nothing and was confirmed live;
anything needing a board was not. `sloyd.autosave.v1` is confirmed **absent** in the
verifying browser afterward, checked rather than assumed.

**Rollback cost is a schema question.** A document saved by the current build carries
`version: 6`, and any image understanding less **refuses** it rather than silently
dropping the guides — the gate working as designed, and the silent-data-loss case the
bump was argued from. Autosave lives in the browser, so rolling back past the
guide-points deploy would strand any project saved since; export first. Rolling back a
round that changed no schema costs nothing but the round itself.

## Architecture

Static single-page app. No server, no database, no API, no env vars.

**Governing rule: the plain-JSON document is the source of truth; the Three.js scene is
derived from it and is never authoritative.** A document is
`{ version, name, units, stock, guides: [...], boards: [...] }`. Dragging a board in the
viewport computes a number, writes it to the document, and the scene re-renders from the
updated document — never the reverse. This is what keeps undo, save/load and export
simple: they only ever serialize or restore the document.

**A board's `position` is the min-corner** of its world bounding box, not its centre.
This matters anywhere geometry or the gizmo touches position math (invariant 2).

### Layer order

Each layer depends only on the ones before it:

1. **`units`** — the bottom layer, imports nothing. `length.ts` (fractional inches),
   `quantity.ts` (decimal board/square feet).
2. **`document`** — schema, geometry, validation, versioned migration.
3. **`store`** (Zustand + snapshot undo/redo) and **`storage`** (the `StorageAdapter`
   seam).
4. **`viewport`** (react-three-fiber) and **`panels`** (React forms) — both read/write
   through the store and both import `document` directly for types and constants.
   `panels` also imports the `storage` singleton. These are legitimate downward imports.

**The `→ units` edges are settled, and the rule is one sentence: a module takes the edge
when it produces a string a person reads off the page, and not otherwise.** Four do —
`document/cutlist.ts` (a row's grouping key *is* formatted strings, because part identity
is defined as "prints identically"), `document/diagram.ts`, `document/nesting.ts` (all
three importing `formatLength`, so one dimension cannot read differently in two places on
one sheet) and `viewport/TapeTool.tsx` (`parseLength`, because the live preview must know
what the typed text *means* before it can place a marker). One deliberately does **not**:
`document/snapPoints.ts` — a snap point is three numbers, a kind and an owner, and nothing
about it is ever printed. Do not generalise to "everything under `document` imports
`formatLength` now." The per-file arguments are in `docs/history.md`.

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`. Nothing else touches `localStorage` or the filesystem directly. A
future desktop build would be a second implementation of that interface, not a parallel
code path.

### Versioning

Every document carries a `version`, and every load path (open, import, autosave-restore)
runs through `migrateDocument` before the document is trusted. `CURRENT_VERSION` is **6**
and migration is a real chain: each step runs on raw data, in version order, one version
at a time, before any board reaches `validateBoard` (invariant 11).

**Two shapes of step, and picking the wrong one is the trap.**

- **Per-board** (v1→v2 `foldRotationToV2`, v2→v3 `addPostureToV3`, v3→v4 `addCutsToV4`) —
  a `rawBoards.map` running *before* `validateBoard`, because that validator's fallback
  for a missing field is a legal-but-wrong value rather than an absence.
- **Document-level** (v4→v5 `stock`, v5→v6 `guides`) — **no `rawBoards.map` step at
  all**. Read defensively off the raw document and defaulted, the way `units.precision`
  already was. `stock.kerf` defaults to `0.125` when absent, non-numeric or outside
  `[0, 1)` — *defaulted, not clamped to the nearest boundary*. `guides` defaults to `[]`,
  and `validateGuides` drops a malformed guide rather than refusing the file, because a
  saved document must always open and a guide has no nearest-legal-value to clamp toward.

**A version bump is for the refusal gate at the far end, not for upgrading old files** —
an absent field defaults cleanly regardless of `CURRENT_VERSION`. But the two bumps were
argued differently and copying the wrong argument would be a mistake. v5's harm is a
**wrong number**: a v4 build drops a user-set kerf and prints a different sheet count.
v6's is plainer and weaker and is still what the gate is for: **silent data loss on
round-trip** — a v5 build opens a v6 file, drops every guide, autosaves, and they are gone
with nothing indicating it. Guides produce no number; nothing on the cut list reads them.
Read which argument applies to *your* field rather than inheriting one.

Full detail: `docs/superpowers/specs/` (design), `docs/superpowers/plans/`
(implementation), `docs/history.md` (what shipped and why).

## Where things live

An index. Layer rationale is in Architecture; the rules are in Invariants (`inv N`).
Where a file's own doc comment is the stated single source of truth for something —
`tapeHover`'s clearing enumeration, `tapeAxis`'s structural rule, `TapeAxis`'s
world-vs-board-local argument, `woodCut`'s seam argument — **read it there.**

```
src/
├── units/                  bottom layer, imports nothing
│   ├── length.ts           parseLength / formatLength / canBeginLength (capture set
│   │                       {0-9, ., -} — NOT '/', nothing here starts with a slash)
│   └── quantity.ts         formatBoardFeet / formatSquareFeet — two decimals fixed,
│                           NOT units.precision (meaningless on a decimal volume)
├── document/
│   ├── types.ts            Board, GuidePoint, SloydDocument, Rotation, Posture,
│   │                       Grain, MATERIALS, SheetStock, isSheetGood, sheetStockOf
│   ├── geometry.ts         axisDimensions (SINGLE SOURCE, inv 13) / boardExtents /
│   │                       boardCenter / reorientedPosition (inv 2)
│   ├── names.ts            uniqueName / dedupeNames (inv 8). Imports only Board
│   ├── cuts.ts             cutRegion / boardSolids (split, drop against the UNION,
│   │                       merge) / boardEdges (inv 16) / solidWorldBox / cutLabel /
│   │                       stockProbe (boardEdges' rule from a segment to a point;
│   │                       CLOSED spans, so a point on a split plane sees both sides)
│   ├── cutlist.ts          buildCutList (inv 18). STOCK, NOT REMAINDER — `cuts`
│   │                       ignored, because a dado does not reduce the board you buy;
│   │                       accumulates EXACT stock, never qty × rounded dimensions
│   ├── depthField.ts       buildDepthField (inv 20)
│   ├── diagram.ts          buildDiagrams — one view per (face, from), so
│   │                       perpendicular cuts on a face draw together
│   ├── nesting.ts          buildNesting — shelf FFD, because guillotine cuttability
│   │                       is a DOMAIN FACT, not a quality tier. Takes doc.boards,
│   │                       NEVER CutListRows (rounded row dimensions can overflow a
│   │                       real sheet). Stock, not remainder. Too-big parts go in
│   │                       `unplaceable`, never dropped. Invs 22, 23
│   ├── snapPoints.ts       boardSnapPoints (the 3x3x3 lattice minus the volume
│   │                       centre; axes at `mid` name the kind — 0 corner, 1
│   │                       edge-mid, 2 face-centre; filtered through stockProbe
│   │                       EXCEPT a fully consumed board, a literal
│   │                       `boardSolids(b).length === 0` check, which keeps all 26
│   │                       because the ghost box IS drawn — inv 21) / cutSnapPoints
│   │                       (floor rectangle 9 + the mouth's two shoulder lines 6, its
│   │                       middle row spanning the opening; 15 for a dado, 12 for a
│   │                       rabbet, with NO cutLabel branch) / snapPointsFor (the
│   │                       union, called in BOTH of MoveTool's branches — a cut point
│   │                       must be a TARGET on the unselected board or the headline
│   │                       operation does not work) / guideSnapPoints / sameSnapPoint
│   │                       (HERE, not in viewport, because the store needs it and
│   │                       cannot import viewport — one home, not a re-export) /
│   │                       offsetPoint (null on a zero-length direction or non-finite
│   │                       distance, rather than letting NaN into the document) /
│   │                       towardFor (the tape's ONE direction source, called from
│   │                       BOTH the preview memo and commit(), which is what keeps
│   │                       marker and placement agreeing; THE AXIS WINS OVER A HOVER,
│   │                       never falls back to it) / tapeAxisFromKey. Exports
│   │                       SnapKind / SnapOwner / SnapPoint / BoardSnapPoint (inv 26).
│   │                       LOCAL→WORLD IS `position[axis] +
│   │                       local[axisDimensions(board)[axis]]` — neither
│   │                       pointToLocalXYZ nor solidWorldBox does this and BOTH look
│   │                       like they do (centre-relative), so either puts every point
│   │                       off by half the board, plausibly, in any screenshot; pin
│   │                       it with a rotated, non-flat pose. Imports ./types,
│   │                       ./geometry, ./cuts — notably NOT ../units
│   └── document.ts         create / validate / migrate (inv 11); validateGuides;
│                           createGuide; re-exports the rest
├── store/store.ts          Zustand, snapshot undo/redo (inv 4), gesture coalescing.
│                           `tool` and the three HELD POINTS — `grabbed`
│                           (BoardSnapPoint, narrow on purpose — inv 26),
│                           `tapeAnchor`, `tapeHover` (SnapPoint, wide because either
│                           can hold a guide) — plus `tapeAxis`, which is NOT a fourth
│                           held point (it holds an enum, so it cannot go stale and
│                           must not be given clearing rules by analogy). Inv 24
├── storage/                types.ts (StorageAdapter), browser.ts (the singleton).
│                           Inv 7; and invs 29, 30, 31 for the library
│   └── libraryIndex.ts     LAYOUT_VERSION + parseIndex / sortEntries / touchEntry /
│                           removeEntry. Versions the ARRANGEMENT OF KEYS, never a
│                           document — which is why it is separate from
│                           CURRENT_VERSION and why `parseIndex` returning null is a
│                           REFUSAL (inv 30), while a single malformed ENTRY is
│                           dropped (validateGuides' argument verbatim). Pure;
│                           imports only ./types
├── viewport/               NO unit tests by design — driven in a real browser
│   ├── Viewport.tsx        Canvas, lights, grid, camera keys; hides Gizmo outside
│   │                       select mode, gates onPointerMissed
│   ├── BoardMesh.tsx       one board per render; ghost box when boardSolids is empty
│   │                       (inv 21). Required `selectable` prop, so the Move tool's
│   │                       commit click cannot select the board it drops onto
│   ├── MoveTool.tsx        raw pointer events on gl.domElement. Candidates are TWO
│   │                       SETS, not one set with a filter: pre-grab the SELECTED
│   │                       board's points only, post-grab every board's minus the
│   │                       grabbed board's own. Guides are POST-GRAB only — targets,
│   │                       never grab sources. Dep list is inv 15's failure mode
│   ├── TapeTool.tsx        MoveTool's sibling; withholds NOTHING either way. LATCHES
│   │                       the hover while anchored (why inv 24 covers it).
│   │                       SUBSCRIBES to tapeAxis — a dep entry over a value nothing
│   │                       subscribes to is inv 15 in disguise. Locked with nothing
│   │                       typed draws NO line (a decision; the honest alternative is
│   │                       fu 130). A click while locked RE-ANCHORS and keeps the lock
│   ├── GuideMarkers.tsx    every guide whenever guides are shown, independent of any
│   │                       tool — a guide is document data
│   ├── SnapMarker.tsx      screen-constant, always-on-top (depthTest off). Owns the
│   │                       four off-palette colours and MARKER_PX / RING_PX /
│   │                       RESTING_PX, all browser-settled (fu 60). RESTING_PX is the
│   │                       guide-only ringless variant: guides are the only points
│   │                       drawn when nothing hovers them, so GROWTH replaces "the
│   │                       marker appeared" as the pick confirmation
│   ├── snapPick.ts         pickSnapPoint — nearest in SCREEN space, ties by depth,
│   │                       exact tie keeps first-found. Screen space rather than
│   │                       raycast-first ON PURPOSE: a corner silhouetted against
│   │                       empty space has no board under the cursor, so
│   │                       raycast-first would make the easiest corners to see the
│   │                       hardest to hit. `project` is a CALLBACK, not a camera —
│   │                       what keeps THREE out and makes it unit-testable. Pure
│   ├── pointer.ts          CLICK_DRAG_SLOP_PX, shared not copied (the fu 64 shape)
│   ├── OriginAxes.tsx      R=X G=Y(up) B=Z; dashed = negative
│   ├── gridDensity.ts      grid tier ladder (1in → 1ft → 12ft). Pure
│   ├── screenScale.ts      px-per-inch + screen-stable dash scale. Pure
│   ├── Gizmo.tsx           TransformControls, 1/16" snapping. Invs 3, 10, 25
│   ├── gizmoScale.ts       size ceiling + grabbable floor. Pure
│   ├── extent.ts           SCENE_EXTENT, shared by Viewport and OriginAxes
│   ├── grainFaces.ts       faceGrainKinds + grainFamily; re-exports axisDimensions
│   ├── grainTiling.ts      per-face UVs, boardUVSignature. Invs 12, 15, 17. Pure
│   ├── grainLog.ts         bandRadius (inv 14), wobble, seededRandom / hash. Pure
│   └── grainTexture.ts     seeded canvas textures, cached, never disposed
├── panels/
│   ├── DimensionField.tsx  min/max REFUSE out-of-range entry rather than clamping,
│   │                       because silently correcting a number the user just typed
│   │                       loses a measurement. Inv 5
│   ├── NameField.tsx       commits on blur/Enter only, empty reverts. Invs 5, 9
│   ├── Toolbar.tsx         project name, Add board, Cut list, undo/redo, the Select /
│   │                       Move / Tape trio, view toggles, and the "Select a part to
│   │                       move" hint. The Move button stays ENABLED — the hint
│   │                       explains the state instead of removing the control
│   ├── TapeReadout.tsx     the tape's DOM overlay. A real <input> outside the Canvas
│   │                       (not drei Html), inside `.app-shell` so the cut list's
│   │                       `inert` covers it. Owns the axis chip (the app's existing
│   │                       brass-on-graphite idiom, NOT a fifth off-palette hue) and
│   │                       the cause-carrying TapeError ('no-direction' |
│   │                       'unparseable' | 'degenerate' | null) with TWO clearing
│   │                       effects rather than one over-wide one. Invs 27, 28
│   ├── GuidesList.tsx      one row per guide, an x per row, Clear all. NO selection
│   │                       model, deliberately: a guide's marker is a known-bad hit
│   │                       target, so there is no click-the-guide path to get wrong
│   ├── ProjectMenu.tsx     the caret-triggered project list: switch, duplicate, the
│   │                       two-step inline delete, + New project, Import. NOT an ARIA
│   │                       menu, decided rather than omitted — a row is a name plus
│   │                       two independent actions, which is grid-shaped, so plain
│   │                       buttons in DOM (Tab) order are the interaction and
│   │                       `aria-current` marks the open project. Its Escape and
│   │                       outside-click are bound to the menu's OWN subtree and are
│   │                       NOT inv 27's business (see design §4.1). The arm/disarm
│   │                       swap renders a <button> at the same sibling index in both
│   │                       branches, which is the only reason focus survives it —
│   │                       giving either branch a `key` silently breaks that. Rendered
│   │                       ONLY when libraryAvailable (inv 30)
│   ├── PartsList.tsx  FileMenu.tsx
│   ├── Properties.tsx      board fields + Cuts; CutRow is its own component so a
│   │                       cut's error dies with the cut
│   ├── diagramScale.ts     fitView / bandOn (ordering-guarded). MAX_ASPECT /
│   │                       MAX_HEIGHT / MIN_WIDTH are browser-settled. Pure
│   ├── diagramLabels.ts    LABEL_SIZE / CHAR_W / labelHeight / labelWidth / packRow
│   │                       (axis-agnostic, reused verbatim for rotated columns) /
│   │                       fitLabel. The arithmetic substitute for
│   │                       getComputedTextLength(), 0 under jsdom. Inv 19. Pure
│   ├── PartDiagram.tsx     one view as SVG. Formats NOTHING. The hatch is an SVG
│   │                       <pattern> fill — foreground content, so it survives print
│   │                       with background graphics off
│   ├── SheetLayout.tsx     one SVG per sheet; labels via fitLabel, never packRow
│   │                       (rects are already disjoint). Formats nothing
│   └── CutList.tsx         the printable sheet, derived every render — no cached
│                           copy, so nothing can go stale. Owns Escape-to-close, takes
│                           focus on mount, owns both toggles as local view state
└── App.tsx                 layout, autosave/restore, the `.app-shell` that goes
                            `inert` behind the cut list, the `.viewport-stack`
                            TapeReadout positions against, `showGuides` as local
                            prop-drilled view state (it joins `shortcutsSuspended`,
                            NOT the store's `tool`). M, T, X/Y/Z, Escape and undo/redo
                            all live in the ONE existing keydown effect — inv 27.
                            Escape's ladder: grabbed → tapeAxis → tapeAnchor → tool
```

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.


## Invariants — break these and things fail in confusing ways

Each cost real debugging. They are load-bearing, not style. **Do not renumber them** —
these numbers are cited from code comments, the specs and `docs/follow-ups.md`. The
worked examples behind several of them are in `docs/history.md`.

1. **The document is the source of truth.** No component may hold geometry state not
   derived from it, and nothing may write to a Three.js object's transform as a way of
   recording a change.
2. **`position` is the min-corner**, not the centre; `boardCenter` exists because
   Three.js meshes are centre-origin and the document is not. `reorientedPosition` is the
   only home for the reorient pivot and takes the whole patch (`Partial<Board>`), because
   a patch that also changes a dimension needs the pivot computed from *post-patch*
   extents. `grain` and `cuts` are deliberately absent from the reorient predicate —
   neither changes a board's extents, which is also why cut edits get their own store
   actions instead of going through `updateBoard`. **A snap move reaches the predicate and
   correctly fails it**: `commitSnapMove` patches `position` only, and a snap move
   translates, never turns. A future tool that both moves *and* turns in one gesture must
   carry its own `position` in the same patch, or it will be pivoted on top of its own
   translation.
3. **The `dragging` ref guard in `Gizmo.tsx`.** `TransformControls` computes motion from
   state captured at drag start; syncing the document into the proxy mid-drag makes it
   fight itself. The symptom is jitter or drift, not a crash.
4. **Gesture snapshots are lazy** — taken on the first `edit()` inside a gesture, not in
   `beginGesture()`. Eager snapshotting leaves no-op undo entries, so `Ctrl+Z` appears to
   do nothing.
5. **A field holding a local draft — `DimensionField` and `NameField` both — skips its
   adopt-external-changes effect while focused, and that effect never re-fires afterward,
   so blur must resync the display from the stored value and must not commit when the
   field was untouched.** Two failure modes if either half is missing. Commit an untouched
   field and it rewrites exact stored values with display-rounded ones (0.7" → 11/16").
   Skip the resync and the field shows a stale number *indefinitely* once an external
   change (a reorient, an undo, a gizmo drag) lands while it has focus: the effect is keyed
   on the value, so nothing re-runs it just because focus later leaves — only a remount.
   **Stored values are exact; display rounds.**
6. **`add_header` does not merge across nginx levels.** A `location` block containing any
   `add_header` discards everything inherited — which is why `security-headers.conf` is
   `include`d in every block rather than set once on the server.
7. **`autoSave` must never throw.** It reports failure via `storage.available`, which
   drives the warning banner.
8. **Board names are unique, enforced in four places** — `addBoard`, `duplicateBoard`, the
   name-field commit, and `migrateDocument`. Creation-only enforcement is not enough: an
   imported or hand-edited file would violate it. `createBoard` cannot dedupe (no view of
   the document), so any new call site that adds a board must pass its name through
   `uniqueName` itself. `validateBoard` trims before the blank check, so `dedupeNames`
   never receives something that trims to `''`.
9. **`NameField` commits once, on blur or Enter — never per keystroke.** An emptied name
   reverts, which is only possible with a single commit: writing per keystroke and
   correcting on blur takes the gesture's undo snapshot before the correction lands,
   leaving an entry that undoes to nothing. Its `onCommit` returns the *stored* name,
   because dedup can store something other than what was typed. Without invariant 5's
   `dirty` guard, an untouched field blurring after an external rename writes stale local
   text back over it — a silent write, worse for being invisible until something reads it.
10. **The gizmo size clamp writes `size` *before* the library's `updateMatrixWorld`, never
    `handle.scale` after it.** `size` is an input to three-stdlib's scale computation, so
    the library bakes the correction itself; correcting the output lands in the re-bake
    trap invariant 3's neighbouring comment documents. The clamp is two-sided *and* has a
    floor on the cap itself (`GIZMO_MIN_CAP_INCHES`) — a board-relative ceiling alone
    shrinks the gizmo for small parts the moment they are selected.
11. **Migration steps run on raw data, before `validateBoard`, in version order.**
    `validateBoard` falls back to `0` for an unknown rotation, so a fold running after it
    turns every saved 270° board a quarter turn the wrong way — a different shape on
    screen, not a redundant one. `addPostureToV3` has the same failure mode: the posture
    fallback is `'flat'`, a perfectly legal value, so a `standing: true` board reaching the
    validator first comes out lying down — silently, and only for files that already exist.
    **Upgrade first, validate second, one version at a time.**
12. **Grain textures are cached at module level and never disposed; per-board variation
    lives in the `uv` attribute, never on the texture.** `texture.repeat`/`offset`/
    `rotation` are per-texture state on an object every board shares — writing them per
    board makes every board on screen fight over one mapping. The per-board offset is
    zeroed on any axis a `FacePlan` marks `fit`: the whole tile shows either way there, so
    an offset only shifts the seam into the middle of the face.
13. **~~`axisDimensions` had a second copy in the viewport.~~ RETIRED in v3** — now
    single-sourced in `document/geometry.ts`; the drift test was deleted, not forgotten,
    because the two things it compared are one thing. *(Number kept deliberately.)*
14. **`bandRadius` is `hypot(d, k·delta)`, and the tile is seamless by two different
    mechanisms.** Because `r = hypot(d, k·delta)`, the in-plane offset `sqrt(r² − d²)` is
    exactly `k·delta` — evenly spaced whatever the cut distance `d`; a "simpler" radius
    reintroduces a seam that only shows on a wide board. That covers *u* only. *v* is
    seamless because `bandRadius` is even in `k` and the seed bucket is
    `Math.abs(k) % half`, so the pattern **folds about the pith line** rather than
    repeating. `grainTexture.ts`'s `woodCut` comment states this precisely — agree with it,
    don't restate a looser version.
15. **Anything memoising on what `boardUVs` reads must key on `boardUVSignature`, not a
    hand-written field list.** v3 added `grain` without updating `BoardMesh`'s dep array,
    so grain silently stopped turning on screen while the document stayed correct — which
    is what made it look like it worked, and no per-task review could see it (added in one
    task, consumed by the stale memo in another). Joinery added `cuts` for the same reason.
    The signature excludes `position`/`name` so dragging doesn't rebuild geometry every
    frame, and it is **identical for every solid of a board** — anything caching per solid
    must not key on it alone (`BoardMesh` builds all geometries in one memo). **A dep entry
    over a value nothing subscribes to is this same failure mode in disguise.**
16. **Edge lines come from the cell grid, not from the solids.** The remainder around a
    dado is L-shaped in section, so the canonical case leaves three abutting solids across
    a *continuous* uncut face and per-solid `EdgesGeometry` draws lines corresponding to no
    real edge. Merging cannot fix this and is not meant to. `boardEdges` tests the up-to-
    four cells around each candidate segment and draws unless the configuration is flat;
    cells outside the board count as empty, which makes the silhouette, the convex corners
    and the concave shoulders fall out of **one rule**. Contiguous drawn cells merge into
    one segment — without that, a cut anywhere fragments lines on faces it never touches.
    **The general rule: a marker or a line must sit on a feature that is actually drawn** —
    also why the volume centre is not a snap point, and why `boardSnapPoints` is filtered
    through `stockProbe`.
17. **UVs are parent-relative, and `FIT` resolves against the board, not the solid.**
    `boardUVs(board, solid)` looks a sub-box up in the *board's* tiling, so the figure runs
    continuously across a dado instead of restarting — which is what makes a cut read as
    stock removed from one board rather than two boards pushed together. `FIT` means "show
    the whole tile on this axis", and the tile belongs to the board; fitting it to the
    solid would squeeze plywood's whole ply stack into the stock a ¼" dado left.
    `FacePlan` carries `tileInches` (size, not count) precisely so `FIT` and fixed tiling
    are one division.
18. **On the cut list, dimensions collapse at display precision and cuts must match
    exactly**, and neither may be relaxed to match the other. A stock dimension rounded to
    1/16" costs nothing — two boards 0.02" apart are one board to anyone cutting them, and
    splitting the row makes the sheet lie about how much stock to buy. A *cut* rounded the
    same way costs the joint: two dados 0.02" apart are two setups, and collapsing them
    tells the user to run one. **Round what is bought, never what is machined.** This is
    not the float-`===` hazard `cutLabel` had — that compared a *subtraction result*
    against a bound, where the arithmetic introduces the error; here both sides are stored
    values, and exact comparison is correct precisely because nothing computes them on the
    way in.
19. **`LABEL_SIZE` has exactly one home, and `--font-num` on diagram text is
    load-bearing.** `LABEL_SIZE` is applied to the `<svg>` as a `fontSize` attribute;
    `styles.css` must **never** set a `font-size` on diagram text. `labelWidth`'s
    arithmetic (character count × `CHAR_W`) is only true of the size the browser actually
    renders, so a second `font-size` in CSS is a value a future edit drifts out of step
    with silently. The font-family matters identically: `--font-num` is a **monospace**
    stack, which is what makes a fixed per-glyph advance true at all. Swap it for a
    proportional face and `labelWidth` returns a number unrelated to what's drawn,
    `packRow` starts stacking labels, and **every unit test still passes** — because the
    tests assert the arithmetic, not the render.
20. **`depthField.ts` shares `cuts.ts`'s split/cover skeleton but not its operation, and
    `boardSolids` is not reusable here.** `boardSolids` **drops** each cell whose centre
    falls inside any cut — a bit, in 3D. `buildDepthField` **assigns** each cell the
    maximum depth among covering cuts — a number, in 2D. It has no merge step, correctly:
    the hatch is a `patternUnits="userSpaceOnUse"` pattern, so equal-depth neighbours
    already render indistinguishably, and the one place a *count* matters is `diagram.ts`'s
    crossing-depth `Set`. Agreement is asserted by `depthField.agreement.test.ts`, not
    assumed — and that test's first version passed with the cover step broken, because it
    asserted only *coverage*. **Any future agreement test between a 2D derivation and its
    3D source must assert the value the derivation claims to compute, not just where it
    claims to differ from zero.**
21. **The empty-solids placeholder must stay a mesh, not a wireframe.** When `boardSolids`
    returns `[]`, `BoardMesh` draws a translucent ghost box at the AABB. Dropping the fill
    for just the outline silently breaks selection: `THREE.Line` raycasting registers a hit
    only within ~1" of a drawn line, leaving the whole interior dead to the pointer — the
    part looks right in every screenshot and is unclickable except near an edge. That is a
    viewport-parity rule: **a part you can see is a part you can click.** The fill is the
    hit target, the outline the legibility; keep both, and test a change here by clicking
    the **middle** of a ghost face, never its edge. `depthWrite` is off so a part with no
    stock never occludes one that has some, and the placeholder rides in the existing
    `geometries` memo — a second memo would need its own hand-written dep list, which is
    invariant 15 exactly.
22. **`nesting.ts`'s fits-test carries an epsilon, the deliberate OPPOSITE of invariant 18,
    not a relaxation.** There, both sides are stored values a user typed. Here one side *is
    computed*: `shelf.used` accumulates by addition, so the test compares a running sum
    against a bound — the shape that made `cutLabel` wrong 2.8% of the time. **Apply the
    tolerance that matches the arithmetic you actually have.** What reaches the tolerance
    is narrower than it looks, and the round's own plan got this wrong: sixteenths and
    sixty-fourths are dyadic rationals and sum exactly in IEEE 754, so a 15,298-case sweep
    came back bit-identical with and without `EPS`. It earns its keep only because
    `parseLength` also accepts decimals and millimetres (÷25.4).
23. **The shelf-height guard (`placeOn`'s `fits(f.h, shelf.h)`) is the SOLE enforcer of
    guillotine cuttability, and a self-derived test bound cannot catch its removal.** The
    whole justification for shelf packing is that every shop cut runs edge to edge, which
    holds only if a shelf never takes a part taller than the one that opened it — nothing
    in the sort order guarantees it. The obvious test (derive each shelf's band from the
    parts inside it) silently **cannot fail**, because a spilling part just grows its own
    recorded band; deleting the guard passed 19/19. The fix bounds each part against the
    **next** shelf's start, a bound the parts under test cannot move. **Any future test of
    a "cannot exceed its container" property must bound against a value the thing under
    test does not itself produce.**
24. **A held point holds a world position, so anything that moves the boards under it must
    drop it.** `grabbed.at` is a captured `[x, y, z]`, not a live reference — it is what
    `commitSnapMove` subtracts. `tapeAnchor` is the second instance (the distance and the
    typed-offset direction both derive from it) and `tapeHover` the third, which it earned
    the hard way: a hover would normally be too transient, except `TapeTool` **latches** it
    while anchored, so it can sit unreplaced across arbitrarily many edits. All three clear
    through one helper, `dropHeldIfGone`, which keeps its **guard-first shape** (return
    before any grid arithmetic when no field is relevant) — adding a field is exactly how
    that gets lost.

    Three distinct reasons a field is cleared, not interchangeable:

    - **The world moved.** `undo`, `redo`, `replaceDocument` (open/import/autosave-restore
      all route through it, and the named board may not exist in the new document at all),
      and `deleteBoard`/`updateBoard` — the last two **conditionally**, since an edit to
      another board changes nothing. `updateBoard` is live: nothing disables Properties in
      Move mode and `commitSnapMove` even selects the board it moved, so a Length edit
      typed right after a grab can relocate it out from under its own point. Committing
      after any of these applies a delta derived from a position that describes nothing —
      undoable, but not obviously wrong. **A future action that rewrites `doc.boards`
      wholesale joins this list** — that is the test, not "does it touch positions",
      because a wholesale rewrite invalidates a grab by removing its owner as easily as by
      moving it.
    - **The feature underneath was destroyed.** `addCut`/`updateCut`/`removeCut` — routed
      *around* `updateBoard` by invariant 2, which is why they needed their own clear and
      could be given a better one. It is **point-precise, not board-precise**:
      `dropHeldIfGone(boardId)` runs **after** the `edit()` and keeps the point iff it is
      still among that board's `snapPointsFor` output. Holding a box corner while editing a
      mid-face dado usually keeps the grab; a rabbet pulled flush with the board's end
      makes that corner stop being offered and the grab drops, by the same rule. Two things
      are easy to undo by "tidying": the comparison is exact `===` (invariant 18's reason),
      and the call must sit **after** `edit()`.
    - **The user retargeted the tool.** Only `grabbed`, because Move's grab candidates are
      the selected board's points. `edit()`'s optional `selection` callback clears it when
      it resolves elsewhere (so `addBoard`/`duplicateBoard` inherit it), as does
      `selectBoard`. `commitSnapMove` also refuses outright when
      `grabbed.owner.id !== selectedId`, before any `edit()`, deliberately leaving
      `grabbed` in hand — the state should be unreachable, and discarding it quietly would
      hide that.

    Four further rules, each load-bearing:

    - **A PROHIBITION: `edit()`'s selection callback and `selectBoard` must NOT clear
      `tapeAnchor` or `tapeHover`.** No part of the retargeting reason reaches the tape,
      which has no selected-board restriction — measuring from one board to another is most
      of what it exists for, and "measure from this board to the one I am about to add" is
      a live path through `addBoard`. Stated as a prohibition because *"add
      `tapeAnchor: null` beside every `grabbed: null`"* is exactly what a tidying pass would
      do and would look like consistency. Store tests exist to catch it.
    - **`clearGuides` clears both tape fields unconditionally**, which is right: every guide
      is going, so a guide-owned anchor is invalid and a board-owned one is cheap to drop.
      The *hover* going unconditionally is defensible **only** because the anchor is nulled
      in the same statement — no anchor, no latch. That is a property of the five statements
      that do it (`setTool`, `clearGuides`, `undo`, `redo`, `replaceDocument`), not a
      licence to add a sixth.
    - **THE ASYMMETRY, a trap in both directions.** At `updateBoard` the tape fields are
      point-precise while **`grabbed` keeps a board-precise clause**, so renaming the
      grabbed board cancels the grab — deferred because it is shipped Move-tool behaviour,
      not because the argument fails to reach it. The board-precise clause fires **first**
      and pre-empts the survival test below it, so **deleting it silently converts
      `grabbed` to point-precise**, and **adding one for either tape field silently
      re-breaks the rename case** — caught only by the "keeps" tests, never the "drops"
      ones.
    - **The enumeration lives in ONE place** — `tapeHover`'s declaration in `store.ts`.
      Point at it; do not restate a count anywhere else, which is how a comment went stale
      once already.
25. **The snap move is deliberately NOT rounded to `SNAP_INCHES`, the exact opposite of
    what `Gizmo.tsx` does — both correct.** The gizmo snaps because a free drag lands on
    arbitrary numbers. A snap move's entire purpose is the *exact* coincidence of two
    points: if both boards already sit on 1/16" boundaries the delta is exact and a snap is
    a no-op, so the only case where rounding does anything is the case where it silently
    breaks the result the user just asked for — by a sixteenth, with the display rounding
    to the same string either way (invariant 5) so nothing on screen shows it. **The rule:
    round what a free drag produced; touch nothing that is already an exact position or a
    difference of two of them.** Compare invariant 22, the same argument in the other
    direction. This covers three more operations: a click-placed guide (`hit.at`), a
    ray-typed guide (`offsetPoint`), and — the one easiest to think you've already
    satisfied — an **axis-placed** guide, which *looks* like it should land on the grid
    because a person typing `3` along Y from an on-grid corner does. Verified rather than
    argued: `0.01` along X from `x = 5` reads back out of `localStorage` as exactly `5.01`.
26. **`grabbed` is a `BoardSnapPoint`, and that is what makes eight reads correct.** The
    guide-points round widened `SnapOwner` with a `{ type: 'guide' }` member, and that edit
    is silent by construction: both members carry an `id: string`, so every `owner.id` read
    keeps typechecking while quietly meaning something else. Eight reads in `store.ts`
    assume it names a **board** (enumerated in the guide-points design §3 and pointed at
    from `grabbed`'s declaration — do not restate the list). Seven are correct only *by
    accident*, because a guide can never reach `grabbed` — an accident holding solely via a
    filter two modules away in `MoveTool`. **A comment cannot enforce that; a type can.**
    So the three providers are annotated `BoardSnapPoint[]`, `pickSnapPoint` is generic in
    the candidate type, and `grabbed`/`grabSnapPoint` take the narrow type.

    The consequence that reads as a gap and is the win: **the "a guide-owned grab must be
    declined" store test was deleted, because that state cannot be constructed in
    TypeScript at all.** Do **not** add a runtime `if (grabbed.owner.type !== 'board')`
    guard to `commitSnapMove` to make it writable again. One runtime narrowing on that path
    *does* survive and is not vestigial: the self-snap guard tests
    `target.owner.type === 'board'` before comparing ids, because the *target* genuinely
    can be a guide, and without it a guide whose id collided with the grabbed board's would
    read as a self-snap.

    The price of the wide type, before adding a fourth held field: `tapeAnchor`/`tapeHover`
    are `SnapPoint` on purpose — **the difference between them and `grabbed` IS the
    documentation of which can hold a guide** — and they pay in five runtime `owner.type`
    tests. `pickSnapPoint`'s generic is currently **unrealized** (both call sites pass a
    union), and `MoveTool` still narrows at entry via `isBoardOwned`, a written-out type
    predicate — narrowing the *property* inline does not narrow the *value*.
27. **Every window-level shortcut goes into `App`'s ONE existing keydown effect, and any
    new `window` listener must take the cut-list-open flag explicitly.** While the cut list
    is open the rest of the app carries `inert`, removing the subtree from the tab order,
    hit-testing and the a11y tree in one attribute — the failure mode being *silently
    editing the document while reading a sheet that shows no selection*, since `NameField`,
    the project-name field and every `DimensionField` commit on change or blur. But `inert`
    **cannot touch a `window` listener**, which never sees which subtree an event came
    from. So `App`'s effect early-returns on `cutListOpen`, and `Viewport` takes it as the
    `shortcutsSuspended` prop for `f`/`Home` — without which `f` re-frames the camera
    invisibly and hands back a moved view.

    The effect's guards are the reason to join it rather than mere tidiness. `cutListOpen`
    means nothing arms a tool or seeds a distance box behind a sheet, and Escape closes the
    sheet while leaving a grab behind it untouched — behaviour a second listener would have
    to re-derive and could drift from. `isTextEntry` at the top is *why only the first
    character of a typed length needs capturing*: once the input has focus, every later
    keystroke matches that guard and reaches the field directly. **That same guard is why
    `TapeReadout` needs its own X/Y/Z branch beside Escape's — forced, not redundant, since
    `App`'s listener never sees another key once the box has focus.** One spelling detail
    is load-bearing there: the modifier test is part of the *condition*, not an early
    `return` like `M`'s and `T`'s, because `Ctrl+Z` is `e.key === 'z'` and a returning
    guard would swallow undo.

    `shortcutsSuspended` and `showGuides` are prop-drilled local view state while
    `tool`/`grabbed` are in the store — one rule applied to three fan-outs, not a
    contradiction. `tool` has four consumers at three depths; a single flag with one
    consumer does not earn shared state.
28. **`TapeReadout` must stay unconditionally mounted.** `tapeTyped`'s anchor-loss clear is
    owned by an effect inside it — the right home, and a coupling. It renders nothing
    without an anchor, so hiding it behind `tool === 'tape'` looks free; it is not. Since
    the typed capture **appends** rather than replaces, breaking the mount turns the
    consequence from a cosmetic flicker into a silently wrong placement. The append is
    load-bearing too: a pointerdown on the canvas blurs the input while the anchor lives,
    so the tool's central gesture is *type `1`, orbit to see the face, type `2`* — and
    replacing would answer `2` while the box read `1` the whole way round. **The displayed
    text and the next keystroke's effect must not disagree.**
29. **The active project id is an EXPLICIT ARGUMENT to `autoSave(id, doc)`, never adapter
    state — and the mechanism is not the one the plan claimed.** If the id lived inside the
    adapter, a debounce armed while project A was open would fire after a switch and write
    **A's document into B's slot**: no error, no visual difference, B's work gone on the next
    read. The signature is what stops it, because a future edit that drops the id has to
    delete an argument rather than merely forget an ordering.

    **State the protection precisely; the plan got this wrong and mutation testing corrected
    it.** What makes the race unreachable is the id being **captured in the same effect
    closure as `doc`**, plus **`doc` changing on every switch** — so the effect's existing
    cleanup clears the pending timer before the new one arms. With `[doc]` alone the race
    test still passes; the dep entry is belt-and-braces *for the race*.

    **But `activeId`'s dep-array entry is genuinely load-bearing for a different reason, and
    a reader who deletes it because "the race doesn't need it" will break autosave
    silently.** There is exactly one path where `activeId` changes and `doc` does **not** —
    the restore effect's edit-wins branch, which adopts `activeId` while keeping the user's
    in-progress document. Drop the entry and that adoption never re-runs the effect: the
    `!activeId` guard then kills **every save for the rest of the session**, while
    `SaveIndicator` goes on reading *Saved locally*. **Do not remove it, and do not
    re-justify it with the race.**
30. **`sloyd.autosave.v1` is never deleted and never written after adoption, and adoption
    fires on exactly ONE condition: the index key is ABSENT.** That key *is* the user's
    project on a pre-library build, Sloyd has no server-side state, and there is nothing to
    restore from — so it costs a few kilobytes and it is this round's entire rollback story.
    Deleting it to be tidy converts a free rollback into an unrecoverable one, which is why
    `browser.ts` carries a comment saying so at the point where deleting it would be natural.

    **Absence is tested on the RAW `getItem` result, before any `JSON.parse`.** A
    present-but-unusable index — corrupt JSON, an empty string, or an unrecognised `layout`,
    in particular a **newer** one — must never be treated as an absent one. Treating it as
    absent silently clobbers real project data with a fresh single-entry index built from the
    now-stale legacy document. So it **refuses and writes nothing**, degrading to a genuinely
    read-only legacy session with `available === false` and the storage banner showing (not a
    session that claims to save and doesn't, and not one that resumes writing to the stale
    legacy key). **The reasoning, which is the part to carry forward: the document layer
    already refuses a `version` it does not understand rather than guessing at it — that is
    what the v6 bump bought — and the storage layer owes exactly the same refusal to a
    `layout` it does not understand.** Adoption is retried on the next boot for free, since
    the absent index is the only thing that triggers it.

    Two neighbouring branches are **not** adoption and must not become it: an index that
    parses but whose `activeId` names a missing project falls back to another loadable
    project, and one with `projects: []` creates a fresh `Untitled`. Both refuse to re-adopt,
    for one reason — an index exists, so adoption already happened, and the legacy document
    is stale **by definition**.
31. **Write the project key, verify it reads back, THEN commit the index — and that ordering
    lives in exactly ONE private primitive (`writeVerifiedProject`) that every writer calls.**
    An index row pointing at a key that never landed is a project the list offers and cannot
    open. The ordering had grown **two** homes (`adopt`, `addUntitledProject`) and was on its
    way to a third (`createProject`) before it was collapsed: a safety rule written out three
    times is a rule that holds in two places after the next edit.

    **A passing test cannot prove this one, and the round has the receipt:** a reviewer
    rewrote `adopt` to commit the index *first* and deleted the round-trip check, and 22/22
    still passed. What covers it is a storage double that **accepts writes but drops
    `sloyd.project.*` on read**, asserting the index key stays null — the bound comes from
    outside the code under test, invariant 23's rule applied to an ordering instead of a
    container.

    The same seam carries the other half: **every mutating operation reads the index through
    `readIndexForWrite` and refuses when it is unusable**, writing nothing and reporting
    `available = false`. Reads may keep degrading gracefully (`listProjects` returns `[]`);
    mutations may not. This is enforced **at the seam**, not by a convention that every caller
    checks `libraryAvailable` first — a convention that has to hold in `App.tsx` to protect
    `localStorage` is not a seam. `deleteProject` refuses **before touching the project key
    itself**: a partial delete (key gone, corrupt index left alone) is worse than no delete.


## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 907 tests across 35 files
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck. A green suite proves nothing about `tsc`; run
`npm run build` before claiming anything compiles.

## Open follow-ups

**`docs/follow-ups.md` is the authoritative list** — 1-156, consciously deferred rather
than missed, each written up in place with its closure where it has one. Read the entries
for the area you are about to touch before starting; several are "correct but untested",
which is exactly what a refactor breaks silently.

The handful worth knowing without opening that file:

- **130** — semi-infinite construction lines, the one genuinely open item on the tape
  surface and the most likely next round. Narrowed but not closed by cardinal guides:
  typed offsets are enough as a *mechanism*; what is still wanted is the line as a *visual*.
- **147** — should a locked axis outlive a commit? A §3.1 amendment and a human decision,
  not a bug fix. **The user was asked and ruled SHIP AS-IS**, so it is open by decision:
  one keystroke per guide is worth the single-sentence rule, revisit only with real use.
- **148** — the most portable entry here, nothing to do with any feature: `store.ts` holds
  `gesturing` and `gestureSnapshotTaken` as module-level closure variables that
  `replaceDocument` does not reset, so a component unmounting mid-gesture leaks them into
  every later test in the file and silently breaks undo bookkeeping. Reproduced and
  independently confirmed; worked around in-file, real remedy is store-level and untried.
- **140** — a pre-existing ~1-in-4 test flake: `depthField.agreement.test.ts`'s heaviest
  case times out at 5000 ms. Reproduces on `master`. Remedy is a per-file `testTimeout` or
  splitting the case.
- **92** — the one open follow-up with a user-visible consequence: a near-square part's
  rotation is ambiguous on a rendered sheet, since nothing says "turned" in words.
- **26a** — **read this before touching anything in the viewport.** Browser verification on
  this host runs on software GL (llvmpipe, no GPU), which returns 1.0 for `pow(0.0, 0.0)`
  where real hardware returns NaN. That difference hid a grid bug completely — it looked
  correct in every screenshot and shipped as a camera-following disc. Anything resting on
  undefined or precision-sensitive shader behaviour needs a human looking at real hardware.
- **70 / 79 / 84** — an actual print-to-PDF render is still unverified; this host's
  Playwright exposes no `pdf()`. Every print check to date used `emulateMedia`.
- **76** — a recorded *negative* finding: hatch versus cross-hatch is not reliably
  distinguishable at screen size on its own. The legend line carries the distinction.

**One chain runs through the whole ledger and is the single most useful thing to know
before executing a plan: code and justifications supplied verbatim by a plan, spec, brief
or reviewer have been wrong at least ten times** (64, 68 ×2, 80, 87, 88, 107, 118, 126,
141 ×4-5, and 155 for the project-library round's own six). The recurring shapes: a fixture
that passes for the wrong reason, a test bound derived from the thing under test, a constant
whose stated justification doesn't reproduce, and a claim copied into several documents
before any code existed. They were caught because implementers were told to fix the *code*
rather than the *expectation*, and to stop and escalate when they believed an expectation was
itself wrong.

**The project library round is the sharpest single data point in that chain and is worth
knowing as a number: SIX DISTINCT plan-supplied tests were shown, by mutation, to be
incapable of failing** — and one of them was hiding a real shipped bug rather than merely
being weak. Follow-up **155** enumerates all six and derives the count (the round's own ledger
reaches six one entry earlier, having logged the same observation twice); take the number from
there rather than restating it. **Mutate the test, don't just run it**, on anything
whose whole justification is an ordering, a refusal, or a "cannot exceed" property.

Host-level open items (proxy auth, Cloudflare, monitoring) are in `DEPLOYMENT.local.md`.

## Deployment

Sloyd builds to static files served by nginx from a multi-stage image
(`docker compose up -d --build`). No bind mounts, no named volumes, no `.env` — there is
deliberately no server-side state to persist, because the document lives entirely in the
browser behind `StorageAdapter`. The nginx config does SPA-fallback routing so a refresh
on a deep route resolves to `index.html` rather than 404ing.

**Everything host-specific — hostname, container name, network, proxy setup, and the
manual steps only a human can do — is in `DEPLOYMENT.local.md` (gitignored).** Read it
before deploying or touching anything on the host. See also the deployment rule stated
once in the Status section: production is verified by page load, features against the dev
server.

## Working agreements

- Build incrementally: small v1, then widen. Prefer shipping a narrow thing that works.
- Design docs live in `docs/superpowers/specs/`; read the latest before changing behavior.
- **No pull requests.** Solo repo — commit to `master`, or branch and merge locally
  (`git merge --no-ff`, verify the merged tree, then delete the branch). Don't open PRs.
- TDD where it pays. `units` is tested hardest on purpose: a quiet bug there produces wrong
  measurements, and wrong measurements waste lumber. **The r3f viewport has no unit tests
  by design — verify it by driving a real browser, not by asserting on mocks.**
- When a review finding conflicts with what a plan or spec says, that's a human decision,
  not one to resolve silently either way.
- Prefer closing latent bugs over deferring them, including ones only reachable on a future
  platform — the storage seam exists precisely so a desktop build stays cheap.
- **This file is the rules; `docs/history.md` is the record.** When a round ships, add a
  table row and promote any new prohibition into an invariant — do not paste the narrative
  back in here.
