# CLAUDE.md — Sloyd

> A woodworking-focused 3D modelling/planning web app — a purpose-built alternative to
> using SketchUp for shop projects.
> Parent context: `/srv/CLAUDE.md` (Docker hub), `/srv/vps-admin/CLAUDE.md` (VPS).

---

## Status

**v1 shipped.** Static SPA, containerized, 119/119 tests passing. Deployed via
nginx-proxy-manager as `sloyd-app-1` on `proxy_network`, target hostname
`sloyd.example.com` (see **Manual deployment steps** below — DNS and the NPM proxy
host are the two pieces a human still has to do).

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

1. **`units`** — parse/format fractional inches (e.g. `24 1/2"`). Imports nothing;
   the leaf of the dependency graph.
2. **`document`** — the document schema, board geometry, validation, and versioned
   migration. Depends on `units` only.
3. **`store`** (Zustand + snapshot-based undo/redo) and **`storage`** (the
   `StorageAdapter` seam) — both sit above `document`.
4. **`viewport`** (react-three-fiber scene, camera, grid, gizmo) and **`panels`**
   (React forms: toolbar, parts list, properties panel) — both read/write through the
   store; neither talks to `document` or `storage` directly.

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

## Manual deployment steps

The container (`sloyd-app-1`, port `80`, on `proxy_network`) is built and running.
Two steps remain that need a human at a browser and a DNS console — **Claude cannot
perform either of these**:

1. Create a DNS **A record** for `sloyd.example.com` pointing at this VPS.
2. In the nginx-proxy-manager admin UI (`:81`), add a proxy host: domain
   `sloyd.example.com` → forward to hostname `sloyd-app-1`, port `80`. Then request a
   Let's Encrypt certificate for it.

## Deployment conventions (inherited from the hub)

- Own compose project (`sloyd`); operate from inside this directory
  (`docker compose ...`). No ports are published — nginx-proxy-manager reaches the
  container over `proxy_network`.
- No bind mounts, no named volumes, no `.env`. There is no server-side state to
  persist — the document lives entirely in the browser via `StorageAdapter`.
- Public-facing containers join the external **`proxy_network`** and get a proxy host
  added by hand in the nginx-proxy-manager admin UI on `:81` (see above).

## Working agreements

- Build incrementally: small v1, then widen. Prefer shipping a narrow thing that works.
- Design docs live in `docs/superpowers/specs/`; read the latest before changing behavior.
