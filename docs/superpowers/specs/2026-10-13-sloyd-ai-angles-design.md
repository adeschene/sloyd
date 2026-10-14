# Sloyd — the AI features accept miters, bevels and chamfers

**Date:** 2026-10-13 · **Status:** approved by the user (with the tenon-clearance exception, §3, ruled while writing; three
examples corrected while planning, marked *amended*). Chunk 1 (§2–§4.1) implemented and merged 2026-10-13 (`be4c87c`); chunk 2 implemented and merged 2026-10-14 (`a4914f1`). *Amended
while executing chunk 2:* the design schema defines the part and the direction once in `$defs` (§5.1's arrays unchanged in
shape) — the API refused the inline form's compiled grammar (fu 322); and `CHARS_PER_TOKEN` was not re-measured (§8; the
estimate counts the real prompt and schema).
**Builds on:** the angle-cuts spec (`2026-10-12-sloyd-angle-cuts-design.md`: the `AngleCut` model, §6 refusals) and the
AI-tapers spec (`2026-10-13-sloyd-ai-tapers-design.md`: flat-wood contact, the taper-at-joint rule, world-direction design
tapers), plus the generate, joinery, refine and refine-joined specs. Every rule there still holds unless this document
says otherwise. **No document schema change** (all four kinds are already schema 14); only the *design* schema the model
writes changes (chunk 2), so a rollback costs nothing.

**Origin:** the remainder of fu 276/277. Tapers went through the AI features in the AI-tapers round; miters, bevels and
chamfers are still refused by Add joinery, Repair and Refine (`angledRefusal`, invariant 48) and cannot be written by
Generate. Angle-aware joint kinds (splined and biscuited miters, the other half of fu 276) stay out of scope.

## 1. Goal and the user's rulings

**Goal:** the Claude features stop refusing miters, bevels and chamfers. A hand-made chamfered or mitered project can be
joined and repaired; Generate can emit chamfered tops, beveled panels and mitered frame corners; Refine keeps them.

**Decided in conversation:**

- **Accept the angles; no new joint kinds.** A miter, bevel or chamfer reaching into a joint refuses the joinery run,
  naming the part, as a taper does today.
- **A miter does not hold.** A sloped face is never a contact (the checks' existing rule). An upright frame held only by
  its miters is reported (its top rail; amended while planning, §4.1); that is honest for a plain glued miter. A structural
  miter is fu 276's splines.
- **Approach 1: world words for every kind**, the AI-tapers pattern (not carrying angles through Refine unseen, not a
  generic stored-form array).
- **Two chunks, each with its own plan and deploy.** Chunk 1 (§2–§4): the checks, joinery and Repair accept the angles,
  with no change to what Claude reads or writes. Chunk 2 (§5–§8): Generate and Refine read and write them.

---

# Chunk 1 — the checks, joinery and Repair

## 2. Flat wood: what contact trusts

Contact (held/hangs contacts, grounding's `connected`, the tip footprint) reads `contactSolids` for an angled part
(invariant 38). Today `contactSolids` throws on any kind but `taper`.

### 2.1 The touched box

Every angle cut is a line in its (`along`, `face`) plane, running straight through `throughOf(c)`. Its **touched box**,
in board-local coordinates, is the smallest box holding every point the cut can remove:

- along `along`: the stations (from `alongFrom`) where the line's depth is above 0 — `[0, zeroStation)` when the line
  shallows to 0 inside the part, the whole dimension when it never does, read through `depthAt`/`zeroStation`;
- along `face`: from the `from` face to the line's greatest depth over those stations (clamped to the dimension);
- along `throughOf(c)`: the whole dimension.

A cut that removes nothing (`angleCutRemovesNothing`) has no touched box.

### 2.2 The split

For a **miter, bevel or chamfer**, each pocket cell is split by the cut's touched box `T` into at most two boxes that
**do not overlap**:

- **A** — the cell's stations along `along` outside `T`'s station range, at the cell's full extent on every other
  dimension;
- **B** — the cell's stations inside `T`'s station range, kept only on the far side of `T`'s greatest depth along `face`.

Their union is the cell minus `T`. A part with several such cuts splits every resulting box by each cut in turn (in stored
order; the result's union is the same in any order). The pieces never overlap, so `coverage` (the 50% rule, invariant 39)
never counts a face twice; nothing a cut removes is ever trusted, because `T` contains everything it removes.

**Tapers keep today's rule byte for byte** (`taperFields`, the length clip and the end slabs). A part carrying a taper and
another kind applies the taper rule first, then splits its output by each non-taper cut.

What this means: a top chamfered on its upper edges still rests fully on its aprons; a mitered end trusts nothing past
its short point; a sloped face is never a contact (the user's ruling, §1). The doc comment on `contactSolids` and
invariant 38's text in CLAUDE.md are updated to say so.

### 2.3 Overlap and the tip check

Already measured on real bodies for any part with an angle cut (fu 302, 303: the gate is `angleCuts.length > 0`). They
lose only the "tapers only" premise in their comments. **`isTapered` is renamed `isAngled`** (what it tests); every caller
and comment follows.

## 3. The joint rule widens

`taperConflicts` (in `generate/joints/tapers.ts`) is unchanged for tapers, limit advice included. Beside it:

- **A miter, bevel or chamfer conflicts with a site** when its touched box (§2.1), crossed to world space through
  `worldBox`, overlaps the site's contact patch **with positive area** (both in-plane spans above `TOUCH`). Touching the
  patch's edge does not conflict (the analogue of a taper's `start` itself being allowed).
- The patch is the same box contact `taperConflicts` reads (sites stay on box contacts, invariant 41).
- **The tenon-clearance exception** (the user's ruling, made while writing this spec: a rail chamfered along its length
  must stay joinable). At an `end-into-face` site, a cut on the ENTERING part that runs straight through the joined end
  — `throughOf(c)` is the entering part's dimension along the site's axis — does not conflict when its touched box's
  cross-section (its `face` and `along` spans) is disjoint from the tenon's section, touching allowed: thickness
  `[cheek, thickness − cheek]` × width `[shoulder, width − shoulder]` from `tenonSection` (`recipes.ts`, exported for this).
  The tenon is the narrowest joint joinery can choose there (a dado or butt takes the whole end), so every joint kind
  stays whole; the cost is a small notch in the shoulder. A deeper cut, any miter (a miter never runs through its own
  end), any cut on the RECEIVING part, and any cut at another kind of site keep the overlap rule above.
- **The growing part's joined end** (amended after the final review, the user's ruling): on the ENTERING part of an
  `end-into-face` site — the part joinery lengthens there — a miter, bevel or chamfer measured along or into that length
  (`along` or `face` is it) whose touched box reaches the joined end conflicts however small its overlap with the patch.
  Joinery keeps such a cut's line fixed (§4) while the part grows through it, so a hairline cut under TOUCH would
  otherwise bite the new tenon. Chamfers and bevels running the length (the clearance case) are unaffected.
- **Rabbets at a thin panel's edge** (amended after chunk 2's final review, the user's ruling): at a `face-against-edge`
  site a MITER on the RECEIVING part does not conflict — the rabbet runs along that part's edge and out through the mitered
  end (a mitered box on a thin bottom, which §8's prompt suggests). A chamfer or bevel on that edge keeps the overlap rule.
- One conflict per part, reported in `taperConflicts`' order (by part). A part with both a taper conflict and another
  kind's conflict reports the taper's.
- **The message**, one sentence per part, in `angledRefusal.ts` (it is a string a person reads): "`<Part>`'s `<kind>` runs
  into its joint with `<Other>` — add joinery before cutting it, or remove it." (`<kind>` is `miter`, `bevel` or
  `chamfer`.)
- `joineryRefusal` returns this widened conflict refusal, else null. `angledRefusal(doc, 'joinery')` no longer refuses any
  kind. A joined Refine (`plainForRefine`) reads `joineryRefusal`, so it refuses in the same words. (Amended while
  planning: Repair does not read it — Repair adds no joints; it prunes strays and proves the result by re-joining the
  joints already recorded, §4.)
- The design-side fault (`taperFaults` → `taperJointViolations`) is widened in chunk 2 (§5.4), not here.

Examples: a rail mitered at the end that meets a leg is refused; a leg chamfered on an outside corner with its apron set
back from that face is fine; the same apron set flush with that face is refused; an apron chamfered ⅛″ along its bottom
edge, tenoned at both ends, is fine (clear of the tenon); the same apron chamfered ⅝″ is refused (amended while planning:
½″ was the example, but a ½″ width leg exactly meets the ½″ shoulder, and touching is allowed).

**Mitered corners:** two mitered parts meeting at a corner have overlapping boxes, so `faceContacts` never makes them a
site; the real-body overlap check sees bodies touching on the diagonal, so they are not an overlap. A mitered corner gets
no joint and no fault — correct for a glued miter until fu 276.

## 4. Joinery keeps angle cuts where they are on the wood

When joinery grows or trims dimension `d` at end `e` by `a` (`resize` then `rebaseCuts` in `recipes.ts`), rectangular cuts
are re-anchored; angle cuts are not, so a cut measured FROM `e` slides with it (fu 307). New, applied in the same step as
`rebaseCuts`, to every angle cut on the part:

- `along === d` and `alongFrom === e`: every station in `points` is shifted by `a` (grown: `+a`; trimmed: `−a`);
- `face === d` and `from === e`: every depth in `points` is shifted by `a` likewise.

The cut's world position is then exactly unchanged (one addition per number, no trigonometry). Canonical cuts anchored
away from the moving end are untouched — a canonical taper is anchored at its thin end, away from its joint, so taper
results are byte for byte as today. A cut that reached the moving end has already been refused by §3. **Closes fu 307.**

**Repair** is offered on any angled project (`repairDocument` drops its non-taper guard). The joinery dialog shows the
widened refusal through `joineryRefusal`. **Refine** still refuses miters, bevels and chamfers in chunk 1, with its
current message (`angledRefusal(doc, 'refine')` unchanged until chunk 2).

## 4.1 Testing — chunk 1

Vitest; one live check on the dev server (a hand-made chamfered side table joined; free, no key).

- **The split, per kind, in every posture and turn:** pieces pairwise disjoint; their union never contains removed wood
  (sample points tested against `keptHalfSpace`); the chamfered top rests on its posts (no `hangs`, no `unsupported`); the
  mitered end trusts nothing past the short point; the top rail of an upright mitered frame, held only by its miters, is
  reported (`unsupported`: its flat wood meets the stiles' only along a line), per the ruling. Amended while planning: the
  spec first said the stiles would be reported, but their long points reach the floor and grounding reads boxes.
- **Tapers:** contact results byte for byte as today (the existing taper tests stay green, unmodified).
- **The joint rule:** mitered rail at a leg refused; chamfered leg with its apron set back passes, flush refused; a patch
  touching `T`'s edge passes; a ⅛″ chamfer along a tenoned apron passes, a ⅝″ one is refused, and a chamfer whose width
  leg is exactly the ½″ shoulder passes (touching allowed). Each case mutated (e.g. `>` → `>=` on the area and clearance tests).
- **The rebase:** fu 307's fixture RED before, GREEN after; a deep-end-last chamfer stays put in world space under a
  tenon's growth; canonical tapers' stored values unchanged.
- **Mitered corner pair:** no site, no overlap fault.
- **Repair** offered on a chamfered project; the joinery dialog shows the miter refusal.

---

# Chunk 2 — Generate and Refine

## 5. The design schema (`generated.ts`)

### 5.1 Three new required arrays

`partSchema` gains three **required** arrays (strict structured output: an unused one is `[]`), using the existing `Dir`
enum:

```json
"miters":   [{ "end": "+x", "longPoint": "+z", "angle": 45 }],
"bevels":   [{ "face": "+y", "longPoint": "-z", "angle": 15 }],
"chamfers": [{ "edge": ["+y", "+z"], "legs": [0.125, 0.125] }]
```

- **Miter** — `end`: the end mitered (must lie along the part's length). `longPoint`: the side holding the long point
  (must be a side, not an end); the miter slopes across that side's dimension. Stored as `MiterFields`
  `{ end, across, longSide, ratio }`.
- **Bevel** — `face`: the side beveled (not an end). `longPoint`: the side, across the OTHER side dimension
  (`bevelAcross`), that keeps its full size. Runs along the length. Stored as `BevelFields`.
- **Chamfer** — `edge`: the two sides meeting at the edge (any of a part's 12 edges: two directions on different axes);
  `legs`: into each, in `edge`'s order. Stored as `ChamferFields` (canonical `face` before `along`, legs following).
- **Angles are degrees** for the model; stored as the slope ratio through `miterRatio` (45° exactly 1), as Properties
  does.
- Assembly definitions write the same form in the definition's frame (placements are translations only, fu 232).
- `isPart`/`partOf` validate the new fields' shapes like the others.

### 5.2 Conversion — `document/angleWorld.ts`

A new module beside `taperWorld.ts`, the ONE place a design miter, bevel or chamfer crosses to stored cuts and back. It
maps directions through `dirToLocal`/`localToDir` (invariant 44's helpers, never by hand) and writes through `miterCut`,
`bevelCut` and `chamferCut`, so a generated cut is stored exactly as a hand-made one. Model-facing text only (no `→ units`
edge).

- **Numbers.** Lengths (`legs`) snapped as `size` is (`snap`, `SNAP_INCHES`) unless in the conversion's `exact` set.
  Angles rounded to 0.1° unless in the exact-angle map (§6.2).
- **Faults** (a phrase the caller prefixes with the part's name, as `taperCutsFor`'s are, each with a code for Refine):
  - direction: a miter `end` not along the length; a `longPoint` on the same axis as the end or face, or on an end; a
    bevel `face` on an end; a chamfer `edge` naming an end twice, the same axis twice, or the same direction twice;
  - numbers: an angle not in (0°, 90°); a leg not above 0;
  - **no wood:** a cut that removes nothing; a cut taking more than the dimension it crosses (Properties' limits:
    `Removes more than the <dimension>`); two miters on one part not leaving wood between them; a part whose real bodies
    (`boardBodies`) are empty.
- **One canonical order.** All of a part's angle cuts (tapers included) sorted by kind (`ANGLE_KINDS` order), then by
  their stored fields, because `sameShared` compares angle cuts index by index. Tapers keep their existing order among
  themselves.
- A rejected part is reported through `RejectedPart` with a new reason `'angle'` (`detail` the whole message), beside
  `'taper'`.

### 5.3 Reading back — the design form

`worldAngles(b)` (in `angleWorld.ts`) returns `{ miters, bevels, chamfers }` in design form, one entry per cut, sorted
canonically; null when any cut has no shop reading (`miterFields`/`bevelFields`/`chamferFields` returns null, or a miter
whose `along` is the length). Refine refuses those (§6.1). It is also how `turnCandidates` re-stores a part (§7).

### 5.4 The design fault

Chunk 1's widened joint rule becomes the fault fed to the model during a run (`taperFaults` → a widened
`angleJointViolations`), so a model that miters at a joint is told so and repaired. **The violation kind and Refine's
refusal reason `taper-joint` are renamed `angle-joint`** (`ViolationKind`, `RefusalReason`, `RefineDialog`'s filter,
`refine.ts`' joined test); the taper wording is unchanged.

## 6. Refine

### 6.1 Reading the document

`documentToDesign` writes each part's miters, bevels and chamfers through `worldAngles`. `angledRefusal(doc, 'refine')`
stops refusing these kinds. Refine refuses, before any call, only a cut `worldAngles` cannot describe, with a new reason
`'angle-form'` in `'taper-form'`'s voice: "`<Part>`'s `<kind>` can't be described to Refine — edit it in Properties first."
(and the plural form `'taper-form'` uses).

### 6.2 Untouched angles come back exactly

Degrees → ratio goes through `tan`, so an exact *set* is not enough. `designValues` gains an **exact-angle map**: each
degree value Refine wrote (`miterDegrees(ratio)`, unrounded) → its stored ratio. Conversion uses the stored ratio when the
model returns that degree value unchanged. An untouched 37.5° miter keeps its exact ratio; 45° is exact anyway.

### 6.3 Joined Refine

Runs through `plainForRefine` → `joineryRefusal` (chunk 1): a joined project with a chamfer runs; one with a miter at a
joint refuses up front. The unjoined-result path (`JointsSummary.notJoined`) covers `angle-joint` as it covers tapers.

### 6.4 The change list

`diffDesigns` diffs the new kinds as it diffs tapers, by world face or edge at display precision, one line per change:
"Top: chamfer added on the +y/+z edge, 1/8″"; "Rail: miter at the +x end now 30°"; removals likewise. `ChangeKind`'s
`'taper'` becomes `'angle'`, so the list groups them.

## 7. Linking

`turnCandidates` today returns nothing for a part with a non-taper angle cut, so four legs chamfered on their outside
corners would stay four parts (four against the distinct-part cap). It now re-stores a part's angle cuts of every kind
under each candidate turn through the world forms (`worldTapers` + `worldAngles`, then `taperCutsFor` + the angleWorld
writer), as it re-stores tapers today; ids by index as now. Such legs link as one component. Rectangular cuts still block
turning (fu 314, unchanged); a cut `worldAngles` cannot describe blocks it too.

## 8. The prompt

`SYSTEM_PROMPT` describes the three arrays and when to use them: chamfers on exposed edges of tops and legs; bevels on
raised-panel edges; miters on frame and box corners. Two rules: **a miter does not hold a part** — miter only where the
parts rest on something else (the floor, a bottom, a panel); **never cut an angle where a part joins another** — joinery
refuses it — except a small chamfer or bevel running along a rail's length, which may pass through the rail's joined
ends when it stays clear of the tenon (the prompt states §3's clearance in plain numbers: about a third of the thickness,
and the smaller of ½in and a quarter of the width; the `angle-joint` fault (§5.4) carries the exact rule back if the
model misjudges). Empty arrays by default. The fixed prefix grows, so `estimate.ts`' measured chars-per-token figure is
re-measured, as for tapers.

## 8.1 Testing — chunk 2

- **Conversion, per kind, in every posture and turn:** design → stored → design round-trips exactly; every fault mutated;
  the canonical order holds (two input orders give one stored part).
- **Refine:** an untouched non-45° angle comes back with its exact ratio — mutated against the plain exact-set approach;
  `'angle-form'` refuses before any call.
- **The change list:** one line per kind, each direction of change.
- **Linking:** four chamfered legs link through turns; one with a notch does not (fu 314).
- **Prompt and schema:** pinned; the strict schema keeps every property required.
- **Live, paid — each run only with the user's approval at the time:** Generate "a mitered picture frame and a chamfered
  side table"; Refine that table with "chamfer the top's edges".

## 9. What does not change

The document schema (14), the stored `AngleCut` forms, Properties' angle rows, the cut list and Plans sheet, the
rectangular-joint recipes, sites on box contacts, `faceContacts` on boxes, the held rule's thresholds (invariant 39), and
the taper rule's results.

## 10. Out of scope (follow-ups)

Angle-aware joint kinds (splined, biscuited, keyed miters — fu 276's other half); a miter counting as a contact; stopped
angle cuts (fu 275); compound angles (fu 280); turning parts with rectangular cuts (fu 314); Generate emitting mirrored
placements (fu 232).
