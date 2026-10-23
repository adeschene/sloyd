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

- **Production: `424c184`, bundle `index-D3k3tvUe.js`, CSS `index-Cj7r9G0C.css`, SCHEMA 20** (Generate and Refine author hole
  rows, fu 329: `holeWorld.ts`, inv 50/56; deployed 2026-10-23). Owed to the user: see NEXT.
- **Rollback:** every deploy back to `98c7df4` (hardware, `index-BZhrLswD.js`) is schema 20 and free (rolling back past `424c184`
  only stops Claude authoring holes; past `98f8296`, Refine refuses featured projects again). The nearest refusing boundary is
  `4a6d6a1` (band wording, `index-QDQAnB8n.js`, schema 19): it REFUSES every project saved at 20 — export first. Full table:
  `docs/rounds.md`; runbook: `DEPLOYMENT.local.md`.
- **NEXT (audited 2026-10-23):** nothing is pending deploy and no plan exists; no follow-up is open as code-sized work.
  Owed to the user: the AI-holes round's look (pin rows and knob holes in the viewport and on the Plans sheet), whether "move the pins"
  should move both rows, and the change list's world-face words (`docs/rounds.md` Status log); the refine-features round's look and
  check-list words; joinery chunk 3's words and spec amendments and fu 419's part note; chunk 2's; fu 402(1)–(2); fu 410–412.
  As the user directs: the rest of Open follow-ups below (417 ask first; 429 ask first).
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

**Rollback cost is a schema question.** A build understanding less than the file's version (20 since the hardware round, deployed 2026-10-21)
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
`shown` copy, fu 355; its model `message` stays decimal inches), and `sectionView.ts` (the section's heading), and `bandText.ts` (the band line and the core note; `banding.ts` stays numbers-only).
`snapPoints.ts` and `row.ts` deliberately do not. Do not generalise to "everything under
`document` imports `formatLength`". A TYPE-only import of `Units` is not an edge (`types.ts`, `geometry.ts`' `snapStep`), nor is `gridDensity.ts`' `isMetric` (the
ground grid's ladder is a display choice of the project's units, not a string).

**Storage seam:** all persistence — autosave, export, import — goes through
`StorageAdapter`, imported only from `storage/index.ts` (fu 8; `storage/seam.test.ts` guards it). Nothing else touches
`localStorage` or the filesystem. A desktop build
would be a second implementation, not a parallel path.

### Versioning

Every load path (open, import, autosave-restore) runs `migrateDocument` before the
document is trusted. `CURRENT_VERSION` is **20**. Steps run one version at a time, in
order, on RAW data before `validateBoard` (inv 11) — except v10→v11 and v11→v12, which run after.
The step table — what each step adds, validates, drops and refuses, and the harm a build one version back
would do — is `docs/versioning.md`; update it
with every bump.

- **A bump exists for the refusal gate, not for upgrading** — absent fields default
  regardless. Argue *your* field's harm; don't inherit another bump's argument. A content-keyed
  refusal (an unknown kind or segment type) needs no bump.
- **v8's and v12's steps are NOT idempotent** (they mirror): the `d.version < 8` and
  `d.version < 12` guards are all that stop a file being re-mirrored on every load.
- **v10→v11 runs after validation**, guarded by `d.version < 11`, before `repairTree`,
  because it needs validated values and world order to judge equal link members (spec
  §8.3). Each link becomes one `Shape` from its first member; equal members become shaped
  parts; a differing member stays plain. `link` is read only from a file below v11.
- `validateShapes` drops a malformed shape (claiming no id) and a duplicate id (first
  wins); a definition whose id is literally `ROOT` is dropped (the write-back's root id).
  `repairTree(doc, { copyShared: version < 11 })` runs on every load (inv 46).
- A malformed entry is DROPPED; a faulted but well-formed one is KEPT (holes, curves, profiles,
  bands alike).

## Where things live

The annotated tree, file by file, is `docs/module-map.md` — keep it current when a file is added
or its role changes. Where a file's own doc comment is the stated single source of truth —
`tapeHover`'s clearing enumeration, `tapeAxis`'s structural rule, `TapeAxis`'s world-vs-board-local
argument, `woodCut`'s seam argument, `App.tsx`'s `pending` — **read it there.** The ONE homes:

| Concern | Home |
|---|---|
| lengths ↔ text | `units/length.ts` (inv 52); nominal names `units/nominal.ts` |
| schema, load, migrate, ids | `document/types.ts`, `document.ts` (inv 11, 33), `ids.ts` |
| turns, extents | `document/geometry.ts` `axisFrame` (inv 44, 2) |
| composition, walk, write-back | `frames.ts`, `tree.ts` `worldParts`, `treeEdit.ts` (inv 46) |
| shapes / links | `shapes.ts` `resolveBoard`, `links.ts` `LINK_FIELDS`, `linksToShapes.ts` (inv 45) |
| rectangular cuts | `cuts.ts` (`CUT_GEOMETRY_FIELDS`, `cutShape`, `clippedRegion`; inv 40) |
| angle cuts | `angleCuts.ts`, `angleText.ts`, `angleWorld.ts` / `taperWorld.ts` (inv 48) |
| holes | `holes.ts`, `holeFaults.ts`, `holeText.ts`, `holeDrawing.ts`; AI authoring `holeWorld.ts`, `holeDesignFaults.ts` (inv 50) |
| curves | `curves.ts`, `curveDrawing.ts`, `curveText.ts` (inv 53) |
| edge profiles | `profiles.ts` (`geometryBoard`), `profilePath.ts`, `skeleton.ts`, `sweep.ts`, `runout.ts`, `sweptEdges.ts`, `sectionEdges.ts` (inv 48, 53) |
| hardware | `hardwareModel.ts`, `hardware.ts` (inv 55) |
| edge banding | `bandModel.ts`, `banding.ts`, `bandText.ts`, `viewport/bandFaces.ts` (inv 54) |
| bodies and edges | `bodies.ts` `partGeometry` / `boardBodies` / `edgesOf`, `seams.ts`, `outline.ts` (inv 16, 48) |
| refusals of joinery/Repair; Refine's carry | `document/featureCarry.ts` + `carryText.ts` (Refine carries features, inv 56), `generate/joints/featureZones.ts` (per-site ruling-out), `document/featureRegions.ts`, `sites.ts` `rangesOf` (stop insets), `ruledOutText.ts`, `angledRefusal.ts`, `generate/joints/tapers.ts` `joineryRefusal` |
| cut list, nesting, Buying | `cutlist.ts` (inv 18), `nesting.ts` (inv 19, 22, 23), `purchase.ts`, `materials.ts` (inv 49) |
| drawings | `drawing.ts` `drawView` (inv 47), `diagram.ts`, `plans.ts`, `featureKeys.ts`, `sectionView.ts`, `section.ts` (inv 51) |
| design checks / AI | `designCheck.ts` (inv 38, 39), `generated.ts`, `refineDesign.ts`, `roleLinks.ts`, `generate/` (inv 41) |
| state | `store/store.ts` (inv 4, 24, 34, 42–47), `visibility.ts` (inv 43) |
| persistence | `storage/` only, through `storage/index.ts` (invs 7, 29–31) |
| viewport | `viewport/` — NO unit tests by design except the pure helpers and perf/watertight guards; `grainTiling.ts` (`drawsAsBox`, `bodyMesh`, `partMesh`, `holesMesh`) |
| panels | `panels/` — one section per feature (AngleCuts, Holes, Curves, Profiles, Banding), each over a pure refusal module |

**Test-only modules** (never import a test module — it re-registers its suite): `treeFixtures.ts`,
`turnFixtures.ts`, `curveFixtures.ts`, `sweepFixtures.ts`, `meshCases.ts`, `shakerTableFixture.ts`.

### Per-file rules not covered by an invariant

- **`snapPoints.ts`**: local→world is `position[axis] + toWorldOffset(board, axis,
  local[axisFrame(board)[axis].dim])`. `pointToLocalXYZ` and `solidWorldBox` are
  CENTRE-relative and both look like they do this — using either puts every point off by
  half the board, plausibly. Pin with a rotated, non-flat pose. `towardFor` is the tape's
  ONE direction source (preview and commit); a locked axis wins over a hover, never falls
  back to it. `sameSnapPoint` lives here because the store needs it.
- **`cutlist.ts` / `diagram.ts`**: a group's key is its rows' key prefix (`groupFields`; fu 54). Format from `cutShape`, never from stored
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
  A cut a later resize pushed past its part is KEPT and noted (`… at this size.`); an edit is refused only when it would
  overrun by MORE than the stored cut does (fu 296, the holes/curves precedent).
- **`nesting.ts`** takes `doc.boards`, NEVER `CutListRows`; too-big parts go in
  `unplaceable`, never dropped. The word `turned` rides on `dims` (inv 19).
- **`SheetLayout.tsx`** is the only caller of `fitLabel`'s `requireDetail`; the tier
  decision stays in `fitLabel`, not as a panel override. The sheet key list is NOT an
  `<ol>` (the number comes from `nextIndex`, not DOM position; fu 162). A part that cannot hold even its NUMBER
  (`holdsIndex`) is a callout (fu 96): the number in a row outside the drawing's nearer long edge (`packRow`, measured boxes,
  ordered by the part's centre), a leader from the part's near edge to its own number; the row exists only when used, so a
  drawing with no callouts keeps its viewBox. A long leader across another part is accepted (the user's ruling).
- **`plans.ts` keying**: a STORED part (container id + part id) is keyed by the first trio that keys it (`claimed`; fu 381(4),
  the user's ruling: no duplicate labels) — only assembly trios can share one.
- **`featureKeys.ts` / `planKeys.ts`** (feature callouts): a key line is built only in `partFeatures` (hole sizes through
  `holeSizeText`/`holePitchText`, the bench line's own home; the four-corner collapse through `curveLineEntries`), never in the
  panel. A tag sits only on a segment `drawView` tagged for its feature (inv 16); tagging never changes a segment, its order
  or the visible/hidden split (`drawingIdentity.test` hashes the drawing with tags stripped). Angle cuts are tagged by
  plane membership (`keptHalfSpace`'s plane is `n·x + d = 0`), so `bodyEdges` is untouched. View order: true and visible,
  visible, true and hidden, any hidden (ties Front, Side, Plan). A part's features are keyed by the innermost LISTED
  assembly's trio (`keyed`), so each feature once per sheet; same-letter tags within a diameter merge, others are pushed out
  along their leaders and clamped inside the figure, and a tag that still overlaps is not drawn and its letter is noted.
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
  `storage.available` (the ADAPTER flag, never React's `available`; fu 159). A row click closes the menu at once; `onOpen`
  resolves null or why the project cannot be opened (`storage.readProject`, asked only on failure so the switch path keeps
  `loadProject`), and a failure reopens the menu on that row with the message, focus on the caret (fu 35). Escape focuses the
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
   (post-patch extents). `grain`, `cuts`, `angleCuts`, `holes`, `curves`, `profiles`, `bands` and
   `cornerRule` are absent from the reorient predicate (they move nothing), so they have their own
   store actions. A future tool that moves *and* turns in one gesture must carry its own `position`
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
16. **Edge lines come from `boardEdges` (`pocketEdges`, or `bodyEdges` once a part has angle
    cuts; `curvedEdges` for a curved part — `edgesOf` is the three-way choice), not from the
    solids. A marker or line must sit on a feature that is actually drawn.** No facet lines: a
    hole draws rims, never wall facets; a curve draws its outline and a through line only at a
    SHARP vertex (judged on the true arc, suppressed per INTERVAL, never as a whole line); a
    stopped profile's run-out and a swept profile draw none (`smoothPair`, `sweptSmoothPair`),
    creases at sharp section vertices stay. **A run-out joins only faces of its own path end**,
    read off `BodyFace.stop` and the path, never the bare `runout` tag. **The fast swept edge path
    skips edges but never faces, and decides a line between two section faces only where both
    cover the same stretch** (`coveredBothSides`); everything else, and every `overlap` face, goes
    through `bodyEdges` with every face. Snap-point exceptions: a hole's centre and an arc's
    centre may sit in air (the centre of a drawn rim/arc); waste is air to `stockProbe`
    (`profileAirTester`, `sweptAirTester`), P3's on-arc points excepted.
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
    is re-minted (never all of them), and `seen.add` lives inside `takeId`. Scopes: part and
    instance ids per container; definition, shape and band type ids per document; cut ids per
    board (per shape for a shape), and so angle-cut, hole and curve ids; profile ids share the
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
    ignored** by every check: a hole never decides support.
39. **Support means HELD: every part off the floor is resting, between (≥ 50% coverage of
    both faces of X or Z) or lapped (a broad face; a top contact only under the stated
    one-level conditions), and the piece must not tip.** **PROHIBITION: do not drop (c),
    the coverage threshold, or either half of the top-face clause.** One fault, one report.
    `groundedSet` is the ONE grounding walk. Known limits: follow-up 176.
40. **Anything deciding "same cut" derives from a field table checked by `satisfies`** —
    `CUT_GEOMETRY_FIELDS`, `ANGLE_CUT_FIELDS` (`kind` included), `HOLE_FIELDS` (a count-1 row's
    `pitch` read as 0, fu 338), `CURVE_FIELDS`, `PROFILE_FIELDS`, `BAND_FIELDS` — every field but
    `id`, exact. Do not replace a table with a list in a function body or add an exclusion without
    a written reason. The cut list groups by them as a multiset, ids ignored; `sameShared` compares
    in order, ids included (`alignedTo` adopts the representative's angle-cut and hole-row ids, only on a match). `cutsThatRemoveStock` decides which cuts are compared; the resulting
    row split on exact dimensions is correct — do not round.
41. **Joinery has one converter (`pocketFor`), never adopts, and is blamed only for what it
    caused.** `pocketFor` is tested against the box in every pose, stores via
    `storedAsShape`. Problems compare by `kind` + `parts`, never message text. Every
    refusal is decided before ANY mutation, and every `resize` is pre-checked by
    `cutIntoEnd`. Angle cuts: one decider, `joineryRefusal` (`taperConflicts`,
    `angleConflicts`, `clearsTenon`), one sentence per part; `rebaseAngleCuts` re-anchors on
    resize and `readJoints`' `resizeAt` undoes it exactly. The unjoin gate compares cuts as a
    MULTISET (`sameCutSet`, exact at 1e-9). On a holed, curved, profiled or banded project joinery rules kinds out per site BEFORE the call (`featureAllowed`, watched trials; per-site ruling-out, units and the zone tests: `docs/invariants.md`); stop ends are narrowed to those that clear (one decider); a stopped dado's smallest inset clears a receiver band. **A curve, profile or band is judged in the ORIGINAL frame (P5, P9; a band as stored), never on a mid-trial board; the run-through exception is decided per growing face (P7)**; a curve or straight profile that only meets a growing end is exempt when its end-face waste clears the tenon section (fu 415). `rebaseHoles` / `rebaseCurves` / `rebaseProfiles` re-anchor on resize and `resizeAt` undoes them; `sameJoined` compares holes (within `GATE_TOLERANCE`), curves, profiles and bands (exact). Refine carries features onto its plain parts BEFORE `runJoinery` (inv 56). A joined Refine is refused up front when an angle cut
    already runs into a joint; a conflicting result comes back UNJOINED, never joined over it.
42. **A group move rounds the GROUP's min corner once and adds one delta
    (`moveGroupTo` → `translateBoards`); one selected part keeps the separate single-part
    path.** Do not unify them; do not round inside `translateBoards`. `selectionPatch` is
    the ONE writer of a user's selection change. A selection change mid-drag ends the
    gizmo's gesture and commits nothing.
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
    never arithmetic on stations or coordinates** — `mirrorAngleCut`, `mirrorHoleRow`,
    `mirrorCurveCut` (`side` never flips), `mirrorProfile` (a station run's ends swap on every
    mirror), `mirrorBands` (`cornerRule` never flips) — each with an exact `lower…` inverse that
    reuses an untouched stored array. Equivariance tests use `chiralPart` (`chiralCurved`,
    `chiralTwoSide`), never a symmetric fixture; mutate any new one.
45. **A link is a SHAPE its users point to; shared fields are stored once.** `LINK_FIELDS`
    is the ONE shared/own table (classify an optional own field with care, fu 231; an optional
    SHARED field fails `_sharedPrimitives`' check, so `cornerRule` is stored). `resolveBoard` is
    the ONE place a shape is read into a part. `linksToShapes` is the ONE label→shape builder,
    with two callers (the v10→v11 step and `linkByRole`); both judge equality by `sameShared`
    only — never loosen it. Shared-field edits are written to the Shape (`applyWorldEdits`); the
    only propagation left is `shapeMates` re-pivoting posture. `linkPlan` is the ONE Link decider.
    A one-user shape dissolves (users counted as STORED parts). **`Board.link`, `repairLinks`,
    `dissolveSingletons` and `mates` propagation must not come back.**
46. **The tree has ONE composition (`placeBoard`/`placeInstance`), ONE walk
    (`worldParts`), and every edit is written back through `treeEdit.ts`**, changed fields
    only, a moved position lowered as a delta. Path names come only from `flatDocument`.
    - **Two write-back rules: a Properties edit keeps the stored local position; joinery
      passes `keepWorld`.** Do not unify; a new caller picks one.
    - Group moves nothing; Ungroup is exact for direct child parts only.
    - Joinery runs on `flatDocument`, maps back by index.
    - Write-back keys on the STORAGE target (`storageKey`); disagreeing edits throw, so the
      store sends one edit per target (`oneEditPerTarget`). An edit in a definition moves
      every copy, so held points are re-judged (`judgeHeld`) and hidden ids/held points are
      re-keyed under every placement (`rekeyEverywhere`).
    - **A mirrored instance (schema 13) is a step inside the ONE composition**; write-back is its
      exact inverse (`lower`). Across a mirror, `linkPlan` and `postureRefusal` refuse before any
      mutation (one decider shared by store and panel); a Shape is never lowered through two
      parities in one edit (`sameSideFirst`). Full rules: `docs/invariants.md`.
47. **Exploded is read-only.** `explode > 0`: `edit()`, `undo` and `redo` are the gate; actions
    with side effects outside `edit()` refuse at entry (`readOnly()`); `setTool` refuses all but
    Select; `setExplode` is the one writer. The UI lock is `EditLock`'s
    `<fieldset class="edit-lock" disabled>` (`display: contents`) around EDITING regions only
    (fu 262). The explode offset is a render-time translation, never written back. **Drawings:**
    `drawView` takes lines from `boardEdges` and `holeDrawingSegments` (one hidden-line pass),
    occluders from the HOLE-FREE `worldBodies` (you cannot see through a hole), and TAGS each
    segment with its feature (`Seg2.feature`) — tagging changes nothing else. A curved part's
    edges come through `curveDrawEdges`: drawn as a fine path, **visibility judged on the MODEL
    chord**, edge-on views unrefined; silhouettes from `silhouetteLines` (probed along the faces'
    normals, never from the vertex); every model edge carries a probe lift (`curveEdgeLifts`);
    ONE facing test (`EDGE_ON`, `facing()`, fu 386). Run-out lines and swept arcs stay MODEL
    chords (P19). Non-curved drawings are byte-for-byte unchanged (`drawingIdentity`).
48. **`boardBodies` is the ONE place angle cuts, curves and profiles become geometry, and bodies
    stay CONVEX; `pocketCells` is stock minus RECTANGULAR cuts only.** Anything that draws, edges,
    occludes or probes reads bodies (through `partGeometry`); anything that describes or joins
    rectangular cuts stays on `pocketCells`. A body no feature touches keeps its object/bytes. A
    curve's waste is CLIPPED when the kept wood is convex (`curvePlan`, the strengthened P6), else
    SPLIT into merged convex pieces (`convexPieces`), diagonals peeled LAST. A stopped profile
    subtracts its band plus `runoutPieces`. **A SWEPT profile's kept wood is BUILT, never its waste
    subtracted** (`sweep.ts`: skeleton bands × the kept section, plus the rest of the outline). A
    b2 stop's run-out is built in its station's MODEL-chord frame (`stopRunoutPieces`); a stop never
    clips the band, a B1 station clips only its own END of it. Generate/Refine speak every angle
    kind in WORLD words, recognised STRUCTURALLY; **the design schema defines part and direction
    ONCE in `$defs`** (`vec3` stays inline; the API's grammar cap; fu 322 before any change).
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
    included, keyed apart by `faultKey` —, `off-flat`, `meets-hole`, `too-deep`). An add is
    refused on any fault, an edit only when it ADDS one; a fault a later edit causes is KEPT,
    noted, never clamped. **Generate and Refine AUTHOR holes through `holeWorld.ts`, the ONE converter** (`holeRowsFor`; the hole grid snaps the STORED distances, never world offsets; shape faults, a stored number past MAX_MAGNITUDE included, reject the part, reason `'hole'`); untouched rows return EXACTLY through the exact-row map (`originalHoles`, `sameHoles` as a set; only in a kept frame, inv 56), in the original order when every row is restored; a strict fault from the model is KEPT and flagged (`holeDesignFaults`, `'hole-fault'`), never rejected or clamped. Joinery rules out only the joint kinds whose zone a hole enters (inv 41); Repair accepts them. `drawsAsBox` is the ONE
    BoxGeometry routing; a part with no holes and no curves keeps its bytes. **A curved part's mesh
    is WATERTIGHT** (welded, conformed, centroid-fanned; `curvesWatertight.test.ts`); a shaped part
    is ONE geometry (`partMesh`), never memoised on the shared bodies. **Rebuild performance breaks silently** (the list of what is memoised and where: `docs/invariants.md`). Perf guards are the MINIMUM of
    9, lowered only, never raised; `sweptIdentity.test.ts` pins swept parts byte for byte. Within-part path chaining on paper is intended — do not undo it.
51. **The section cut is view state with ONE writer (`setSection`), never in the document, undo or
    autosave**; reset only where `explode` is. One shared `THREE.Plane` clips on the GPU (no geometry
    rebuild). **Caps come only from `sectionCaps`** (board-local; ONE winding before `minusPrism`;
    bores subtracted). **Picking and snapping read only `keptBySection`**, guides exempt. Never hand
    out the local-cap cache's arrays. On the Plans sheet the section drawing comes only from
    `drawView`'s `section` option and its caps from `sectionCaps`, always of the ASSEMBLED piece; a
    sheet with no section is byte-for-byte unchanged.
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
    circle** (the loader would DROP it; it alone holds one within 4 ulps of its coordinates to the bound, fu 416). **A curved part's edges are BUILT** (`curvedEdges`). An
    unknown segment `type` refuses the document. **Edge profiles are stored as `ProfileCut`s and
    every reader goes through `geometryBoard`** (a NEW reader takes the view too); `profileFaults` is
    the ONE profile fault decider; `profilePath.ts` the ONE path home. Faults and decisions read the
    tangent point (`profilePath`); B1's ε and Q13's zone are construction only. **The straight
    fallback** is ONE decision in `geometryBoard` (stops first, `stopFallsBack`; a two-side run never
    falls back). Curves and Profiles refuse an edit that ADDS a fault to ANY profile, naming it. Refine carries them (inv 56); joinery rules out only the joint kinds whose zone one enters; Repair accepts them.
54. **`banding.ts` is the ONE place band numbers are computed** (core, strips, tape runs, faults),
    numbers-only, memoised and deep-frozen. **The model is the FINISHED size; the cut list prints the
    CORE**; bodies are untouched. **A faulted band adds nothing** and prints `— check: <words>`.
    Authoring refuses an ADDED fault; a later one is KEPT. Refine carries them (inv 56); joinery rules out only the joint kinds a band is in the way of (inv 41);
    Repair accepts them; a strip, tape run and glue line count only the VISIBLE run (`visibleRun`, P12). A strip row has no `boardIds`: every reader of a row's parts handles an empty list. A
    band-free document is byte for byte as before (`bandFreeIdentity.test.ts`). The viewport paints a
    band by MOVING triangles into material groups 6+ (`bandedMesh`), never by recolouring a slot;
    `glueLines` is the ONE glue-line geometry; band types reach the drawings as an OPTIONAL argument.

55. **`hardware.ts` is the ONE place hardware is counted** (a part per placement via `placementsOf`, its own walk whose agreement with
    `worldParts` is pinned by the oracle test; an assembly per placement of its definition, the project once; hidden parts count). **Hardware never groups the cut list, never touches geometry, and every Definition copy
    carries it** (Ungroup merges it into the parent, REFUSED above 999 — P1). `hardware` is a SHARED field (inv 45). **`holderHardware`
    returns STORED arrays, never `resolveBoard`'s copy** (a selector returning a fresh array crashes React). Refine carries hardware
    on parts by flat name from the RESOLVED flat part (a shaped part's Shape included); only ASSEMBLY hardware reads the STORED definitions
    (`flatDocument` empties them, P2; inv 56); joinery and Repair accept it. Hardware is typed, never derived from holes.

56. **A part Refine carries curves, profiles or bands onto keeps the original's posture and rotation (`frameFor`); a part whose only frame features are holes keeps it only while every world extent keeps its rank against the original's (ties allowed both ways) and its thickness's world axis is still a smallest extent (unless the original's thickness was not its smallest). Never `orient` either otherwise.** The carry (`featureCarry.ts`, by flat name, in the ORIGINAL frame) lands before `migrateDocument` (band and hardware
    types through `designToDocument`'s opts) and before `linkByRole`. Holes are no longer carried (inv 50: authored in world words) but `hasFrameFeatures` still counts them (hardware never); a holes-only part the model turned (any strict rank inversion of its world extents: onto another face, C1, or in plan, R1; or, from an original tied at its smallest extent, a thickness axis no longer smallest — the tie clause) is `orient`ed like its plain twin, the exact-row swap skipped, its holes converted from the model's world words; `turnCandidates` never turns a part with curves, profiles or
    bands, and re-stores a holed part through world forms with an exact set. A resize keeps features at their stored stations (faults KEPT, noted); a turned featured part is a fault fed to the repair loop
    (`'feature-turned'`); the done view's `carried` list is computed plain-to-plain BEFORE `runJoinery`. **PROHIBITION: do not `orient` a part that carries curves, profiles or bands, nor a holes-only part whose returned box keeps every world extent's rank against the original's (ties allowed both ways) AND still has a smallest extent on the original's thickness axis unless that thickness was not the original's smallest (the ONE decision is `keptFrame` in `convertPart`), and do not move the carry after `migrateDocument` or `linkByRole`.**

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 7711 tests across 221 files
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck; run `npm run build` before claiming anything compiles.

## Open follow-ups

**`docs/follow-ups.md` is authoritative** (1–430). Every entry's LAST `**Status:**` line governs; all 380 were triaged
2026-10-16 (tagged `(triaged 2026-10-16)`; numbers 24, 25, 97, 131, 157, 158 each name two entries, never renumber).
This list is the triage's open set — when an entry's status changes, change it here too, or delete the number; some entries close mid-line, so read an entry whole.

- **Feature-sized (need a spec):** 253 and 265 (schema bumps); 257, 258, 268, 270, 271, 274; 404–407 (hardware); angle cuts
  275, 276 (joint kinds only), 280; holes 330, 331, 334; curves 363 (authoring; design checks reading curved bodies),
  364–366; banding 399, 400; profiles and bands authored by Claude 430.
- **Owed to the user, not code:** real hardware — 26a, 21, 28, 34, 39, 255, 337, 347, 370 (369's pinholes), 402(1); by eye —
  142, 272, 319, 380(1), 384(2), 387(1), 392(2), 393, 394 (`docs/rounds.md`); 350 (section markers by hand); 106 (touch/pen);
  153 (a browser at quota); a real print — 357 (Brave, metric margin), 402(2); paid runs 172, 177, 283; 410–412 (hardware
  wording); the specs' *Amended* rulings and words (curves, profile runs, section views: `docs/rounds.md`, Owed to the user;
  joinery features chunks 2–3: NEXT). 336's grain seam waits for a texture/shader session.
- **Open, cosmetic and not small:** 33 (one drawn ring centre for every board's end grain; 37's seed attempt reverted by ruling).
- **Open by decision:** 130 (ask before assuming it is wanted), 147, 163's residue (do not re-open unasked), 176, 207, 225,
  232, 241, 295, 315 (needs 232), 349 (ask first), 389 (ask first), 393(2) (left as is 2026-10-19), 396, 397 and 408 (only
  when a real project needs it), 417 (ask first). Record-only: 401, 403, 409, 413 (ask first), 414, 418, 420–429.
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
