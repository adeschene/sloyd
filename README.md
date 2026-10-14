# Sloyd

A woodworking-focused 3D modelling and planning app for shop projects: a purpose-built
alternative to SketchUp for shop work. You lay out the boards of a build in 3D, cut the
joinery into them, group them into assemblies, and get the numbers you need at the bench.
That means dimensions, a printable cut list, board feet and a sheet-goods layout. Everything
is in fractional inches.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education tradition
built around hand woodworking.

## What it does

**Boards**
- Add boards, then set length, width, thickness, material and grain direction. Fields take fractional inches,
  decimals or millimetres. Built-in materials are pine, oak, maple, walnut, cherry, plywood and MDF; **Materials &
  prices** adds your own solid woods and sheet goods (kept in a browser library and copied into each project that uses
  them). Pine and nominal-sized custom woods show **nominal names** (a ¾ × 5½ board reads 1×6).
- **Posture** (flat, on edge, upright) and **turn** (0°, 90°, 180°, 270°, true rotations).
- Move with the gizmo, which snaps to 1/16". Or use the **Move** tool (M) to snap one point
  exactly onto another: a corner, an edge midpoint, a face centre, a cut's corner or a guide.
- **Multi-select** with Shift/Ctrl-click or Ctrl/Cmd+A. Several parts move, duplicate, delete
  and take shared size, grain and material edits together.
- **Copy in a row…**: N copies along ±X/Y/Z by gap, centre-to-centre pitch, or fit across a
  distance.
- **Hide/unhide**: an eye on every row; H hides the selection, Shift+H hides the rest, and
  Alt+H shows everything. A hidden part still counts in the cut list.

**Joinery**
- Cuts are stock removed from a board: dados, grooves, rabbets, notches, and mortises and
  stopped dados (a cut can stop short of either end). The 3D view, the snap points and the
  cut list all read the same cut.
- **Angles**: tapers, miters (one end or both), bevels and chamfers, from the **+ Add ▾** menu; the cut list reads them
  as bench lines (a miter names its long point, and mitered parts get a short point).
- **Holes**: a single bore or a stored row (shelf pins at 32 mm), blind or through, square to any face, plus a 35 mm
  hinge cup preset. They show open in 3D, on the Plans sheet and in the part diagrams, and as bench lines on the cut
  list. Add joinery and Refine don't handle holed projects yet.
- **Add joinery…** finds where parts meet and, using Claude, chooses mortise-and-tenon, dado,
  stopped dado, rabbet or half-lap joints. It then cuts and resizes the parts. The result is
  saved as a new project, and the original is never changed. Tapered, mitered, beveled and chamfered parts are
  accepted; an angle cut running into a joint refuses. **Repair joints** fixes projects damaged by an older build.

**Linked parts, assemblies and components**
- **Link** parts so they share size, material, grain, posture and cuts. Edit one and every
  copy changes; each keeps its own name, position and turn. **Unlink** gives a part back its
  own values.
- **Group** (Ctrl/Cmd+G) parts into an **assembly**, and nest assemblies inside each other.
  Click to select the whole assembly, and double-click to open it and edit inside; everything
  else fades. Escape, or a click on empty space, goes back up a level. **Ungroup** is
  Ctrl/Cmd+Shift+G.
- **Duplicate shares**: copies of an assembly are components of one definition. Change a
  part inside any copy and every copy changes. **Make Unique** splits one copy off. The parts
  list shows `×N` on a shared copy.

**Measuring**
- **Tape** tool (T): measure point to point and drop guide points by typing a distance.
  X, Y or Z locks the direction to an axis.

**At the bench**
- **Cut list**: a printable sheet that groups identical parts. Every part is named by its
  path (`Cabinet › Drawer › Side`). It shows each part's joinery as a drawing with its setup
  lines, board feet for solid wood and square feet for sheet goods. A **Buying** section turns it into a shopping
  list: board feet with a waste factor, boards bought by the piece packed onto the cheapest sizes, sheets, and a cost
  from the prices you set.
- **Plans**: a printable sheet of dimensioned third-angle elevations (front, plan, side) of the piece and of
  each assembly, with an exploded isometric. The viewport has an **Explode** slider; the model is read-only while it
  is spread.
- **Views**: Front, Side, Top and Iso buttons over the viewport; **Save image** downloads a clean PNG of the view.
- **Sheet layout**: plywood and MDF parts are nested onto 4×8 sheets in guillotine-cuttable
  rows, accounting for the saw kerf.

**Generate**
- Describe a piece and get one to three prototypes built from boards, using Claude with your
  own API key. The key is stored in this browser only. Each prototype is saved as a new
  project; generation never touches the project you are working on. Prototypes can come with tapers, miters, bevels and
  chamfers.
- **Refine…** changes an existing design by instruction ("make it 2 inches taller") and saves the result as a new
  project with a list of what changed; joined designs keep their joints.

**Projects**
- Several projects live in the browser's local storage, with switch, duplicate, delete and
  new. **Export** and **Import** `.sloyd` files. Undo and redo cover the last 50 edits.

## Keyboard

| Key | Action |
|---|---|
| M / T | Move tool / Tape tool |
| X, Y, Z | Lock the tape to an axis |
| Ctrl/Cmd+A | Select all (at the open level) |
| Ctrl/Cmd+G, Ctrl/Cmd+Shift+G | Group, Ungroup |
| H, Shift+H, Alt+H | Hide selection, hide others, show all |
| Delete / Backspace | Delete the selection |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | Undo, redo |
| Escape | Cancel the current tool step, or close the open assembly |
| F / Home | Frame the selection / frame everything |

## The document is the source of truth

A project is a plain-JSON document. It holds parts, assemblies (definitions placed by
instances), shared shapes, guides and stock settings, and carries a schema `version`. The
Three.js scene is *rendered from* that document and is never authoritative. Dragging a board
computes a number, writes it to the document, and the scene re-renders. That one-way flow is
what keeps undo, save, load and export simple.

Every load path runs the document through a versioned migration chain. Older files open
unchanged and are upgraded in place, and a file from a newer build is refused rather than
guessed at. The current schema is **11**.

## Development

```bash
npm install
npm run dev      # start the Vite dev server
npm test         # run the Vitest suite (3045 tests)
npm run build    # tsc -b && vite build: type-checks and produces dist/
```

`npm test` does not typecheck; `npm run build` is the type gate.

**Further reading:**
- `CLAUDE.md`: the architecture, the layer order and the invariants that govern new work.
- `docs/history.md`: what each round shipped and why.
- `docs/superpowers/specs/`: one design per feature round.
- `docs/browser-verification-*.md`: how each round was checked in a real browser.
- `docs/follow-ups.md`: what was deliberately left open.

## Deployment

Sloyd is a static single-page app. It has no server, no database and no backend; projects
live in the user's browser. The one outbound call is to `api.anthropic.com`, made from the
browser with the user's own key, for Generate and Add joinery. The CSP allows only that origin.

It ships as an nginx container serving the Vite build, with SPA-fallback routing so a refresh
on any deep route still resolves to `index.html`.

```bash
docker compose up -d --build
```

The container does not publish a port of its own. It is meant to sit behind a reverse proxy on
a shared Docker network, which is why `docker-compose.yml` expects an external network rather
than mapping ports to the host. Adapt that to your own setup. To run it locally, add a `ports:`
mapping or serve `dist/` with any static file server.
