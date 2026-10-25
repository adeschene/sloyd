# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Deployment specifics for this host live in `DEPLOYMENT.local.md` (gitignored).
>
> **This file holds the rules that govern new work, condensed.** Detail lives in maintained
> reference files, split out 2026-10-20:
>
> | File | Holds |
> |---|---|
> | `docs/invariants.md` | the FULL text of every invariant (condensed below; read the full one before touching its area) |
> | `docs/module-map.md` | the annotated source tree, file by file |
> | `docs/versioning.md` | the full migration table (what each loader step validates and drops) |
> | `docs/rounds.md` | one row per shipped round, and the per-round Status log (merges, bundles, rollback, review items), and the rollback table by schema boundary |
> | `docs/follow-ups.md` | every follow-up; authoritative |
> | `docs/history.md` | the record (narratives; text removed from this file on 2026-08-14 and 2026-10-07); not maintained |
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

What it does today — boards, joinery (by hand and AI), assemblies and components, Generate/Refine/Repair via Claude,
the cut list with nesting and Buying, the Plans sheet, angle cuts, holes, curves, edge profiles, edge banding, hardware
— is listed round by round in `docs/rounds.md`.

## Status

- **Production: `aa1f841`, bundle `index-B114iN-Y.js`, CSS `index-Cj7r9G0C.css`, SCHEMA 23** (angled holes, splayed legs chunk 2,
  fu 437: a hole row tilts, Bore leg sockets; merge `aa1f841`; deployed 2026-10-25). Owed to the user: see NEXT.
- **Rollback:** the nearest refusing boundary is `f3fced0` (splayed legs chunk 1, `index-B3SCZcHR.js`, schema 22): it REFUSES every
  project saved at 23 — export first. Below it, `68dca2d` refuses 22 and `e2729ee` refuses 21; every deploy back to `98c7df4` is
  schema 20. Full table: `docs/rounds.md`; runbook: `DEPLOYMENT.local.md`.
- **NEXT (2026-10-25):** round tenons (chunk 2b, fu 447, SCHEMA 24) is BUILT on branch `round-tenons`, NOT merged or deployed:
  its browser pass (plan Task 12), then merge and deploy (the user's call). Owed to the user: the round tenons, angled holes,
  splayed legs and mirrored links specs' Amended blocks; fu 454, 464 (copy); fu 465 (by eye); fu 402(1)–(2); the by-eye and
  real-hardware items. Next feature: stretchers (fu 438). Then Open follow-ups (417, 429 ask first).
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
rather than assumed. On the DEV server, test projects a check creates are LEFT in place (the user's ruling, 2026-10-17:
removing them "is just a waste of time"); never clear the dev profile wholesale either (it holds the user's API key and projects). Paid Generate/joinery runs for testing are approved up to 10 per feature
without asking (the user's ruling, 2026-10-22); ask before an 11th. The key never goes into chat or a committed file. (Generate was once exercised on production
because it only ever adds unactivated projects, inv 36. That is not a precedent.)

**Rollback cost is a schema question.** A build understanding less than the file's version (23 since angled holes, deployed 2026-10-25)
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
`viewport/TapeTool.tsx` (`parseLength`, for the live preview) take it, and so does `designCheck.ts` (a metric violation's
`shown` copy, fu 355; its model `message` stays decimal inches), and `sectionView.ts` (the section's heading), and `bandText.ts` (the band line and the core note; `banding.ts` stays numbers-only), and `tenonText.ts` (the tenon's bench line and copy; `roundTenons.ts` stays numbers-only).
`snapPoints.ts` and `row.ts` deliberately do not. Do not generalise to "everything under
`document` imports `formatLength`". A TYPE-only import of `Units` is not an edge (`types.ts`, `geometry.ts`' `snapStep`, `roundTenons.ts`' `tenonStep`), nor is `gridDensity.ts`' `isMetric` (the
ground grid's ladder is a display choice of the project's units, not a string).

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`, imported only from `storage/index.ts` (fu 8; `storage/seam.test.ts` guards it). Nothing else touches
`localStorage` or the filesystem. A desktop build
would be a second implementation, not a parallel path.

### Versioning

Every load path (open, import, autosave-restore) runs `migrateDocument` before the
document is trusted. `CURRENT_VERSION` is **24** on the `round-tenons` branch (round tenons, NOT deployed; production is 23). Steps run one version at a time, in
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
| angle cuts | `angleCuts.ts`; AI `angleWorld.ts` / `taperWorld.ts` (inv 48) |
| holes | `holes.ts`, `holeFaults.ts`, tilt `holeTilt.ts`, `holeRebase.ts`, `legSockets.ts`; AI `holeWorld.ts` (inv 50) |
| curves | `curves.ts`, `curveDrawing.ts` (inv 53) |
| edge profiles | `profiles.ts`, `profilePath.ts`, `sweep.ts` and kin; AI `profileWorld.ts` (inv 48, 53) |
| hardware | `hardwareModel.ts`, `hardware.ts` (inv 55) |
| edge banding | `bandModel.ts`, `banding.ts`; AI `bandWorld.ts` (inv 54) |
| lean | `lean.ts`, `levelEnds.ts`, `leanContacts.ts`, `worldBounds.ts` (inv 57) |
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
`turnFixtures.ts`, `curveFixtures.ts`, `sweepFixtures.ts`, `meshCases.ts`, `shakerTableFixture.ts`, `stoolFixture.ts`, `holesSquareCases.ts` (with `holesSquare.snapshot.json`).

### Per-file rules not covered by an invariant

- **`snapPoints.ts`**: local→world is `position[axis] + toWorldOffset(board, axis,
  local[axisFrame(board)[axis].dim])`, then `leanMap(board).apply` for a leaning part (`fromWorld` inverts it — exactly only for an unleaned part). `pointToLocalXYZ` and `solidWorldBox` are
  CENTRE-relative and both look like they do this — using either puts every point off by
  half the board, plausibly. Pin with a rotated, non-flat pose. `towardFor` is the tape's
  ONE direction source (preview and commit); a locked axis wins over a hover, never falls
  back to it. `sameSnapPoint` lives here because the store needs it.
- **`cutlist.ts` / `diagram.ts`**: a group's key is its rows' key prefix (`groupFields`; fu 54). Format from `cutShape`, never from stored
  `across`/`offset`/`width`/stops (fu 192). The cut list accumulates EXACT stock, never
  qty × rounded dimensions, and ignores cuts (stock, not remainder). `storedAsShape`
  returns an already-aligned cut as the same object.
- **`bodies.ts`**: read bodies and edges through `partGeometry` wherever it runs per frame or per part (snap
  points, drawings, BoardMesh). Its results are SHARED between parts with one `geometryKey`, deep-frozen:
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
  A cut a later resize pushed past its part is KEPT and noted (`… at this size.`); an edit is refused only when it would
  overrun by MORE than the stored cut does (fu 296, the holes/curves precedent).
- **`nesting.ts`** takes `doc.boards`, NEVER `CutListRows`; too-big parts go in
  `unplaceable`, never dropped. The word `turned` rides on `dims` (inv 19).
- **`SheetLayout.tsx`** is the only caller of `fitLabel`'s `requireDetail`; the tier
  decision stays in `fitLabel`, not as a panel override. The sheet key list is NOT an
  `<ol>` (the number comes from `nextIndex`, not DOM position; fu 162). A part that cannot hold even its NUMBER
  (`holdsIndex`) is a callout (fu 96): its number in a row outside the drawing, the row only when used, so a drawing with no
  callouts keeps its viewBox (the layout: `docs/module-map.md`). A long leader across another part is accepted (the user's ruling).
- **`plans.ts` keying**: a STORED part (container id + part id) is keyed by the first trio that keys it (`claimed`; fu 381(4),
  the user's ruling: no duplicate labels) — only assembly trios can share one.
- **`featureKeys.ts` / `planKeys.ts`** (feature callouts): a key line is built only in `partFeatures` (hole sizes through
  `holeSizeText`/`holePitchText`, the bench line's own home; the four-corner collapse through `curveLineEntries`), never in the
  panel. A tag sits only on a segment `drawView` tagged for its feature (inv 16); tagging never changes a segment, its order
  or the visible/hidden split (`drawingIdentity.test` hashes the drawing with tags stripped). Angle cuts are tagged by
  plane membership (`keptHalfSpace`'s plane is `n·x + d = 0`), so `bodyEdges` is untouched. A part's features are keyed by the innermost
  LISTED assembly's trio (`keyed`), so each feature once per sheet (view order, merging and pushing: `docs/module-map.md`).
- **`pocket.ts`**: `pocketFor` stores each of its OWN numbers within EPS of a 1/64" or 0.1 mm grid point AS that point's float
  (`onGrid`, dyadic first; fu 216) — a box arrives through world differences and reflections, and the cut list compares
  stored cuts exactly. A `storedAsShape` re-store after it is off-grid but deterministic (fu 382); never snap after it, and
  never round the row key instead.
- **`prompt.ts`**: a batch concept rides in the USER turn, never in `SYSTEM_PROMPT`, which
  must stay a fixed prefix. `Concept` lives in `prompt.ts` so it never imports
  `concepts.ts`. **`concepts.ts`**' parse is all-or-nothing (never mixes planned and
  built-in concepts).
- **`SettingsDialog.tsx`**: a new key is shape-checked and verified with one free
  `GET /v1/models`; 401/403 refuses, anything else saves with a note. **There is
  deliberately no prefix rule.**
- **`useGenerations.ts`**: auth or cancel during planning starts no run; a cancel landing
  as planning resolves is caught before the runs (its test asserts run CALLS).
  A failed run's cost comes from `spentOnFailure` (run.ts; Refine too): a `RunFailed`'s usage or the calls before a rethrown
  error, null when nothing was spent; every spent cost prints through `formatCost` (`< $0.01`, never `≈ $0.00`; fu 168).
- **`store.ts`**: `copyInRow` and `duplicateBoards` share `copyBoard` so they cannot drift.
  `undo`, `redo` and `deleteBoards` are refused while `gesturing` (fu 208/209: mid-drag they lost or merged the drag's entry).
  `setKerf` refuses a kerf outside [0, 1) — the loader DEFAULTS one there, so storing it would be silently replaced (fu 98).
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
- **`DimensionField.tsx`**: min/max REFUSE out-of-range input, never clamp. A mixed field emptied after typing is untouched (fu 210). Enter commits
  and blurs (fu 212); a refused entry keeps focus. `onCommit` may return a refusal MESSAGE (a string): the field shows
  it as its OWN error (same element, role and `aria-invalid` as min/max), keeps focus and the typed text, and keeps it
  until its own next commit or an external resync — no sibling clears it (holes chunk 1 R7, R8). AngleCuts' Angle fields return their refusal too (fu 339; unreachable through today's bounds).
- **`ProjectMenu.tsx`**: deliberately not an ARIA menu. The arm/disarm swap renders a
  `<button>` at the same sibling index in both branches — giving either a `key` breaks
  focus. Rendered only when `libraryAvailable`. A duplicate error's cause is read off
  `storage.available` (the ADAPTER flag, never React's `available`; fu 159). A row click closes the menu at once; a failed open
  reopens it on that row with the message, focus on the caret (fu 35; `onOpen`: `docs/module-map.md`). Escape focuses the
  caret before closing (fu 152).
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
comments, specs and `docs/follow-ups.md`. These are condensed; **the full current text is
`docs/invariants.md`** — read the full entry before working in its area, and change both when one
changes. The pre-2026-10-07 text with worked examples is in `docs/history.md`.

1. **The document is the source of truth.** No component holds geometry state not derived
   from it; nothing writes a Three.js transform as a way of recording a change.
2. **`position` is the min corner.** `boardCenter` bridges to centre-origin meshes.
   `reorientedPosition` is the only home of the reorient pivot and takes the whole patch
   (post-patch extents). `grain`, `cuts`, `angleCuts`, `holes`, `curves`, `profiles`, `bands`,
   `cornerRule`, `lean` and `tenons` are absent from the reorient predicate (they move nothing), so they have their own
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
16. **Edge lines come from `boardEdges` (`edgesOf`: `pocketEdges`, `bodyEdges` once a part has angle cuts, `curvedEdges` for a
    curved part), not from the solids. A marker or line must sit on a feature that is actually drawn.** No facet lines: a
    hole draws rims, never wall facets; a curve draws its outline and a through line only at a
    SHARP vertex (judged on the true arc, suppressed per INTERVAL); a stopped profile's run-out, a swept profile and a round
    tenon's round side draw none, creases at sharp section vertices stay. **A run-out joins only faces of its own path end**,
    read off `BodyFace.stop` and the path. **The fast swept edge path skips edges but never faces** (its rule: `docs/invariants.md`).
    Snap-point exceptions: a hole's, an arc's and a tenon's shoulder ring's centre may sit in air or wood (the centre of a drawn
    rim, arc or ring); waste is air to `stockProbe`, P3's on-arc points excepted.
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
    - `setLean` and `levelEnds` end in `judgeHeld()`, point-precise like a resize (inv 57).
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
    is re-minted (never all of them), and `seen.add` lives inside `takeId`. Scopes: part and
    instance ids per container; definition, shape and band type ids per document; cut ids per
    board (per shape for a shape), and so angle-cut, hole, curve and tenon ids; profile ids share the
    CURVE scope; bands carry no id. `/` in an id is re-minted. A guide with no id is dropped.
    References (`Instance.definition`, `ShapedBoard.shape`) are resolved by DROPPING the
    duplicate or the dangling part, never by re-minting. A future field pointing at a board by id
    breaks the single-pass repair.
34. **`gesturing`/`gestureSnapshotTaken` are store state so `replaceDocument` can reset
    them — the only reset.** **PROHIBITION: they must not join `restore`'s clear list, and
    no component may read either.** A test of this asserts an undo entry, never a flag.
35. **`FACE_AXES` carries each UV axis's SIGN, applied BEFORE the swap**, in the table
    itself, read back off a real `BoxGeometry` (three of twelve axes run backwards). A UV
    test must check an interior number (`uv − position/tileInches` constant per board), not
    only extremes. A sloped or chord face takes the plan of the world axis its normal is nearest
    (a tie to the cut's `face`); the grain seam partway round an arc is ACCEPTED (fu 336).
36. **Generation never adopts a project**: `createProject(doc, { activate: false })` and
    nothing else. "Open when done" must call `openProject`.
37. **The generation history is append-only; `LlmMessage` is opaque so it stays that way.**
    Assistant turns go back verbatim (thinking and fallback blocks included); do not
    "clean" them.
38. **`overlap` and joinery's blockers/trims are measured between SOLIDS via `worldSolids`**
    (pocket-cell BOXES), never `solidWorldBox`. A pair with a tapered part is measured on real
    bodies (`clipConvex`, fu 302), the tip check weighs it by real bodies (`partMass`, fu 303);
    contact, grounding's `connected` and the tip footprint read `contactSolids` for any ANGLED part
    (flat wood only — a sloped face is never a contact). Untapered results are byte-for-byte
    unchanged. Do not raise `TOUCH` to make joints pass; do not drop the check. **Holes are
    ignored** by every check: a hole never decides support — THE ONE EXCEPTION: a bore a SEATED tenon fills makes a joint (inv 58;
    that pair is measured without the tenon, the shoulder still is). A built-tenon part is real-bodied (`realBodied`); **a built
    tenon's wood, tip included, is never a contact** (`stands`, `checkedLevelFaces`). A LEANING part is measured on its leaned bodies; its only
    contacts are its LEVEL faces (±Y within 1e-9; 0.5° is not one).
39. **Support means HELD: every part off the floor is resting, between (≥ 50% coverage of
    both faces of X or Z) or lapped (a broad face; a top contact only under the stated
    one-level conditions), and the piece must not tip.** **PROHIBITION: do not drop (c),
    the coverage threshold, or either half of the top-face clause.** One fault, one report.
    `groundedSet` is the ONE grounding walk. Known limits: follow-up 176. A LEANING part is supported only by RESTING on
    its level faces, or by a joint (d): nothing is held "between" or lapped onto one (fu 438); an unlevelled one is not grounded
    (hint `Level the ends`). Every unleaned pair runs as before. **(d) JOINED (inv 58): a seated tenon holds either of its two
    parts, ONLY toward the floor** (the partner grounded without it, `groundedWithout(i)`), any part, no coverage threshold;
    `groundedSet`'s `joint` connects them. ADDED: the top-face clause's floor test reads `stands[o]` for a built-tenon part, both
    halves otherwise as before.
40. **Anything deciding "same cut" derives from a field table checked by `satisfies`** —
    `CUT_GEOMETRY_FIELDS`, `ANGLE_CUT_FIELDS` (`kind` included), `HOLE_FIELDS` (a count-1 row's
    `pitch` read as 0, fu 338), `CURVE_FIELDS`, `PROFILE_FIELDS`, `BAND_FIELDS`, `TENON_FIELDS` — every field but
    `id`, exact. Do not replace a table with a list in a function body or add an exclusion without
    a written reason. The cut list groups by them as a multiset, ids ignored; `sameShared` compares
    in order, ids included (`alignedTo` adopts the representative's angle-cut, hole-row, profile and tenon ids, only on a match). `cutsThatRemoveStock` decides which cuts are compared; the resulting
    row split on exact dimensions is correct — do not round.
41. **Joinery has one converter (`pocketFor`), never adopts, and is blamed only for what it
    caused.** `pocketFor` is tested against the box in every pose, stores via
    `storedAsShape`. Problems compare by `kind` + `parts`, never message text. Every
    refusal is decided before ANY mutation, and every `resize` is pre-checked by
    `cutIntoEnd`. **ONE decider, `joineryRefusal(entry, …)`: a leaning part (`leaningRefusal`, inv 57), then a round tenon
    (`tenonRefusal`, inv 58) — both also called by Repair (cuts present) and a joined Refine (before `gateUnjoin`) — then angle
    cuts** (`taperConflicts`, `angleConflicts`, `clearsTenon`), one sentence per part. `rebase…` re-anchors angle cuts, holes,
    curves and profiles on resize and `readJoints`' `resizeAt` undoes them; the unjoin gate compares cuts as a MULTISET
    (`sameCutSet`, 1e-9). On a holed, curved, profiled or banded project joinery rules kinds out per site BEFORE the call
    (`featureAllowed`, watched trials; stop ends narrowed to those that clear). **A curve, profile or band is judged in the
    ORIGINAL frame, never on a mid-trial board; the run-through exception is decided per growing face (P7).** Refine carries
    features onto its plain parts BEFORE `runJoinery` (inv 56); a joined Refine is refused up front when an angle cut already runs
    into a joint or a part has a tilted row; a conflicting result comes back UNJOINED, never joined over it.
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
    selector — filter in a memo or handler; a selector may reduce it to a PRIMITIVE. Hidden parts
    are still in the cut list, joinery, checks, export and autosave. Consecutive hide/show toggles
    share ONE undo entry.
44. **`axisFrame` is the ONE turn table; every part↔world crossing goes through its helpers**
    (`toWorldOffset`, `fromWorldOffset`, `spanToWorldOffset`, `spanFromWorldOffset`,
    `endFacing`). **Never `board[dim] - u` at a call site.** Nothing branches on
    `rotation`'s value except `axisFrame`, the migrations, `generated.ts`'s `orient` and
    Properties' Turn select. The one legitimate hand reflection is `mirrorCutAlong` (clip
    first, one sum, no snap; also called by `mirrorCut`); do not tidy it onto the helpers.
    Every posture shares ONE hand (fu 215, v12). **Every other feature reflects by FLAG FLIPS,
    never arithmetic on stations or coordinates** (`mirrorAngleCut`, `mirrorHoleRow`, `mirrorCurveCut`, `mirrorProfile`,
    `mirrorBands`, `leanFlip`, `mirrorTenons`), each with an exact `lower…` inverse reusing an untouched stored array.
    Equivariance tests use `chiralPart` (and kin), never a symmetric fixture; mutate any new one. A part's own mirror (schema 21)
    is the same flips along `mirrorDim` (`mirrorFeatures`; inverse `lowerOwnMirror`); rect cuts are not bit-exact twice.
45. **A link is a SHAPE its users point to; shared fields are stored once.** `LINK_FIELDS`
    is the ONE shared/own table (classify an optional own field with care, fu 231; an optional
    SHARED primitive fails `_sharedPrimitives`' check, so `cornerRule` is stored). `resolveBoard` is
    the ONE place a shape is read into a part. `linksToShapes` is the ONE label→shape builder,
    with two callers (the v10→v11 step and `linkByRole`); both judge equality by `sameShared`
    only — never loosen it. Shared-field edits are written to the Shape (`applyWorldEdits`); the
    only propagation left is `shapeMates` re-pivoting posture. `linkPlan` is the ONE Link decider.
    A one-user shape dissolves (users counted as STORED parts). **`Board.link`, `repairLinks`,
    `dissolveSingletons` and `mates` propagation must not come back.** A shaped part may be its Shape's MIRROR (`mirrored`:
    OWN, shaped parts only, applied by `resolveBoard`); `linkByRole` tries the part, its turns, then mirror candidates.
    `lean` and `tenons` are SHARED (a fresh copy per user; `tenons: []` is a removal, never stored); a shape-mate's patch never
    carries `lean`; `setLean` / `levelEnds` write a Shape once (inv 57).
46. **The tree has ONE composition (`placeBoard`/`placeInstance`), ONE walk
    (`worldParts`), and every edit is written back through `treeEdit.ts`**, changed fields
    only, a moved position lowered as a delta. Path names come only from `flatDocument`.
    - **Two write-back rules: a Properties edit keeps the stored local position; joinery
      passes `keepWorld`.** Do not unify; a new caller picks one. (A leaning part's resize lowers a pivot-keeping delta, a
      third case, inv 57.)
    - Group moves nothing; Ungroup is exact for direct child parts only. Joinery runs on `flatDocument`, maps back by index.
    - Write-back keys on the STORAGE target (`storageKey`); disagreeing edits throw, so the store sends one edit per target
      (`oneEditPerTarget`). An edit in a definition moves every copy: held points re-judged (`judgeHeld`), hidden ids and held
      points re-keyed under every placement (`rekeyEverywhere`).
    - **A mirrored instance (schema 13) is a step inside the ONE composition**; write-back is its exact inverse (`lower`). Across
      a mirror `linkPlan` and `postureRefusal` refuse before any mutation; a Shape is never lowered through two parities in one
      edit (`sameSideFirst`).
    - **A side is chain parity XOR the part's own flag (`sideAt`)**; `LINK_ACROSS_MIRROR` stays on assembly parity. Joinery's
      regroup joins a user only when the Shape resolves EXACTLY to it through its own flag.
    - A `lean` or `tenons` key present as `undefined` REMOVES it (never stored).
47. **Exploded is read-only.** `explode > 0`: `edit()`, `undo` and `redo` are the gate; actions
    with side effects outside `edit()` refuse at entry (`readOnly()`); `setTool` refuses all but
    Select; `setExplode` is the one writer. The UI lock is `EditLock`'s disabled `<fieldset>` (`display: contents`) around
    EDITING regions only; the explode offset is a render-time translation, never written back. **Drawings:**
    `drawView` takes lines from `boardEdges` and `holeDrawingSegments` (one hidden-line pass),
    occluders from the HOLE-FREE `worldBodies` (you cannot see through a hole), and TAGS each
    segment with its feature — tagging changes nothing else. A curved part's edges come through `curveDrawEdges`,
    **visibility judged on the MODEL chord**; silhouettes from `silhouetteLines` (probed along the faces' normals); every model
    edge of a curved or LEANING part carries a probe lift; ONE facing test (`EDGE_ON`). Non-curved drawings are byte-for-byte
    unchanged (`drawingIdentity`).
48. **`boardBodies` is the ONE place angle cuts, curves, profiles and round tenons become geometry, and bodies
    stay CONVEX; `pocketCells` is stock minus RECTANGULAR cuts only.** Anything that draws, edges,
    occludes or probes reads bodies (through `partGeometry`); anything that describes or joins
    rectangular cuts stays on `pocketCells`. A body no feature touches keeps its object/bytes. A
    curve's waste is CLIPPED when the kept wood is convex, else
    SPLIT into merged convex pieces, diagonals peeled LAST. **A SWEPT profile's kept wood is BUILT, never its waste
    subtracted** (`sweep.ts`). A BUILT tenon's waste is two square-span VIEW curves (`geometryBoard`; `squareSpan`: no
    run-out), never shown as curves. Generate/Refine speak every angle
    kind in WORLD words, recognised STRUCTURALLY; **the design schema defines part, direction and `vec3`
    ONCE in `$defs`; the four angle kinds share ONE item shape (`angles`). A new design-form feature joins an existing item
    shape where it can — each new SHAPE costs grammar (fu 322).** The wire form is not the internal form (`toWireDesign`).
49. **A custom material's KIND is in its id** (`m-s-…`, `m-v-…`, `m-p-…`); a stored `kind` that
    disagrees drops the entry, and nothing may change a stored material's kind. Label, colour and
    sheet size come only from a `MaterialCatalog` (`catalogOf(doc)`) — no global registry. **A
    document carries exactly the custom materials its parts, shapes and band types use**
    (`pruneMaterials` on load and in `edit()`; adoption in the SAME edit); every path that makes a
    project from another carries them (Refine's converter BEFORE `migrateDocument`). Generate's
    schema stays byte-identical. Nominal names only on an EXACT section match (metric: the same
    whole mm, `fitsStock`/`mmTicks`); drawings keep actual dimensions.
50. **`holes.ts` is the ONE place holes become geometry; `boardBodies` stays hole-free and
    convex. `holeFaults` is the ONE strict-rule decider** (`breaks-out` — a curve's waste
    included —, `off-flat`, `meets-hole`, `too-deep`, `too-shallow`). An add is
    refused on any fault, an edit only when it ADDS one; a fault a later edit causes is KEPT,
    noted, never clamped. **A row may TILT (schema 23); `holeTilt.ts` is the ONE home of tilt math**; square rows keep their
    paths byte for byte. **A tilted row's faults are EXACT or CONSERVATIVE, never under-reported** (the unclipped mesh path
    trusts them). Bore leg sockets: `legSockets.ts`, the ONE decider; `boreAlongAxis` the ONE coaxial test (`isSocketOf`, the
    tenon joint); a tenoned leg is found by `tenonInSeat` (T9a), the ONE predicate `legsUnder` (plus `isLevelled`) and
    `staleSocketOf` share. **Generate and
    Refine AUTHOR holes through `holeWorld.ts`, the ONE converter** (the grid snaps STORED distances; untouched rows return
    EXACTLY; a strict model fault is KEPT and flagged, never clamped). `drawsAsBox` is the ONE BoxGeometry routing. **A curved
    part's mesh is WATERTIGHT** (`curvesWatertight.test.ts`); a shaped part is ONE geometry (`partMesh`), never memoised on the
    shared bodies. **Rebuild performance breaks silently** (what is memoised where: `docs/invariants.md`). Perf guards are the
    MINIMUM of 9, lowered only, never raised; `sweptIdentity.test.ts` pins swept parts byte for byte. Within-part path chaining
    on paper is intended — do not undo it.
51. **The section cut is view state with ONE writer (`setSection`), never in the document, undo or
    autosave**; reset only where `explode` is. One shared `THREE.Plane` clips on the GPU (no geometry
    rebuild). **Caps come only from `sectionCaps`** (board-local; bores subtracted). **Picking and snapping read only
    `keptBySection`**, guides exempt. Never hand out the local-cap cache's arrays. On the Plans sheet the section drawing comes
    only from `drawView`'s `section` option, always of the ASSEMBLED piece; a sheet with no section is byte-for-byte unchanged.
    A LEANING part's caps come back in leaned WORLD coordinates.
52. **A length becomes text — and text becomes a length — only through `units/length.ts`, with the
    DOCUMENT's own `Units`.** Stored values are inches always; a units switch moves no number.
    Imperial output is byte-for-byte as before (one ruled change, fu 359). Metric: whole mm, a bare
    typed number is mm, holes to 0.1 mm via `holeLengthText`, free drags via `snapToGrid`; field
    bounds compared with a 1e-9 tolerance. Imperial on purpose: trade sizes, Generate's limits,
    model-facing text (dialogs show `shown`). Drawings read BARE mm with one `Dimensions in mm` note
    (repeated per printed page by `@page metric-sheet`).
53. **`curves.ts` is the ONE place curves become outlines; `curveFaults` is the ONE fault decider.**
    A `CurveCut` is a closed WASTE outline of lines and MINOR arcs (`rise` OR `radius`, the other
    derived, never written back); kinds are derived structurally. Authoring refuses an ADDED fault;
    one a resize causes is KEPT and noted. **Every edit is refused when an arc would pass a half
    circle** (the loader would DROP it; fu 416). **A curved part's edges are BUILT**. An
    unknown segment `type` refuses the document. **Edge profiles are stored as `ProfileCut`s and
    every reader goes through `geometryBoard`** (a NEW reader takes the view too); `profileFaults` is
    the ONE profile fault decider, `profilePath.ts` the ONE path home; **the straight fallback** is ONE decision in
    `geometryBoard`. Curves and Profiles refuse an edit that ADDS a fault to ANY profile. **Generate and Refine AUTHOR profiles
    through `profileWorld.ts`, the ONE converter**, except on a part with curves or any two-side run (`carriesProfiles`, the ONE
    predicate), whose profiles stay carried and are never fed to the model.
54. **`banding.ts` is the ONE place band numbers are computed** (core, strips, tape runs, faults),
    numbers-only, memoised and deep-frozen. **The model is the FINISHED size; the cut list prints the
    CORE**; bodies are untouched. **A faulted band adds nothing** and prints `— check: <words>`.
    Authoring refuses an ADDED fault; a later one is KEPT. **Generate and Refine AUTHOR bands through `bandWorld.ts`, the ONE
    converter** (`mintBandTypes`, one design-wide pass), except on a part with curves, whose bands stay carried (inv 56);
    `cornerRule` is always carried. A strip, tape run and glue line count only the VISIBLE run (`visibleRun`). A strip row has no
    `boardIds`: every reader of a row's parts handles an empty list. A band-free document is byte for byte as before
    (`bandFreeIdentity.test.ts`). The viewport paints a band by MOVING triangles into material groups 6+, never by recolouring a
    slot; `glueLines` is the ONE glue-line geometry.

55. **`hardware.ts` is the ONE place hardware is counted** (a part per placement, `placementsOf`, pinned against `worldParts`;
    an assembly per placement of its definition; the project once; hidden parts count). **Hardware never groups the cut list,
    never touches geometry, and every Definition copy carries it** (Ungroup merges it, REFUSED above 999). `hardware` is SHARED
    (inv 45). **`holderHardware` returns STORED arrays, never `resolveBoard`'s copy** (a selector returning a fresh array crashes
    React). Refine carries it by flat name (assembly hardware from the STORED definitions; inv 56); joinery and Repair accept it.
    Hardware is typed, never derived from holes.

56. **Refine keeps a featured part's posture and rotation by ONE decision, `keptFrame` (the prohibition below).** The carry (`featureCarry.ts`, by flat name, in the ORIGINAL frame) lands before `migrateDocument` and before `linkByRole`. A part the model turned is `orient`ed like its plain twin, the exact swaps skipped; `turnCandidates` never turns a part with curves or carried profiles. A resize keeps features at their stored stations (faults KEPT, noted); a turned featured part is a fault fed to the repair loop; the done view's `carried` list is computed plain-to-plain BEFORE `runJoinery`. **PROHIBITION: do not `orient` a part with carried curves or carried profiles (a run on two sides, `carriesProfiles`), nor a part whose only frame features are holes, bands and/or authored profiles whose returned box keeps every world extent's rank against the original's (ties allowed both ways) AND still has a smallest extent on the original's thickness axis unless that thickness was not the original's smallest (the ONE decision is `keptFrame` in `convertPart`), and do not move the carry after `migrateDocument` or `linkByRole`.**
    A LEANING part, one with a TILTED hole row, or one with a round tenon is KEPT exactly (`keepsExactly`, `keptParts`; invs 57,
    58): put in FIRST, verbatim, in the carry's slot; a model part reusing its name is dropped; no floor shift while one is kept;
    one inside an assembly refuses Refine, and so does a joined Refine.

57. **A lean is placement, and `lean.ts` is its ONE home** (schema 22). `Board.lean` (SHARED) stores turn-0 SLOPES (degrees only in
    display and typed input), only when non-zero (a zero lean is no lean), only on an UPRIGHT part, always seam-free. **A lean-free document is byte for byte as before.** `position`
    stays the PRE-lean min corner; the lean turns about the PIVOT (the top's centre), which a resize keeps. **Mirrors flip it
    by `leanFlip` only.** **R1:** every part→world crossing composes it (`cuts.ts`' group-relative helpers stay lean-free).
    **R2:** extents come from `partBounds`; **a leaning part's pre-lean box is never presented as its extent.** **R3:** no
    box fast path. Drags round the DELTA. Level the ends (`levelEnds.ts`): two end miters, lengths rounded UP, the top through R;
    never automatic; holes kept in the wood; on a tenoned end it levels the tip and keeps the tenon. Checks extended, never
    weakened (a joint holds a leaning part too, inv 39 (d)); joinery and Repair refuse, Refine keeps; the cut list ignores it.

58. **A round tenon is a STORED feature of a part's end, and `roundTenons.ts` is its ONE home** (schema 24). `Board.tenons?`
    (`{ id, end, diameter, length }`, at most one per end, `min` first): coaxial, centred, the shoulder square to the axis, `length`
    from the shoulder to the end's centre, inside the part's length (a typed tenon never changes `length`). **A tenon-free part
    has NO `tenons` key — never `[]`, never `undefined` — and is byte for byte as before.** **`tenonFaults` is the ONE fault
    decider** (CONSERVATIVE boxes, never under; copy only in `tenonText.ts`): an add refuses any fault, an edit only an ADDED one,
    a later one is KEPT and noted; **a faulted tenon builds nothing** (`builtTenons`). A tenoned end is square or carries ONE end
    miter, the tip. **The joint** (`tenonJoints.ts` `seatedIn`, in the world): the tenon builds; a single bore of another part;
    the same diameter (1e-9); coaxial (`boreAlongAxis`); entered by more than `TOUCH`; a blind bottom not passed by the tip's
    FURTHEST point; first match wins. **Support is never granted by proximity.**

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 8659 tests across 242 files (timing guards can fail under load; re-run on a quiet machine before claiming a regression)
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck; run `npm run build` before claiming anything compiles.

## Open follow-ups

**`docs/follow-ups.md` is authoritative** (1–466). Every entry's LAST `**Status:**` line governs; all 380 were triaged
2026-10-16 (numbers 24, 25, 97, 131, 157, 158 each name two entries, never renumber).
This list is the triage's open set — when an entry's status changes, change it here too, or delete the number; some entries close mid-line, so read an entry whole.

- **Feature-sized (need a spec):** 253 and 265 (schema bumps); 257, 258, 268, 270, 271, 274; 404–407 (hardware); angle cuts
  275, 276 (joint kinds only), 280; holes 330, 331, 334; curves 363 (authoring; design checks reading curved bodies),
  364–366; banding 399, 400; splayed legs 438 (chunk 3, stretchers), 449, 450; round tenons 457, 458, 460.
- **Owed to the user, not code:** real hardware — 26a, 21, 28, 34, 39, 255, 337, 347, 370 (369's pinholes), 402(1); by eye —
  142, 272, 319, 380(1), 384(2), 387(1), 392(2), 393, 394 (`docs/rounds.md`); 350 (section markers by hand); 106 (touch/pen);
  153 (a browser at quota); a real print — 357 (Brave, metric margin), 402(2); copy — 454 (angled holes), 464 (round tenons); by eye — 465 (round tenons); paid runs 172, 177, 283. 336's grain seam waits for a texture/shader session.
- **Open, cosmetic and not small:** 33 (one drawn ring centre for every board's end grain).
- **Open by decision:** 130 (ask before assuming it is wanted), 147, 163's residue (do not re-open unasked), 176, 207, 225,
  232, 241, 295, 315 (needs 232), 349 (ask first), 389 (ask first), 393(2) (left as is 2026-10-19), 396, 397 and 408 (only
  when a real project needs it), 417 (ask first), 431 (left as is 2026-10-23; do not re-open unasked). Record-only: 401, 403, 409, 413 (ask first), 414, 418, 420–429, 433 (ask first), 434, 435.
- **Open, splayed legs (2026-10-24):** 436 and 439 (ask first), 441 (by decision), 442, 443, 445; record-only 440, 446. Angled
  holes (2026-10-25): 448 and 453 (ask first), 451, 452; owed to the user 454 (copy); record-only 455, 456. Round tenons
  (2026-10-25): 459 and 463 (ask first); record-only 461, 462, 466.
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
