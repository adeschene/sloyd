# Cut list diagrams — per-face views

**Date:** 2026-08-01
**Status:** design, approved
**Predecessor:** `2026-08-01-sloyd-diagram-label-layout-design.md`
**Supersedes:** the `(face, across)` view key from
`2026-08-01-sloyd-cut-list-diagrams-design.md` §2

---

## 1. The defect

Perpendicular cuts on one face are not dropped — they are **fragmented**. `buildDiagrams`
keys views on `(face, across)`, so a board with a dado running across its width and
another running across its length produces **two diagrams, both headed "Thickness
face"**: one *across the length*, one *across the width*. Each shows one cut. Neither
shows the other. The same physical face is drawn twice, in two different orientations
and two different aspect ratios, each telling half the truth.

Verified in a real browser, not inferred. A 24" × 12" board with rabbets on all four
edges of both faces plus crossing shallow dados on both faces — twelve cuts, ordinary
casework joinery — produces exactly two diagrams, six bands each, and:

- **Near and far bands coincide.** Rabbets at `offset: 0` on both faces draw at the
  identical position; only hatch-versus-dash separates them, and at six bands per figure
  that reads as noise.
- **Leader rows come in identical pairs.** `0" 1/2" 1/4" deep` appears twice, `6" 3/4"
  1/8" deep` twice, `11-1/2" 1/2" 1/4" deep` twice — a near cut and a far cut at the
  same position produce byte-identical labels.
- **The crossing appears nowhere.** The two centre dados intersect in the middle of the
  board. That intersection is the joint. It is in neither figure.
- Above it all sits a **twelve-line wall of prose**, which is what the diagrams exist to
  replace.

**The diagnosis is the view key.** `across` is in it because keying on the pair
guarantees every cut is a vertical band and there is one layout in the whole feature —
a real simplification, and correct *when every cut on a face is parallel*. It is exactly
what breaks when they are not.

**This is a presentation failure, not a model one.** `boardSolids` splits the board at
every cut boundary and drops each cell whose centre is inside **any** cut, so crossing
dados already remove the overlapped stock exactly once and the 3D viewport renders the
worst case correctly today. Only the drawing fragments.

## 2. Why a flat drawing is still the right answer

A `Cut` is a rectangular removal running fully across one dimension. `positionAxisOf`
returns the dimension that is neither `face` nor `across`, so for a cut on a given face
**both `across` and the position axis are in-plane** — which makes every cut a full-span
rectangle on that face. A per-face plan view is therefore exactly as expressive as the
data model: no more, no less.

The honest ceiling: the diagram and the `Cut` primitive reach their limit at the same
moment — the first stopped dado, mortise, pocket or curve. Neither scales past the
other, and both would need work together. That is a much better position than a drawing
that cannot keep up with the model it draws.

## 3. Goals and non-goals

**Goals**

1. One view per **physical** face. Perpendicular cuts on one face appear in one drawing.
2. Where cuts cross, the intersection is drawn as its own region carrying the depth that
   actually governs there.
3. The drawing and `boardSolids` agree **by construction**, not by coincidence.
4. The depth computation is pure and unit-testable without a browser.

**Non-goals**

- **Extending the `Cut` primitive.** No stopped dados, mortises or pockets. This round
  draws what the model can already express (§2).
- **Showing a far-side cut on the near-side view.** A view shows the cuts made into that
  face. A deep cut from the other side is that other face's setup.
- **A section view.** Depth is annotated, never drawn to scale. A plan view cannot show
  depth geometrically and this design does not pretend otherwise.
- **Changing the document schema.** `CURRENT_VERSION` stays 4. Everything here derives
  from `cuts`, which is already stored.

## 4. The depth field — split, cover, merge

The core is a 2D echo of what `cuts.ts` does in 3D:

1. **Split** the face at every cut boundary on **both** in-plane axes, giving a grid of
   cells.
2. **Cover:** each cell takes the **maximum depth** among the cuts covering it, or 0 if
   none.
3. **Merge** adjacent cells of equal depth into regions.

**Merging is a labelling concern, not a rendering one.** A merged region can be
L-shaped or plus-shaped, which is not a `<rect>` — but it does not have to be drawn as
one shape. The hatch is a `<pattern>` with `patternUnits="userSpaceOnUse"`, so the
pattern is anchored to the drawing rather than to each filled shape, and a run of
adjacent cell rects renders **indistinguishably from a single merged shape**. So the
renderer may emit one rect per cell; the merge exists to decide how many depth labels
and legend lines there are, and where they go. This is the same property the existing
hatch already relies on and is worth stating, because "merge" otherwise implies path
construction that this design does not need.

One rule produces all three cases that would otherwise need separate handling —
perpendicular crossing, parallel overlap, and three-or-more-way overlap — the same way
invariant 16's `boardEdges` rule makes the outer silhouette, the convex corners and the
concave dado shoulders fall out together.

**This is not `cuts.ts` reused, and the distinction is load-bearing.** `boardSolids`
drops a cell whose centre is inside any cut — a boolean. This assigns a maximum. Same
skeleton, different operation; `cuts.ts` is not callable here. Anyone reading "the same
algorithm" and reaching for `boardSolids` will find it does not fit. Call it a **depth
field**, not a solid decomposition.

What the shared skeleton *does* buy is goal 3: a cell has depth > 0 exactly when the
corresponding 3D column has stock removed at that face, so the drawing and `boardSolids`
cannot disagree. §8 turns that into a test rather than leaving it an argument.

## 5. Views and axes

**Key on `(face, from)`** — six possible views, drawn only where that physical face has
at least one cut, with the existing cut-free fallback (`thickness`/`min`) preserved for
the "All parts" toggle. Heading matches the language the prose setup lines already use:
`Thickness face — min side`.

**In-plane axes come from `DIMENSION_ORDER`** (`['length', 'width', 'thickness']`): of
the two in-plane dimensions, the earlier one runs horizontal. This is deterministic,
consistent down a page of parts, introduces no new constant, and puts the longer
dimension horizontal on all three faces of an ordinary board:

| face | horizontal | vertical |
|---|---|---|
| thickness (a broad face) | length | width |
| width (an edge) | length | thickness |
| length (an end) | width | thickness |

A cut spans its `across` axis fully and occupies `[offset, offset + width]` along its
position axis — a vertical band when the position axis is horizontal, a horizontal band
when it is vertical. A crossing is one of each.

`fitView`'s clamps carry over unchanged and are needed more, not less: an end-grain face
(width × thickness) is a sliver and `MAX_ASPECT` is what keeps it drawable.

## 6. What this retires

Splitting on `from` means every view shows exactly one side, so the near/far distinction
has nothing left to encode. **`DiagramView.hasFar`, the `stroke-dasharray`, the
`.cutlist-diagram-leader-far` class and the caption's "hatched: this side · dashed: far
side" are all removed.**

This is recorded prominently because the dashed leader line was *added one round ago*,
as the replacement second encoding for near/far after depth moved off the outline.
Without this paragraph it reads as regressing that decision. It is not: the encoding
becomes unnecessary when the two sides no longer share a drawing. A reviewer should
check that it is gone, not that it survived.

## 7. Fills and labels

**Two fills, and only two.** Ordinary hatch for a cut region; cross-hatch for an
intersection region. Fill-per-depth was considered and rejected: it needs one distinct
pattern per distinct depth on the face — unbounded — and hatch legibility cannot be
verified in print on this host (§8).

**An intersection is only distinguished when the covering cuts' depths DIFFER**, and
this falls out of §4 rather than needing its own rule. Two crossing cuts of equal depth
produce a uniform depth field across both bands and their overlap, so step 3 merges the
whole plus-shape into one region — and correctly so: when both cuts are ⅜" deep there is
nothing about the intersection to report, and cross-hatching it would invent a
distinction the stock does not have. Cross-hatch and a legend line appear exactly when
the merge yields an overlap region whose depth differs from at least one of the bands
producing it, which is precisely the case where a person needs telling which depth
governs.

**Depth stays per cut, in that cut's leader row**, where it already lives and reads
well. The legend under the figure carries **one line per intersection region only**:
*crossing: 1/4" deep governs*. Same information as fill-per-depth, bounded visual
language.

**Labels on two axes.** Cuts positioned along the horizontal axis keep today's leader
rows below. Cuts positioned along the vertical axis get leader **columns** at the left,
text rotated −90°.

`packRow` is reused verbatim — it is axis-agnostic 1-D arithmetic, so feeding it
y-coordinates works unchanged.

**But one premise of `diagramLabels.ts` breaks, and it needs a new measured constant.**
`labelWidth(s) = s.length × CHAR_W` measures advance *along the text direction*. For a
`rotate(-90)` label the extent along y is the advance (so `packRow` is correct), while
the extent along x is the **glyph box height** — which nothing in production models.
That number currently exists only hard-coded in a *test helper* (~15 units above the
baseline, ~5 below, at `LABEL_SIZE = 20`). It becomes a real export beside `CHAR_W`,
**measured in a browser exactly as `CHAR_W` was, not derived from the font size.** The
test helper then reads the production constant instead of restating it.

## 8. Testing

**Layer 1 — the depth field, pure and fully unit-testable.** No cuts; one cut; two
parallel disjoint; two parallel overlapping; two perpendicular crossing **of differing
depths**; two perpendicular crossing **of equal depth** (which must merge to one region
and produce no legend line — the §7 case that is easy to get backwards); three-way
overlap; a cut covering the whole face. Assert the region partition and each region's
depth.

**Layer 2 — the agreement test, and the strongest test in the round.** For a set of
boards, assert that a cell has depth > 0 **exactly when `boardSolids` removed stock at
the corresponding column**. This pins goal 3 to a test instead of leaving it an
argument, and it is the test that would catch the depth field and the 3D model drifting
apart in some future change to either.

**Layer 3 — layout.** The geometry-collision predicate built last round carries over,
extended to the vertical axis. Same stated boundary as before: it tests the *model* of
text extent, not the browser's rendering of it.

**Not testable, carried forward rather than re-promised:**

- **Hatch versus cross-hatch legibility** is a browser judgement, in the same category
  as `MAX_ASPECT` and `MAX_HEIGHT` (follow-up 60) — pattern spacing gets named constants
  so a browser pass can retune without touching geometry.
- **Print-to-PDF remains unverifiable on this host**, because the available Playwright
  exposes no `pdf()`. This was recorded honestly in the previous round (follow-up 70) and
  is carried forward, not re-promised. Both fills are SVG `<pattern>` foreground content,
  so they survive Chrome's "Background graphics" off — the same reasoning that made the
  original hatch a pattern rather than a CSS background — but that is an expectation
  here, not a verification.

## 9. Sequencing

The depth field (`document/diagram.ts`, pure, no rendering) and the vertical-column
layout (`panels/PartDiagram.tsx`) must be **separate tasks**. They are independently
reviewable, they fail in different ways, and the second is substantially riskier. A plan
that lands them together forfeits the ability to reject one and keep the other.

## 10. Risks

- **The vertical leader column is the riskiest piece.** Rotated text is the one place
  this codebase has no prior art, and its width model is a new measured constant that
  could be wrong in the unsafe direction — exactly the shape of `LABEL_EM`'s recorded
  risk (follow-up 66). It must be measured in a browser and bounded from above.
- **Two fills may not be enough** for a face carrying several distinct depths, where the
  legend line per crossing does the real work and the drawing shows only "cut" versus
  "crossed". Accepted deliberately over unbounded patterns; revisit only with browser
  evidence.
- **View count rises** — a board cut on both broad faces now yields two figures where it
  yielded one, and a heavily-joined part could reach four. The prose setup lines and the
  row identity are unchanged, so the sheet gets longer rather than wrong. Worth a browser
  look at total sheet length before this is called done.
