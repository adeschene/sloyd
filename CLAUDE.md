# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Parent context: `/srv/CLAUDE.md` (Docker hub), `/srv/vps-admin/CLAUDE.md` (VPS).

---

## Status

**v1 shipped.** Static SPA, containerized, 124/124 tests passing.

Host-specific deployment detail — hostname, container name, proxy configuration, and
the manual steps a human has to perform — lives in `DEPLOYMENT.local.md`, which is
gitignored. Read that file before deploying; it is not in the public repo.

v1 deliberately excludes joinery (dados/rabbets) and the cut list — those are v2 and
v3. The parametric board model exists specifically to make them cheap to add later.

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
   versioned migration.
2. **`store`** (Zustand + snapshot-based undo/redo) and **`storage`** (the
   `StorageAdapter` seam) — both sit above `document`.
3. **`viewport`** (react-three-fiber scene, camera, grid, gizmo) and **`panels`**
   (React forms: toolbar, parts list, properties panel) — both read/write through the
   store, and both also import `document` directly for its exported types and
   constants (`panels` for `MATERIALS`, `DocumentError`, `Rotation`; `viewport` for
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
trusted. This is what lets the schema evolve (e.g. for joinery in v2) without breaking
files saved by earlier versions.

Full detail: `docs/superpowers/specs/` (design) and `docs/superpowers/plans/`
(implementation plan). This section is a summary, not a replacement for either.

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
