# Sloyd joinery — stock removed, not stock painted

> Boards can be laid out next to each other. They cannot yet be joined *into* each
> other, so nothing in a model shows whether the parts actually fit. This adds one
> subtractive primitive — a rectangular through-cut — and the dado and the rabbet
> both fall out of it.

The cut list stays behind this, and is the reason to do it in this order: a cut list
that does not know about joinery reports the wrong numbers for every part with a dado
in it. The parametric board model exists specifically to make both cheap.

---

## 1. What v1 of joinery is

**One primitive: a rectangular removal that runs fully across one of the board's
dimensions.** A dado is that cut taken in the middle of a face; a rabbet is the same
cut taken at an edge. They are not two features and they are not two types — the
difference is where the cut sits, so it is *derived*, never stored.

Deliberately not in this release: stopped dados (a second "how far does it run"
number on every cut, and a decomposition that stops being a grid), and mortise and
tenon (a tenon leaves stock proud *beyond* the board's stated length, which breaks
the assumption that a board's AABB is its stated dimensions). Both are listed in
non-goals with the reason, not merely omitted.

---

## 2. The `Cut` type — part-local, exactly like `Grain`

```ts
export interface Cut {
  id: string;
  /** The dimension the cut goes *into*. 'thickness' is a dado in the broad face. */
  face: Dimension;
  /** Which end of `face` the cut enters from. */
  from: 'min' | 'max';
  /** The dimension the cut runs fully across. Must differ from `face`. */
  across: Dimension;
  /** Along the remaining (implied) dimension: where the cut starts... */
  offset: number;
  /** ...and how wide it is. */
  width: number;
  /** How far into `face` the cut goes. */
  depth: number;
}
```

`face` and `across` name two of the three dimensions; the third — the **position
axis** — is implied and never stored. `offset` and `width` are measured along it,
from its min end. Storing the position axis as well would let a board hold a cut
naming the same dimension twice, so it is computed rather than recorded.

Everything is named in `length` / `width` / `thickness`. Nothing here is in world
axes, so a cut survives posture and rotation for the same reason `grain` does, and
for the same reason the cut list will want: *"a 3/4" dado, 1/4" deep, 6" from the
end"* is already the sentence you take to the bench. A world-space cut would be
wrong the first time a part stood up.

`Board` gains `cuts: Cut[]`.

### Dado versus rabbet is derived

A cut is a **rabbet** when it is flush with one end of its position axis
(`offset === 0`, or `offset + width` equal to that dimension), and a **dado**
otherwise. This is a label — for the panel today and the cut list later — computed
by a small pure function. Storing a kind field would let the kind disagree with the
geometry.

---

## 3. Schema 4

`CURRENT_VERSION` goes to 4. The migration chain gains one step:

```
if (d.version < 2) foldRotationToV2(d)     // 180 -> 0, 270 -> 90
if (d.version < 3) addPostureToV3(d)       // standing -> posture, grain defaulted
if (d.version < 4) addCutsToV4(d)          // cuts defaulted to []
```

`addCutsToV4` defaults `cuts` to `[]` on **raw board data, before `validateBoard`**,
in version order — invariant 11. This step is the mildest of the three (the default
is empty, and `validateBoard`'s fallback would be the same empty array), but it runs
in the same place as the other two on purpose: the chain's value is that every step
is in one shape, so the next step that *does* have a divergent fallback inherits the
correct structure rather than the author having to notice.

A v1 file therefore walks 1→2→3→4. That is a test.

---

## 4. Decomposition — `src/document/cuts.ts`

A new leaf module beside `names.ts` and `geometry.ts`, exporting a pure

```ts
boardSolids(board: Board): Solid[]
```

where a `Solid` is a part-local min/max box in (length, width, thickness) space. The
viewport turns those into world boxes through `axisDimensions`; no mapping is
restated in the viewport, which is what invariant 13 was retired for.

Three steps, all **exact** — not approximate — because every cut is axis-aligned and
so is every board:

A cut occupies the full extent of its `across` axis, `[offset, offset + width]` on
the position axis, and — this is where `from` is consumed, and the only place it is —
either `[0, depth]` or `[faceDim − depth, faceDim]` on the `face` axis. Turning a
`Cut` into that part-local box is one small function, and every step below reads the
box rather than the cut.

1. **Split.** On each of the three part-local axes, collect every cut box's two
   boundary coordinates on that axis, clamped into `[0, dimension]`, plus `0` and the
   dimension itself. Deduplicated and sorted, these define a small 3D grid of cells.
   Two cuts give at most 27.
2. **Drop.** A cell is removed when its centre lies inside *any* cut. This is the
   whole of overlap handling: the **union** of the cuts is subtracted, so stock
   covered by two cuts is removed once and never twice, and no pairwise intersection
   case exists to get wrong. Testing a cell's centre is sound precisely because the
   split step guarantees no cell straddles a cut boundary.
3. **Merge.** A deterministic greedy sweep — axis by axis, in a fixed order, merging
   any two surviving cells that share a full face. Fewer draw calls, but the visible
   reason is edge lines: without merging, an uncut face shows interior seams wherever
   an unrelated cut's boundary plane crossed it.

**A board with no cuts must produce exactly one solid, whose extents equal
`boardExtents(board)` today.** That is a test, and it is the guarantee that joinery
costs nothing at all for the boards that do not use it.

Overlap is allowed because it is legitimate: a rabbet along an end plus a dado that
reaches it is an ordinary corner detail, and a validator that rejected it would be
refusing a joint you would really cut.

---

## 5. Rendering — N boxes, and the grain layer intact

This is the constraint that chose the approach, so it is written down rather than
implied. `boardUVs` returns a `Float32Array(48)` — 24 UV pairs, one per
`BoxGeometry` vertex — and `faceGrainKinds` assigns a grain cut per box face. **The
whole v3 grain layer is written against box topology.** CSG subtraction produces
arbitrary triangle counts and would invalidate invariants 12, 14 and 15 together;
that is not a rendering preference, it is v3's headline feature being rewritten
inside a rendering choice. Sub-box decomposition keeps every box a box.

`BoardMesh` maps over `boardSolids(board)` and draws one `BoxGeometry` per solid.

### UVs stay parent-relative

`boardUVs` generalises from *"UVs for this board"* to *"UVs for this solid within the
board's frame"* — same tile size, same swap rule, same per-board offset, evaluated
over a sub-range instead of the whole. The consequence is the point: the figure runs
**continuously across** a dado rather than restarting at it, which is what makes the
cut read as stock removed from one board instead of two boards pushed together.

The per-board offset rule of invariant 12 is unchanged, and it is still the *board's*
offset, not the solid's — a per-solid offset would break the continuity this section
exists to get.

### Face grain kinds need no new concept

A face's grain kind already follows its world-axis normal, so the floor and walls of
a dado get theirs from the same `faceGrainKinds` call as everything else: the floor
of a dado in the broad face shows face grain, and its two shoulders show end grain.
That is correct, and it falls out rather than being special-cased.

### The memo trap, named in advance

`BoardMesh`'s geometry memo keys on `[extents[0..2], boardUVSignature(board)]`. Cuts
change a board's geometry but change **neither its extents nor the current
signature** — so cuts would silently fail to render while the document stayed
correct, the per-face materials updated normally, and everything looked like it
worked. That is invariant 15's failure mode exactly, and it is the same shape that
already cost a browser gate once.

Therefore, as a numbered requirement rather than a discovery: **`boardUVSignature`
must cover `cuts`**, and it stays the single thing anything memoising on
`boardUVs`-inputs keys on. It continues to exclude `position` and `name`.

Selection highlight and edge lines derive per solid, so a board with a dado still
highlights and outlines as one part.

---

## 6. Store and panel

`store` gains `addCut`, `updateCut` and `removeCut`, gesture-coalesced like every
other edit, with the same lazy snapshot rule (invariant 4).

**`cuts` is deliberately absent from `updateBoard`'s reorient predicate.** A cut
removes stock from inside the board's AABB: it never changes the extents and never
moves the board, so reorienting on a cut change would be a no-op pivot. This is the
same reasoning that keeps `grain` out of that predicate, and it is recorded here so
the absence reads as a decision rather than an omission.

`Properties.tsx` grows a **Cuts** section for the selected board: an *Add cut*
button, then per cut a `<select>` for `face`, one for `from`, one for `across`, three
`DimensionField`s for `offset` / `width` / `depth`, and a delete control.

Reusing `DimensionField` is not incidental — it is how these three new numeric inputs
inherit invariant 5's dirty guard and blur resync instead of reimplementing them and
reintroducing the staleness bug in three more places.

The `across` select offers only the two dimensions that are not the current `face`,
so the illegal pair is unreachable through the UI as well as unrepresentable in the
type. Changing `face` to the dimension currently held by `across` moves `across` to a
legal value in the same edit — the panel is never asked to render a `<select>`
holding a value with no matching `<option>`, which is the rule follow-up 46 arrived
at for `grain` on sheet goods.

---

## 7. Validation

The two paths differ on purpose.

**On load, `validateBoard` clamps.** `offset` and `width` are clamped into the
position axis; `depth` is clamped to at most the face dimension. A cut with
non-positive width or depth after clamping is dropped. A saved document must always
open, and a board whose length was later shrunk below an existing cut is a real case
rather than a corrupt file — so the cut is brought back inside the board, not
rejected and not silently vanished.

**In the panel, entry is refused.** An out-of-range number shows an inline error and
is not committed, the way `DimensionField` already refuses an unparseable length.
Silently correcting a number the user just typed would lose a measurement without
saying so.

A `depth` equal to the full face dimension severs the board. That is legal, clamps to
itself, and decomposes correctly into two disconnected solids — it is a rip, not a
malformed cut, and the renderer needs no special case for it.

---

## 8. Testing

The weight goes on `cuts.ts`, because the r3f viewport has no unit tests by design
and this host's software GL cannot be trusted for geometry (follow-up 26a). All of
these are CPU-side and exact:

- No cuts → exactly one solid, extents equal to `boardExtents(board)`.
- One dado in the middle of a face → three solids.
- A rabbet → two solids.
- Two overlapping dados → removed volume equals the volume of the **union**, not the
  sum. This is the test that would catch double-removal.
- A cut at full depth → two disconnected solids.
- Merging is deterministic: the same board yields the same solids in the same order.
- The dado/rabbet label agrees with the geometry at both ends of the position axis.

Plus: the migration chain (a v1 file walks 1→2→3→4 and lands with `cuts: []`), the
clamping rules including the drop cases, and the sub-box UV cases in `grainTiling`.

**Browser gate:** a dado is visible in the render, and grain runs across it
continuously. Pixel-diffed before and after, because that is what caught the
`boardUVSignature` bug in v3 and section 5 predicts the same shape here.

**Typecheck gate:** `npm run build`. `npm test` does not typecheck.

---

## 9. Non-goals

- **No cut list.** Still next, and this is what makes it cheap.
- **No stopped dados.** They need a second run-length number per cut and turn the
  decomposition from a grid into something less tidy. Deferred with a reason.
- **No mortise and tenon, and nothing additive.** A tenon leaves stock proud of the
  board's stated length, which breaks the AABB assumption the whole app rests on.
- **No per-cut viewport gizmo.** A second `TransformControls` next to the existing
  one is where invariant 3's drag-guard trap lives. Cuts are entered numerically.
- **No cuts at an angle**, matching the six axis-aligned orientations.
- **No new materials**, no change to `units`, `storage` or the `StorageAdapter` seam.
- **Nothing else from `docs/follow-ups.md`.** Item 47 stays open as a recorded
  finding.
