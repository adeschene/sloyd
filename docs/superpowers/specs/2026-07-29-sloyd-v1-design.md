# Sloyd v1 — Design

**Date:** 2026-07-29
**Status:** Approved, ready for implementation planning

---

## Purpose

A woodworking-focused 3D modelling app for planning shop projects — a purpose-built
alternative to SketchUp rather than a general-purpose modeller.

The differentiator, once it arrives, is joinery: adding a dado or a rabbet should take
two clicks and stay editable, and the resulting numbers should reach a cut list. That
is only possible because parts are parametric objects rather than meshes, which is why
v1 invests in the document model before it builds any joinery.

## Scope

**v1 ships:** 3D viewport, add/place/edit boards, save/load, undo, fractional-imperial
input.

**v1 explicitly does not ship:** joinery (v2), cut list (v3), multi-select, free-angle
rotation, curves, accounts, any server-side state.

## Core decision: parametric boards, not meshes

A board is a first-class object — `length × width × thickness`, plus position and
orientation — not a collection of vertices and faces. The 3D view is *rendered from*
that data.

Rejected alternatives:

- **Sketch-and-extrude / full mesh kernel.** More general, but requires boolean CSG and
  yields nothing woodworking-specific. It would also make joinery *harder*: a dado in a
  mesh is just holes in geometry, with no notion that it *is* a dado, so it can't stay
  editable or feed a cut list.
- **A B-rep kernel (OpenCascade.js, CadQuery-wasm).** Multi-megabyte WASM and a steep
  API, to solve a problem we don't have — a dado in a rectangular board is an
  axis-aligned box subtraction, a closed-form special case. Revisit only if curves or
  turnings become central.

## Stack

React + [react-three-fiber](https://github.com/pmndrs/react-three-fiber) + `drei`,
built with Vite. State in Zustand. Tests in Vitest.

Chosen over vanilla Three.js because r3f makes "document is truth, scene is derived"
the default rather than something enforced by discipline — vanilla would require
hand-written reconciliation (document changed → update these meshes, dispose those),
which is the code most likely to rot and the path by which the scene quietly becomes
the source of truth again. The panels, which are most of this app, are also plainly
easier as React.

Cost accepted: r3f is a real abstraction, so a bug may live in our code, in r3f, or in
Three.

## Architecture

Static single-page app. No server, no database, no API.

```
┌─ Document (plain JSON, source of truth) ─────────┐
│  { version, name, units, boards: [ … ] }         │
└──────────────────┬───────────────────────────────┘
                   │  (one-way: document → scene)
     ┌─────────────┴──────────────┐
     ▼                            ▼
  3D Viewport                Properties Panel
  (react-three-fiber)        (React forms)
     │                            │
     └────── edits ───────────────┘
              ▼
        store actions → new document
```

**The governing rule: the JSON document is the truth; the Three.js scene is derived
from it, never the reverse.** Dragging a gizmo computes a number, which updates the
document, which re-renders the scene. A mesh is never authoritative.

Consequences: undo is a snapshot stack (trivial at tens-of-boards scale), save/load is
`JSON.stringify`, and the future cut list is a `GROUP BY` over an array rather than a
mesh-inspection problem.

### Modules

| Module | Responsibility | Depends on |
|---|---|---|
| `units` | parse `"1-1/2"` → `1.5`; format `1.5` → `1-1/2"` | nothing — pure |
| `document` | schema, defaults, validation, version migration | `units` |
| `store` | current document + actions (add/update/delete/undo) | `document` |
| `storage` | load/save/list projects behind a platform-agnostic interface | `document` |
| `viewport` | renders scene from document; owns camera and gizmo | `store` |
| `panels` | toolbar, parts list, properties form | `store`, `units` |

Each is independently testable and can be understood without reading the others'
internals.

## Data model

```jsonc
{
  "version": 1,
  "name": "Bookshelf",
  "units": { "display": "imperial-fractional", "precision": 16 },  // nearest 1/16"
  "boards": [
    {
      "id": "b_7f3a",
      "name": "Left Side",
      "length": 36,          // canonical: inches, float
      "width": 9.25,
      "thickness": 0.75,
      "position": [0, 0, 0], // min-corner of the world-space bounding box
      "rotation": 0,         // degrees about vertical: 0 | 90 | 180 | 270
      "standing": false,     // false = lying flat, true = on edge
      "material": "pine"     // v1: a color lookup and a label
    }
  ]
}
```

**Inches are canonical, stored as floats.** Fractions exist only at the parse/display
boundary; nothing downstream handles strings.

**Position is the min-corner, not the center.** `[0,0,0]` means sitting on the floor at
the origin, and a shelf at `Z 11-7/8"` has its underside 11-7/8" up — the measurement
you would actually take. Center-origin would force mental arithmetic on every read.

**Rotation is 90° steps plus a flat/standing flag, not free Euler angles.** Casework is
axis-aligned; free rotation invites gimbal problems and snapping ambiguity for a rare
case. Angled parts can arrive later as an explicit feature with compound-angle math
done properly, rather than as a general transform that is subtly wrong everywhere.

**`version` is present from the first commit,** and every load runs through a migration
function (v1's is the identity). When v2 adds `cuts: []` to each board, existing files
still open.

**Coordinates:** Y is up, world units are inches, the grid is the floor. A board of
length L lying flat at the origin spans `0..L` in X, `0..width` in Z, `0..thickness`
in Y.

Orientation resolves in a fixed order — `standing` first, then `rotation`:

| `standing` | `rotation` | X extent | Y extent | Z extent |
|---|---|---|---|---|
| `false` | `0` / `180` | length | thickness | width |
| `false` | `90` / `270` | width | thickness | length |
| `true` | `0` / `180` | length | width | thickness |
| `true` | `90` / `270` | thickness | width | length |

Because `position` is the min-corner, changing orientation keeps that corner fixed and
grows the board in the new directions — it does not spin about a center.

## Units

Canonical storage is decimal inches. The `units` module owns the boundary.

Accepted input: `3/4`, `0.75`, `1-1/2`, `1 1/2`, `1 1/2"`, `2'6"`, `18mm`, `12.7 mm`.
Display: nearest 1/16" by default, rendered as `1-1/2"`, `3/4"`, `30-1/16"`. A 1/32"
precision toggle is a later, cheap addition — `units.precision` already exists in the
document to carry it.

## Storage seam

All persistence goes through one small interface. Nothing else in the app calls
`localStorage`, constructs a download link, or touches a file input.

```ts
interface StorageAdapter {
  autoSave(doc: Document): Promise<void>;      // debounced by the caller
  loadAutoSaved(): Promise<Document | null>;
  exportProject(doc: Document): Promise<void>; // "save as" — may prompt
  importProject(): Promise<Document>;          // "open" — may prompt
  listRecent(): Promise<RecentEntry[]>;        // browser: [] in v1
  capabilities: { recentFiles: boolean; realPaths: boolean };
}
```

v1 ships `BrowserStorageAdapter`: `autoSave`/`loadAutoSaved` over localStorage,
`exportProject` as a download, `importProject` via a file picker, `listRecent` returning
`[]`, and both capability flags `false`. The UI reads `capabilities` rather than
sniffing the platform, so a recent-files menu simply does not render in the browser.

This costs roughly thirty lines now. Without it, file handling spreads through
components and any later port means hunting it down; with it, a new platform is a second
implementation of a small interface. It also isolates the localStorage failure paths in
one testable place.

## UI and interaction

Three regions. No floating windows; no modals except file operations.

```
┌────────────────────────────────────────────────────────────┐
│  Sloyd   Bookshelf ▾     + Add Board    ⟲ ⟳     ⬇ ⬆        │  toolbar
├──────────────────────────────────┬─────────────────────────┤
│                                  │  PARTS                  │
│                                  │  ▸ Left Side            │
│           3D viewport            │  ▸ Right Side           │
│         (orbit / pan / zoom)     │  ▪ Shelf        ← sel.  │
│                                  │  ▸ Back Panel           │
│              ↑Y                  ├─────────────────────────┤
│              ┃                   │  SHELF                  │
│          ────╋────→X             │  Length      23-1/4"    │
│             ╱                    │  Width        9-1/2"    │
│            Z                     │  Thickness      3/4"    │
│  ▒▒▒▒▒▒▒ grid (1" / 12") ▒▒▒▒▒   │  ─────────────────────  │
│                                  │  X  3/4"  Y 11-7/8"     │
│                                  │  Z  0"    Rot 0° □stand │
│                                  │  ─────────────────────  │
│                                  │  Material    pine ▾     │
│                                  │  Duplicate   Delete     │
└──────────────────────────────────┴─────────────────────────┘
```

**Camera.** Left-drag orbits, right- or middle-drag pans, scroll zooms. `F` frames the
selection, `Home` frames everything. Perspective by default, with an orthographic toggle
(one line, and genuinely useful for checking alignment).

**Selection.** Click a board in the viewport or the parts list; the two stay in sync.
The selected board gets an outline and the transform gizmo. Clicking empty space
deselects. Multi-select is out of v1.

**Editing.** The gizmo and the panel are two views of the same numbers. Dragging the red
arrow makes `X` count up live, snapped to 1/16"; typing into `X` moves the board. Every
dimension field accepts the fraction syntax and normalizes on blur.

**Add Board.** Drops a board at the origin using the last-used dimensions (initial
default 3/4" × 5-1/2" × 24"), selects it, and focuses the Length field. Adding twenty
parts should not mean twenty trips through a dialog.

**Undo/redo.** `Ctrl+Z` / `Ctrl+Shift+Z`, snapshot-based. Nearly free given the document
model, and painful to add after people have adapted to its absence.

**Files.** Debounced auto-save on every change, via the storage seam. Export downloads
`<name>.sloyd`; import replaces the current document after a confirm. A visible "saved
locally" indicator, since the honest failure mode is clearing browser data.

**Visual tone.** A shop tool, not a toy: restrained palette, plausible wood tones with
visible edges so joints read clearly, a soft ground shadow for depth. The
`frontend-design` skill informs this at implementation time rather than defaults being
guessed at.

## Testing

**Tested hard — `units`.** Comprehensive tests including `2'6"`, `1 1/2` vs `1-1/2`,
`18mm`, garbage input, and rounding exactly on a 1/32 boundary. Written TDD, before the
implementation. A quiet bug here means a wasted board.

**Tested normally — `document`, `store`, `storage`.** Validation, version migration,
save/load round-trip, each store action including undo, and the browser adapter's
failure paths (quota exceeded, localStorage unavailable, malformed stored JSON) against
a fake `localStorage`. Mostly pure functions over plain data.

**Not unit-tested — `viewport`.** Testing r3f rendering is high-effort and low-yield;
verified by driving the app in a browser and screenshotting.

## Error handling

- **Bad dimension input** — the field goes red with a hint and the document is never
  written. Never silently coerce to 0; a 0"-thick board is worse than an error.
- **Corrupt or future-version file on import** — refuse with a specific reason and leave
  the current document untouched. Never partially load.
- **localStorage full or unavailable** (private browsing) — a persistent banner stating
  that work is in memory only and must be exported. Silent save failure is the one
  unacceptable outcome.

## Deployment

`sloyd.example.com`. Multi-stage build, static output, no published ports, no state on
the server.

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

```yaml
services:
  app:
    build: .
    restart: always
    networks: [proxy_network]
networks:
  proxy_network:
    external: true
```

`nginx.conf` needs SPA fallback (`try_files $uri /index.html`) so a refresh on any route
does not 404.

**Manual steps (human required, documented in `CLAUDE.md`):**

1. DNS: `sloyd.example.com` A record → VPS IP.
2. nginx-proxy-manager admin UI on `:81` → new proxy host `sloyd.example.com` forwarding
   to `sloyd-app-1:80`, with a Let's Encrypt cert requested.

Also: add a `sloyd/` row to the hub table in `/srv/CLAUDE.md`.

**Dev loop:** `npm run dev` (Vite, hot reload). Docker is for deploying only; no image
rebuild is needed to see a change.

## Roadmap beyond v1

- **v2 — joinery.** Dados and rabbets as parametric features on a board (face, width,
  depth, offset), rendered via axis-aligned box subtraction. Then the mating flow: pick
  two boards, and the dado width comes from the mating board's actual thickness.
- **v3 — output.** Cut list grouped by material and thickness, board-feet, sheet-goods
  layout, and a setup sheet carrying joinery measurements to the bench.

### Possible: open source, and a desktop build

Not planned for v1, but the architecture should not foreclose either — and it does not.

Because Sloyd is a static site with no backend, distribution is already wide open: it
deploys free to GitHub Pages, Netlify, or Cloudflare Pages, so users visit a URL and
nothing is self-hosted. The VPS is one deployment target among several, not a
requirement imposed on anyone else.

A desktop build (native file dialogs, offline use, `.sloyd` file associations, no
"cleared browser data ate my work" failure mode) would be a second `StorageAdapter`
implementation plus a shell — Tauri or Electron loading the same `dist/`. The code is
small; the real cost is code signing and notarization (Apple Developer, a Windows
certificate) and release CI, none of which the application architecture affects.

Tauri vs Electron is genuinely contested for a 3D app and should be benchmarked rather
than assumed: Tauri's binaries are far smaller, but Electron bundles Chromium so WebGL
behaves identically across platforms, whereas Tauri uses each OS's webview and
WebKitGTK on Linux has a rough WebGL history.

Two v1 decisions already serve this: the storage seam above, and `version` in the
document from the first commit — precisely the field a desktop app needs when opening a
file the web app wrote years earlier.
