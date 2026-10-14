# Sloyd — section cut (design)

Date: 2026-10-14. Feature gaps §2 ("Section cut: clipping plane to see inside a joint"). Status: approved; plan
`docs/superpowers/plans/2026-10-14-sloyd-section-cut.md`.

## 1. Purpose and rulings

An on-screen inspection tool: slice the model with one plane to look inside joints (mortise and tenon, dadoes, rabbets)
and bores (holes, shelf-pin rows, hinge cups).

User rulings (brainstorm, 2026-10-14):

- **R1 Viewport only.** No sectioned drawings on the Plans sheet (fu 256 stays its own item). Save image captures the
  section because it captures the view.
- **R2 Axis planes + slider.** One plane perpendicular to X, Y or Z, placed by a slider or an exact typed position,
  with Flip choosing the kept side. No face-aligned or free-angle planes.
- **R3 Solid caps, built from the exact model** (not a GPU stencil trick): where the plane slices wood a flat filled
  section shows, with an outline, so a joint or bore reads as a crisp shape.
- **R4 Edit freely.** Section is a view, like hide: select, Move, Tape and Properties all work while it is on; clicks
  and snap points on the removed side are ignored; caps follow edits live.
- **Approach A** (chosen over CPU-rebuilt clipped meshes and stencil caps): GPU clipping planes for meshes and edges,
  exact caps computed on the CPU.

Non-goals this round: section on the Plans sheet, cut list or part diagrams; more than one plane; snap points on the
caps (follow-up); a keyboard shortcut; drawing the plane itself.

## 2. State and controls

### 2.1 State

View state in the store, beside `hiddenIds` and `explode` — never in the document, never autosaved, no undo entry:

```ts
type SectionAxis = 'front' | 'side' | 'top';
section: { axis: SectionAxis; at: number; flip: boolean } | null;
setSection(next: Section | null): void;   // the one writer
```

- `axis` names the standard view the cut is seen from (`FRONT`/`SIDE`/`TOP` in `drawing.ts`): front → the plane is
  `z = at`, side → `x = at`, top → `y = at`. With `toward` the view's unit vector (target → camera), the **kept
  half-space is `toward · p ≤ at`** (the far side, seen from that view); `flip` keeps `toward · p ≥ at` instead.
- `at` is world inches, exact; never rounded or clamped (an edit that leaves it outside the parts keeps it).
- Reset to `null` exactly where `hiddenIds` and `explode` reset: the initial state and `replaceDocument` (a project
  switch goes through it).
- Allowed while exploded; changes nothing about inv 47's read-only rules. Not cleared by Escape or by `setTool`.

### 2.2 Controls

- A **Section** toggle in the viewport's View group (`aria-pressed`). Turning it on sets
  `{ axis: 'front', at: middle of the bounds, flip: false }`. Disabled when no part is visible.
- While on, a separate floating group (`role="group"`, `aria-label="Section"`), not inside the View group — that group
  already wraps at 1440 px (fu 319):
  - axis as a segmented control **Front / Side / Top**; changing it re-centres `at`;
  - a **slider** over the bounds;
  - the exact position as a `DimensionField` (min/max = the bounds: refuses outside input, never clamps; inv 5);
  - **Flip**.
- **Bounds** = the visible parts' drawn box along the axis (explode offsets included, `subsetBounds`' arithmetic), read
  live. A stored `at` outside them pins the slider to its end; the field shows the stored value.

## 3. Geometry — `document/section.ts`

A pure module, unit-tested. A world axis plane lands on a placed part as one of the part's own axis planes, because
placed parts turn only in quarter turns and mirroring is resolved by the composition before a part is drawn (invs 44,
46). So every computation runs in board-local coordinates, exactly, and crosses to world only through `axisFrame`'s
helpers (`fromWorldOffset` for the plane, `pointToLocalXYZ`-style `toWorldOffset` for the results; never
`board[dim] - u`).

### 3.1 `sectionCaps(board, section, offset?)`

Returns `{ pieces: V3[][]; outline: [V3, V3][] }` in world coordinates (the explode `offset` added), or `null` when the
plane misses the part.

1. **Plane to local.** Find the board-local dimension the world axis maps to and the local coordinate of `at`.
2. **Bodies.** For each body from `partGeometry(board).bodies` (inv 48: angle cuts included, holes not), the cap is the
   face `clipConvex` adds when the body is clipped by the plane (the kept side's cap face). A body the plane does not
   cross adds no cap. **Amended 2026-10-14 (the user approved at plan review):** a body face lying exactly ON the plane
   and facing the removed side IS capped — a holed body's mesh subtracts seam faces (inv 50), so without it a plane at a
   dado's shoulder would show a hole into the part. Visible consequence, accepted: any face exactly on the plane reads
   as a cut (e.g. a Top cut at a tabletop's underside darkens the aprons' tops). Every piece is normalised to one
   winding (pocketCells merges cells, so clip caps and face caps can mix).
3. **Holes.** For each hole in `partGeometry(board).holes` whose axial extent and radius box the plane crosses
   (prefiltered, inv 50's budget), subtract its prism from every piece with `minusPrism`. Because the plane and the
   hole are both axis-aligned, the plane is either across the bore (a 48-gon void) or along it (a strip; a blind bore's
   strip notches the cap edge). Pieces are convex; a fan fills each.
4. **Outline.** The boundary of the union of the pieces: every piece edge, with overlapping stretches of opposite-
   direction collinear edges cancelled (the pieces are disjoint and consistently wound, so an interior seam — between
   pocket cells, or from `minusPrism`'s split — always meets its twin running the other way). What is left is the true
   outline: no seam lines across a cut, the bore drawn as its ring or strip.

`keptBySection(section, p): boolean` — the one side test (`toward · p ≤ at + SECTION_EPS`, flipped when `flip`; a point
on the plane is kept). `sectionPlane(section)` returns `{ n, constant }` for `THREE.Plane` (n = −toward, constant = at,
both negated under flip).

## 4. Viewport

- **Clipping.** One shared `THREE.Plane`, updated from `section`; `gl.localClippingEnabled = true`. Every part material
  (grain faces, ghost placeholder, hole walls) and every edge-line material takes `clippingPlanes={[plane]}` while the
  section is on, `[]` when off. Moving the slider changes the plane only: no part geometry rebuilds.
- **Caps.** A `SectionCaps` component draws, per visible part the plane crosses, one mesh (fans of `pieces`) and one
  line segment set (`outline`). Fill: the part's colour, faded when the part is faded, darkened by a named constant; no
  grain. Outline: the part's edge colour, so a selected part's cut shows its selection. Memoised per part on the part's
  geometry signature and the section; recomputed only for crossed parts. Hidden parts get no cap.
- **Not clipped:** grid, guides, origin axes, snap markers, the gizmo.
- **Picking.** Part meshes take a raycast wrapper that drops intersections on the removed side (`keptBySection` on the
  hit point), so a click passes through to what is visible. A cap is pickable and selects its part (same click path,
  same `stopPropagation`, inv 21's pickability).
- **Snapping.** Move's and Tape's candidate lists filter through `keptBySection` (world positions; Move/Tape are
  refused while exploded, so no offset). Snap points on the caps are not added this round.
- **Save image** captures the section as drawn (the caps are scene content, not a tool overlay).

## 5. Invariant

New **inv 51**: *Section is view state with one writer (`setSection`), never in the document. One plane: the meshes
and edges are clipped on the GPU by the shared `THREE.Plane`; caps come only from `sectionCaps` (exact, board-local,
through `axisFrame`); picking and snapping are filtered only through `keptBySection`. A slider move rebuilds caps, never
part geometry.* No existing invariant changes.

## 6. Testing

- `section.test.ts`: plain box; notched part (multi-cell — one outline, no seam lines); tapered and mitered parts
  (bodies clipped by angle cuts); a bore across (48-gon void) and along (strip; blind bore notching the edge); a
  shelf-pin row; the plane on a face (no cap) and missing the part (`null`); every quarter turn, posture and a mirrored
  placement compared against the world box, on `chiralPart` (inv 44); explode offset added. `keptBySection` both sides,
  on-plane kept, flipped.
- **Mutation-test** the cancellation rule (drop it → seam lines appear) and the side filter (flip the comparison →
  tests fail).
- Store: `setSection`; reset by `replaceDocument`; not touched by `setTool`, undo/redo or Escape; no undo entry.
- ViewportControls: toggle, axis change re-centres, field refuses out-of-range, Flip.
- `sectionPerf.test.ts` (like `holesPerf.test.ts`, minimum of 9 runs): a cabinet side with two shelf-pin rows cut
  along and across the bores; budget set from a measurement, recorded with its numbers.
- **Live check** on the dev server, the user watching: the Shaker table's joints, a drilled cabinet side, click-through,
  Move/Tape snapping on the kept side, explode, Save image. Owed to real hardware (26a): cap colour, z-fighting where a
  cap meets clipped faces.
