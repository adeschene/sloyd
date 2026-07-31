# Sloyd v3 — the orientation model, and grain that looks like wood

> Two problems found by using v2 on real work. They share a schema field and a
> texture pipeline, so they ship together.

1. **The orientation model reaches four of the six ways a board can sit,** and the
   two it misses are the upright ones — so a table leg, a post, a stile and a
   vertical divider are all unmodellable. Separately, grain is welded to the part's
   length, so grain running across a part is unreachable and no two parts meeting at
   a right angle can share a grain direction.
2. **Face grain reads as squiggly lines,** because that is literally what it is:
   seventy independent random sinusoids. Edge and end grain read correctly.

Joinery moves behind this. It was next; this is worth doing first, because both
problems are in the model joinery would build on.

---

## 1. The gaps, precisely

### Length can never be vertical

`boardExtents` today:

| posture | turn | X | Y | Z |
|---|---|---|---|---|
| flat | 0° | **length** | thickness | width |
| flat | 90° | width | thickness | **length** |
| on edge | 0° | **length** | width | thickness |
| on edge | 90° | thickness | width | **length** |

`length` lands on X or Z in all four branches. There are six ways to assign three
dimensions to three axes; Sloyd reaches four. `standing` does not stand a board up —
it tips it onto its edge.

### Grain is welded to length

`boardExtents` assumes fibres run along `length`, so the only way to point grain along
Z is to make the part's length run along Z. Two consequences:

- **No continuous grain across a right-angle butt joint.** Board A 24" long running X,
  board B butted to its end running Z: A's grain runs X, B's runs Z, and there is no way
  to say "B's grain runs across its width."
- **No cross-grain parts at all** — a plywood panel cut across the sheet, or an
  end-grain cutting board (fibres running through the thickness).

---

## 2. Schema v3

`standing: boolean` becomes `posture: 'flat' | 'on-edge' | 'upright'`, and a new
`grain: 'length' | 'width' | 'thickness'` defaults to `'length'`. `rotation` stays
`0 | 90`, degrees about the vertical axis, applied after posture. `CURRENT_VERSION`
goes to 3.

**Posture names which dimension points up.** That is the whole model:

| posture | up |
|---|---|
| `flat` | thickness |
| `on-edge` | width |
| `upright` | length |

The other two dimensions take X and Z, and `rotation` picks which is which: **at 0°,
the earlier of `[length, width, thickness]` goes on X; at 90° they swap.** One rule,
six rows:

| posture | turn | X | Y | Z |
|---|---|---|---|---|
| flat | 0° | length | thickness | width |
| flat | 90° | width | thickness | length |
| on-edge | 0° | length | width | thickness |
| on-edge | 90° | thickness | width | length |
| upright | 0° | width | length | thickness |
| upright | 90° | thickness | length | width |

The first four rows are byte-identical to what v2 does today. That is not a
coincidence to be grateful for — it is the check that the general rule is the right
generalisation, and it belongs in the tests as one.

### The migration becomes a chain

v2→v3 maps `standing: false → 'flat'`, `standing: true → 'on-edge'`, and gives every
existing board `grain: 'length'` — exactly what v2 meant, so the step is
**extent-neutral** like the last one and adjusts no positions.

The part that is genuinely new: **a v1 file must now walk 1→2→3 in order.** v1's
`rotation: 270` folds to `90` at the v2 step, and only then gains a posture at the v3
step. `CLAUDE.md` has promised since v1 that migrations step forward one version at a
time; v2 was the first step and never exercised the promise, because there was nothing
to chain to. This does.

Both steps run on raw board data **before `validateBoard`**, for the reason v2's
invariant 11 already states: the validator falls back for unrecognised values, so a
fold running after it silently rewrites rather than upgrades. `validateBoard` gains
fallbacks for the two new fields — an unrecognised `posture` becomes `'flat'`, an
unrecognised `grain` becomes `'length'` — as last-resort garbage handling, not as a
migration path.

---

## 3. One source for the axis mapping

`boardExtents` (in `document`) and `axisDimensions` (in `viewport`) currently encode
the same fact twice. `CLAUDE.md` carries an invariant about them not drifting, and
`grainFaces.test.ts` carries a test whose only job is asserting they agree.

With posture as an explicit field the mapping is a table, so `axisDimensions` moves
into `document/geometry.ts` as the single source and `boardExtents` derives from it:

```ts
export function axisDimensions(board: Board): [Dimension, Dimension, Dimension] {
  const up = UP[board.posture];                          // flat->thickness, on-edge->width, upright->length
  const flat = ORDER.filter((d) => d !== up);            // ORDER = ['length', 'width', 'thickness']
  const [x, z] = board.rotation === 90 ? [flat[1], flat[0]] : flat;
  return [x, up, z];
}

export function boardExtents(board: Board): [number, number, number] {
  const [x, y, z] = axisDimensions(board);
  return [board[x], board[y], board[z]];
}
```

`viewport/grainFaces.ts` imports it instead of restating it. This **retires** an
invariant and deletes a test rather than adding to either — the duplication existed
only because the mapping was implicit in a boolean.

---

## 4. Grain kind per face, generalised

Today's rule (length→end, width→edge, thickness→face) is the special case of:

- the face whose normal runs along the **grain** dimension shows **end** grain
- **face** grain goes to the first of `[thickness, width, length]` that is not the
  grain dimension
- **edge** grain goes to the one left over

| grain | end | face | edge |
|---|---|---|---|
| `length` | length | thickness | width |
| `width` | width | thickness | length |
| `thickness` | thickness | width | length |

The first row is today's behaviour unchanged. The third is an end-grain cutting
board: rings on the broad faces, long grain on the sides.

### Grain direction in the UV mapping

`grainTiling.ts` ranks the three dimensions to decide which one the drawn texture's
`u` follows, and that rank currently hardcodes length first — because grain ran along
length. It becomes a function of the board: **the grain dimension ranks first, then
the rest in `[length, width, thickness]` order.**

Everything else in that module is unchanged, including the `FIT` handling — and `FIT`
on wood ends is now doing more work than it was. An end face used to be small by
construction; with `grain: 'thickness'` it can be the board's broadest face. `FIT`
stays correct there, and for a physical reason: a 24" × 5½" end face means stock at
least 24" across, so one ring set spanning it is exactly right. The ring scale should
follow the piece's cross-section, which is what `FIT` means.

---

## 5. One log, three cuts

Face, edge and end are currently three unrelated drawings, which is part of why they
do not look like the same board. They become three cuts through one model.

### The model

Growth rings are nested cylinders about the pith, their radius wobbling along the
grain: `r_k(z)`. A cut plane at distance `d` from the pith meets ring *k* where
`r_k(z) ≥ d`, at

```
x_k(z) = ±√( r_k(z)² − d² )
```

That formula is the cathedral. Where `r_k(z)` dips below `d` the two branches meet and
the band closes into an arch; where it stays well above, the branches run nearly
parallel. Real flatsawn boards look exactly like that: arches crowded along one line,
straightening toward the edges.

The three kinds are three values of `d`:

- **face** — `d` large (a flatsawn slice, far from the pith): broad cathedrals
- **edge** — `d ≈ 0` (quartersawn, through the pith): the tight near-straight lines
  that already read correctly, now falling out of the same model rather than being
  drawn separately
- **end** — the cross-section itself: concentric rings

### Making it tile

The tile has to be seamless in both directions, and the naive ring family is not. Both
axes are fixed by construction rather than by patching:

- **Along the grain (`u`)**, the wobble is a sum of sinusoids with integer periods
  across the tile, so the curve and its slope match at both edges. This is what the
  current streaks already do and it works.
- **Across the grain (`v`)**, choose the ring radii so the pattern is periodic:
  place band *k* at mean offset `kΔ` where `Δ = SIZE / N`, which means
  `r_k = √(d² + (kΔ)²)`, and give band `k` and band `k + N` the same wobble phase.
  Then the pattern repeats exactly every `SIZE`.

The second point is worth stating as the reason the radii are chosen the way they are,
because it looks arbitrary otherwise. It also keeps the physics: with `d ≈ 0` the
formula degenerates to `x_k(z) = kΔ(1 + wobble)`, straight-ish evenly spaced lines,
which is quartersawn — the model gives the right answer at both ends of its range.

**End grain needs no tiling at all**, and that is not luck: end faces use `FIT`, so
exactly one copy is ever shown. Concentric circles cannot tile, and they never have to.

### Bands, not hairlines

Each ring draws as an earlywood→latewood gradient — a soft wide band darkening to a
hard thin line at its outer edge — rather than a single stroke. That is the other half
of why the current texture reads as line art rather than timber.

### What does not change

Greyscale masks tinted by `MATERIALS[...].color`, nine cached textures keyed by
(family, kind), seeded PRNG with no `Math.random`, module-level cache never disposed,
and no per-board mutation of a texture. Plywood and MDF keep their own drawing; only
the `wood` family becomes log-derived.

### Where the maths lives

A new pure `src/viewport/grainLog.ts` owns the ring geometry — radii, the wobble, and
`x_k(z)` — and is unit-tested. `grainTexture.ts` keeps only canvas strokes.

This is deliberate: the last round flagged that `hash` and `seededRandom` were pure
and DOM-free but untested only because they sat in the canvas file. They move to
`grainLog.ts` and get tested. The split is the same one that made `grainFaces` and
`grainTiling` testable while `grainTexture` was not — applied to the part of the
drawing code that is actually maths.

---

## 6. The panel

```
ORIENTATION
  Posture   [ Flat        ▾ ]     Flat / On edge / Upright
  Turn      [ 0°          ▾ ]     0° / 90°

GRAIN
  Runs      [ Along length ▾ ]    Along length / Across width / Through thickness
```

Three selects, same shape as the existing Material select. "Turn" rather than
"Rotation" because with three postures it is no longer the only thing that rotates the
board; the stored field stays `rotation`, in degrees, as in v2.

`reorientedPosition` needs no new rule — preserve the footprint's X and Z centre,
preserve Y-min — but it now fires on posture changes too, and standing a 24" board
upright is the largest pivot the app can perform. It gets its own test.

---

## 7. Testing

**Unit:**

- **The posture table** — all six rows of `axisDimensions`, asserted directly. Plus
  the generalisation check: the four v2-reachable rows must be identical to what v2
  produced, which is what makes this a generalisation rather than a rewrite.
- **`boardExtents` derived from `axisDimensions`** — same values as before for every
  pre-existing orientation.
- **Migration** — v2→v3 maps `standing` to posture and defaults grain, changes no
  extents and no positions; **v1→v3 chains in order**, so a v1 board with
  `rotation: 270, standing: true` arrives as `rotation: 90, posture: 'on-edge',
  grain: 'length'`; an unrecognised posture or grain falls back at validation; a v3
  file round-trips.
- **`faceGrainKinds`** — the three-row grain table above, across postures.
- **UV rank** — `u` follows the grain dimension, for each of the three grain values;
  plywood's ply stack still lands across the thickness; the `FIT` axes still carry no
  per-board offset.
- **`reorientedPosition`** — standing a board upright preserves the X/Z centre and
  leaves it on the floor.
- **`grainLog`** — a plane through the pith gives constant `x` (straight quartersawn
  lines); a plane outside a ring gives no intersection; a band closes exactly where
  `r_k(z) = d`; the wobble has equal value and slope at both tile edges; band `k` and
  band `k + N` agree, which is what makes the tile seamless across the grain.

**Browser:** a leg standing upright; two boards at a right angle with continuous grain
across the joint; cathedral figure that reads as wood; an end-grain board. Final
aesthetic judgement is the user's, on real hardware — the software-GL caveat
(follow-up 26a) applies to judging appearance even though canvas generation itself is
CPU-side and trustworthy here.

**Gate:** `npm run build`.

---

## 8. Non-goals

- **No joinery, no cut list.** Joinery moves behind this work and gets its own spec.
- **No free-angle rotation.** Six orientations, all axis-aligned.
- **No per-species pore structure.** Ring-porous oak versus diffuse maple was
  considered and deferred: it costs a fourth texture family and a species→pore-type
  map, for a difference smaller than the one this spec is already making.
- **No new materials**, no change to `units`, `storage` or the `StorageAdapter` seam.
- **No change to plywood or MDF drawing.** Only the `wood` family becomes log-derived.
- **Nothing else from `docs/follow-ups.md`.** Items 31-35 stay open; item 32
  (`hash`/`seededRandom` untested) is closed incidentally by the `grainLog.ts` split,
  and should be marked closed when it is.

---

## 9. A note on bumping the schema twice

v2 shipped hours before this was written, and v3 changes the same field again. Saved
files are safe — the chain is exactly what makes them safe, and this is the release
that proves the chain works rather than merely asserting it. But it is worth being
honest that the v2 orientation control was designed against an incomplete model:
collapsing four rotations to two was correct, and it left `standing` unexamined next
door. The lesson is in the record rather than in the code.
