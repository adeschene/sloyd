# Sloyd

A woodworking-focused 3D modelling and planning app for shop projects: a purpose-built
alternative to SketchUp for shop work. You lay out the boards of a build in 3D, cut the
joinery into them, group them into assemblies, and get the numbers you need at the bench.
That means dimensions, a printable cut list and plans, board feet and a sheet-goods layout. Projects
read in fractional inches, or in whole millimetres if you switch a project to metric.

The name is from *sloyd* (Swedish *slöjd*), the Scandinavian handicraft education tradition
built around hand woodworking.

## What it does

**Boards**
- Add boards, then set length, width, thickness, material and grain direction. Fields take fractional inches,
  decimals or millimetres. Built-in materials are pine, oak, maple, walnut, cherry, plywood and MDF; **Materials &
  prices** adds your own solid woods and sheet goods (kept in a browser library and copied into each project that uses
  them). Pine and nominal-sized custom woods show **nominal names** (a ¾ × 5½ board reads 1×6).
- **Posture** (flat, on edge, upright) and **turn** (0°, 90°, 180°, 270°, true rotations).
- **Units**: each project reads in inches or millimetres (`in | mm`). A bare typed number is millimetres in a metric
  project, and drawings print bare millimetres with a "Dimensions in mm" note.
- Move with the gizmo, which snaps to 1/16". Or use the **Move** tool (M) to snap one point
  exactly onto another: a corner, an edge midpoint, a face centre, a cut's corner or a guide.
- **Multi-select** with Shift/Ctrl-click or Ctrl/Cmd+A. Several parts move, duplicate, delete
  and take shared size, grain and material edits together.
- **Copy in a row…**: N copies along ±X/Y/Z by gap, centre-to-centre pitch, or fit across a
  distance.
- **Align** two or more parts to the one selected first (left, centre, right; bottom, middle, top; back, centre,
  front), and **Space evenly** between the outer two.
- **Overall size**: select an assembly or several parts, type a new width, height or depth, and place a stretch line
  (the middle by default). Everything past the line moves, and parts crossing it get longer, with their joints, holes
  and cuts following their side. A preview says what grows, moves and stays; anything that can't follow refuses with
  a sentence.
- **Hide/unhide**: an eye on every row; H hides the selection, Shift+H hides the rest, and
  Alt+H shows everything. A hidden part still counts in the cut list.

**Joinery**
- Cuts are stock removed from a board: dados, grooves, rabbets, notches, and mortises and
  stopped dados (a cut can stop short of either end). The 3D view, the snap points and the
  cut list all read the same cut.
- **Angles**: tapers, miters (one end or both), bevels and chamfers, from the **+ Add ▾** menu; the cut list reads them
  as bench lines (a miter names its long point, and mitered parts get a short point).
- **Holes**: a single bore or a stored row (shelf pins at 32 mm), blind or through, on any face, plus a 35 mm
  hinge cup preset. A row can tilt for an angled bore. Holes show open in 3D, on the Plans sheet and in the part
  diagrams, and as bench lines on the cut list.
- **Curves**: cut an arch, a notch or any outline of lines and arcs clean through a part. **Edge profiles** (roundover,
  cove, Roman ogee, bead, thumbnail) run full length, stop short with the router's run-out, or follow a curved outline.
- **Edge banding**: veneer tape or solid edging on chosen sides. The model shows the finished size and the cut list
  gives the core to cut, with strips and tape on the Buying list.
- **Splayed legs**: lean an upright part by a typed **Rake** and **Splay**, set square to the sides by default.
  **Level the ends** cuts the ends to sit flat on the floor and under the top (compound miters on a two-way splay).
  **Round tenons** go on a leg's end, and **Bore leg sockets** on the seat bores an angled socket over each leg and
  tenons the legs to fit. **Add stretcher** puts a tenoned rung between two legs, and **Fit the stretcher again**
  re-fits it after a change.
- **Add joinery…** finds where parts meet and, using Claude, chooses mortise-and-tenon, dado,
  stopped dado, rabbet or half-lap joints. It then cuts and resizes the parts. The result is
  saved as a new project, and the original is never changed. Parts with angle cuts, holes, curves, profiles and banding
  are accepted, and a joint kind is ruled out only where a feature is in its way. Leaning legs and compound end cuts
  are refused, and box-jointed parts are left alone. **Repair joints** fixes projects damaged by an older build.
- **Box joint the corners**: select the parts of a box or drawer and every corner gets equal interlocking fingers (any
  leftover goes in one odd finger at the bottom). The parts run out to the outside faces, and the cut list gives one line
  per joint.
- **Dovetail the corners**: through or half-blind dovetails with a typed slope and tail count, half pins at both edges.
  The cut list gives one line per joint and bench drawings on the tail part's row.

**Linked parts, assemblies and components**
- **Link** parts so they share size, material, grain, posture and cuts. Edit one and every
  copy changes; each keeps its own name, position and turn. A linked part can be its mate's **mirror** image (a left
  and right side). **Unlink** gives a part back its own values.
- **Group** (Ctrl/Cmd+G) parts into an **assembly**, and nest assemblies inside each other.
  Click to select the whole assembly, and double-click to open it and edit inside; everything
  else fades. Escape, or a click on empty space, goes back up a level. **Ungroup** is
  Ctrl/Cmd+Shift+G.
- **Duplicate shares**: copies of an assembly are components of one definition. Change a
  part inside any copy and every copy changes. **Make Unique** splits one copy off. The parts
  list shows `×N` on a shared copy. **Copy mirrored** makes a live mirror-image copy of an assembly.

**Measuring**
- **Tape** tool (T): measure point to point and drop guide points by typing a distance.
  X, Y or Z locks the direction to an axis.
- **Section**: slice the viewport along a Front, Side or Top plane to see inside the piece, with solid caps on the cut.
- **X-ray** (R): the selection draws solid and every other part faded, so the joints inside show through.

**At the bench**
- **Cut list**: a printable sheet that groups identical parts. Every part is named by its
  path (`Cabinet › Drawer › Side`). It shows each part's joinery as a drawing with its setup
  lines, board feet for solid wood and square feet for sheet goods. A **Buying** section turns it into a shopping
  list: board feet with a waste factor, boards bought by the piece packed onto the cheapest sizes, sheets, and a cost
  from the prices you set. Every group and the project carry a **weight**, from each material's density.
- **Labels…**: one sticker per piece on Avery 5160/5163 or L7160/L7163 label sheets, printed at true size.
- **Hardware**: hinges, slides, screws and the like as typed items with a pack size and price, counted on parts,
  assemblies or the project and multiplied with copies. The cut list has a Hardware section, and Buying counts packs.
- **Plans**: a printable sheet of dimensioned third-angle elevations (front, plan, side) of the piece and of
  each assembly, with an exploded isometric numbered to match the cut list, lettered feature callouts, and a hatched
  section view when the viewport has a section. The viewport has an **Explode** slider; the model is read-only while it
  is spread.
- **Views**: Front, Side, Top and Iso buttons over the viewport; **Save image** downloads a clean PNG of the view.
  **Saved views** keep a camera, section, explode and hidden parts in the project.
- **Sheet layout**: plywood and MDF parts are nested onto 4×8 sheets in guillotine-cuttable
  rows, accounting for the saw kerf.

**Generate**
- Describe a piece and get one to three prototypes built from boards, using Claude with your
  own API key. The key is stored in this browser only. Each prototype is saved as a new
  project; generation never touches the project you are working on. Prototypes can come with tapers, miters, bevels,
  chamfers, holes, edge profiles and banding.
- **Refine…** changes an existing design by instruction ("make it 2 inches taller") and saves the result as a new
  project with a list of what changed, in shop words. Joined designs keep their joints, and features are carried
  onto the refined parts. Leaning legs, angled holes, round tenons and box joints can't be described to the model,
  so those parts (and a box-jointed assembly) come back exactly as they were.

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
guessed at. The current schema is **25**.

## Development

```bash
npm install
npm run dev      # start the Vite dev server
npm test         # run the Vitest suite (9406 tests)
npm run build    # tsc -b && vite build: type-checks and produces dist/
```

`npm test` does not typecheck; `npm run build` is the type gate.

**Further reading:**
- `CLAUDE.md`: the architecture, the layer order and the invariants that govern new work.
- `docs/rounds.md`: one row per shipped round, the status log and the rollback cost of each.
- `docs/invariants.md`: the full text of every invariant; `docs/module-map.md`: the source tree, file by file.
- `docs/superpowers/specs/`: one design per feature round.
- `docs/browser-verification-*.md`: how each round was checked in a real browser.
- `docs/follow-ups.md`: what was deliberately left open.

## Deployment

Sloyd is a static single-page app. It has no server, no database and no backend; projects
live in the user's browser. The one outbound call is to `api.anthropic.com`, made from the
browser with the user's own key, for Generate, Refine and Add joinery. The CSP allows only that origin.

It ships as an nginx container serving the Vite build, with SPA-fallback routing so a refresh
on any deep route still resolves to `index.html`.

```bash
docker compose up -d --build
```

The container does not publish a port of its own. It is meant to sit behind a reverse proxy on
a shared Docker network, which is why `docker-compose.yml` expects an external network rather
than mapping ports to the host. Adapt that to your own setup. To run it locally, add a `ports:`
mapping or serve `dist/` with any static file server.
