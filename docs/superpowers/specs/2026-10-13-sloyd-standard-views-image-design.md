# Sloyd — standard views and image export

**Date:** 2026-10-13 · **Status:** approved in conversation; spec awaiting the user's review
**Builds on:** the viewport's framing (`CameraKeys` in `viewport/Viewport.tsx`), the Plans sheet's view table
(`FRONT`, `SIDE`, `TOP`, `ISO` in `document/drawing.ts`), explode (`explodeOffsets`, invariant 47), the floating
view controls (`panels/ViewportControls.tsx`) and the storage seam (`StorageAdapter`, invariant 7). Every rule there
still holds unless this document says otherwise.

**Origin:** `docs/feature-gaps.md` §2, "Standard views" and "Image export". Also closes **fu 260** (F / Home frame
the unexploded positions while exploded), because the standard views share that framing.

## 1. Problem and goal

The viewport has a perspective/orthographic toggle and two framing keys (F, Home) that keep the current viewing
direction. Getting a true front, side or top view means orbiting by eye, and nothing ever lines up exactly. There is
also no way to get a picture of the piece out of Sloyd, short of an OS screenshot that includes the selection colour,
the gizmo and the UI around the viewport.

**Goal:** one click to look at the piece from the front, the side, the top or the isometric corner, and one click to
save a clean PNG of the viewport for sharing.

**The user's rulings, made in conversation:**
- **The PNG is for sharing the piece.** It is a clean picture: no selection colour, no assembly fading, no gizmo, no
  Move/Tape markers. Grid, origin axes and guides follow their toggles.
- **A standard view keeps the current projection.** It turns the camera only; Perspective stays perspective (as in
  SketchUp). Orthographic is the existing toggle.
- **Capture by a one-frame clean render** (option 1 of 3), at the canvas's own backing size. Layers and an
  offscreen render target at a chosen size were set aside: layers still need the clean mode for the selection colour
  (a material, not an object), and a chosen size adds controls nobody asked for.
- **fu 260 is folded in.**
- **No schema change.** Nothing here touches the document; `CURRENT_VERSION` stays 14 and a rollback costs nothing.

## 2. Standard views

### 2.1 The views

Four views, named and oriented exactly as the Plans sheet's, so "Front" in the viewport and "Front" on the sheet are
the same face:

| Button | Camera looks along | Screen right | Screen up | From `drawing.ts` |
|---|---|---|---|---|
| Front | −Z (camera on the +Z side) | +X | +Y | `FRONT` |
| Side | −X (camera on the +X side) | −Z | +Y | `SIDE` |
| Top | −Y (camera above) | +X | −Z (the piece's front edge at the bottom) | `TOP` |
| Iso | −(1,1,1)/√3 (from front-right-above) | as `ISO` | as `ISO` | `ISO` |

A `View`'s `toward` is the direction from the model TO the camera. The viewport reads `toward`, `right` and `up` off
those four constants; it never restates them. Back, left and bottom are left out (YAGNI; the sheet has none).

### 2.2 The camera move

A standard view **frames everything visible** (the Home subset: `visibleBoards(worldParts(doc), hiddenIds)`) from the
view's `toward` direction, then sets the camera's `up` so the screen axes match §2.1. It jumps; there is no animation.
The projection is untouched. With no visible parts the button does nothing, as Home does.

**Top is the one degenerate case.** OrbitControls orbits about world +Y and keeps the camera's polar angle inside
`[ε, π − ε]`; looking straight down puts it on the pole, where its azimuth is undefined and the first orbit would
spin the view. The camera therefore sits on the `toward` ray with a vanishing +Z tilt (well under a pixel at any
framing), so OrbitControls' own azimuth is "front at the bottom" and the first drag orbits from there without a jump.
**This is a hypothesis about three-stdlib's `OrbitControls.update` to be confirmed by reading it while planning**
(the plan names the lines); if `camera.up = −Z` is what actually holds the orientation, the plan says so and this
paragraph is amended.

After any standard view, orbiting works as before. Nothing is remembered: the views are actions, not a mode, and no
button shows as pressed.

### 2.3 One framing helper, and fu 260

`CameraKeys`' `frame(subset)` becomes `frame(subset, toward?)`: with no `toward` it keeps the current viewing
direction (F, Home, the projection swap — today's behaviour exactly); with one it uses that direction. Its pure part —
the bounding box of a subset, the radius, and the orthographic zoom or perspective distance — moves into a
**tested** module beside the viewport (§5), so the arithmetic is pinned even though the viewport itself is not.

**fu 260:** while exploded, every framing (F, Home, the projection swap and the standard views) frames the parts
where they are DRAWN: each board's box translated by its `explodeOffsets` offset, the same map `Viewport` passes to
`BoardMesh`. At `explode === 0` the offsets are absent and the framing is byte-for-byte today's.

### 2.4 Where the buttons sit

A new segmented row in the View group (top-right), after the projection row: `Front · Side · Top · Iso`, each a
plain button (no `aria-pressed`), titled ("Look at the front of the piece", …). The View group is outside the edit
lock, so the views work while exploded (they change nothing in the model; invariant 47 is about the model). No
keyboard shortcuts this round; if they come later they go through `CameraKeys`' listener and its `suspended` flag
(invariant 27's rule).

### 2.5 Reaching the camera

The buttons live outside the `<Canvas>`; the camera and controls live inside it. `Viewport` takes a `handleRef`
prop, and a component inside the Canvas (beside `CameraKeys`) fills it with a `ViewportHandle`:

```ts
interface ViewportHandle {
  /** Frame everything visible from a standard view (§2.2). */
  showView(view: StandardView): void;
  /** Render one clean frame and return it as a PNG, or null if the canvas gave none (§3). */
  capture(): Promise<Blob | null>;
}
type StandardView = 'front' | 'side' | 'top' | 'iso';
```

`App` owns the ref and hands `ViewportControls` two callbacks. An imperative handle, not a request counter in props:
a view is an event, and a counter would replay on remount.

## 3. Image export

### 3.1 What is in the picture

The model as the viewport draws it now — the same camera, projection, explode amount and hidden parts — with:

- **removed:** the selection colour and emissive (every part drawn unselected), assembly fading (every part drawn
  unfaded, as if no assembly were open), the gizmo, the Move tool's markers and the Tape tool's line, readout and
  hover marker;
- **kept, following their toggles:** the ground grid, the origin axes and the guide markers;
- **background:** the viewport's own ground colour, opaque.

Size: the canvas's backing store, i.e. its CSS size × the device pixel ratio (already 2–3, so a typical window gives
roughly 3000 px across). No size control.

### 3.2 The clean frame

`capture()`:

1. sets a `clean` flag held in `Viewport`'s React state;
2. while `clean`, `BoardMesh` gets `selected={false}` and `faded={false}`, and `Gizmo`, `MoveTool`'s markers and
   `TapeTool`'s drawing are not rendered (each takes the flag, or is left out as `Gizmo` already is while exploded);
3. waits for the commit and one rendered frame (`useFrame` after the flag is seen), then calls
   `gl.render(scene, camera)` and, in the same task, `gl.domElement.toBlob(…, 'image/png')` — the drawing buffer is
   still intact within the task, so `preserveDrawingBuffer` is NOT turned on (it costs every frame);
4. clears `clean` in a `finally`, so a throw never leaves the viewport stuck clean.

The cost, accepted in conversation: the selection colour blinks off for about one frame. Tool state is not touched —
the Tape tool's anchor, typed distance and held points survive a capture (invariant 24: a capture moves nothing and
writes no held point; it only stops DRAWING them for a frame).

A second click while a capture is in flight returns the in-flight promise (no second download).

### 3.3 Saving it — the storage seam

`StorageAdapter` gains one method:

```ts
/** Offer a PNG for download as `<name>.png`. Rejects if triggering the download throws. */
exportImage(name: string, png: Blob): Promise<void>;
```

`BrowserStorageAdapter` implements it exactly as `exportProject` builds its download (object URL, anchor,
`sanitizeFilename`, cleanup in `finally`); the shared anchor dance is factored into one private helper so the two
cannot drift. The name is the project's `doc.name`.

### 3.4 The button and its errors

"Save image" sits at the end of the View group, after Explode; title "Save a PNG of the view, without the selection
or tool markers". It is outside the edit lock (works while exploded) and inside `.viewport-stack`, so `inert` covers
it behind a modal. If `capture()` resolves null or `exportImage` rejects, the View group shows
`Could not save the image.` in a `role="alert"` span (FileMenu's pattern), cleared on the next attempt.

## 4. What does not change

The document, the schema, autosave, undo (a view or a capture pushes no entry and dirties nothing), the Plans sheet,
F/Home outside the explode case, the projection swap's re-frame, and the CSP (a blob download is not a fetch).

## 5. Testing

The viewport has no unit tests by design (`viewport/` note in CLAUDE.md); what can be pure is pulled out and tested.

**Unit (Vitest):**
- `viewport/framing.ts` (new, pure; imports `document` only): the subset box with and without explode offsets; the
  orthographic zoom and perspective distance (today's formulas, pinned with values computed by hand, not by the
  code); the standard-view camera pose (position direction and `up`) for each view.
- **The views are the sheet's views:** for each `StandardView`, the pose's camera direction (target → camera) equals
  the constant's `toward` (Top: within the §2.2 tilt), and the screen axes the pose produces — screen right
  = `normalize(cameraUp × toward)`, computed in the test from the pose, not taken from the module — equal the
  constant's `right` and `up`. Mutated by swapping two views' entries to see it fail.
- **fu 260:** a subset box for an exploded fixture equals the drawn boxes' union and differs from the assembled one.
- `exportImage`: the download name, the blob passed through, cleanup on a throwing `click()` — beside
  `exportProject`'s tests. `ViewportControls`: the four buttons and Save image call their callbacks; the error span
  appears on a rejected save and clears on retry; neither is disabled while exploded.

**Browser (dev server, Playwright; the user can watch):**
- Each view on a chiral fixture (a part that reads differently from each side), in both projections: front faces
  +Z, side from +X with −Z to the right, top with the front edge at the bottom, iso from front-right-above; the first
  orbit after Top does not jump.
- F/Home/views while exploded frame the exploded set (fu 260); unexploded framing unchanged.
- Save image with a part selected, an assembly open and the Tape tool anchored: the saved PNG (opened and looked at)
  has no selection colour, fading or markers; the viewport afterward still shows the selection and the tape anchor.
- A screenshot of a view and of a saved PNG go in `docs/img/`; the pass is recorded in
  `docs/browser-verification-standard-views-image.md`.
- Software GL caveat (fu 26a): nothing here touches a shader; the capture reads what the GPU drew, so the PNG
  should also be looked at once on real hardware by the user.

## 6. Out of scope

Back/left/bottom views, view animation, keyboard shortcuts for views, saved views ("scenes"), image size or
transparent-background options, copying the image to the clipboard, and exporting the Plans sheet as an image (it
prints to PDF).
