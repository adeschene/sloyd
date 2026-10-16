# Sloyd — Plans sheet feature callouts (design)

Date: 2026-10-16. Follow-ups 333 (hole callouts), 279 (angle callouts), 362 (curve callouts); the part-balloon half of the
callouts shipped as fu 252 (`2026-10-16-sloyd-plans-balloons-design.md`, whose R1 deferred feature callouts to this round). Status: awaiting the
user's review of this document.

## 1. Purpose and rulings

The Plans sheet's elevations (a Front/Side/Plan trio for the piece and one per assembly) carry overall and chain
dimensions and nothing about a part's holes, angle cuts or curves. The cut list's part diagrams carry every feature with its
full bench line, one part at a time. What the sheet lacks is WHERE each feature sits in the assembled piece.

Woodworking plans (magazine practice: Woodsmith, ShopNotes, WOOD) label features with short shop-word notes on the main
drawings — "1/4″-dia. shelf-pin holes, 3/8″ deep", "45° miter", "R 3″" — and keep exact positions on part views and enlarged
details; drafting practice agrees (positions are dimensioned in the view looking at the drilled face, never to hidden lines).
In Sloyd the part diagrams already are those part views.

User rulings (brainstorm, 2026-10-16):

- **R1 Where, in the piece.** A callout says what a feature is and its key size; positions stay on the part diagrams.
- **R2 Elevations only.** The trios carry the callouts; the exploded view keeps its balloons alone.
- **R3 Letter keys and a key list.** A small lettered tag beside each feature with a short leader; the notes listed under the
  trio (`A  Row of 12 holes, …`). Chosen over a column of notes with long leaders.
- **R4 Hidden features are keyed on their dashed lines.** A visible view is preferred; a feature hidden in every elevation
  (shelf-pin holes on a case side's inside face) is keyed on its hidden outline, not dropped.
- **R5 Each feature is keyed once on the sheet, in the deepest listed assembly trio that draws its part** (§2.1).
- **R6 Every instance is marked** in its chosen view (the point is where), coincident marks merged (§4.4).
- **R7 The key line is a short bench line** in the part diagrams' vocabulary (`dia`, not `Ø`; radius in brackets after the
  rise), §3.

Non-goals, each staying a follow-up: dimensioned feature positions on the sheet (extension lines, radius leaders, angle
arcs); callouts on the exploded view; enlarged detail views; user-placed tags (a schema bump, with fu 253); keys in the
viewport.

## 2. What is keyed, and where

### 2.1 Which trio

The sheet draws the whole piece's trio, then one trio per listed assembly (`planAssemblies`: a sole-child wrapper is not
listed, fu 264). A part belongs to the INNERMOST LISTED assembly on its path; that assembly's trio keys its features. The
piece trio keys only parts belonging to no listed assembly. So every feature is keyed exactly once on the sheet, where its part
is drawn largest among the fewest neighbours. An assembly placed three times is drawn once (its heading says `× 3`), and its
features are counted as drawn, once.

### 2.2 Features

A feature is one of a part's:

- **hole rows** — one feature per row (a row of 12 is one feature; its key line says 12);
- **angle cuts** — one per cut, any kind (taper, miter, bevel, chamfer);
- **curves** — one per curve, except that four rounded corners which the bench line collapses into one line
  (`curveLineEntries`) are ONE feature.

The feature's identity is `<partId>:hole:<rowId>`, `<partId>:angle:<cutId>` or `<partId>:curve:<firstCurveId>` (the collapsed
corners take the first curve's id, as `curveLineEntries` prints them).

### 2.3 Which view

Per feature, one of the trio's three views, in this order:

1. its **true view** where the feature has a visible segment;
2. any view where it has a visible segment;
3. its true view, where it has only hidden segments (R4);
4. none: it is listed under the figure as not shown (§4.6).

The true view: a **hole** row — the view looking down its axis (the rim is round); a **curve** — the view looking along its
`through` dimension (the outline is true); an **angle cut** — a view whose direction lies in the cut's plane (`|n · toward| ≤
1e-9`: the slope is edge-on and its angle reads true). Ties (an angle cut edge-on in two views) go Front, then Side, then
Plan. Every preset's plane holds one of the part's axes, and every part is a quarter turn, so a preset always has a true view;
a hand-edited compound angle cut (sloped in two axes, fu 280) has none and falls straight to step 2.

## 3. The key line — `document/featureKeys.ts`

ONE home for a feature's identity, its kind, its key line and its fault flag, built in `document` (inv 19: the shown string is
assembled where it is built, never in the component). Lengths through `formatLength` with the DOCUMENT's units (inv 52); hole
sizes through `holeLengthText` (metric to 0.1 mm; imperial with the mm aside, exactly as `holeLine` prints it); degrees as
`angleLine` prints them (`toFixed(1)`).

| Feature | Key line |
|---|---|
| Hole | `Hole 1/4″ (6.4 mm) dia × 3/8″ deep` · `… × through` |
| Hole row | `Row of 21 holes, 1/4" dia × 3/8" deep, every 1-17/64" (32 mm)` · metric `Row of 21 holes, 6.4 mm dia × 10 mm deep, every 32 mm` |
| Miter | `Miter 45.0°` |
| Bevel | `Bevel 15.0°` |
| Chamfer | `Chamfer 1/4″` · unequal legs `Chamfer 1/4″ × 1/2″` · no chamfer fields `Chamfer 30.0°` |
| Taper | `Taper 1/2″ over 18″` (depth at the deep end, over the run to zero) · otherwise `Taper 1/4″ to 1/2″` |
| Arch | `Arch, 30″ span, 2″ rise (radius 57-1/4″)` |
| Half-round notch | `Half-round notch, 1-1/2″ wide` |
| Bow | `Bow 1″ over 36″ (radius 162-1/2″)` |
| Rounded corner | `Rounded corner, 1″ radius` · four collapsed `Four rounded corners, 1″ radius` |
| Any other curve | `Curve: 2 arcs and 3 lines` |

- *Amended (plan ruling P1, approved 2026-10-16):* the key list is an HTML note like the part diagrams' notes, so it reads
  the bench lines' own units (`12 mm`, `6.4 mm dia`), not the bare mm of SVG dimension labels; imperial prints the straight
  `"` of `formatLength` (this table's `″` was typography).
- **No positions** (R1): no "from the left end", no inset. The tag is the position.
- **Through-dimension words** (`cut through the width`) are omitted: the view shows it.
- **A faulted feature** (a hole with any `holeFaults`, a curve with any `curveFaults`, an angle cut a resize pushed past its
  part) ends `— check the cut list`; the part diagram's bench line carries the fault words.
- **One letter per distinct key line** within a trio: two features share a letter exactly when their key lines are the same
  string (a faulted and a clean feature never share).

## 4. Placement — `panels/planKeys.ts`

Pure functions beside `planBalloons.ts`, tested without rendering.

### 4.1 Tagging the drawing — `document/drawing.ts`

`Seg2` gains `feature?: string` (the §2.2 identity); `drawView` sets it on each 3D segment while building the list, so it rides
through the one hidden-line pass unchanged — no second pass:

- **holes:** `holeDrawingSegments` returns each segment with its row id;
- **curves:** `curveDrawEdges`' chord edges carry their curve's id (a non-chord edge carries none); `silhouetteLines` carries
  the id of the curve it was built for; collapsed corners map to the first corner's id;
- **angle cuts:** classified in `partSegments` by geometry — an edge both of whose board-local ends lie on a cut's plane
  (within `DRAW_EPS`) belongs to that cut; the first such cut in stored order wins. `bodyEdges` is NOT changed, so every
  part's edges stay byte-for-byte.

`pathOf` reads `part` only, so every SVG path is byte-for-byte unchanged (pinned).

### 4.2 Lettering

Features are grouped by key line; groups are lettered A, B, C, … (after Z: AA, AB, …) in reading order of their first mark:
Plan, then Front, then Side; within a view top to bottom, then left to right. Letters restart in each trio.

### 4.3 The mark

- **Anchor:** among the feature's segments in its chosen view (visible ones; hidden ones only at §2.3 step 3), the endpoint
  farthest from its part's projected centre — the outside of the feature's outline, ON a drawn line (inv 16).
- **Leader:** a fixed `KEY_LEADER` (SVG user units) from the anchor, directed away from the part's projected centre (straight
  up when the anchor is the centre).
- **Tag:** a circle of one radius per figure (the widest letter, measured with `labelWidth`/`labelHeight`, inv 19, plus a pad),
  the letter centred, filled with the paper colour so the lines beneath are masked (accepted; for the user's eye, §6).
- One tag per INSTANCE (R6): an instance is one feature on one drawn part.

### 4.4 Collisions

- Tags with the SAME letter whose centres are closer than one tag diameter merge into one tag (the first instance's leader
  kept): lined-up pin rows on a case's two sides in a Front view.
- Tags with DIFFERENT letters that overlap are pushed further out along their own leaders, in lettering order, by whole
  tag radii, until clear; a tag never leaves the figure's viewBox (clamped back toward its view).
- Tags may overlap drawn lines and dimension text, never each other: a tag still overlapping an earlier one after the push
  and the clamp is not drawn, and its letter goes to §4.6's note (pinned, mutated).

### 4.5 Rendering — `panels/PlanFigure.tsx`

`PlanTrio` takes the trio's key plan and draws, after the lines and dimensions: each leader, its tag and its letter
(`plans-key-leader`, `plans-key-tag`, reading the sheet's surface roles; black in the print block like the balloons). Under the
figure, before the existing notes, the key list: one line per letter, `A  <key line>` plus ` (N×)` when the letter marks more
than one instance — an HTML list (`plans-key`), printed with the sheet.

### 4.6 The notes

- `Not shown in these views: <key lines>.` — features with no drawn segment in any view (a curve wholly off its face).
- `Not keyed (no room): <letters>.` — tags §4.4 could not place clear of each other.

### 4.7 Unchanged

The exploded view and its balloons; part diagrams; the cut list; the viewport; every trio of a piece with no features
(byte-for-byte SVG, no key list); `drawView`'s visible/hidden split. No schema change: deploying or rolling back costs nothing.

## 5. Testing

Every new test fails before its code exists or is mutated (the house rule).

- **`featureKeys.test`**: every row of §3's table in imperial and metric; the four-corner collapse is one feature; a faulted hole,
  curve and overrunning angle cut end `— check the cut list`; no position words appear.
- **`drawing.test`**: segments carry the right feature keys (a hole row, a curve's chords and silhouettes, each angle-cut kind);
  a featureless part's drawing is byte-for-byte as before (deep-equal with `feature` absent); `pathOf` output unchanged.
- **`planKeys.test`**: the trio owner (piece trio vs innermost listed assembly, a sole-child wrapper skipped); the view order
  (true visible, visible, true hidden, none); shelf-pin holes on a case side's inside face keyed on hidden lines in their true
  view; lettering order; identical key lines share a letter, a faulted one does not; same-letter merge; different-letter push;
  no two placed tags overlap (mutated); no features gives no key plan.
- **`PlansSheet.test`**: tags and the key list in the trios and none in the exploded view; each key line under its own trio;
  ` (4×)` on a four-instance letter; the not-shown note.
- **Live, on the dev server**: a bookcase with shelf-pin rows and an arched apron; a table with tapered legs and mitered
  aprons; a metric cabinet with hinge cups. Screenshots for the user's eye (tags over lines, crowding); print emulation for
  page fit. The real print stays owed with fu 254.

## 6. Build order

One chunk: the key lines (§3), then tagging (§4.1), then placement (§4.2–4.4), then rendering (§4.5–4.6). The live pass
closes 333, 279 and 362 or leaves residue in a new follow-up.
