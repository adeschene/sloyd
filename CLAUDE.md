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
three dimensions, not just its length), and log-derived grain textures. Static SPA,
containerized, 307/307 tests passing.

Host-specific deployment detail — hostname, container name, proxy configuration, and
the manual steps a human has to perform — lives in `DEPLOYMENT.local.md`, which is
gitignored. Read that file before deploying; it is not in the public repo.

Joinery (dados/rabbets) is next, with its own spec and version label after v3 — see
the v3 spec's non-goals (`docs/superpowers/specs/2026-07-31-sloyd-v3-design.md`,
section 8). The cut list stays behind that. **Next up is joinery**, then the cut
list. The parametric board model exists specifically to make both cheap to add.

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

1. **`units`** and **`document`** — both leaves of the dependency graph; each imports
   nothing from the rest of the app. `units` parses/formats fractional inches (e.g.
   `24 1/2"`). `document` owns the document schema, board geometry, validation, and
   versioned migration. `document/names.ts` is a leaf alongside it, importing only the
   `Board` type.
2. **`store`** (Zustand + snapshot-based undo/redo) and **`storage`** (the
   `StorageAdapter` seam) — both sit above `document`.
3. **`viewport`** (react-three-fiber scene, camera, grid, gizmo) and **`panels`**
   (React forms: toolbar, parts list, properties panel) — both read/write through the
   store, and both also import `document` directly for its exported types and
   constants (`panels` for `MATERIALS`, `DocumentError`, `Rotation`, `uniqueName`; `viewport` for
   geometry helpers). `panels` additionally imports the `storage` adapter singleton
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
trusted. This is what lets the schema evolve (e.g. for joinery) without breaking files
saved by earlier versions. `CURRENT_VERSION` is 3, and migration is a real chain: each
step runs on raw data, in version order, one version at a time
(`if (d.version < 2) …; if (d.version < 3) …`), before any board reaches
`validateBoard`. A v1 file walks 1→2→3 — `foldRotationToV2` (180→0, 270→90) first,
then `addPostureToV3` (`standing` → `posture`, `grain` defaulted) — which is the
worked example every future migration step should match. See invariant 11 for why
both steps run where they do.

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
│   └── document.ts          create / validate / migrate (v1->v2->v3 chain);
│                            re-exports the other two
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
│   ├── DimensionField.tsx   the validating fractional-inch input
│   ├── NameField.tsx        part name; commits on blur/Enter, empty reverts
│   ├── Toolbar.tsx  PartsList.tsx  Properties.tsx  FileMenu.tsx
└── App.tsx                  layout, autosave/restore effects, undo keybindings
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
3. **The `dragging` ref guard in `Gizmo.tsx`.** `TransformControls` computes motion from
   state captured at drag start; syncing the document into the proxy mid-drag makes it
   fight itself. The symptom is jitter or drift, not a crash.
4. **Gesture snapshots are lazy** — taken on the first `edit()` inside a gesture, not in
   `beginGesture()`. Eager snapshotting leaves no-op undo entries, so `Ctrl+Z` appears
   to do nothing.
5. **`DimensionField` only commits when `dirty`.** Otherwise focusing and blurring a
   field re-parses the *rounded display text* and writes it back, silently quantizing
   exact values (18mm → 11/16"). Stored values are exact; display rounds.
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
   typed.
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
14. **`bandRadius` is `hypot(d, k·delta)`, not an arbitrary choice of curve.**
    Because `r = hypot(d, k·delta)`, the in-plane offset `sqrt(r² − d²)` comes out as
    exactly `k·delta` — evenly spaced, whatever the cut distance `d` — so the ring
    pattern is periodic across the grain and the tile has no seam. A "simpler"
    radius (e.g. `r = k·delta` directly) reintroduces a seam that only shows up on a
    wide board, because the in-plane spacing would then vary with `d`.
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
    dragging a board does not rebuild its geometry every frame.

## Commands

```bash
npm install
npm run dev        # Vite dev server; use --port <n> to avoid collisions
npm test           # Vitest, currently 307 tests
npm run build      # tsc -b && vite build — this is the typecheck gate
docker compose up -d --build    # deploy (see DEPLOYMENT.local.md first)
```

`npm test` does **not** typecheck. A green suite proves nothing about `tsc`; run
`npm run build` before claiming anything compiles.

## Open follow-ups

`docs/follow-ups.md` lists everything found during v1 review, the two polish passes,
v2, and now v3, consciously deferred rather than missed, numbered 1-30 plus v2's and
v3's additions. Read it before starting new work in the same area — several items are
"correct but untested", which is exactly what a refactor breaks silently.

**29 and 30 are closed** — the gizmo now has a size ceiling tied to the selected board
(with a floor that keeps it grabbable when zoomed far out), and the origin lines have
their own toolbar checkbox. **5 is closed** — the version gate now rejects versions
below 1 and non-integer versions. **32 is closed** — `hash` and `seededRandom` moved
to `src/viewport/grainLog.ts` and are unit-tested there. All closures are written up
in place. With those done, **joinery is the next work.**

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
