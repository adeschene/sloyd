# Sloyd — held and stable (follow-up 165)

**Date:** 2026-10-03 · **Status:** approved in conversation, section by section
**Builds on:** `2026-10-03-sloyd-generate-design.md` (§4.3, the checks) and
`2026-10-03-sloyd-batch-variety-design.md`. Every rule there still holds unless this
document says otherwise.

## 1. Problem and goal

`checkDesign`'s support rule is **topological**. It walks out from the floor through any face
contact, in **every** direction, sideways included. So "connected" passes parts a woodworker
would call unsupported. The user chose two of the four candidate failure classes to catch
now:

1. **Tipping**: the piece's weight overhangs what touches the floor.
2. **Hanging**: a part held by nothing a build could rely on.

Contact-size rules in general and "something else" were not chosen. Rule 2 below does use
coverage, but only to decide whether a part is held *between* two parts.

**The evidence that shaped rule 2** is the user's exported workbench
(`Simple-workbench.sloyd`, the Generate round's live pass, Sonnet 5.5). Its lower shelf
(y 5.25–6.0) sits **under** the four low rails (y 6.0–9.5), not on them. Those rails also lie
outside the shelf's outline in plan, so the shelf meets them along a line only, and a line
is not support. What actually holds the shelf is four 0.75 × 2in patches where its ends
brush the legs' inner faces, with nothing under it. Every other part is sound: each rail's
end butts fully into a leg, and the top bears on the legs and top rails over about 380in².

The obvious rule, "held between two parts", **passes that shelf**, because legs touch it on
both X sides. What is wrong is how little of each end is touched: 4in of a 21in end on each
side, **19%**. (An earlier conversational figure of 10% counted one leg per end; two legs
touch each end.) A rail butting into a leg covers about 100% of its end, and so does a
shelf between case sides. So rule 2 measures **coverage**.

The second instance, from the batch variety pass, is side table C: a top and an offset
shelf cantilevered off one spine panel on a plinth. Its shelf meets the spine with one edge
on one side only, so it hangs. The top-heavy layout is what the tipping rule is for.

**Goal:** a generated design whose parts are not *held*, or which would *tip*, is reported
and repaired the way an overlap is today. Designs that are sound, including face-mounted
parts like a backrest screwed to posts, gain no new problems.

## 2. Definitions

All geometry is world-space boxes from `boardExtents` and `position`, the same `Box` that
`checkDesign` already builds. `TOUCH = 1/32`.

**Face contact** between A and B, **on A's face F**: on F's axis, A's face plane and B's
opposite face plane coincide within `TOUCH`; on each of the other two axes, the shared span
is **> TOUCH**. This is today's `connected` rule restricted to contact; a pair whose shared
span exceeds `TOUCH` on **all three** axes is an overlap and is **never** a contact for this
rule. The **contact rectangle** is the shared span on the two in-plane axes.

A box has six faces: `-X`, `+X`, `-Y` (bottom), `+Y` (top), `-Z`, `+Z`.

**Coverage** of face F = (sum of the contact-rectangle areas on F) / (area of F), capped at
1. Parts cannot overlap legally, so on a valid design the rectangles on one face do not
overlap; the cap keeps an invalid design from scoring above 100%.

**Broad faces** of a box are the two faces normal to its **smallest** extent. If two
extents tie for smallest (within `1e-9`), the faces normal to **both** count, so a square
leg has four.

**On the floor**: `min.y <= TOUCH`, the same test the existing grounding uses.

## 3. Rule 2: `hangs`

Every part **not on the floor** must be held in at least one of these ways:

- **(a) Resting:** at least one face contact on its `-Y` (bottom) face.
- **(b) Between:** for the X pair or the Z pair, the coverage of **both** faces is
  **≥ 0.5**.
- **(c) Lapped:** at least one face contact on one of its broad faces, **other than its
  top (`+Y`) face**. *(Amended 2026-10-03 on the user's ruling, after the Task 1 review
  probed it. As first written, (c) counted the top face, so anything set ON a hanging
  shelf, such as a crate on the workbench's shelf, made the shelf "held". Something sitting
  on a part never holds it up.)*

A part that meets none of them gets one violation of kind `'hangs'`.

**Exclusion.** A part already reported `'unsupported'` (not connected to the floor) gets no
`'hangs'` violation. Its fault is already named, and one fault gets one message.

**Message**, written for the model in the module's existing voice (decimal inches, stored
names). Exact template:

```
<Name> is not held: nothing is under it, and its <X|Z> sides are covered <a>% and <b>%<by>; each needs 50%. Rest it on a part below, fit it between two parts that cover its sides, or fasten its broad face to another part.
```

- **The pair reported** is the X or Z pair whose **smaller** coverage is larger: the pair
  closest to passing. On a tie, it is X.
- `<a>` and `<b>` are the two coverages of that pair, `-` face first, each as
  `Math.floor(100 × coverage + 1e-9)`. *(Amended 2026-10-03 on the user's ruling: it was
  `Math.round`, which printed a failing 49.74% as "50% … each needs 50%". Rounding down
  means a failing side never reads as passing; the `1e-9` keeps a computed 0.48999… at 49.)*
- `<by>` is ` (by <names>)`, listing the distinct names of the parts in contact on either
  face of that pair, in board order and joined with `, `. It is empty when neither face has
  a contact.

For the workbench, the shelf's X sides read `19% and 19% (by Front left leg, Front right
leg, Back left leg, Back right leg)`, in board order.

## 4. Rule 1: `tips`

Skipped when **no** part is on the floor, because every part is already `'unsupported'`.

- **Centre of mass**, in the XZ plane: the volume-weighted mean of the box centres. Density
  is ignored; every part counts as the same material.
- **Footprint**: the convex hull, in XZ, of the four plan corners of every on-the-floor box.
- **Margin** `m = min(1, s / 4)` inches, where `s` is the smaller side of the footprint's
  axis-aligned bounding box. A footprint 4in or more across gets 1in, and a smaller one gets
  a quarter of its width.
- **Signed distance** `d` from the centre of mass to the footprint: positive inside. It is
  the minimum, over the hull's edges, of the distance to that edge's line, signed by side.
  With a degenerate hull (fewer than 3 distinct points), `d = -Infinity`.
- If `d < m`, the design gets one violation of kind `'tips'`.

**Message.** Exact template:

```
The piece would tip toward <±X|±Z>: its centre of mass is <dist> <inside|beyond> the edge of what touches the floor; keep it at least <m> inside. Widen the base or move weight inward.
```

- **The direction** is the outward normal of the edge that achieves the minimum, reduced to
  its dominant axis and sign. On a tie, it is X.
- `<dist>` is `|d|` in the module's `inches()` format. `<m>` uses the same format.
- It says `inside` when `d >= 0` and `beyond` when `d < 0`.
- With a degenerate hull the message says `beyond` and the distance is omitted:
  `its centre of mass is not over a usable footprint`.

## 5. Where it lives, and what does not change

- **`src/document/designCheck.ts`**:
  - `ViolationKind` gains `'hangs'` and `'tips'`.
  - Both checks run inside `checkDesign`, after the existing grounding pass, because the
    `hangs` exclusion needs its result.
  - Order of output: the existing kinds as today, then `hangs` (board order), then `tips`.
  - `connected` is unchanged; the existing `unsupported` rule stays as it is.
  - Still pure, and still does not take the `→ units` edge.
- **`src/generate/prompt.ts`**: `SYSTEM_PROMPT` gains two rule lines, verbatim:
  - `- Every part off the floor must be held: resting on a part below it, fitted between two parts that cover at least half of each of its opposite sides, or fastened by its broad face to another part. A part touching only by an edge or its corners is not held.`
  - `- Keep the piece stable: its weight must sit well inside the outline of what touches the floor, so it cannot tip over.`

  They are placed directly after the existing "Every part must connect to the floor…" line.
  The prompt stays fixed text, with nothing per-run in it.
- **Repair loop: no change.** The new violations count in "fewest violations wins" like any
  other, `MAX_REPAIRS` stays 3, and a design with violations remaining is still saved with
  its count.
- **No change to:**
  - invariant 36: generation writes only new, unactivated projects
  - invariant 37: the history is append-only
  - invariant 38: overlap is phase-1 only
  - `src/llm/`
  - the document schema
  - any UI

## 6. Testing

Every test builds real boards (`createBoard`, positions in inches) and calls `checkDesign`.
Nothing is mocked.

**The real workbench.** `src/document/fixtures/simple-workbench.sloyd` is the user's export,
copied byte-for-byte and loaded through `migrateDocument`.

- **Exactly one new violation:** `hangs` for `Lower shelf`, whose message contains `19% and
  19%` and `Front left leg`. No other part gets `hangs`, and the piece does not `tips`.
- **The fix the message suggests:** the same document with the shelf moved onto the low rails
  (its `y` set to 9.5, its plan outline widened over the rails) has no violations at all.
  The plan supplies the exact numbers.

**Side table C, rebuilt from the screenshot.** It has a plinth, a spine on the plinth, a top
on the spine, and a shelf whose edge meets one face of the spine.

- The shelf gets `hangs`, with message `covered 100% and 0%` (or the mirror, per its side).
- With the top offset so the centre of mass falls outside the plinth, the piece gets `tips`.
  The same layout centred over the plinth does not.

**Each way of being held, at its boundary:**

- (a) A top resting on four legs.
- (b) A shelf between two case sides at 50% coverage on each side passes. At 49% it fails.
- (c) A backrest lapped by its broad face onto two posts passes, with nothing under it.

**One fault, one report:**

- A floating part gets `unsupported` and no `hangs`.
- A part that passes 1in into a leg gets `overlap`. Its only "contact" is that overlap, so
  it also gets `hangs`: overlap never holds.

**Tipping:**

- A centre of mass exactly `m` inside passes, and `m - 0.01` fails.
- A 3in-wide footprint uses `m = 0.75`.
- With no part on the floor there is no `tips`.
- One heavy part and one light part pin the volume weighting.

**Prompt.** `SYSTEM_PROMPT` contains both new lines, and the existing "nothing per-run" test
still passes.

**Mutation checks.** Each mutation turns the named test red; mutate before believing.

| Mutation | Test that turns red |
|---|---|
| Drop the 0.5 coverage requirement (any contact on both sides passes) | the real workbench |
| Let one side's contact satisfy (b) | side table C's shelf |
| Drop (c) | the backrest |
| Count an overlap as a contact | the overlap case |
| Drop the margin (`d < 0`) | the exact-margin case |
| Use the unweighted mean of centres | the heavy/light case |
| Skip the `unsupported` exclusion | the floating part |

**Live check** (paid, with the user's approval). Claude drives the dev server and the user
watches.

- Run `"A simple workbench"`: Shop, Moderate, 1 generation, Sonnet 5.5.
- Run the side table batch: oak, Mid-century, Detailed, 3 generations, Sonnet 5.5.
- **Pass:** no finished design keeps a `hangs` or `tips` violation, and the user judges the
  results sound.
- Record repair rounds per run. If designs routinely spend all three rounds on these rules,
  the thresholds are wrong; that is a decision for the user, not a silent retune.

## 7. Docs

- **CLAUDE.md**: add invariant **39**, *support means held, not touching*. It must state:
  - the three ways a part is held;
  - why (c) exists: without it, ordinary face-mounted parts fail and cost repair rounds for
    nothing;
  - that overlap never holds;
  - that coverage, not mere two-sidedness, is what catches the workbench shelf;
  - a prohibition on dropping either (c) or the coverage requirement as "simplification".
- **History**: the round's narrative.
- **Follow-ups**: close 165.

## 8. Out of scope

- Contact-size rules beyond rule 2's coverage, and joint strength.
- Density per material.
- Racking and lateral stability.
- Load on a span (a long shelf sagging).
- Any change to the existing `unsupported` rule.
