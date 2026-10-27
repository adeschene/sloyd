# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Deployment specifics for this host live in `DEPLOYMENT.local.md` (gitignored).
>
> **This file holds the rules that govern new work, condensed.** Detail lives in maintained
> reference files:
>
> | File | Holds |
> |---|---|
> | `docs/invariants.md` | the FULL text of every invariant (condensed below; read the full one before touching its area) |
> | `docs/module-map.md` | the annotated source tree, file by file, and the per-file rules (in full) |
> | `docs/versioning.md` | the full migration table (what each loader step validates and drops) |
> | `docs/rounds.md` | one row per shipped round, and the per-round Status log, and the rollback table by schema boundary |
> | `docs/follow-ups.md` | every follow-up; authoritative |
> | `docs/history.md` | the record (narratives); not maintained |
>
> Precedence: `docs/follow-ups.md` wins on any follow-up's status (the list below is a summary).
> A mismatch between a condensed rule here and its full text in `docs/invariants.md`,
> `docs/module-map.md` or `docs/versioning.md` is a bug: read both and reconcile — never trim the
> full text to match the summary. Over `docs/history.md` (unmaintained), this file wins.

---

## What Sloyd is

Modelling and planning for woodworking projects: lay out the parts of a build in 3D, see
how they fit, and get the numbers you need at the bench (dimensions, cut list). Not a
general-purpose CAD tool — the domain assumptions (boards, stock thickness, fractional
inches) are the point. The name is from *sloyd* (Swedish *slöjd*), the Scandinavian
handicraft education tradition built around hand woodworking.

What it does today is listed round by round in `docs/rounds.md`.

## Status

- **Production: `72228cc`, bundle `index-BEpsbfAI.js`, CSS `index-BRfNHt6R.css`, SCHEMA 26** (through dovetails;
  merge `72228cc`; deployed 2026-10-27). Owed to the user: see NEXT.
- **Rollback:** the nearest boundary REFUSES: back to `975e418` (box joints, `index-EQnlonaA.js`, schema 25) refuses every
  project saved at 26 — export first. Every older boundary: the table
  in `docs/rounds.md`; runbook: `DEPLOYMENT.local.md`.
- **NEXT (2026-10-27):** through dovetails are deployed; owed to the user (the dovetails *Amended (build)* block was approved
  2026-10-27): the copy reviews (fu 491, 512), the bench chain by eye (fu 511), fu 496(1) and the dovetailed corner on real hardware (the paid Refine runs passed 2026-10-27). Owed
  otherwise: the owed list below.
- **The deployed commit always trails `HEAD`**: a deploy's own record is committed after it.
  Docs-only commits past it are not unreleased work, and some rounds ship byte-identical bundles
  (test-only). Check what a later commit touches before reading `git log` as a pending release.
- Design specs: `docs/superpowers/specs/<date>-sloyd-<slug>-design.md` (plans beside them); live
  checks: `docs/browser-verification-<slug>.md`; screenshots: `docs/img/` (prefer a DOM readout,
  add an image when the finding is spatial).
- **Do not re-propose** two items declined on purpose: CSV/clipboard export and name
  run-collapsing (`Leg 1..4`).

### The deployment rule

**Production is verified by loading the page only.** Sloyd has no server-side state:
`localStorage` in the user's browser *is* their project, and exercising a feature against
production would overwrite it with nothing to restore from. So new behaviour is verified
against the **dev server** (Claude drives the Playwright browser; the user can watch), and
the deploy is confirmed by **bundle hash** at the edge and in-network, plus the edge's
**CSP header** (`connect-src 'self' https://api.anthropic.com`), which the dev server does
not send. On PRODUCTION, `localStorage` is confirmed cleared in the verifying browser afterward, checked
rather than assumed. On the DEV server, test projects a check creates are LEFT in place (the user's ruling, 2026-10-17); never clear the dev profile wholesale either (it holds the user's API key and projects). Paid Generate/joinery runs for testing are approved up to 10 per feature
without asking (the user's ruling, 2026-10-22); ask before an 11th. The key never goes into chat or a committed file. (Generate was once exercised on production
because it only ever adds unactivated projects, inv 36. That is not a precedent.)

**Rollback cost is a schema question.** A build understanding less than the file's version (25)
refuses the document. Rolling back past a schema bump strands every project saved since;
export first. A round with no schema change costs nothing to roll back. The library
round changed the storage *layout*, not the schema: rolling past it loses only projects
created after adoption (inv 30).

## Architecture

Static single-page app. No server, no database, no backend API, no env vars. **One
outbound call**: Generate/joinery call `api.anthropic.com` from the browser with the
user's own key, stored only in `sloyd.llm.v1`; the CSP's
`connect-src` allows only that origin.

**The plain-JSON document is the source of truth; the Three.js scene is derived from it
and is never authoritative.** A document is
`{ version, name, units, stock, guides, boards, instances, definitions, shapes, materials, bandTypes, hardwareTypes, hardware }`.
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
`viewport/TapeTool.tsx` (`parseLength`, for the live preview) take it, and so do `designCheck.ts` (a metric violation's
`shown` copy, fu 355; its model `message` stays decimal inches), `sectionView.ts` (the section's heading), `dovetailBench.ts` (the
bench drawings' strings, `formatLengthBare`), and the copy homes `bandText.ts`, `tenonText.ts`, `stretcherText.ts`, `boxJointText.ts`,
`cornerText.ts` and `dovetailText.ts` (`banding.ts` and `roundTenons.ts` stay numbers-only).
`snapPoints.ts` and `row.ts` deliberately do not. Do not generalise to "everything under
`document` imports `formatLength`". A TYPE-only import of `Units` is not an edge (`types.ts`, `geometry.ts`' `snapStep`, `roundTenons.ts`' `tenonStep`, `stretchers.ts`, `boxJoints.ts`, `cornerPlan.ts`, `dovetails.ts`), nor is `gridDensity.ts`' `isMetric` (the
ground grid's ladder is a display choice of the project's units, not a string).

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`, imported only from `storage/index.ts` (fu 8; `storage/seam.test.ts` guards it). Nothing else touches
`localStorage` or the filesystem. A desktop build
would be a second implementation, not a parallel path.

### Versioning

Every load path (open, import, autosave-restore) runs `migrateDocument` before the
document is trusted. `CURRENT_VERSION` is **26** (dovetails; merged `72228cc` and deployed 2026-10-27). Steps run one version at a time, in
order, on RAW data before `validateBoard` (inv 11) — except v10→v11 and v11→v12, which run after.
The step table — what each step adds, validates, drops and refuses, and the harm a build one version back
would do — is `docs/versioning.md`; update it
with every bump.

- **A bump exists for the refusal gate, not for upgrading** — absent fields default
  regardless. Argue *your* field's harm; don't inherit another bump's argument. A content-keyed
  refusal (an unknown kind or segment type) needs no bump.
- **v8's and v12's steps are NOT idempotent** (they mirror): the `d.version < 8` and
  `d.version < 12` guards are all that stop a file being re-mirrored on every load.
- **v10→v11 runs after validation**, guarded by `d.version < 11`, before `repairTree` (it judges
  equal link members on validated values; what it builds: `docs/versioning.md`). `link` is read only from a file below v11.
- `validateShapes`' drops and `repairTree` on every load (inv 46): `docs/versioning.md`.
- A malformed entry is DROPPED; a faulted but well-formed one is KEPT (holes, curves, profiles,
  bands alike).

## Where things live

The annotated tree, file by file, is `docs/module-map.md` — keep it current when a file is added
or its role changes. Where a file's own doc comment is the stated single source of truth (the list heads
`docs/module-map.md`), **read it there.** The ONE homes:

| Concern | Home |
|---|---|
| lengths ↔ text | `units/length.ts` (inv 52); nominal names `units/nominal.ts` |
| schema, load, migrate, ids | `document/types.ts`, `document.ts` (inv 11, 33), `ids.ts` |
| turns, extents | `document/geometry.ts` `axisFrame` (inv 44, 2) |
| composition, walk, write-back | `frames.ts`, `tree.ts`, `treeEdit.ts` (inv 46) |
| shapes / links | `shapes.ts`, `links.ts`, `linksToShapes.ts` (inv 45) |
| rectangular cuts | `cuts.ts` (inv 40) |
| angle cuts | `angleCuts.ts`; AI `angleWorld.ts` / `taperWorld.ts` (inv 48, 59) |
| holes | `holes.ts`, `holeFaults.ts`, tilt `holeTilt.ts`, `holeRebase.ts`, `legSockets.ts`, stretchers `stretchers.ts`; AI `holeWorld.ts` (inv 50, 60) |
| curves | `curves.ts`, `curveDrawing.ts` (inv 53) |
| edge profiles | `profiles.ts`, `profilePath.ts`, `sweep.ts` and kin; AI `profileWorld.ts` (inv 48, 53) |
| hardware | `hardwareModel.ts`, `hardware.ts` (inv 55) |
| edge banding | `bandModel.ts`, `banding.ts`; AI `bandWorld.ts` (inv 54) |
| box joints | `boxJoints.ts` (layout, recogniser, planner), `boxJointText.ts`, `resizeEnd.ts`; write-back `treeEdit.ts` `writeBackParts`; Refine/Repair `fingerClaim.ts` (inv 61) |
| corner joints (shared) | `cornerPlan.ts` (corner finding, run-out, corner region, linked Shapes, `writeCorners`), `cornerText.ts`; keep predicate `leanKeep.ts` `cornerJointed` (inv 61, 62) |
| dovetails | `dovetails.ts` (faults, view curves, zones, planner), layout `dovetailModel.ts`, `dovetailText.ts`, `dovetailBench.ts`, `cornerPlan.ts` (inv 62) |
| lean | `lean.ts`, `levelEnds.ts`, `leanContacts.ts`, `worldBounds.ts` (inv 57, 59) |
| round tenons, the joint | `roundTenons.ts`, `tenonJoints.ts`, `tenonText.ts`; tolerances `checkTolerances.ts` (inv 58) |
| bodies and edges | `bodies.ts`, `seams.ts`, `outline.ts` (inv 16, 48) |
| refusals of joinery/Repair; Refine's carry | `featureCarry.ts` (inv 56), `joints/featureZones.ts`, `featureRegions.ts`, `joints/tapers.ts` `joineryRefusal` |
| cut list, nesting, Buying | `cutlist.ts`, `nesting.ts`, `purchase.ts`, `materials.ts` (inv 18, 19, 22, 23, 49) |
| drawings | `drawing.ts` `drawView` (inv 47), `plans.ts`, `section.ts` (inv 51) |
| design checks / AI | `designCheck.ts` (inv 38, 39), `generated.ts`, `generate/` (inv 41) |
| state | `store/store.ts` (inv 4, 24, 34, 42–47), `visibility.ts` (inv 43) |
| persistence | `storage/` only, through `storage/index.ts` (invs 7, 29–31) |
| viewport | `viewport/` — NO unit tests by design except the pure helpers and perf/watertight guards |
| panels | `panels/` — one section per feature, each over a pure refusal module |

**Test-only modules** (never import a test module — it re-registers its suite): `treeFixtures.ts`,
`turnFixtures.ts`, `curveFixtures.ts`, `sweepFixtures.ts`, `meshCases.ts`, `shakerTableFixture.ts`, `stoolFixture.ts`, `holesSquareCases.ts` (with `holesSquare.snapshot.json`), `dovetailFixtures.ts`.

### Per-file rules not covered by an invariant

**These are rules, kept in full in `docs/module-map.md` ("Per-file rules") — read a file's entry there before
editing it** (`snapPoints.ts`, `cutlist.ts`/`diagram.ts`, `bodies.ts`, `angleCuts.ts`, `AngleCuts.tsx`, `nesting.ts`,
`SheetLayout.tsx`, `plans.ts`, `featureKeys.ts`/`planKeys.ts`, `pocket.ts`, `prompt.ts`/`concepts.ts`, `SettingsDialog.tsx`,
`useGenerations.ts`, `store.ts`, `MoveTool`, `TapeTool.tsx`, `BoardMesh.tsx`, `Viewport.tsx`, `DimensionField.tsx`,
`ProjectMenu.tsx`, `GuidesList.tsx`, `Popover.tsx`, `styles.css`, `App.tsx` keys). A new per-file rule goes there, and
its file's name here.

## Invariants — break these and things fail in confusing ways

Each cost real debugging. **Do not renumber them** — the numbers are cited from code
comments, specs and `docs/follow-ups.md`. These are condensed; **the full current text is
`docs/invariants.md`** — read the full entry before working in its area, and change both when one
changes.

1. **The document is the source of truth.** No component holds geometry state not derived
   from it; nothing writes a Three.js transform as a way of recording a change.
2. **`position` is the min corner.** `boardCenter` bridges to centre-origin meshes.
   `reorientedPosition` is the only home of the reorient pivot and takes the whole patch
   (post-patch extents). `grain`, `cuts`, `angleCuts`, `holes`, `curves`, `profiles`, `bands`,
   `cornerRule`, `lean`, `tenons` and `dovetails` are absent from the reorient predicate (they move nothing), so they have their own
   store actions; a LEANING part's resize or turn keeps its pivot instead (inv 57). A future tool that moves *and* turns in one gesture must carry its own `position`
   in the same patch.
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
   `Assembly N`. **The separator glyph `›` is reserved: `cleanName` turns it into `>` where a
   name is WRITTEN (`renameItem`, Generate), and PROHIBITION: never in `uniqueName`,
   `dedupeNames` or on load** — a flat document names parts "Front › Leg" by construction and
   runs through `migrateDocument` (fu 227).
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
    the same failure. It includes every hole row and curve (profiles through `geometryBoard`; a
    swept profile appends its own suffix). Bands are NOT in it: BoardMesh's memos add
    `bandViewSignature`, because a band type edit keeps the board object.
16. **Edge lines come from `boardEdges` (`edgesOf`'s three-way choice), not from the solids. A marker or line must sit on a feature that is actually drawn.** No facet lines: a
    hole draws rims, never wall facets; a curve its outline, a through line only at a SHARP vertex (judged on the true arc,
    suppressed per INTERVAL); a stopped profile's run-out, a swept profile and
    a round tenon's round side draw none. **A run-out joins only faces of its own path end**. **The fast swept edge path skips
    edges but never faces**. The snap-point exceptions (centres in air, waste as air to `stockProbe`): `docs/invariants.md`.
17. **UVs are parent-relative and `FIT` resolves against the board, not the solid**, so
    figure runs continuously across a cut.
18. **On the cut list, stock dimensions collapse at display precision; cuts match
    EXACTLY.** Round what is bought, never what is machined.
19. **`LABEL_SIZE` has one home (the `<svg>` attribute); CSS never sets a font-size on
    diagram text, and `--font-num` must stay monospace.** The measured string and the drawn
    string must be the same string: assemble it in the module that builds it
    (`nesting.ts`, `diagram.ts`), never in the component. A non-ASCII glyph must be
    measured in a browser before it is trusted. Hole and curve notes are HTML notes under the
    figure, never measured SVG labels.
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
    (guard-first shape). Three reasons to clear: the world moved; the feature underneath went
    (point-precise, `===`, called AFTER `edit()`); the user retargeted (`grabbed` only, via `selectionPatch`).
    - **PROHIBITION: no selection write may clear `tapeAnchor` or `tapeHover`.**
    - `clearGuides` clears both tape fields; that licence is not to be extended.
    - At `updateBoard`, `grabbed` keeps a board-precise clause and the tape fields are
      point-precise. Deleting the former or adding one for the latter breaks behaviour that
      only the "keeps" tests catch.
    - The enumeration lives only at `tapeHover`'s declaration in `store.ts`; never restate it.
25. **Exact moves are never rounded to the drag grid (`SNAP_INCHES`, or 1 mm in a metric project — `snapToGrid`)**: snap move, click-placed guide,
    ray-typed guide, axis-placed guide and copy in a row (copy k = original + k·step·sign,
    never from the previous copy). Round what a free drag produced, nothing else; a free drag of a LEANING part
    rounds the DELTA, never a corner (`dragTarget`, inv 57).
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
    is re-minted (never all of them), and `seen.add` lives inside `takeId`. Scopes per id kind (dovetail ids per board, as tenons):
    `docs/invariants.md`. `/` in an id is re-minted. A guide with no id is dropped.
    References (`Instance.definition`, `ShapedBoard.shape`) are resolved by DROPPING the
    duplicate or the dangling part, never by re-minting. A future field pointing at a board by id
    breaks the single-pass repair.
34. **`gesturing`/`gestureSnapshotTaken` are store state so `replaceDocument` can reset
    them — the only reset.** **PROHIBITION: they must not join `restore`'s clear list, and
    no component may read either.** A test of this asserts an undo entry, never a flag.
35. **`FACE_AXES` carries each UV axis's SIGN, applied BEFORE the swap**, in the table
    itself, read back off a real `BoxGeometry`. A UV
    test must check an interior number (`uv − position/tileInches` constant per board), not
    only extremes. A sloped or chord face takes the plan of the world axis its normal is nearest
    (a tie to the cut's `face`); the grain seam partway round an arc is ACCEPTED (fu 336).
36. **Generation never adopts a project**: `createProject(doc, { activate: false })` and
    nothing else. "Open when done" must call `openProject`.
37. **The generation history is append-only; `LlmMessage` is opaque so it stays that way.**
    Assistant turns go back verbatim (thinking and fallback blocks included); do not
    "clean" them.
38. **`overlap` and joinery's blockers/trims are measured between SOLIDS via `worldSolids`**
    (pocket-cell BOXES), never `solidWorldBox`. A tapered pair is measured on real bodies (`clipConvex`, `partMass`); contact,
    grounding's `connected` and the tip footprint read `contactSolids` for any ANGLED part (flat wood only — a sloped face is never a contact). Untapered results are
    byte-for-byte unchanged. Do not raise `TOUCH` to make joints pass; do not drop the check. **Holes are ignored** by every
    check: a hole never decides support — THE ONE EXCEPTION: a bore a SEATED tenon fills makes a joint (inv 58). **A built tenon's wood, tip included, is
    never a contact** (`stands`, `checkedLevelFaces`). A part with a BUILT dovetail is `realBodied` too; its contacts are the wood behind each
    baseline plus each tail's or pin's INSCRIBED box at its narrowest span (`dovetailContacts`; angled cheeks never a contact; inv 62). A LEANING part's only contacts are its LEVEL faces (±Y within 1e-9).
39. **Support means HELD: every part off the floor is resting, between (≥ 50% coverage of
    both faces of X or Z) or lapped (a broad face; a top contact only under the stated
    one-level conditions), and the piece must not tip.** **PROHIBITION: do not drop (c),
    the coverage threshold, or either half of the top-face clause.** One fault, one report.
    `groundedSet` is the ONE grounding walk. Known limits: follow-up 176. A LEANING part is supported only by RESTING on
    its level faces, or by a joint (d): nothing is held "between" or lapped onto one; an unlevelled one is not grounded. **(d) JOINED (inv 58): a seated tenon holds either of its two
    parts, ONLY toward the floor** (`groundedWithout(i)`), any part, no coverage threshold.
40. **Anything deciding "same cut" derives from a field table checked by `satisfies`** —
    `CUT_GEOMETRY_FIELDS`, `ANGLE_CUT_FIELDS`, `HOLE_FIELDS`, `CURVE_FIELDS`, `PROFILE_FIELDS`, `BAND_FIELDS`, `TENON_FIELDS`, `DOVETAIL_FIELDS` —
    every field but `id`, exact. Do not replace a table with a list in a function body or add an exclusion without
    a written reason. The cut list groups by them as a multiset, ids ignored; `sameShared` compares
    in order, ids included. `cutsThatRemoveStock` decides which cuts are compared; the resulting
    row split on exact dimensions is correct — do not round.
41. **Joinery has one converter (`pocketFor`), never adopts, and is blamed only for what it
    caused.** `pocketFor` is tested against the box in every pose, stores via
    `storedAsShape`. Problems compare by `kind` + `parts`, never message text. Every
    refusal is decided before ANY mutation, and every `resize` is pre-checked by
    `cutIntoEnd`. **ONE decider, `joineryRefusal(entry, …)`** (also called by Repair and a joined Refine), one sentence per
    part. On a featured project joinery rules kinds out per site BEFORE the call (`featureAllowed`). **A curve, profile or band
    is judged in the ORIGINAL frame, never on a mid-trial board; the run-through exception is decided per growing face (P7).** Refine carries
    features onto its plain parts BEFORE `runJoinery` (inv 56); a joined Refine is refused up front when an angle cut already
    runs into a joint or a part has a tilted row; a conflicting result comes back UNJOINED, never joined over it.
42. **A group move rounds the GROUP's min corner once and adds one delta
    (`moveGroupTo` → `translateBoards`); one selected part keeps the separate single-part
    path.** Do not unify them; do not round inside `translateBoards`. `selectionPatch` is
    the ONE writer of a user's selection change. A selection change mid-drag ends the
    gizmo's gesture and commits nothing. A group with a LEANING part rounds the delta instead (inv 57).
43. **Hidden-ness is view state with one gate, and a hide moves nothing.** The four user
    actions go through `applyHidden` (one entry per run, the SAME `doc`, no autosave); others only
    reconcile. `selectionPatch` drops hidden ids — do not move that to callers. A hide is
    refused while `gesturing`. **PROHIBITION: no hide or show may clear `tapeAnchor` or
    `tapeHover`.** Never return `visibleBoards`' array (or anything built from it) from a
    selector — filter in a memo or handler; a selector may reduce it to a PRIMITIVE. Hidden parts are still in the cut list, joinery,
    checks, export and autosave. Consecutive hide/show toggles share ONE undo entry.
44. **`axisFrame` is the ONE turn table; every part↔world crossing goes through its helpers**
    (`toWorldOffset`, `fromWorldOffset`, `spanToWorldOffset`, `spanFromWorldOffset`,
    `endFacing`). **Never `board[dim] - u` at a call site.** Nothing branches on
    `rotation`'s value except `axisFrame`, the migrations, `generated.ts`'s `orient` and
    Properties' Turn select. The one legitimate hand reflection is `mirrorCutAlong`; do not tidy it onto the helpers.
    Every posture shares ONE hand (fu 215, v12). **Every other feature reflects by FLAG FLIPS,
    never arithmetic on stations or coordinates** (`mirrorAngleCut` and kin, `mirrorDovetails`), each with an exact `lower…` inverse.
    Equivariance tests use `chiralPart` (and kin), never a symmetric fixture. A part's own mirror (schema 21)
    is the same flips along `mirrorDim` (`mirrorFeatures`; inverse `lowerOwnMirror`).
45. **A link is a SHAPE its users point to; shared fields are stored once.** `LINK_FIELDS`
    is the ONE shared/own table (classify an optional own field with care, fu 231). `resolveBoard` is
    the ONE place a shape is read into a part. `linksToShapes` is the ONE label→shape builder, with two
    callers (the v10→v11 step and `linkByRole`); both judge equality by `sameShared` only — never loosen it. Shared-field edits are written to the
    Shape (`applyWorldEdits`); the only propagation left is `shapeMates` re-pivoting posture. `linkPlan` is the ONE Link decider. A one-user shape dissolves.
    **`Board.link`, `repairLinks`, `dissolveSingletons` and `mates` propagation must not come back.** A shaped part may be
    its Shape's MIRROR (`mirrored`: OWN, shaped parts only, applied by `resolveBoard`). `lean`, `tenons` and `dovetails` are SHARED (`tenons: []` or `dovetails: []` is a
    removal, never stored); a shape-mate's patch never carries `lean`.
46. **The tree has ONE composition (`placeBoard`/`placeInstance`), ONE walk
    (`worldParts`), and every edit is written back through `treeEdit.ts`**, changed fields
    only, a moved position lowered as a delta. Path names come only from `flatDocument`.
    - **Two write-back rules: a Properties edit keeps the stored local position; joinery
      passes `keepWorld`.** Do not unify; a new caller picks one (a leaning part's resize is a third case, inv 57).
    - Group moves nothing; Ungroup is exact for direct child parts only. Joinery runs on `flatDocument`, maps back by index.
    - Write-back keys on the STORAGE target (`storageKey`), one edit per target (`oneEditPerTarget`); an edit in a
      definition moves every copy (held points `judgeHeld`, keys `rekeyEverywhere`).
    - **A mirrored instance (schema 13) is a step inside the ONE composition**; write-back is its exact inverse (`lower`).
      Across a mirror `linkPlan` and `postureRefusal` refuse before any mutation; a Shape is never lowered
      through two parities in one edit (`sameSideFirst`). **A side is chain parity XOR the part's own flag (`sideAt`)**;
      joinery's regroup joins a user only when the Shape resolves EXACTLY to it through its own flag.
    - A `lean`, `tenons` or `dovetails` key present as `undefined` REMOVES it (never stored).
47. **Exploded is read-only.** `explode > 0`: `edit()`, `undo` and `redo` are the gate; actions
    with side effects outside `edit()` refuse at entry (`readOnly()`); `setTool` refuses all but
    Select; `setExplode` is the one writer. The UI lock is `EditLock`'s disabled `<fieldset>` around
    EDITING regions only; the explode offset is a render-time translation, never written back. **Drawings:**
    `drawView` takes lines from `boardEdges` and `holeDrawingSegments` (one hidden-line pass),
    occluders from the HOLE-FREE `worldBodies`, and TAGS each segment with its feature — tagging changes
    nothing else. A curved part's visibility is judged on the MODEL chord; ONE facing test (`EDGE_ON`).
    Non-curved drawings are byte-for-byte unchanged (`drawingIdentity`).
48. **`boardBodies` is the ONE place angle cuts, curves, profiles, round tenons and dovetails become geometry, and bodies
    stay CONVEX; `pocketCells` is stock minus RECTANGULAR cuts only.** Anything that draws, edges,
    occludes or probes reads bodies (through `partGeometry`); anything that describes or joins
    rectangular cuts stays on `pocketCells`. A body no feature touches keeps its object/bytes. A
    curve's waste is CLIPPED when the kept wood is convex, else SPLIT into convex pieces. **A SWEPT profile's
    kept wood is BUILT, never its waste subtracted** (`sweep.ts`). A BUILT tenon's waste is two square-span VIEW curves
    (`geometryBoard`; `squareSpan`: no run-out), never shown as curves. **The design schema defines part, direction
    and `vec3` ONCE in `$defs`; the four angle kinds share ONE item shape (`angles`). A new design-form feature joins
    an existing item shape where it can — each new SHAPE costs grammar (fu 322).** The wire form is not the
    internal form (`toWireDesign`).
49. **A custom material's KIND is in its id** (`m-s-…`, `m-v-…`, `m-p-…`); a stored `kind` that
    disagrees drops the entry, and nothing may change a stored material's kind. Label, colour and
    sheet size come only from a `MaterialCatalog` (`catalogOf(doc)`) — no global registry. **A
    document carries exactly the custom materials its parts, shapes and band types use**
    (`pruneMaterials` on load and in `edit()`); every path that makes a project from another carries them.
    Generate's schema stays byte-identical. Nominal names only on an EXACT section match (metric: the same whole mm); drawings keep
    actual dimensions.
50. **`holes.ts` is the ONE place holes become geometry; `boardBodies` stays hole-free and
    convex. `holeFaults` is the ONE strict-rule decider.** An add is refused on any fault, an edit only
    when it ADDS one; a fault a later edit causes is KEPT, noted, never clamped. **A row may TILT (schema 23);
    `holeTilt.ts` is the ONE home of tilt math**; square rows keep their paths byte for byte. **A tilted row's
    faults are EXACT or CONSERVATIVE, never under-reported** (the unclipped mesh path trusts them). Leg sockets: `legSockets.ts`, the ONE decider;
    `boreRow` the ONE bore core; `boreAlongAxis` the ONE coaxial test; `tenonInSeat` the ONE tenoned-leg predicate. **Generate and Refine AUTHOR holes through `holeWorld.ts`, the ONE converter** (untouched rows return
    EXACTLY; a strict model fault is KEPT and flagged, never clamped). `drawsAsBox` is the ONE BoxGeometry routing.
    **A curved part's mesh is WATERTIGHT** (`curvesWatertight.test.ts`); a shaped part is ONE geometry
    (`partMesh`), never memoised on the shared bodies. **Rebuild performance breaks silently** (what is memoised where: `docs/invariants.md`). Perf
    guards are the MINIMUM of 9, lowered only, never raised; `sweptIdentity.test.ts` pins swept parts byte for byte.
    Within-part path chaining on paper is intended — do not undo it.
51. **The section cut is view state with ONE writer (`setSection`), never in the document, undo or
    autosave**; reset only where `explode` is. One shared `THREE.Plane` clips on the GPU (no geometry
    rebuild). **Caps come only from `sectionCaps`** (board-local; bores subtracted). **Picking and snapping read only `keptBySection`**,
    guides exempt. Never hand out the local-cap cache's arrays. On the Plans sheet the section drawing comes
    only from `drawView`'s `section` option, always of the ASSEMBLED piece; a sheet with no section is byte-for-byte unchanged.
52. **A length becomes text — and text becomes a length — only through `units/length.ts`, with the
    DOCUMENT's own `Units`.** Stored values are inches always; a units switch moves no number.
    Imperial output is byte-for-byte as before (one ruled change, fu 359). Metric: whole mm, a bare
    typed number is mm, holes to 0.1 mm via `holeLengthText`, free drags via `snapToGrid`. Imperial on
    purpose: trade sizes, Generate's limits, model-facing text. Drawings read BARE mm with one `Dimensions in mm` note.
53. **`curves.ts` is the ONE place curves become outlines; `curveFaults` is the ONE fault decider.**
    A `CurveCut` is a closed WASTE outline of lines and MINOR arcs (`rise` OR `radius`, the other
    derived, never written back). Authoring refuses an ADDED fault; one a resize causes is KEPT and
    noted. **A curved part's edges are BUILT.** **Every edit is refused when an arc would pass a half circle** (fu 416). An unknown segment
    `type` refuses the document. **Edge profiles are stored as `ProfileCut`s and every reader goes through
    `geometryBoard`**; `profileFaults` is the ONE profile fault decider, `profilePath.ts` the ONE path home;
    **the straight fallback** is ONE decision in `geometryBoard`. Curves and Profiles refuse an edit that ADDS a fault to
    ANY profile.     **Generate and Refine AUTHOR profiles through `profileWorld.ts`, the ONE converter**, except on a part
    `carriesProfiles` flags (curves or a two-side run), whose profiles stay carried and are never fed to the model.
54. **`banding.ts` is the ONE place band numbers are computed**, numbers-only, memoised and deep-frozen.
    **The model is the FINISHED size; the cut list prints the CORE**; bodies are untouched. **A faulted band
    adds nothing.** Authoring refuses an ADDED fault; a later one is KEPT. **Generate and Refine AUTHOR bands
    through `bandWorld.ts`, the ONE converter**, except on a part with curves, whose bands stay carried (inv 56); `cornerRule`
    is always carried. A strip, tape run and glue line count only the VISIBLE run (`visibleRun`). A strip row has no `boardIds`:
    every reader of a row's parts handles an empty list. A band-free document is byte for byte as before
    (`bandFreeIdentity.test.ts`). The viewport paints a band by MOVING triangles into material groups 6+,
    never by recolouring a slot; `glueLines` is the ONE glue-line geometry.
55. **`hardware.ts` is the ONE place hardware is counted** (`placementsOf`, pinned against `worldParts`; hidden
    parts count). **Hardware never groups the cut list, never touches geometry, and every Definition copy carries
    it**; `hardware` is SHARED (inv 45). **`holderHardware` returns STORED arrays, never `resolveBoard`'s copy** (a
    selector returning a fresh array crashes React). Hardware is typed, never derived from holes.
56. **Refine keeps a featured part's posture and rotation by ONE decision, `keptFrame` (the prohibition below).** The carry (`featureCarry.ts`, by flat name, in the ORIGINAL frame) lands before `migrateDocument` and before `linkByRole`. A resize keeps features at their stored stations (faults KEPT, noted); a turned featured part is a fault fed to the repair loop. A part whose only frame features are holes, bands and/or authored profiles that the model turned (`keptFrame`'s rank and tie rules) is `orient`ed like its plain twin, the exact swaps skipped; `turnCandidates` never turns a part with curves or carried profiles. **PROHIBITION: do not `orient` a part with carried curves or carried profiles (a run on two sides, `carriesProfiles`), nor a part whose only frame features are holes, bands and/or authored profiles whose returned box keeps every world extent's rank against the original's (ties allowed both ways) AND still has a smallest extent on the original's thickness axis unless that thickness was not the original's smallest (the ONE decision is `keptFrame` in `convertPart`), and do not move the carry after `migrateDocument` or `linkByRole`.**
    A LEANING part, one with a TILTED hole row, a round tenon, a compound end cut, a BOX JOINT or a DOVETAIL is KEPT exactly (`keepsExactly`,
    `keptParts`; the corner joints through ONE predicate, `cornerJointed`; invs 57–59, 61, 62); one inside an assembly refuses Refine (a
    box-jointed or dovetailed part's whole ASSEMBLY is kept whole instead, inv 61, 62), and so does a joined Refine (unless the only kept
    kinds are box joints and/or dovetails, inv 61, 62).

57. **A lean is placement, and `lean.ts` is its ONE home** (schema 22). `Board.lean` (SHARED) stores turn-0 SLOPES (degrees only in display
    and typed input), only when non-zero (a zero lean is no lean), only on an UPRIGHT part, always seam-free. **A lean-free document is byte for byte as before.** `position` stays the
    PRE-lean min corner; the lean turns about the PIVOT (the top's centre), which a resize keeps. **Mirrors flip it
    by `leanFlip` only.** **R1:** every part→world crossing composes it (`cuts.ts`' group-relative helpers stay lean-free). **R2:** extents come from `partBounds`; **a
    leaning part's pre-lean box is never presented as its extent.** **R3:** no box fast path. Drags round the DELTA.
    Level the ends (`levelEnds.ts`): two end miters, lengths rounded UP; never automatic. Checks extended, never weakened (a joint
    holds a leaning part too, inv 39 (d)); joinery and Repair refuse,
    Refine keeps; the cut list ignores it.

58. **A round tenon is a STORED feature of a part's end, and `roundTenons.ts` is its ONE home** (schema 24).
    `Board.tenons?` (at most one per end): coaxial, centred, the shoulder square to the axis, `length` from the shoulder to
    the end's centre, inside the part's length (a typed tenon never changes `length`). **A tenon-free part has NO `tenons` key — never `[]`, never
    `undefined` — and is byte for byte as before.** **`tenonFaults` is the ONE fault decider** (CONSERVATIVE; copy
    only in `tenonText.ts`): an add refuses any fault, an edit only an ADDED one, a later one is KEPT and noted;
    **a faulted tenon builds nothing** (`builtTenons`). A tenoned end is square or carries ONE end miter, the tip. **The joint** is `tenonJoints.ts` `seatedIn` (every
    condition: `docs/invariants.md`). **Support is never granted by proximity.** A stretcher is held by inv 39 (d) (inv 60).

59. **A lean may be SQUARE-SET (`square: true`, schema 25): `leanMap` is `m = T`, never twisted** (turned:
    `T · Ry(τ)`; `leanTwist` its τ). A first lean is square-set; a Set change on a holed part is refused when τ ≠ 0.
    **A two-slope square-set leg's level ends are COMPOUND miters** (`across: { rise, from }`, end miters only,
    the depth `depthAtCross` = `depthAt + rise·(t − T/2)`, anchored at the through CENTRE; `deepestCorner` reads all four
    corners; mirrors flip `across.from`). A document without either is byte for byte as before. **Every reader is correct or refuses**
    (`hasCompoundCut` the ONE predicate): `miterFields` null, joinery and Repair refuse, Refine keeps, `worldAngles` null.

60. **A stretcher is an ordinary part with two round tenons in two BLIND sockets; `stretchers.ts` is the ONE planner (Add
    stretcher, Fit the stretcher again); nothing about one is stored** (no schema change; a stretcher-free project is byte for
    byte as before; inv 39 (d) holds it, no check changes). Its legs are FOUND every time (`rungLegAt`, `stretcherOf`). Its axis
    is EXACTLY axis-aligned (legs not square to 1e-6 refuse); `L` and `S` round DOWN to the grid, a socket's depth UP to
    `tenonStep`; a free row the tenon is `seatedIn` is reused; any socket fault refuses the WHOLE action. Every refusal before
    `edit()`; ONE undo entry, none for a fitted rung's Fit. Fit re-fits the CLOSURE (each stretcher sharing a used row).

61. **A box joint is ORDINARY rectangular cuts; `boxJoints.ts` is the ONE layout, the ONE recogniser and the ONE planner, and they
    are each other's inverse** (box joints; NO schema change; a box-joint-free project is byte for byte as before). A corner is
    two parts with full-thickness notches at their ends (`across: 'thickness'`, stops 0); the recogniser (`fingerSets`) reads SHAPE,
    never a stored field. **One layout per corner, exact complements to 1e-9** (the user's ruling 2026-10-27: every finger `w`, the
    leftover ONE odd finger at J's world MIN on every axis — bottom for Y, BACK for Z (+Z is the front), left for X — a sliver under `w/4`
    merged into its neighbour; `N` may be even; **at least five**, three read as a tenon); each part's segments are computed DIRECTLY in its
    own J terms, and the recogniser reports only part-local `fingerAtMin`/`oddEnd`; a linked mirror along J compares them through the flag.
    **With an asymmetric layout two linked cases refuse** (the disagreement sentence): mirrored along J at the SAME turn, and UNMIRRORED
    users at opposite turns (90°/270°); a symmetric layout (odd `N`, no odd finger) succeeds. A recognised
    width may be an ulp off the planned value, so compare PLANNED parameters. **The write-back is `writeBackParts` (`keepWorld`, one edit per storage key, Shapes regrouped), never `mapWorld`; its
    link post-condition refuses a split link.** Every refusal before `edit()`; ONE undo entry; the run-out is exact (inv 25).
    **Joinery leaves the size and place of any box-jointed part alone** (`<part> has box joints, so joinery leaves its size and place
    alone`). **Refine keeps box-jointed root parts and box-jointed ASSEMBLIES whole** (definition and every placement, put back FIRST,
    inv 56); **finger sets are claimed BEFORE the gate** (`fingerClaim.ts`), **Repair claims them too**, and a joined Refine fixes
    every NEW site touching a kept part as BUTT (a RECORDED joint stays as recorded) and **(c)** returns the design UNJOINED when the
    re-join would change a kept part. **PROHIBITION: do not claim finger sets after the gate, do not force a recorded joint into a
    kept part butt, and do not drop the (c) guard.** The cut list prints one line per set, never a tenon or notch lines
    (`setupLines` claims first). Since dovetails the corner planner is `cornerPlan.ts` (box joints one `JointKind` of it, unchanged)
    and every keep/leave-alone site reads `cornerJointed`; the claim sites stay finger-only. Full text: `docs/invariants.md`. Follow-ups 484–496.

62. **A dovetail is a STORED parametric feature of a part's end (schema 26); `dovetails.ts` is the ONE fault decider (`dovetailFaults`),
    the ONE view-curve source and the ONE planner (the dovetail kind of `cornerPlan.ts`); the ONE layout is `dovetailLayout` in the
    leaf `dovetailModel.ts`** (re-exported from `dovetails.ts`). `Board.dovetails?` `{ id, dim, end, role, count, slope, pin, depth,
    outside? }` (pins only: the outside face), one per `(dim, end)`, canonical order; SHARED (inv 45), mirrors by FLAG FLIPS (inv 44:
    `end` along `dim`, `outside` along the thickness, nothing along J — the layout is a PALINDROME); `DOVETAIL_FIELDS` (inv 40).
    **A dovetail-free document is byte for byte as before: no `dovetails` key — never `[]`, never `undefined`.** The layout: half
    pin `p`, `N` tails `Te = (H − (N + 1)·p) / N`, pins `p`, half pin `p`, every bound computed DIRECTLY from J's min, the last tail's
    far edge `H − p`; every reader takes its bounds from it. **One layout per corner, an exact partition** (to 1e-9). Faults in order
    `count`, `slope` (1:4–1:12), `depth` (past the part, or two depths meeting), `narrow` (narrowest tail < widest pin by > 1e-9;
    equal passes). **Authoring refuses ANY fault; a later one is KEPT and noted; a faulted dovetail builds NOTHING** (`builtDovetails`).
    Geometry is inv 48's path: square-span VIEW curves through `geometryBoard`, after the tenons' (bodies convex, mesh watertight,
    `geometryKey`/UVs read it, never a curve to the user); snap corners only at the outside plane. **Every reader is correct or refuses:**
    a dovetailed part refuses dovetails on featured stock and every other feature's ADD (`<part> has dovetails — remove them first.`),
    and any cut or hole reaching a dovetailed end's ZONE (`depth` back, whole section) on add or edit, EXCEPT a cut running straight
    through along the run (`cutRunsThrough`); the checks read it as `realBodied` with inscribed contact boxes (inv 38; no new kind of
    support). Re-plan keeps the stored count, pin width and tail side (G3); `N` ≤ `DOVETAIL_COUNT_MAX` (100: load drops more, `Te` O(1) in `dovetailTailWidth`); a linked user mirrored along J at its mate's SAME turn refuses when the Shape takes PINS (fu 507). Joinery
    leaves its size and place alone AND skips a pocket reaching its zone; Refine keeps it (and its assembly) whole, Repair never
    changes it (`cornerJointed`, `changedDovetailed`). The cut list: one line per stored dovetail; the bench drawings on the TAIL
    part's row only (`dovetailBench.ts` builds every string, inv 19). Full text: `docs/invariants.md`. Follow-ups 497–515.

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 9715 tests across 271 files (timing guards can fail under load; re-run quiet before claiming a regression)
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck; run `npm run build` before claiming anything compiles.

## Open follow-ups

**`docs/follow-ups.md` is authoritative** (1–515). Every entry's LAST `**Status:**` line governs
(numbers 24, 25, 97, 131, 157, 158 each name two entries, never renumber).
This list is the triage's open set — when an entry's status changes, change it here too, or delete the number; some entries close mid-line, so read an entry whole.

- **Feature-sized (need a spec):** 253 and 265 (schema bumps); 257, 258, 268, 270, 271, 274; 404–407 (hardware); angle cuts
  275, 276 (joint kinds only), 280; holes 330, 331, 334; curves 363 (authoring; design checks reading curved bodies),
  364–366; banding 399, 400; splayed legs 449, 450; stretchers 475–478, 480, 481; round tenons 457, 458, 460; square-set legs 470, 471; box joints 485–490, 492;
  dovetails 497–503.
- **Owed to the user, not code:** real hardware — 26a, 21, 28, 34, 39, 255, 337, 347, 370 (369's pinholes), 402(1); by eye —
  142, 272, 319, 380(1), 384(2), 387(1), 392(2), 393, 394 (`docs/rounds.md`); 350 (section markers by hand); 106 (touch/pen);
  153 (a browser at quota); a real print — 357 (Brave, metric margin), 402(2); copy — 454 (angled holes), 464 and 468 (round tenons), 473 (square-set legs), 482 (stretchers), 491 (box joints; the tie, spec difference 4, is moot since Task 9), 512 (dovetails); by eye — 465 (round tenons), 511 (dovetails' bench chain); real hardware — 496(1) (box joints: the jointed corner by eye; its paid Refine run passed 2026-10-27); paid runs 172, 177. 336's grain seam waits for a texture/shader session.
- **Open, cosmetic and not small:** 33 (one drawn ring centre for every board's end grain).
- **Open by decision:** 130 (ask before assuming it is wanted), 147, 163's residue (do not re-open unasked), 176, 207, 225,
  232, 241, 295, 315 (needs 232), 349 (ask first), 389 (ask first), 393(2) (left as is 2026-10-19), 396, 397 and 408 (only
  when a real project needs it), 417 (ask first), 431 (left as is 2026-10-23; do not re-open unasked). Record-only: 401, 403, 409, 413 (ask first), 414, 418, 420–428, 429 (ask first), 433 (ask first), 434, 435.
- **Open, splayed legs (2026-10-24):** 436 and 439 (ask first), 441 (by decision), 442, 443, 445; record-only 440, 446. Angled
  holes (2026-10-25): 448 and 453 (ask first), 451, 452; record-only 455, 456, 469. Round tenons
  (2026-10-25): 459, 463 and 467 (ask first); record-only 461, 462, 466. Square-set legs (2026-10-26): record-only 472, 474. Stretchers
  (2026-10-26): 479 (ask first); record-only 483. Box joints (2026-10-27): 493 (pre-existing; ask first), 494; record-only 495. Dovetails
  (2026-10-27, deployed): 504, 507 and 510 (ask first), 505, 506, 508, 509,
  514, 515; record-only 513.
- **Read before touching:** 26a before the viewport (software GL hides shader behaviour); invs 38, 41 and fu 180–206
  before `generate/joints/`; 322 before any `DESIGN_SCHEMA` change (one live compile); 76 (hatch vs cross-hatch: the
  legend carries it).

## Deployment

Static files served by nginx from a multi-stage image (`docker compose up -d --build`).
No bind mounts, volumes or `.env` — there is no server-side state. nginx does SPA
fallback. Scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `security-headers.conf`.
**Everything host-specific is in `DEPLOYMENT.local.md` (gitignored); read it
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
- **This file is the rules; `docs/history.md` is the record.** When a round ships: update the
  Status block's production line and rollback line, and `docs/rounds.md`'s rollback table (no per-round bullets
  here — they go in `docs/rounds.md`'s Status log, with a row in its table); write a new invariant or a change to one
  in FULL in `docs/invariants.md` and CONDENSED here (every PROHIBITION verbatim in both); keep
  `docs/module-map.md` and `docs/versioning.md` current. Put the narrative in `docs/history.md`.
  Keep this file under ~60KB: when it grows, move detail out, not rules.
