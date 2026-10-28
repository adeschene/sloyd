# Sloyd — saved views

**Date:** 2026-10-28 · **Status:** deployed 2026-10-28 (`ee43d69`, `index-CaZZjZyz.js`, schema 29); approved by the user 2026-10-28; plan `docs/superpowers/plans/2026-10-28-sloyd-saved-views.md`.

**Origin:** `docs/feature-gaps.md` §2, "X-ray / transparency; saved views ("scenes")" — the half left after X-ray. The user picked it
on 2026-10-28 and asked to skip the brainstorm questions, so **every choice below is Claude's call**; §10 lists them for checking.

## 1. Intent

Getting back to a view takes work: orbit and zoom to the joint, turn the section on and drag it to the right depth, hide the top,
set explode. Close the project or look elsewhere and it is gone. SketchUp users keep these as *scenes*. A saved view is a named
snapshot of how you were LOOKING at the project, kept with the project, one click to return to.

**Goals**

- **Save** the current view under a name; **go to** a saved view in one click; **update** it to the current view; **rename**;
  **delete**.
- A view holds: the camera (where it is, what it looks at, perspective or orthographic, and how far it is zoomed), the section cut,
  the explode amount, and which parts are hidden.
- Views live IN THE DOCUMENT: they autosave, export and import with the project, survive a reload, and a Duplicate carries them.

**Non-goals (v1)**

- Saving the selection, X-ray, the open assembly, the active tool, or the Grid/Origin/Guides toggles (editing state or display
  preferences, not a way of looking; X-ray without its selection means nothing — follow-up, §11).
- Animated transitions between views; a keyboard shortcut per view; thumbnails.
- Views on the Plans sheet, in Save image as a batch, in drawings or the cut list.
- Generate/Refine knowing about views (Generate's schema stays byte-identical, inv 49). Refine's new project carries NO views
  (its parts are new; a view's hidden ids would not match).

**Anti-goals** (failure even if it works)

- Going to a view changing the MODEL (any part's size, place or features) — it changes only how you look.
- A view that silently loses itself: a project round-tripped through an older build, or a view dropped on load without reason.
- A restored camera that lands somewhere else than saved because a projection switch re-framed over it (today's `CameraKeys`
  re-frame on a projection swap, `Viewport.tsx` ~156–178).

## 2. The stored shape (schema 29)

```ts
interface SavedView {
  id: string;                 // nextId(); repaired on load by takeId (inv 33)
  name: string;               // unique among the project's views (uniqueName), non-empty, trimmed
  camera: {
    ortho: boolean;
    position: [number, number, number];   // world inches
    target: [number, number, number];     // the orbit centre (controls.target)
    height?: number;          // ortho only: the visible world HEIGHT in inches (> 0); absent on perspective
  };
  section: Section | null;    // the store's Section shape, as setSection accepts it
  explode: number;            // 0..1
  hidden: string[];           // part/assembly ids (item paths) hidden when saved
}
SloydDocument.views: SavedView[]   // `[]` in a new document; order = the order the user sees
```

- **Ortho zoom is stored as a visible height, not three's pixel `zoom`**, so a view reopened in a different window size shows the
  same extent: save `height = (camera.top − camera.bottom) / camera.zoom`; restore `zoom = (top − bottom) / height` for the
  camera at restore time. Perspective needs no zoom (the distance is in `position`; `fov` is fixed at 45).
- **`up` is never stored or written** (the viewport never writes it today).
- **`hidden` on LOAD is a hint, never a reference** (inv 33): load's duplicate-id repair does not touch it; ids that no longer exist
  are skipped on restore (`applyHidden` already filters to existing item paths). A part re-minted by that repair simply drops out of a
  view.
- **`hidden` DURING EDITING is re-keyed like the live `hiddenIds`** (Claude's call after the builder check): every edit that changes
  item paths — Group, Ungroup (including inside a shared definition, every placement), i.e. everything that goes through `editRekeyed` /
  `rekeyHeld` and `rekeyEverywhere` — applies the same `rekey` (and `lift`: a dissolved assembly's hidden-ness passes to its children,
  fu 229) to every `doc.views[i].hidden`, inside the SAME `edit()`, so undo restores both together. Otherwise a view that hid "Top"
  would silently stop hiding it the moment the top was grouped. A deleted part's id is left in place (skipped on restore; undo of the
  delete brings it back working).
- **Validation on load** (`validateViews`, beside `validateGuides`): a non-array → `[]`. An entry is DROPPED when it is not an
  object, `name` is not a string with a non-blank trim, `camera.ortho` is not a boolean, either vector is not three finite numbers,
  an ortho camera's `height` is not finite and > 0, `explode` is not finite, or `section` is neither `null` nor a valid section
  (axis one of the store's axes, finite `at`, boolean `flip`). Kept entries: `explode` clamped to [0, 1]; a perspective camera's
  `height` dropped; `hidden` filtered to strings (a non-array → `[]`), duplicates removed; names trimmed and deduplicated in order
  (`uniqueName`, the first keeps its name); ids through `takeId`.
- **The bump** (`CURRENT_VERSION` 29; `docs/versioning.md` row 28→29): `migrateDocument` builds the document field by field and a
  28 build would DROP `views`, then autosave the project without them — silent loss on round trip. A 29 file must be refused by a
  28 build. Document-level, no step. **Rollback past this round refuses every project saved at 29 — export first.**

## 3. Saving and editing views (store)

Store actions, each ONE undo entry, each a document edit (autosaved):

- `saveView(camera: SavedView['camera'])` — appends `{ id, name: uniqueName('View 1'-style next number, …), camera, section, explode,
  hidden: hiddenIds }` from the store's current view state. Returns the new id. Name: `View N`, N one more than the count of views,
  passed through `uniqueName`.
- `updateView(id, camera)` — replaces that view's `camera`, `section`, `explode` and `hidden` with the current ones; keeps `id`, `name`
  and its place in the list.
- `renameView(id, name)` — `cleanName`d, trimmed, non-empty (an emptied name reverts, as `NameField` already does), `uniqueName`
  among the views excluding itself; returns the STORED name (inv 9's shape).
- `deleteView(id)`.
- An action on an unknown id, or one that would change nothing (inv 4), pushes nothing.

**Exploded is read-only (inv 47) — with ONE carve-out:** these four actions ARE allowed while exploded, because saving an exploded
view is a main use. They write only `doc.views` (never a part) and push an ordinary undo entry. **Invariant 47 is amended**: "a
saved-view write (`saveView`, `updateView`, `renameView`, `deleteView`) is the one document write allowed while exploded; it touches
only `views`." Undo and redo stay refused while exploded, as today. All four are refused mid-gesture (`gesturing`), as hide is.

The camera is not store state, so the caller passes it in (§5).

## 4. Going to a view (store + viewport)

`goToView(id)` is a view action — it writes nothing to the document:

1. Refused while `gesturing`; unknown id → nothing.
2. `setExplode(view.explode)` (its own rules: leaving 0 sets the Select tool).
3. `setSection(view.section)`.
4. Hidden: `applyHidden(view.hidden)` with the current hide run ENDED first (`hideRunEntry = null`, as undo and redo do), so every
   go-to-view that changes the hidden set is its OWN undo entry, and an eye toggle after it starts a fresh run; none when the set
   already matches (inv 4). (Claude's call after the builder check: "go to A, go to B, Ctrl+Z" lands on A's hidden set.) **Invariant
   43 is amended**: going to a view is a fifth user action through `applyHidden`, and it ends any run in progress.
5. The camera: App calls the viewport (§5) with `view.camera`.

The view's own `hidden` ids that no longer exist are skipped; parts added since the view was saved are shown.

## 5. The camera (viewport)

`ViewportHandle` gains:

- `getCamera(): SavedView['camera'] | null` — reads the default camera and `controls.target`; `null` before the Canvas is ready.
- `setCamera(c: SavedView['camera']): void` — writes `position`, `controls.target` and (ortho) `zoom` from `height`, then
  `updateProjectionMatrix()` and `controls.update()`.

`orthographic` stays App state. When `c.ortho` differs from it, App switches it first and the pose is applied once the NEW camera
and its OrbitControls exist (`controls.object === camera`, the condition `CameraKeys` already waits on); **the projection-swap
re-frame must not run for a swap a view restore caused** (the anti-goal in §1). The builder decides how (a pending pose consumed by
`CameraKeys` instead of its re-frame is the obvious shape).

## 6. The UI

A **Views** footer in the sidebar, beside Guides, in the same disclosure shape as `GuidesFooter` (`Views · N`, closed by default,
opening itself when the count rises; keyed by project id). It is NOT inside `EditLock` (the carve-out, §3). Inside:

- A **Save view** button (adds `View N` and selects its name field for typing, as a new part's length field takes focus).
- One row per view, in list order: the name as a **button that goes to the view** (title `Go to this view`), a `NameField` for
  rename (commit on blur/Enter, inv 9), **Update** (title `Replace this view with the current view`), and **×** (aria-label
  `Delete view <name>`).
- Empty: `No saved views. Set up a view, then Save view.`

No confirmation on delete or update: both are one undo entry (Ctrl+Z, once not exploded).

## 7. Other paths

- `createDocument`: `views: []`. Duplicate project, export, import and autosave carry views (they copy the document).
- Generate: a new project has `views: []`. Refine: the refined project has `views: []` (§1 non-goal).
- `flatDocument`, joinery, checks, the cut list, drawings, Plans: never read `views`.
- `replaceDocument` already resets the view state a view restores; nothing new to reset (views are document data).

## 8. Tests (the builder writes them; these are the ones that matter)

- Load: every DROP and every kept-and-repaired case in §2's validation, each with its own fixture; a v28 file loads with `views: []`;
  a v30 file is refused; round trip save → load is identity.
- Store: each of the four actions — one undo entry, autosave-visible doc change, refused mid-gesture, ALLOWED while exploded (and the
  part data untouched); undo of a save removes the view; no entry for a no-op.
- `goToView`: sets explode, section and hidden; skips missing ids; writes nothing to `doc`; refused mid-gesture; its hide is its own
  entry after an eye-toggle run (Ctrl+Z returns to the run's end, not its start), none when already matching; go to A, go to B,
  Ctrl+Z → A's hidden set.
- Re-keying: Group and Ungroup (incl. the `lift` of a hidden assembly) re-key every view's `hidden` in the same undo
  entry; undo restores the old ids.
- Ortho height ↔ zoom conversion as a pure helper with tests (different canvas heights give the same visible height).
- Views footer: save, go, rename (blur/Enter, emptied reverts), update, delete, empty text, works while exploded.
- Real browser (the user's Chrome): save in perspective, orbit away, go back (same pose); save ortho, switch to perspective, go back
  (ortho, same extent, NO re-frame); a view with section + explode + hidden; resize the window between save and go (ortho extent
  holds); reload the page, views persist; export/import keeps them.

## 9. Docs

`docs/versioning.md` (28→29), `docs/invariants.md` and CLAUDE.md (inv 47 and 43 amendments, in full and condensed), the module map,
the feature-gaps status, rollback table at ship.

## 10. Claude's calls (for the user to check)

1. Stored in the document (schema 29: rollback refuses projects saved after; export first) rather than in browser-only storage.
2. What a view holds: camera, section, explode, hidden parts. NOT selection, X-ray, open assembly, tool, grid/axes/guides.
3. Saving/updating/renaming/deleting views is undoable and allowed while exploded (an inv 47 carve-out).
4. Going to a view is not undoable except its hide/show part (one entry, like the eye toggles).
5. Ortho extent stored as a visible height, so window size does not change what a view shows.
6. The UI is a `Views · N` footer beside Guides; Save / go / rename / Update / ×; default names `View N`; no delete confirmation.
7. Refine and Generate start with no views.
8. A view's hidden parts follow Group / Ungroup (Make unique changes no paths; re-keyed in the same edit); load does not repair them.
9. Each go-to-view that changes what is hidden is its own undo step.

## 11. Follow-ups to record when this ships

- Views that remember the selection and X-ray.
- Plans sheet / Save image per saved view.
- Smooth camera transitions; per-view keyboard shortcuts.
