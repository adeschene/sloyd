# Sloyd

A woodworking-focused 3D modelling app for planning shop projects — a purpose-built
alternative to using SketchUp for shop work. Lay out the boards of a build in 3D, see
how they fit, and edit their dimensions and position with fractional-inch precision.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education
tradition built around hand woodworking.

**v1 scope:** 3D viewport, add/place/edit boards, save/load/export/import, undo/redo,
fractional-imperial input. **Deliberately out of scope for v1:** joinery (dados,
rabbets — v2) and the cut list (v3). Boards are modelled as parametric objects
(`length × width × thickness` + position/orientation) rather than meshes specifically
so that joinery and a cut list are cheap to add later, once they arrive.

The full design is in
[`docs/superpowers/specs/2026-07-29-sloyd-v1-design.md`](docs/superpowers/specs/2026-07-29-sloyd-v1-design.md).

## The document is the source of truth

Every board lives in a plain-JSON document (`{ version, name, units, boards: [...] }`).
The Three.js scene in the 3D viewport is *rendered from* that document and is never
authoritative — dragging a board in the viewport computes a number, writes it to the
document, and the scene re-renders from the updated document. This one-way flow is
what keeps undo, save/load, and export all simple: they only ever need to serialize or
restore the document, never reconcile scene state.

## Development

```bash
npm install
npm run dev      # start the Vite dev server
npm test         # run the Vitest suite (124 tests)
npm run build    # tsc -b && vite build — type-checks and produces dist/
```

## Deployment

Sloyd is a static SPA — no server, no database, no API, and nothing to persist on the
host. It ships as an nginx container serving the Vite build output, with SPA-fallback
routing so a refresh on any deep route still resolves to `index.html`.

```bash
docker compose up -d --build
```

The container does not publish a port of its own — it is intended to sit behind a
reverse proxy on a shared Docker network, which is why `docker-compose.yml` expects an
external network rather than mapping ports to the host. Adapt that to your own setup;
if you just want to run it locally, add a `ports:` mapping or serve `dist/` with any
static file server.
