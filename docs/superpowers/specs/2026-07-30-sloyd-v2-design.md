# Sloyd v2 — orientation semantics and wood grain

> Design for the two items deferred to "Spec B" at the end of
> `2026-07-30-sloyd-v1-polish-design.md`. They ship together because grain is what
> makes orientation observable: on a plain untextured box, a two-state orientation
> control has nothing to show for itself.

Two pieces:

1. **Orientation semantics** — the four-value rotation select collapses to a two-state
   "grain runs along X / along Z", and reorienting a board stops moving it sideways.
   This carries the schema to version 2.
2. **Wood grain** — face, edge and end grain distinguished per face, with plywood
   showing veneer on its faces and plies on its edges.

---

## 1. Schema and migration

`Rotation` narrows from `0 | 90 | 180 | 270` to `0 | 90`, and `CURRENT_VERSION` goes
to 2. A rectangular box has 2-fold symmetry about the vertical axis, so 0° and 180°
map it exactly onto itself and no pivot choice can distinguish them; the same holds
for 90° and 270°. The duplicates were never two states, only two spellings.

### The fold runs before validation

`migrateDocument` folds `180 → 0` and `270 → 90` on the **raw** board data, in the
`if (d.version < 2)` step, before `validateBoard` sees any of it.

This ordering is the single most important detail in this section. `validateBoard`
does:

```ts
const rotation = VALID_ROTATIONS.includes(b.rotation as number) ? (b.rotation as Rotation) : 0;
```

With `VALID_ROTATIONS` narrowed to `[0, 90]`, a stored `270` fails that `includes`
check and falls back to **`0`, not `90`**. Unlike 0-vs-180, that is a visible geometry
change — `boardExtents` returns different extents for 0 and 90 — so every 270° board
in every existing file would silently turn a quarter turn. Folding first makes
`validateBoard`'s fallback what it was always meant to be: last-resort handling for
garbage, not a migration path.

The fold must tolerate junk entries: `d.boards` is untrusted, so the map only rewrites
`rotation` on entries that are non-null objects and passes everything else through
unchanged for `validateBoard` to reject with its existing message.

### The fold is extent-neutral

`boardExtents` already treats 0 and 180 identically, and 90 and 270 identically. The
fold therefore changes no board's size, position, or appearance, and it must **not**
grow a position adjustment. The pivot fix in section 2 is a separate concern that
applies to *future* orientation changes made by the user, not to this rewrite.

### Version gate hardening (follow-up 5)

Taken while in this code, as agreed. `migrateDocument` currently accepts any finite
number as a version, so `version: 0` or `version: 0.5` passes the gate and is treated
as v1. It now rejects a version below 1 or one that is not an integer, with the same
`DocumentError` shape as the existing "newer version of Sloyd" message. `createDocument`
never emits either, so this only affects hand-edited or foreign files — which is exactly
the input the validator exists for.

---

## 2. Reorienting pivots about the board

### The bug

`boardExtents` swaps the extents and `position` stays pinned to the min-corner, so
turning a 24 × 5½ board appears to shove it sideways by nearly 9¼" rather than turning
it in place. The same defect applies to the `standing` toggle, which swaps the Y and Z
extents and so jumps the board along Z. Spec B named only rotation; covering `standing`
is a deliberate widening — it is the identical bug and one helper fixes both.

### The rule

> **Reorienting preserves the footprint's X and Z center, and preserves Y-min.**

The board spins in place and stays on the floor. Y-min rather than Y-center is the
right half of that rule because a board resting on the ground should still be resting
on the ground after it is stood on edge — preserving the Y center would sink half of it
through the floor.

### The helper

A pure function in `src/document/geometry.ts`, alongside the extent math it depends on:

```ts
export function reorientedPosition(
  board: Board,
  changes: { rotation?: Rotation; standing?: boolean },
): [number, number, number];
```

It is `position + (extentsBefore − extentsAfter) / 2` on X and Z, with Y passed
through untouched. It lives in `document` because `document` already owns geometry
math, and it is pure so that the store stays a caller rather than a second home for
orientation arithmetic (invariant 2).

### The call site

`store.updateBoard` applies it whenever a patch carries `rotation` or `standing` and
does **not** also carry an explicit `position`. One place, so every call site — the
Properties select, the standing checkbox, and anything added later — shares the math
instead of each remembering to call it. An explicit `position` in the same patch wins,
which keeps the door open for a future caller that has already computed one; no
current call site does both.

This produces exactly one undo entry per change, because `updateBoard` already funnels
through `edit()`.

---

## 3. The orientation control

The `<select>` stays where it is, with two options instead of four:

```
Orientation
  Grain      [ Along X  ▾ ]
               Along X
               Along Z
  [x] Standing (on edge)
```

The label is **Grain** and the options are **Along X** and **Along Z**. Same `<select>`
element in the same slot, so the panel stays uniform with the Material select below it,
and the axis vocabulary points at something already on screen — the Position X/Y/Z
fields directly above and the origin axes' R=X, B=Z colouring. "Left–right" and
"front–back" were rejected because they are true only from the default camera; orbit
90° and the words are wrong while X and Z stay right.

The stored value remains degrees (`0` / `90`). The field is degrees-shaped behind a
grain-shaped control, and that is a deliberate trade: it keeps the migration a pure
value rewrite and leaves `geometry.ts`'s `turned = rotation === 90` untouched.

---

## 4. Wood grain

### Greyscale masks, tinted by the material colour

Three families × three kinds, drawn as greyscale luminance masks and tinted by
`MATERIALS[...].color` through `material.color`. Two consequences, both wanted:
species colour keeps living in exactly one place (`MATERIALS`), and the cache is at
most nine entries — `{wood, plywood, mdf} × {face, edge, end}` — rather than one per
species per kind.

- **wood** — face: broad streaks with occasional cathedral arcs. Edge: tight straight
  quartersawn lines. End: concentric arcs with pore speckle.
- **plywood** — face: mild veneer figure. Edge and end: alternating ply bands stacked
  across the thickness direction.
- **mdf** — uniform fine speckle for all three kinds, because that is what MDF looks
  like. It has no grain and should not pretend to.

Each is drawn once into a 2D canvas using a **seeded** PRNG — never `Math.random` — so
the same board looks the same on every load, and wrapped in a `CanvasTexture` cached at
module level and never disposed. A texture per board, or per render, is the same
GPU-memory bug that the existing `useMemo` + `dispose` treatment of `BoxGeometry` in
`BoardMesh` exists to prevent, with a larger footprint.

### Why canvas and not a shader

A GLSL noise shader would give scale-free grain with no tiling seams, and it is the
wrong choice here. Follow-up 26a: browser verification on this host runs on software GL
(llvmpipe), which returned `1.0` for `pow(0.0, 0.0)` where real hardware returns NaN —
a difference that hid a grid bug completely and shipped it as a camera-following disc.
Canvas generation is CPU-side and deterministic, so what a screenshot shows here is
what real hardware shows.

### Two pure functions carry the coupling

Both live under `src/viewport/` beside the other pure viewport modules
(`gridDensity`, `screenScale`, `gizmoScale`), and both are unit-tested without a
browser.

**`faceGrainKinds(board) → [GrainKind × 6]`**, in `BoxGeometry`'s material-group order
`+X, −X, +Y, −Y, +Z, −Z`. It reduces to one fact: the kind on an axis is set by which
board dimension lies along that axis — length → **end**, width → **edge**, thickness →
**face**. Tested against all four combinations of `rotation` × `standing`.

**`boardUVs(board) → Float32Array`**, written into the geometry's `uv` attribute.

That second function is why the shared textures need no per-texture state, and the
reasoning is worth recording. Grain scale has to be world-relative — a ¾" edge and a
24" face cannot show the same number of lines — and the obvious lever, `texture.repeat`,
is per-texture. Using it would mean mutating an object shared by every board on screen.
Putting the scale, the 90° grain-direction swap, and the per-board offset into the UV
attribute instead keeps the textures immutable and shared, and puts all per-board
variation into an array that `BoardMesh` already rebuilds and disposes correctly per
board.

Per-board variation is a stable offset derived from `board.id`, so two pine parts
sitting edge to edge do not read as clones. Stable, not random: the same board offsets
the same way on every load.

### In `BoardMesh`

The box takes a six-slot material array — three distinct materials, each reused across
a pair of opposite faces — attached via `attach="material-0"` … `material-5` so r3f
owns their disposal. The selection emissive applies to all six. Edge lines are
untouched: they are what make joints legible and nothing here changes that.

---

## 5. Order of work

Orientation ships first and completely — schema, migration, pivot helper, store wiring,
control, all unit-tested — and then textures.

Grain is what makes orientation observable, but orientation is what is *verifiable*.
Doing it in that order means the schema change, which is the one thing here that writes
itself into the user's saved files, lands with real evidence behind it before anything
that only a screenshot can check gets touched.

---

## 6. Testing

**Unit** (`npm test`):

- **Migration** — a v1 document with `rotation: 180` loads as `0`; with `rotation: 270`
  loads as **`90`**. That second one is the regression test for the ordering trap: it
  fails if the fold ever moves after `validateBoard`. Also: extents are unchanged across
  the fold; a junk board entry still produces `validateBoard`'s existing error rather
  than a crash in the fold; a v2 document round-trips unchanged; `version: 0`,
  `version: 0.5`, and `version: 3` are each rejected with a `DocumentError`.
- **`reorientedPosition`** — a 24 × 5½ board at a known position keeps its X and Z
  center across `0 → 90`, and its `position[1]` is untouched; the same across a
  `standing` toggle, where the Y extent grows and the board stays on the floor;
  a no-op change returns the position unchanged.
- **Store** — `updateBoard` with `{ rotation }` moves the position per the rule;
  with `{ standing }` likewise; with both a rotation and an explicit `position`, the
  explicit position wins; each produces exactly one undo entry, and `Ctrl+Z` restores
  both the orientation and the position.
- **Properties** — the Grain select offers exactly two options; choosing one commits;
  the Standing checkbox still commits.
- **`faceGrainKinds`** — all four orientations, asserted slot by slot in
  `+X, −X, +Y, −Y, +Z, −Z` order.
- **`boardUVs`** — scale is proportional to each face's world extent (a 24" face shows
  proportionally more tiles than a 6" one); the grain direction swaps with rotation;
  the per-board offset is stable across calls and differs between two boards with
  different ids.

**Browser verified** — a 24 × 5½ board turning in place rather than jumping; the same
for standing; grain reading correctly per face in all four orientations; plywood
showing plies on its edges and veneer on its faces. Per the project rule, the r3f
viewport is verified by driving a real browser, not by asserting on mocks. Final
aesthetic judgement on the grain is the user's, on real hardware.

**Typecheck gate** — `npm run build`. `npm test` does not typecheck, so a green suite is
not evidence that anything compiles.

---

## 7. Non-goals

- **No joinery and no cut list.** Naming needs settling: the v1 design and
  `docs/follow-ups.md` both call joinery "v2", while the polish design's Spec B —
  which this document implements — is what actually became v2. Joinery is not in this
  spec and gets its own spec and version label after it; the cut list stays behind that.
- **No new materials.** `MATERIALS` keeps its seven entries; the three grain families
  map onto the existing keys.
- **No free-angle rotation.** Two states, and the schema still stores degrees from a
  closed set.
- **No roughness or normal maps.** Colour map only. A roughness map would read well on
  end grain in particular, and it is deliberately left for later rather than bundled in.
- **No grain controls in the UI** beyond the two-state select — no seed picker, no
  grain scale, no per-board texture choice.
- **No change to `units`, `storage`, or the `StorageAdapter` seam.**
- **Nothing else from `docs/follow-ups.md`** beyond item 5, which is taken because it
  sits inside the version gate this spec is already editing.
