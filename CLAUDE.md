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

- **Production matches `master`** as of 2026-10-10: the record-only 243/244 round, bundle
  `index-nQcIwlOt.js`, CSS `index-QQ-rJZea.css`, merge `74469ff`, **schema 11** (unchanged).
  Test count is under Commands.
- **Nothing is pending. NO SUCCESSOR IS
  CHOSEN: ask what to work on; do not pick.** Open near the recent code:
  241 (open by decision), 215 (posture handedness, a question),
  205/206 (joinery's safe refusals), 221, 225–235. See Open follow-ups below.
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

**Rollback cost is a schema question.** A build understanding less than `version: 11`
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
`{ version, name, units, stock, guides, boards, instances, definitions, shapes }`.
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
`viewport/TapeTool.tsx` (`parseLength`, for the live preview) take it.
`snapPoints.ts` and `row.ts` deliberately do not. Do not generalise to "everything under
`document` imports `formatLength`".

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`. Nothing else touches `localStorage` or the filesystem. A desktop build
would be a second implementation, not a parallel path.

### Versioning

Every load path (open, import, autosave-restore) runs `migrateDocument` before the
document is trusted. `CURRENT_VERSION` is **11**. Steps run one version at a time, in
order, on RAW data before `validateBoard` (inv 11) — except v10→v11.

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

- **A bump exists for the refusal gate, not for upgrading** — absent fields default
  regardless. Argue *your* field's harm; don't inherit another bump's argument.
- **v8's step is NOT idempotent** (it mirrors): the `d.version < 8` guard is all that stops
  a v8 file being re-mirrored on every load.
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
├── units/            length.ts (parseLength/formatLength/canBeginLength; capture set {0-9 . -}),
│                     quantity.ts (board/square feet, two decimals fixed)
├── document/
│   ├── types.ts          Board, Cut, Shape, ShapedBoard, StoredBoard, Instance, Definition,
│   │                     SloydDocument, FlatDocument, MATERIALS, sheet stock
│   ├── document.ts       create/validate/migrate (inv 11); takeId (inv 33); trueTurnsToV8 /
│   │                     mirrorCutAlong (inv 44); validateGuides, validateShapes
│   ├── ids.ts            nextId, the one id minter
│   ├── names.ts          uniqueName / dedupeNames among siblings (inv 8); derivedName,
│   │                     the derived-PROJECT name ("— refined 2", fu 237)
│   ├── geometry.ts       axisFrame, the ONE turn table, and its crossings (inv 44);
│   │                     boardExtents/boardCenter/reorientedPosition (inv 2), boardsBounds
│   ├── frames.ts         placeBoard / placeInstance, the ONE composition (inv 46)
│   ├── tree.ts           occurrence paths, isCovered, worldParts (THE walk), flatDocument
│   ├── treeEdit.ts       every write-back: applyWorldEdits (storageKey), lowerEdit,
│   │                     translateItems, writeBackFlat (inv 46)
│   ├── treeOps.ts        group/ungroup, shareInstance, makeUniqueItem, removeItems, turnInstance
│   ├── treeRepair.ts     repairTree, dropUnresolved (load repair)
│   ├── shapes.ts         resolveBoard (THE shape reader), shapeUsers, prune/dissolveShapes (inv 45)
│   ├── links.ts          LINK_FIELDS (the ONE shared/own table), sameShared, linkPlan (inv 45)
│   ├── linksToShapes.ts  the v10→v11 step
│   ├── cuts.ts           cutRegion, boardSolids, boardEdges (inv 16), clippedRegion (THE clip),
│   │                     cutShape (THE description of a cut), cutLabel, openSides,
│   │                     storedAsShape, cutsThatRemoveStock, CUT_GEOMETRY_FIELDS (inv 40)
│   ├── tenons.ts         findTenons
│   ├── cutlist.ts        buildCutList (inv 18) — stock, not remainder
│   ├── depthField.ts     buildDepthField (inv 20)
│   ├── diagram.ts        buildDiagrams, one view per (face, from)
│   ├── nesting.ts        buildNesting, shelf FFD; formatDims (invs 19, 22, 23)
│   ├── snapPoints.ts     board/cut/guide snap points, towardFor, offsetPoint (inv 26)
│   ├── row.ts            rowLayout (gap/pitch/fit-across; refusal CODES; no rounding, inv 25)
│   ├── generated.ts      DESIGN_SCHEMA, parseDesign, designToDocument (assemblies → a TREE;
│   │                     `Authored` maps flat names back to what the model wrote; MAX_MAGNITUDE)
│   ├── roleLinks.ts      linkByRole: role + sameShared classes → linksToShapes (inv 45)
│   ├── assemblyChecks.ts distinctParts, distinctPartsViolation, collapseViolations (one report
│   │                     per authored fault; "fix the assembly" only for overlaps)
│   ├── refineDesign.ts   documentToDesign (Refine's input + refusals; definitions normalised),
│   │                     carryGrain, designValues (exact values kept), definitionCorner
│   ├── designDiff.ts     diffDesigns — what a refine changed, by flat display name (→ units)
│   ├── designCheck.ts    checkDesign; worldSolids, the ONE world-solid mapping (invs 38, 39)
│   └── treeFixtures.ts, turnFixtures.ts   TEST-ONLY (assemblyDoc; chiralPart, inv 44)
├── store/
│   ├── store.ts          state, edit(), undo/redo/restore, selectionPatch, held points,
│   │                     hiddenIds, copyInRow, group/link/unique actions (invs 4, 24, 34, 42–46)
│   ├── assemblyPick.ts   clickTarget (inv 46)
│   ├── selectionGesture.ts  selectByClick, clearOnMiss (shared by viewport and parts list)
│   └── visibility.ts     visibleBoards, the ONE visibility filter (inv 43)
├── storage/          types.ts (StorageAdapter), browser.ts, libraryIndex.ts (invs 7, 29–31)
├── llm/              types.ts (LlmClient, opaque LlmMessage, inv 37), anthropic.ts
├── generate/         prompt.ts (limitLines), concepts.ts (batch planning), estimate.ts (cost ranges: measured
│                     chars/token, cached prefix, every repair round high; fu 236), refine.ts (refineMessage,
│                     detailFor), run.ts (runRepairLoop, evaluateDesign — THE design evaluation
│                     shared by Generate and Refine, runRefine, runJoinery),
│                     joints/{pocket,sites,recipes,choose,unjoin,repair}.ts (inv 41); unjoin + gateUnjoin
│                     read joints back, proved by an exact (1e-9in) re-join (readJoints = the lenient
│                     body); runJoinery's `fixed` keeps recorded joints passing validChoice, `alsoPresent`
│                     = original's problems; repair.ts = fu 240's prune-and-prove (a stray must be empty
│                     and its twin the same stored part; evidence rule); joints/fixtures/ = damaged docs made by the buggy 4a340f7
├── useGenerations.ts, useJoinery.ts, useRefine.ts, useRepair.ts   write only via createProject(…, {activate:false}) (inv 36)
├── viewport/         NO unit tests by design. Viewport, BoardMesh (inv 21), MoveTool +
│                     moveCandidates, TapeTool, Gizmo (invs 3, 10, 42), GuideMarkers,
│                     SnapMarker, snapPick (screen-space nearest, on purpose), grain*.ts
│                     (invs 12, 14, 15, 17, 35), pointer.ts, gridDensity, screenScale, extent
├── panels/           DimensionField/NameField (invs 5, 9), Properties, CopyInRow, PartsList,
│                     Toolbar, TapeReadout (invs 27, 28), GuidesList, ProjectMenu,
│                     SettingsDialog, GenerateDialog, JoineryDialog, RefineDialog, RepairNotice, CutList, PartDiagram,
│                     SheetLayout, diagramScale, diagramLabels (inv 19)
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
  and blurs (fu 212); a refused entry keeps focus.
- **`ProjectMenu.tsx`**: deliberately not an ARIA menu. The arm/disarm swap renders a
  `<button>` at the same sibling index in both branches — giving either a `key` breaks
  focus. Rendered only when `libraryAvailable`. A duplicate error's cause is read off
  `storage.available` (the ADAPTER flag, never React's `available`; fu 159).
- **`GuidesList.tsx`** has no selection model, deliberately.
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
   `Assembly N`. So paths, and `flatDocument`'s names, are unique.
9. **`NameField` commits once, on blur or Enter — never per keystroke**; an emptied name
   reverts; `onCommit` returns the *stored* name.
10. **The gizmo clamp writes `size` before `updateMatrixWorld`, never `handle.scale`
    after**; two-sided, with a floor (`GIZMO_MIN_CAP_INCHES`).
11. **Migration steps run on raw data, before `validateBoard`, in version order**, because
    the validator's fallbacks are legal-but-wrong values. Upgrade first, validate second
    (the one exception, v10→v11, is in Versioning).
12. **Grain textures are cached and never disposed; per-board variation lives in the `uv`
    attribute, never on the texture.** Offset is zeroed on a `fit` axis.
13. *Retired in v3* (`axisDimensions` is single-sourced; since v8 derived from `axisFrame`,
    inv 44). Number kept.
14. **`bandRadius` is `hypot(d, k·delta)`**; u is seamless by that, v by folding about the
    pith line. `grainTexture.ts`'s `woodCut` comment is the statement — agree with it.
15. **Anything memoising on what `boardUVs` reads keys on `boardUVSignature`, never a
    hand-written field list.** The signature is the same for every solid of a board, so
    don't cache per solid on it alone. A dep entry over a value nothing subscribes to is
    the same failure.
16. **Edge lines come from the cell grid (`boardEdges`), not from the solids.** General
    rule: a marker or line must sit on a feature that is actually drawn.
17. **UVs are parent-relative and `FIT` resolves against the board, not the solid**, so
    figure runs continuously across a cut.
18. **On the cut list, stock dimensions collapse at display precision; cuts match
    EXACTLY.** Round what is bought, never what is machined.
19. **`LABEL_SIZE` has one home (the `<svg>` attribute); CSS never sets a font-size on
    diagram text, and `--font-num` must stay monospace.** The measured string and the drawn
    string must be the same string: assemble it in the module that builds it
    (`nesting.ts`, `diagram.ts`), never in the component. A non-ASCII glyph must be
    measured in a browser before it is trusted.
20. **`depthField.ts` is not `boardSolids`**: it assigns max depth per cell in 2D; it does
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
25. **Exact moves are never rounded to `SNAP_INCHES`**: snap move, click-placed guide,
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
    shape). `/` in an id is re-minted. A guide with no id is dropped. References
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
36. **Generation never adopts a project**: `createProject(doc, { activate: false })` and
    nothing else. "Open when done" must call `openProject`.
37. **The generation history is append-only; `LlmMessage` is opaque so it stays that way.**
    Assistant turns go back verbatim (thinking and fallback blocks included); do not
    "clean" them.
38. **`overlap`, `hangs`' contacts and joinery's blockers/trims are measured between SOLIDS
    via `worldSolids`**, never `solidWorldBox`. Only grounding, `tips` and `faceContacts`
    stay box-based. Do not raise `TOUCH` to make joints pass; do not drop the check.
39. **Support means HELD: every part off the floor is resting, between (≥ 50% coverage of
    both faces of X or Z) or lapped (a broad face; a top contact only under the stated
    one-level conditions), and the piece must not tip.** **PROHIBITION: do not drop (c),
    the coverage threshold, or either half of the top-face clause.** One fault, one report.
    `groundedSet` is the ONE grounding walk. Known limits: follow-up 176.
40. **Anything deciding "same cut" derives from `CUT_GEOMETRY_FIELDS` (`cuts.ts`), checked
    against `Cut` by `satisfies`.** Do not replace the table with a list in a function body
    or add an exclusion without a written reason. `cutsThatRemoveStock` decides which cuts
    are compared; the resulting row split on exact dimensions is correct — do not round.
41. **Joinery has one converter (`pocketFor`), never adopts, and is blamed only for what it
    caused.** `pocketFor` is tested against the box in every pose, stores via
    `storedAsShape`. Problems compare by `kind` + `parts`, never message text. Every
    refusal is decided before ANY mutation, and every `resize` is pre-checked by
    `cutIntoEnd`.
42. **A group move rounds the GROUP's min corner once and adds one delta
    (`moveGroupTo` → `translateBoards`); one selected part keeps the separate single-part
    path.** Do not unify them; do not round inside `translateBoards`. `selectionPatch` is
    the ONE writer of a user's selection change. A selection change mid-drag ends the
    gizmo's gesture and commits nothing.
43. **Hidden-ness is view state with one gate, and a hide moves nothing.** The four user
    actions go through `applyHidden` (one entry, the SAME `doc`, no autosave); others only
    reconcile. `selectionPatch` drops hidden ids — do not move that to callers. A hide is
    refused while `gesturing`. **PROHIBITION: no hide or show may clear `tapeAnchor` or
    `tapeHover`.** Never call `visibleBoards` in a selector; filter in a memo or handler.
    Hidden parts are still in the cut list, joinery, checks, export and autosave.
44. **`axisFrame` is the ONE turn table; every part↔world crossing goes through its helpers**
    (`toWorldOffset`, `fromWorldOffset`, `spanToWorldOffset`, `spanFromWorldOffset`,
    `endFacing`). **Never `board[dim] - u` at a call site.** Nothing branches on
    `rotation`'s value except `axisFrame`, the migrations, `generated.ts`'s `orient` and
    Properties' Turn select. The one legitimate hand
    reflection is `mirrorCutAlong` (clip first, one sum, no snap); do not tidy it onto the
    helpers. Turn 0 is the pre-v8 mapping. Equivariance tests use `chiralPart`, never a
    symmetric fixture; mutate any new one. In `boardUVs` the reflection is per geometry
    axis, before inv 35's sign and swap. Generate stays at 0° and 90°.
45. **A link is a SHAPE its users point to; shared fields are stored once.** `LINK_FIELDS`
    is the ONE shared/own table (classify an optional own field with care, fu 231).
    `resolveBoard` is the ONE place a shape is read into a part. `linksToShapes` is the ONE
    label→shape builder, with two callers (the v10→v11 step and generation's `linkByRole`);
    both judge equality by `sameShared` only. Shared-field edits are written to the Shape (`applyWorldEdits`); the only propagation left is `shapeMates`
    re-pivoting posture. `linkPlan` is the ONE Link decider. A one-user shape dissolves
    (users counted as STORED parts). Joinery keeps sharing where cuts are identical by
    geometry. **`Board.link`, `repairLinks`, `dissolveSingletons` and `mates` propagation
    must not come back.**
46. **The tree has ONE composition (`placeBoard`/`placeInstance`), ONE walk
    (`worldParts`), and every edit is written back through `treeEdit.ts`**, changed fields
    only, a moved position lowered as a delta. Path names come only from `flatDocument`.
    - **Two write-back rules: a Properties edit keeps the stored local position; joinery
      passes `keepWorld`.** Do not unify; a new caller picks one.
    - Group moves nothing (identity frame); Ungroup is exact for direct child parts only.
    - Joinery runs on `flatDocument`, maps back by index; anything reading sites/joints uses
      the flat document.
    - A selection is one level (`isCovered` is the ancestor test).
    - Write-back keys on the STORAGE target (`storageKey`); disagreeing edits throw, so the
      store sends one edit per target (`oneEditPerTarget`). An edit in a definition moves
      every copy, so held points are re-judged (`judgeHeld`) and hidden ids/held points are
      re-keyed under every placement (`rekeyEverywhere`).
    - Make Unique copies one level and keeps ids. A twin placement of a selected part is
      never a Move target. `writeBackFlat` splits definitions shallowest-first by deepest
      placement.

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 2594 tests across 90 files
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck; run `npm run build` before claiming anything compiles.

## Open follow-ups

**`docs/follow-ups.md` is authoritative** (1–243, each with its closure). Read the entries
for the area you are about to touch; several are "correct but untested". Open items worth
knowing without opening it:

- **179** — refine by instruction (phase 2's other half). Read invs 38, 41 and fu 180–206
  before touching `generate/joints/`. **205/206** are open safe refusals.
- **215** — postures differ in handedness; a question, not a bug. Read before touching
  posture or shapes across postures.
- **221** — a hand-edited linked file whose cuts lack ids stays plain on load (fails safe).
- **225–231** — assemblies/components residues (225 out of scope by decision; the rest low).
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
