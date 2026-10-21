# Sloyd: Add joinery and Repair accept holes, curves, profiles and bands

**Date:** 2026-10-21 · **Status:** draft, awaiting the user's approval.
**Builds on:** the joinery, repair-joints and refine-joined specs; the AI-tapers and AI-angles specs
(`2026-10-13-sloyd-ai-angles-design.md`, the pattern this spec follows: the checks, joinery and Repair accept a feature
before Generate and Refine do); the holes (§6), curves (§7), edge profiles, profile runs (§6) and edge banding (§6) specs,
each of which refused these features at entry and named this work as its follow-up. Every rule there still holds unless
this document says otherwise.
**No schema change.** The stored forms of `HoleRow`, `CurveCut`, `ProfileCut` and `Band` are unchanged (schema 20). What
changes is which documents Add joinery and Repair accept, and how joinery re-anchors these features when it grows or trims
a part, so a rollback costs nothing.

**Origin:** follow-ups 328 (holes through joinery), 363's first piece (joinery and Repair on curved parts) and 398's
joinery and Repair half (bands). Today `joineryRefusal` refuses any document with a hole, curve, profile or band before
the call (`holedRefusal`, `curvedRefusal`, `bandedRefusal`), and `repairDocument` withholds Repair on the same
documents. So a real project (shelf-pin holes in its sides, an arched apron, a banded plywood top) cannot use either.

**The user's direction (2026-10-21):** "start the joinery and Repair spec", the first step of the recommendation that
Claude's features stop refusing real projects. The user skipped the questions, so every design decision below that is not
inherited from an earlier ruling is marked **(my call)**.

## 1. Goal, non-goals, anti-goals

**Goal:** a project whose parts carry holes, curves, edge profiles or edge bands can be joined (Add joinery) and repaired
(Repair joints). A feature that sits clear of every joint rides through unchanged on the wood. A feature that is in the way
of a joint refuses the run before any paid call, naming the part, as a taper or miter does today.

**Non-goals (this spec):**
- **Refine stays refused** for all four features (`holedRefusal`/`curvedRefusal`/`bandedRefusal` with `'refine'`, and their
  calls in `refine.ts` and `refineDesign.ts`, unchanged). Refine has to read and write them in the design schema (fu 322's
  live compile). That is the next spec (fu 329, 363's second piece, 398's Refine half).
- Generate does not change, and `DESIGN_SCHEMA` and the joinery prompt stay byte-identical.
- No new joint kinds. Dowel joints from holes (fu 404) and joints cut through edging are out of scope.
- The design checks (overlap, held, tip, contact) still read a curved or profiled part as its box (fu 363's third piece).
  So joinery's "introduced problems" filter judges curved parts as today.
- `turnCandidates` and linking are unchanged.

**Anti-goals (a failure even if the tests pass):**
- **A feature moved on the wood by a join.** A hole, curve, profile or band that was clear of every joint ends up somewhere
  other than where it was in world space.
- **A joint cut through a feature without saying so.** For example, a tenon through a hole, a mortise through edging, or a
  dado across a curve's waste.
- **A paid call spent and then refused.** Every refusal is decided before the call and before any mutation (inv 41).
- **Repair "proving" a result its gate cannot see.** The gate must compare the features it now accepts (§5).

## 2. Chunks

Each chunk has its own plan, review, merge, deploy and live check. The order is my call: holes are the most common
real-world blocker, and they set up the shared machinery.

| Chunk | Accepts | Builds |
|---|---|---|
| **1: holes** | parts with hole rows | the joint zones (§3), `rebaseHoles` + its inverse (§4.1), the gate extension for holes (§5), Repair on holed projects |
| **2: curves and profiles** | parts with curves or profiles (`curvedParts` counts both) | §4.2 / §4.3 rebases, curve and profile conflict rows, gate extension, Repair |
| **3: bands** | banded parts | §4.4, band conflict rows, gate extension, Repair |

A chunk removes its feature's `'joinery'` refusal and Repair withholding only in that chunk, together with the rebase, the
inverse and the gate extension. Repair must never be enabled for a feature its gate cannot compare (anti-goal 4). Until its
chunk ships, a document with a later chunk's feature keeps today's refusal and wording.

## 3. The conflict rule: joint zones

### 3.1 Why not the angle rule

`angleConflicts` asks whether a cut's touched box reaches the contact plane and overlaps the patch. That works because an
angle cut always opens on a face. These features don't have to. A blind hole drilled from a side panel's outer face, a
curve's waste or a stopped profile can sit inside a mortise's or dado's depth without touching the plane. So the test here
is about **volume**: does the feature's wood overlap the wood the joint might take?

### 3.2 A site's joint zone

For each site, its **joint zone** is, per part, the board-local region of wood that **any allowed choice** at that site
(`Site.allowed`, sizes up to the upper bound of `rangesOf(s, flat)`) could remove, add or trim. It is computed before the
call from the site and the flat document alone, so the refusal is decided before any call or mutation (inv 41). The rows,
one per recipe in `applyJoints`:

| Recipe | Part | Zone |
|---|---|---|
| mortise-tenon, dado, stopped-dado | receiver | the box-contact patch × depth into the receiver up to the largest allowed depth (`tenonLength[1]`, `dadoDepth[1]`) |
| mortise-tenon, dado, stopped-dado | entering | the **joined end** (§3.4): the growth region beyond the end plus the end face itself |
| rabbet | receiver | the rabbet's pocket: along the receiver's edge, `rabbetDepth[1]` into it, and the panel's thickness along the contact axis (`recipes.ts` ~509–515) |
| rabbet | trimmed parts | each part the rabbet path (`recipes.ts` ~496–581) may trim, at the trimmed end, up to that trim's largest depth over the allowed `rabbetDepth` (the panel's own trim is largest at `rabbetDepth[0]`) |
| half-lap | both | the crossing patch × the notch's largest depth into each part |
| anything `rest()` cuts or moves | as that code reads | derived by the builder from `rest()`; a move alone is no zone (features are board-local) |

The builder derives each row from the recipe code, not from this table. Where the code and this table disagree, the code
wins and the table is corrected in the plan. Each row gets a mutation test: delete the row, and a fixture that only that
row protects must go red.

Zones are computed on the document as it stands before joining, the same assumption `angleConflicts` makes. Moves made by
earlier joints in the same run (laps, rabbet panels) can shift later patches. The oracle test (§7) is the backstop for
that.

### 3.3 A feature's region

Each feature is tested on its real wood, board-local, with touching allowed: a conflict is an overlap above **float
noise (1e-9)** on all three axes, `clearsTenon`'s tolerance and `holeFaults`' (*amended after the builder check:* the draft
said `TOUCH`, 1/32", which let a dado break 1/32" into a hole's bottom, the anti-goal itself) **(my call)**:

- **Hole:** each hole of the row (`holeInstances`) as its bore's box (mouth to bottom × diameter). A box is enough here.
  The zone is a box, and the cylinder–box difference is at most a corner sliver, so I'm choosing the conservative test.
- **Curve:** its waste on the real outline (`curveOutline`) extruded through `through`, not its bounding box. The box test
  would refuse a bow along a rail's bottom edge, whose waste reaches the ends only at a point.
- **Profile:** its waste through `geometryBoard`'s view, plus a swept profile's waste, from the same sources the bodies
  use. The builder may use the profile's section box (`profileSection`) × the run's extent if that is exactly as
  conservative.
- **Band:** solid edging's strip region on its side: the band's thickness in from that side × the side's full run × the
  part's thickness. **Tape has no thickness** (`bandModel.ts`), so it has no region and a joint through a taped edge is
  accepted, as it is in the shop (a through dado across a taped front edge); a tape band on the moving end's own side is
  still refused by §3.4 **(my call, amended after the builder check)**.

### 3.4 The growing end (entering part of an end-into-face site)

Joinery grows the entering part at the joined end: a tenon or a dado's housed length. §4's rebase keeps every number
**measured from** that end fixed in world space. A feature that **reaches** the joined end is different:

- **It conflicts** if its region touches the end face with positive area, however small its overlap with the patch. This
  is the AI-angles growing-end ruling. Examples: a hole drilled into the end (`face` is the grown dimension, mouth on that
  end, or `'through'` along it), a curve whose waste meets the end, a profile on the end's own side (or a `loop`), a band on
  the end's side.
- **Exception: it runs straight through the joined end and clears the tenon.** A feature stored as running the whole grown
  dimension, so growth extends it into the new wood, does not conflict when its region's cross-section is disjoint from the
  tenon's section (`tenonSection`: thickness `[cheek, t − cheek]` × width `[shoulder, w − shoulder]`, touching allowed).
  This is `clearsTenon` generalised from angle cuts. It covers a roundover along a rail's top edge (a profile ending
  `through` both ends), a curve whose `through` is the grown dimension (a rounded arris along the rail), and a thin band
  along the rail's long edge. The tenon is the narrowest joint joinery can choose there, so every joint kind stays whole.
  **(my call, by direct analogy with the angle ruling; see §8 Q2 for bands)**
- A hole's `'through'` along the grown dimension takes no exception and always conflicts **(my call: rare, and a bore
  through a tenon is never intended)**.
- **Trimmed ends** (a rabbet's trims, `recipes.ts` ~522–581) take the same rule with the same exception: a feature stored
  as running through the trimmed dimension is shortened with the part and does not conflict; one that merely reaches the
  trimmed end does, unless it is measured from the far end and lies outside the trimmed slab **(my call, amended after the
  builder check)**.

### 3.5 The refusal

- **Conflicts per part, one sentence per part, in part order.** Precedence on one part: taper, then angle, then hole, curve,
  profile, band (the order the features shipped). `jointRefusal` gains these kinds. The text is built in
  `document/angledRefusal.ts` or a sibling, because it is a string a person reads.
- **Wording (my call; for the user's eye, as fu 410–412):**
  - "`<Part>`'s holes run into its joint with `<Other>` — add joinery before drilling them, or remove them."
  - "`<Part>`'s curve runs into its joint with `<Other>` — add joinery before cutting it, or remove it."
  - "`<Part>`'s `<kind>` profile runs into its joint with `<Other>` — add joinery before routing it, or remove it."
  - "`<Part>`'s edge band runs into its joint with `<Other>` — add joinery before banding, or remove the band."
- **The whole run refuses.** It does not leave that one site as a butt. This is the taper and angle precedent; see §8 Q1.
- `joineryRefusal` stays THE one decider (the dialog, `runJoinery` and a joined Refine's `plainForRefine` all call it). In a
  feature's chunk, its blanket `'joinery'` refusal call is removed from `joineryRefusal`. The `'refine'` calls stay.
- A joined Refine still refuses these documents first, through `refine.ts`' and `refineDesign.ts`' own refine refusals,
  which run before its `joineryRefusal` call (`refine.ts` ~65–83). A test pins that order.

**Examples:**
- **Refused:** shelf-pin holes in a side panel whose rows run under a shelf's dado.
- **Refused:** dowel holes hand-drilled at a butt joint. "Add joinery" would cut a tenon through them.
- **Refused:** a band on a shelf's end that enters a dado.
- **Refused:** a hole drilled from a side's outer face, 3/8" deep in 3/4" stock, under a 1/2"-thick shelf. The mortise
  zone reaches 1/2" in (`tenonLength[1]` = depth − 1/4), so it overlaps the hole. (*Amended:* the draft blamed the dado,
  whose 3/8" zone only touches the hole, which passes.)
- **Fine:** shelf-pin holes clear of every joint.
- **Fine:** an apron arched along its bottom edge between the legs, with the arch stopping short of the ends.
- **Fine:** a rail with a 1/4" roundover along its top edges, tenoned at both ends (it clears a 1/2" shoulder).
- **Fine:** a banded plywood shelf with edge tape on its front edge, dadoed at both ends. This is the Q2 case.

## 4. Joinery keeps features where they are on the wood

`resize` (`recipes.ts`) calls `rebaseCuts` and `rebaseAngleCuts`. Each chunk adds its feature's rebase beside them, with
the same signature `(b, d, end, amount)` and the same rule: **every stored number measured FROM the moving end of `d`
shifts by `amount`**. Growth is `+a` and a trim is `−a`, one addition per number, nothing re-derived. Everything else is
untouched. A feature that reaches the moving end has already been refused by §3.4, except the run-through cases, which
need no number changed because they are stored as spanning `d`. **Every stored number is classified below**, so a missed
field is a spec bug, not a builder's choice:

### 4.1 `rebaseHoles` (chunk 1)
- `station`: shifts when `along === d && alongFrom === end`.
- `inset`: shifts when the third dimension (`acrossFrom`'s) is `d` and `acrossFrom === end`.
- `face === d`: refused (§3.4), so never reached. A row with `face === d` but `from` the OTHER end and a numeric depth is
  measured from the far end and stays put. It is untouched, and it only conflicts if its bore reaches the zone.
- `diameter`, `count`, `pitch`, `depth` (from a face that is not `d`): untouched.

### 4.2 `rebaseCurves` (chunk 2)
- `start` and every segment's `to`: the coordinate whose dimension (`uvDims(through)`) is `d` shifts when that
  coordinate's `uFrom`/`vFrom` is `end`.
- `rise` and `radius`: untouched. They are chord-relative, and the chord moves rigidly.
- `through === d`: no number changes. Growth extends it (§3.4's exception, or a conflict).

### 4.3 `rebaseProfiles` (chunk 2)
- A `ProfileEnd` with a station: `at` shifts when its run dimension is `d` and its `from === end`.
- A `through` end, `loop`, `face`, `size`, `depth`, `fillet` and `facing`: untouched. A profile ON the moving end's own
  side, or a loop, is refused by §3.4.

### 4.4 Bands (chunk 3)
- Bands store no number. A band on the moving end's side is refused (§3.4). A band along `d` grows with the part. Its
  strip and core numbers are re-derived by `banding.ts` from the new size; see §8 Q2.

### 4.5 The inverse
`readJoints`' `resizeAt` (`unjoin.ts`) calls each new rebase exactly as it calls `rebaseAngleCuts`, so the plain part
carries each feature as it was before joinery. The joined document's write-back through shapes (inv 45, 46) is
unchanged. Holes, curves, profiles and bands are SHARED fields, so a fixture with two parts on one Shape carrying a
feature, where only one gets a tenon, must split or write back exactly as it does today with angle cuts. Follow whatever
that path already does, and pin it.

## 5. Repair and the gate

- `sameJoined` (`unjoin.ts`) today compares cuts and angle cuts only. So Refine's gate, and Repair's proof (which calls
  it), are blind to holes, curves, profiles and bands. Each chunk extends it to its feature:
  - enumerations exact;
  - every number within `GATE_TOLERANCE`;
  - entries in stored order.
- Tolerance, not exact comparison, **(my call)**: a feature number goes out as `x + L` and back as `(x + L) − L`, and with
  metric holes storing `mm / 25.4` unrounded that is not guaranteed bitwise `x`. **The plan's first task measures it**: a
  metric hole station through join → unjoin → re-join. If it is bitwise exact on every fixture, exact comparison is fine and
  the spec is amended. The angle-cut clause is left as it is.
- `repairDocument` drops that feature's withholding in the same chunk. Repair itself only removes stray cuts. It never
  resizes, so features ride through untouched. The extended gate proves the re-join reproduces them.
- **No new refusal in Repair (my call).** A feature drilled near a joint after joining is fine there, because the joint
  already exists. Repair re-joins only the recorded joints and never runs §3's zones. §3 guards a new join, not a recorded
  one.

## 6. Invariants and records

On each chunk's ship, in full in `docs/invariants.md` and condensed in CLAUDE.md (every PROHIBITION verbatim):

- **inv 41:** joinery's one decider gains the feature zones. Each feature re-anchors on resize by its own `rebase…`, and
  `readJoints`' `resizeAt` undoes them exactly.
- **inv 50, 53, 54:** "Joinery, Refine and Repair refuse holed / curved / banded projects" becomes "Refine refuses …;
  joinery refuses only a joint zone a feature enters (§3); Repair accepts".
- Follow-ups:
  - **fu 328:** closed for joinery and Repair; Refine stays with fu 329.
  - **fu 363:** first piece closed.
  - **fu 398:** joinery and Repair half closed.
- `docs/module-map.md`, `docs/rounds.md`, the Status block, and CLAUDE.md's "refusals of joinery/Refine/Repair" home row,
  as the round-close rule says.

## 7. Testing

Vitest per chunk, then a live check.

- **Rebase, per field of §4, in every posture and turn, both ends, growth and trim:**
  - the feature's world position is unchanged after `resize`, sampled through the geometry the viewport reads;
  - `resize` then `resizeAt` restores every stored number within the gate's comparison;
  - each shift is mutated (drop it, flip its sign, test the wrong `from`) and goes red.
- **Zones, one fixture per row of §3.2,** each mutated by deleting the row. Each §3.3 region gets a touching case (passes)
  and an overlap-by-a-sliver case (refused), mutated `>` → `>=`. The §3.5 examples are all fixtures.
- **§3.4:** the growing-end conflict, the clearance exception for each feature that has one (mutated against the tenon
  section's bounds), and a hole `'through'` along the grown dimension refused.
- **No mutation, no call** on every refusal: the existing pattern asserts the call count, never message text.
- **The oracle:** across every joinery fixture (`recipes.test`, `runJoinery.test`, `shakerTableFixture`) with features
  added clear of their zones, after joining, **no joint's wood (each new or changed rectangular cut's region, and each
  growth or trim slab) overlaps any feature's region (§3.3) beyond 1e-9**, except the §3.4 run-through cases. It is
  measured directly, because only `holeFaults` reads cuts: `curveFaults`, `profileFaults` and band faults never would
  flag a joint cut through them (*amended after the builder check*). Also, no part gains a `holeFaults` fault. This
  catches a missing zone row.
- **Gate:** a holed, then curved, then banded joined project passes `gateUnjoin`. Moving a feature by 1e-3 after joining
  fails it.
- **Repair:** the fu 240 bug fixture with a hole row added is repaired, and its holes are byte-for-byte unchanged.
- **Shapes:** the §4.5 shared-shape fixture.
- **Order:** a joined Refine of a holed project refuses with Refine's words, before `joineryRefusal`.
- **Byte-for-byte:** a document with none of the chunk's feature joins exactly as before (existing joinery tests
  unmodified and green).
- **Live (dev server), per chunk:**
  - **Free:** the joinery dialog's refusal for one conflicting fixture, and Repair offered on a holed bug fixture.
  - **Free, my call:** import a document joined by test code (exported JSON) and check in the viewport that the
    features sit where they were, beside their joints.
  - **Paid:** one real Add joinery run on a feature-bearing project, **only with the user's approval at the time**.

## 8. Open questions for the user

Q1–Q2 were raised while writing. The builder check may add to them.

- **Q1: Refuse the whole run, or leave that joint plain?** When one feature is in one joint's way, this spec refuses the
  whole Add joinery run, as tapers and miters do today. The alternative is to run anyway, leave that one joint as a butt,
  and say why in the summary.
- **Q2: Bands on a part that grows.** A shelf with tape on its front edge, dadoed or tenoned at its ends, gets longer when
  joined. `banding.ts` then computes the tape run and solid-edge strip over the new length, so the strip includes the
  housed or tenon length: a small over-buy.
  - For a dado this is right, since the edge runs into the housing.
  - For a tenon it is wrong by the tenon's length, since the edging stops at the shoulder.
  - Options: accept the over-buy, or refuse a band along a part that gets a tenon.

## 9. What does not change

The schema (20). Refine and Generate refuse or ignore exactly as today. `DESIGN_SCHEMA` and the joinery prompt. Sites on
box contacts. The recipes' joint geometry. The taper and angle rules and their wording. The design checks.
`holeFaults`, `curveFaults`, `profileFaults` and band faults. A document without these features joins byte for byte as
before.

## 10. Out of scope (follow-ups)

Refine reading and writing holes, curves, profiles and bands (fu 329, 363, 398). Generate writing them. Design checks on
curved bodies (fu 363). Dowel joints derived from holes (fu 404). Counterbores meeting holes (fu 330). Joints through
edging (fu 398's "tenon out of edging" beyond the clearance rule).
