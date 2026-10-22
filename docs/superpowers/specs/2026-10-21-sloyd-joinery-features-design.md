# Sloyd: Add joinery and Repair accept holes, curves, profiles and bands

**Date:** 2026-10-21 · **Status:** draft, awaiting the user's approval. Builder-checked; the user's two rulings (§8) folded in.
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
(Repair joints). A feature that sits clear of every joint rides through unchanged on the wood. Where a feature is in the
way of a joint, **only the joint kinds that would cut into it are ruled out at that site** before any paid call; the run
goes ahead, a site with nothing left stays a plain butt, and the summary says why (the user's ruling, 2026-10-21, §3.5).

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
- **A paid call spent and then refused.** Every ruling-out is decided before the call and before any mutation (inv 41).
- **Repair "proving" a result its gate cannot see.** The gate must compare the features it now accepts (§5).

## 2. Chunks

Each chunk has its own plan, review, merge, deploy and live check. The order is my call: holes are the most common
real-world blocker, and they set up the shared machinery.

| Chunk | Accepts | Builds |
|---|---|---|
| **1: holes** (merged `f3493a7`, deployed 2026-10-22 as `index-ChnyDt9R.js`) | parts with hole rows | the joint zones (§3), `rebaseHoles` + its inverse (§4.1), the gate extension for holes (§5), Repair on holed projects |
| **2: curves and profiles** (merged `133c669`; not yet deployed) | parts with curves or profiles (`curvedParts` counts both) | §4.2 / §4.3 rebases, curve and profile conflict rows, gate extension, Repair |
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

### 3.2 A joint kind's zone at a site

For each site and **each joint kind** in `Site.allowed` (butt excepted), its **zone** is, per part, the board-local region
of wood that kind could remove, add or trim at that site, at any size up to the upper bound of `rangesOf(s, flat)`. It is
computed before the call from the site and the flat document alone, so the ruling-out is decided before any call or
mutation (inv 41). Per kind, not per site (*amended after the builder check, the user's ruling*): a dado is allowed
wherever a tenon is, and a dado takes the whole patch, so a per-site union would rule out every joint at a rounded-over
leg with a flush apron that a tenon clears. The rows, one per recipe in `applyJoints`:

| Recipe | Part | Zone |
|---|---|---|
| mortise-tenon | receiver | the mortise: the tenon's section (`tenonSection`, placed in the patch as `mortiseTenon` places it) × `tenonLength[1]` into the receiver |
| dado | receiver | the whole box-contact patch × `dadoDepth[1]` into the receiver |
| stopped-dado | receiver | the patch less the smallest allowed stop inset at each allowed stop end, × `dadoDepth[1]` (the builder may take the whole patch, the dado's zone, if that is simpler: it is only more conservative) |
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
  would rule out every joint at a bow along a rail's bottom edge, whose waste reaches the ends only at a point.
- **Profile:** its waste through `geometryBoard`'s view, plus a swept profile's waste, from the same sources the bodies
  use. The builder may use the profile's section box (`profileSection`) × the run's extent if that is exactly as
  conservative.
- **Band:** solid edging's strip region on its side: the band's thickness in from that side × the side's full run × the
  part's thickness. **Tape has no thickness** (`bandModel.ts`), so it has no region and a joint through a taped edge is
  accepted, as it is in the shop (a through dado across a taped front edge); a tape band on the moving end's own side
  still rules the growing kinds out (§3.4) **(my call, amended after the builder check)**.

### 3.4 The growing end (entering part of an end-into-face site)

Joinery grows the entering part at the joined end: a tenon or a dado's housed length. §4's rebase keeps every number
**measured from** that end fixed in world space. A feature that **reaches** the joined end is different. "Conflicts" here
means it rules out all three growing kinds (mortise-tenon, dado, stopped-dado) at that site:

- **It conflicts** if its region touches the end face with positive area, however small its overlap with the patch. This
  is the AI-angles growing-end ruling. Examples: a hole drilled into the end (`face` is the grown dimension, mouth on that
  end, or `'through'` along it), a curve whose waste meets the end, a profile on the end's own side (or a `loop`), a band on
  the end's side.
- **Exception: it runs straight through the joined end and clears the tenon.** A feature stored as running the whole grown
  dimension, so growth extends it into the new wood, does not conflict when its region's cross-section is disjoint from the
  tenon's section (`tenonSection`: thickness `[cheek, t − cheek]` × width `[shoulder, w − shoulder]`, touching allowed).
  This is `clearsTenon` generalised from angle cuts. It covers a roundover along a rail's top edge (a profile ending
  `through` both ends), a curve whose `through` is the grown dimension (a rounded arris along the rail), and a thin band
  along the rail's long edge. The exception holds for all three growing kinds, as the angle ruling does: a tenon stays whole, and a dado's housing
  shows a small gap where the feature runs in, which is what happens in the shop. **(my call, by direct analogy with the
  angle ruling; bands' strip length is §4.4)**
- A hole's `'through'` along the grown dimension takes no exception and always conflicts **(my call: rare, and a bore
  through a tenon is never intended)**.
- **Trimmed ends** (a rabbet's trims, `recipes.ts` ~522–581) take the same rule with the same exception: a feature stored
  as running through the trimmed dimension is shortened with the part and does not conflict; one that merely reaches the
  trimmed end does, unless it is measured from the far end and lies outside the trimmed slab **(my call, amended after the
  builder check)**.

### 3.5 Ruling joint kinds out (the user's ruling, 2026-10-21)

- **Per site, a kind whose zone a feature enters is ruled out**: removed from that site's `allowed` before the sites are
  sent, so Claude never offers it, `defaultChoice` never picks it, and `validChoice` rejects it. One pure function
  (`featureAllowed(flat, sites)` or the builder's name) returns the narrowed sites and, per site, which kinds went and the
  feature that removed each. It is THE one decider; `runJoinery` and the dialog both call it.
- **Rabbets go as a unit.** `applyJoints` resolves a panel's rabbet sites on one face together (`rabbetUnits`, keyed
  `enter|axis|side`) and moves the panel into its frame by the rabbet depth. If one member kept rabbet while another lost
  it, the panel would move into the butt member's part. So **when a feature rules rabbet out at any site of a unit, it is
  ruled out at every site of that unit**, each named in the summary (*amended before handover*).
- **A trim's zone belongs to the site that trims.** A feature on a part that a rabbet would trim (§3.2's trimmed-parts
  row, §3.4's trimmed ends) rules out rabbet at the site doing the trimming, and with it that site's whole unit. It does
  not rule anything out at the trimmed part's own sites.
- **A site left with only butt is still a site** and is joined as a butt. It is not sent to the chooser **(my call)**: a
  choice of one is no choice, and it saves tokens. A run whose every open site is left butt makes no call.
- **The summary says why**, one line per site that lost a kind, built in `document/` beside `angledRefusal.ts` because it
  is a string a person reads. Wording (my call; for the user's eye, as fu 410–412):
  - "`<Enter>` → `<Receive>`: dado ruled out — `<Part>`'s roundover is in the way."
  - "`<Enter>` → `<Receive>`: left as a butt — `<Part>`'s holes are in the way of every joint."
  Feature words: `holes`, `curve`, `<kind> profile`, `edge band`.
- **The dialog's estimate.** `joineryEstimateUsd` (shown when `joineryRefusal` is null, `App.tsx` ~1107) counts only the
  sites still sent to the chooser, and shows no cost when none are, so the dialog never quotes money for a free run.
- **The prompt.** `JOINERY_PROMPT` (the fixed system prefix) stays byte-identical. The user turn's site list
  (`siteMessage`) lists each site's narrowed `allowed`, as it lists `allowed` today; that is the only change in what Claude
  reads.
- **Tapers and other angle cuts keep their whole-run refusal** (`taperConflicts`, `angleConflicts`, unchanged words). This
  spec does not move them onto ruling-out; doing so is a follow-up to raise with the user (§10).
- `joineryRefusal` stays THE refusal decider (the dialog, `runJoinery` and a joined Refine's `plainForRefine` call it). In a
  feature's chunk, its blanket `'joinery'` refusal call is removed. The `'refine'` calls stay.
- **Kept joints (a joined Refine's `fixed`)** are unreachable while Refine refuses these features; `validChoice` reading
  the narrowed `allowed` covers them when that changes.
- A joined Refine still refuses these documents first, through `refine.ts`' and `refineDesign.ts`' own refine refusals,
  which run before its `joineryRefusal` call (`refine.ts` ~65–83). A test pins that order.

**Examples:**
- **Left as a butt:** shelf-pin holes in a side panel whose rows run under a shelf's dado and through its mortise zone.
- **Left as a butt:** dowel holes hand-drilled at a butt joint (every kind would cut through them).
- **Left as a butt:** a band on a shelf's end that enters a dado (the joined end, §3.4).
- **Dado ruled out, tenon kept:** a leg rounded over on its outer corner, apron flush with that face.
- **Tenon ruled out, dado kept:** a hole drilled from a side's outer face, 3/8" deep in 3/4" stock, under a 1/2"-thick
  shelf. The mortise zone reaches 1/2" in (`tenonLength[1]` = depth − 1/4); the dado's 3/8" only touches the hole.
- **Fine:** shelf-pin holes clear of every joint.
- **Fine:** an apron arched along its bottom edge between the legs, with the arch stopping short of the ends.
- **Fine:** a rail with a 1/4" roundover along its top edges, tenoned at both ends (it clears a 1/2" shoulder).
- **Fine:** a banded plywood shelf with edge tape on its front edge, dadoed at both ends. This is the Q2 case.

## 4. Joinery keeps features where they are on the wood

`resize` (`recipes.ts`) calls `rebaseCuts` and `rebaseAngleCuts`. Each chunk adds its feature's rebase beside them, with
the same signature `(b, d, end, amount)` and the same rule: **every stored number measured FROM the moving end of `d`
shifts by `amount`**. Growth is `+a` and a trim is `−a`, one addition per number, nothing re-derived. Everything else is
untouched. A feature that reaches the moving end has already had the growing kinds ruled out by §3.4, except the run-through cases, which
need no number changed because they are stored as spanning `d`. **Every stored number is classified below**, so a missed
field is a spec bug, not a builder's choice:

### 4.1 `rebaseHoles` (chunk 1)
- `station`: shifts when `along === d && alongFrom === end`.
- `inset`: shifts when the third dimension (`acrossFrom`'s) is `d` and `acrossFrom === end`.
- `face === d` with its mouth on the moving end, or `'through'`: the growing kinds are ruled out (§3.4), so never reached. A row with `face === d` but `from` the OTHER end and a numeric depth is
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
  side, or a loop, has the growing kinds ruled out by §3.4.

### 4.4 Bands (chunk 3)
- Bands store no number. A band on the moving end's side rules the growing kinds out (§3.4). A band along `d` grows with
  the part, and its core numbers are re-derived by `banding.ts` from the new size.
- **Strips and tape count only the visible length** (the user's ruling, 2026-10-21): a band's run stops where a rectangular
  cut removes the side's face across the part's whole thickness at an end of the run, as a tenon's shoulders and a stopped
  dado's notch do; into a plain dado's housing it runs on, since the face is still there. Decided in `banding.ts` from the
  part's stored cuts, with no knowledge of joints, so a HAND-made notch at a banded end shortens its strip too. That is a
  change for existing documents **(my call: it is the same fact, and the number was wrong before)**; listed in the round's
  record. A band-free document stays byte for byte (`bandFreeIdentity.test.ts`).
- Checked before handover: `mortiseTenon` stores each shoulder's waste as ONE cut spanning the part's whole thickness
  (`recipes.ts` ~272), so the single-cut rule fires for tenons. The builder confirms the stopped dado's notch is one cut
  too; if it is not, the rule reads "the part's cuts together".

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

- **inv 41:** joinery gains a second decider beside `joineryRefusal`: the per-kind feature zones that rule joint kinds
  out before the call (§3.5). Each feature re-anchors on resize by its own `rebase…`, and
  `readJoints`' `resizeAt` undoes them exactly.
- **inv 50, 53, 54:** "Joinery, Refine and Repair refuse holed / curved / banded projects" becomes "Refine refuses …;
  joinery rules out only the joint kinds whose zone a feature enters (§3); Repair accepts".
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
- **Ruling-out:** per §3.5 example, the narrowed `allowed`, the summary line, and a run whose every site is left butt
  making no call (call count asserted). `siteMessage` lists the narrowed kinds; `JOINERY_PROMPT` pinned unchanged.
- **Bands' visible length (chunk 3):** a tenoned banded rail's strip stops at both shoulders; a dadoed shelf's runs into
  the housing; a stopped dado's notch shortens it; each mutated.
- **Zones, one fixture per row of §3.2,** each mutated by deleting the row. Each §3.3 region gets a touching case (passes)
  and an overlap-by-a-sliver case (ruled out), mutated `>` → `>=`. The §3.5 examples are all fixtures.
- **§3.4:** the growing-end conflict, the clearance exception for each feature that has one (mutated against the tenon
  section's bounds), and a hole `'through'` along the grown dimension ruling the growing kinds out.
- **No mutation, no call** before the ruling-out is decided: the existing pattern asserts the call count, never message
  text.
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
  - **Free:** Repair offered on a holed bug fixture. (Ruling-out shows only in a run's summary, so it is checked in the
    paid run below or not live.)
  - **Free, my call:** import a document joined by test code (exported JSON) and check in the viewport that the
    features sit where they were, beside their joints.
  - **Paid:** one real Add joinery run on a feature-bearing project, **only with the user's approval at the time**.

## 8. The user's rulings (2026-10-21)

- **Q1, in the way of a joint:** rule out only the joint kinds that would cut into the feature, per site, before the call;
  a site with nothing left stays a butt and the summary says why (§3.2, §3.5). Chosen over refusing the whole run after the
  builder check showed per-site refusal would turn away a rounded-over leg with a flush apron.
- **Q2, edging on a part that grows:** count only the visible length (§4.4), over accepting the over-buy or refusing.

## 9. What does not change

The schema (20). Refine and Generate refuse or ignore exactly as today. `DESIGN_SCHEMA` and the joinery prompt. Sites on
box contacts. The recipes' joint geometry. The taper and angle rules and their wording. The design checks.
`holeFaults`, `curveFaults`, `profileFaults` and band faults. A document without these features joins byte for byte as
before.

## 10. Out of scope (follow-ups)

Refine reading and writing holes, curves, profiles and bands (fu 329, 363, 398). Generate writing them. Design checks on
curved bodies (fu 363). Dowel joints derived from holes (fu 404). Counterbores meeting holes (fu 330). Joints through
edging (fu 398's "tenon out of edging" beyond the clearance rule). Moving tapers and other angle cuts from whole-run
refusal onto ruling-out (§3.5; a new follow-up, ask first).

## Amended (planning)

Chunk 1's plan amendments (2026-10-21).

- **P1: zones by trial.** The §3.2 table becomes one trial `applyJoints` per (site, kind), watched (`JoinWatch`). Sizes per trial:
  - **mortise-tenon:** `tenonLength[1]`.
  - **dado:** `dadoDepth[1]`.
  - **stopped-dado:** once per stop end, at `dadoDepth[1]` and that end's `inset(e)[0]`.
  - **half-lap:** once.
  - **rabbet:** once per unit (every site sharing `enter|axis|side` with rabbet allowed, all rabbeted together), at every
    member's `rabbetDepth[0]` and again at every member's `rabbetDepth[1]`. Depth grows the pocket; the panel's trim
    shrinks as depth grows.

  Every site but the trial's is left butt. Zones are judged before any other joint runs: the spec's stated assumption,
  with the oracle as backstop. A row's "mutation test" is deleting one watch call.
- **P2: gate tolerance, decided without the measurement step.** A hole number goes out as `x' = x + L` and is read back as
  `x' - L`. When `x' > 2L` that subtraction rounds (Sterbenz does not apply), so re-joining need not give back `x'`
  bitwise. Hole numbers are therefore compared within `GATE_TOLERANCE`, as §5's default said. The same reasoning applies to
  `sameAngleCut`'s exact comparison: raised as fu 413, not changed here.
- **P3: one part per summary line.** When several parts or kinds rule out kinds at one site, the line names the part of
  the first ruled-out kind in `JOINTS` order. §3.5 asks for one line per site.

## Amended (execution)

Rulings made while executing chunk 1.

- **Half-laps go as a unit**, like rabbet units (commit `31972de`): a part's half-lap set (every half-lap-allowed site
  sharing the entering part and axis, `applyJoints`' own lap-partner grouping) is trialled together, and a hole anywhere in
  it rules half-lap out at every member. The real run can only lap a part into all its partners at once. Cost: a lap at a
  clear crossing is withheld when a sibling crossing is blocked.
- **`defaultJoint` respects `allowed` at crossings** (`choose.ts`): `has('half-lap') ? 'half-lap' : 'butt'`, so
  `defaultChoice` never picks a ruled-out kind (§3.5).
- **A stopped dado is ruled out whole** when any stop end's trial conflicts; stop ends are not narrowed per end.
- **A skipped trial rules nothing out**: a recipe that skips the joint produced no zone, and the real run would skip the
  same way from the same state in isolation. The oracle is the backstop.
- **Holes take no run-through exception at trimmed ends either** (§3.4): a hole is never stored as running a trimmed
  dimension except `through`, which §3.4 already refuses an exception. Chunks 2 and 3 implement the exception for curves,
  profiles and bands.
- **Butt-only exclusion** applies only to sites a FEATURE narrowed to butt; sites `allowedFor` already makes butt-only are
  still sent, as before (hole-free projects stay byte for byte).
- **§5, Repair's gate:** "a hole moved after joining is refused" is unreachable at `gateUnjoin` (a hole moved in the joined
  state round-trips unchanged), so it is pinned through `sameJoined` instead, with a plain-equals-input assertion in the
  passing gate test.
- **Known gap (fu 414):** a lap set of three or more partners whose full set is not coplanar but a model-chosen subset is:
  the unit trial skips and rules nothing out. No fixture reaches it.

## Amended (planning, chunk 2)

Chunk 2's plan amendments (2026-10-22).

- **P4: open tests, conservative where the closed ones are.** §3.3 asks for touching to pass:
  - **Curves and straight profiles:** `rectOverlapsWaste`, an open test, is used on the real outline.
  - **A stopped profile's extent along `through`:** its span widened by `runoutReach` at each stopped end, as `intoCurve`
    widens it. It is compared open.
  - **Swept profiles:** these keep `sweptWasteMeets`' conservative footprint (`BEARING` + reach), through a box form,
    `sweptWasteMeetsBox`.

  Cost: a joint that only touches a swept profile, or a stopped profile's run-out allowance, is ruled out. It is never
  wrongly allowed.
- **P5: judge in the original frame.** The watch tests curves and profiles on `flat.boards[part]`, the part before the trial
  (`applyJoints` clones it, so it is never mutated). It never builds a geometry view of a mid-trial board (`geometryBoard`
  and `sweptWaste` are memoised per object, so a view of a mutated board is stale). A cut box or trim slab is moved into the
  original frame by subtracting, per dimension, the sum of the part's min-end growths so far in the trial. Holes keep chunk
  1's rule unchanged, judged on the board as it stands, so a holes-only project behaves byte for byte as in chunk 1.
- **P6: "touches the joined end with positive area" (§3.4).**
  - **A curve or straight profile across the grown dimension** (`d` is `u` or `v`): the length of the end line, in the
    curve's (u, v) plane, that lies inside the waste exceeds 1e-9 (`wasteOnSegment`).
  - **Along the grown dimension** (`d === through`): its extent along `through` reaches that end.
  - **A swept profile:** conservatively, its box form meets the end face, touching included.

  Correction (execution, see below): the plan's note that a bow's waste meets the end only at a corner point, so a bow keeps
  the growing kinds, was wrong. A bow's waste lies along the end line for its rise.
- **P7: the run-through exception (§3.4), decided per growing face.** A feature takes it when all three hold:
  1. `d === 'length'`. `tenonSection` is defined over width × thickness, the recipe's own frame.
  2. It is a curve or straight profile with `through === d` that runs out through the GROWING face: a plain curve always
     does; a view curve with a `span` does unless that end is a stop.
  3. Its waste in (width, thickness) does not overlap the tenon section `[shoulder, w − shoulder] × [cheek, t − cheek]` (open).

  A run-through feature at a TRIMMED end never conflicts: it is shortened with the part. Swept profiles take no exception. A
  profile `through` at the growing end and stopped at the far end takes it. Its far station is measured from either end; if
  measured from the growing end, `rebaseProfiles` keeps it in place.
- **P8: words.** §3.5 gives two forms: its example says "roundover", its word list `<kind> profile`. The word list wins.
  - Feature words: `holes`, `curve`, `roundover profile`, `cove profile`, `Roman ogee profile`, `bead profile`,
    `thumbnail profile`.
  - The verb is `are` after `holes` and `is` otherwise.
  - The dialog's failure refusal is generalised (`FEATURE_CHECK_FAILED`).

  All of this is for the user's eye.

## Amended (execution, chunk 2)

Rulings made while executing chunk 2.

- **P6's rule stands: any positive-length end contact rules the growing kinds out.** A bowed rail therefore loses
  mortise-tenon, dado and stopped-dado at its ends (the bow tests assert the true values: `wasteOnSegment` = the rise,
  `featureTouchesEnd` = true). The spec's growing-end rule (any positive-area end contact conflicts, the AI-angles ruling) is
  the authority; the "corner point" note was a wrong aside. Cost: a bowed rail is joined as a butt at its ends where a tenon
  clearing the bow's waste would have been fine. Candidate follow-up: an end-face clearance exception like P7's (fu 415; ask
  first).
- **P7 condition 1 (`d === 'length'`) is unreachable through `findSites` today** (end-into-face grows only along length). It
  is kept as a defensive guard and tested with a hand-built dado site. Cost: a dead guard.
- **The oracle checks a run-through feature's waste only INSIDE the tenon section, for dados too.** §3.4 accepts a dado
  housing's gap where a run-through feature runs in; the plan's literal "every kept point of the new slab" would flag every
  accepted dado. Cost: a dado housing with a feature running into it outside the tenon section goes unflagged, which the spec
  accepts by name.
- **P7 condition 3 is covered by hand tests (a 5/8" cove), not the oracle:** no roundover that fits the stock overlaps a
  tenon section. Cost: the oracle cannot catch a condition-3 regression.
- **§4.2's "`rise` and `radius`: untouched" has one exception (final review C1).** The chord does NOT move rigidly in floats:
  two separate additions can bring a chord of 2 back as 1.9999999999999991, and the loader then drops a Half-round notch
  (rise === chord / 2) in `applyJoints`' closing `migrateDocument`, with no note. So `rebaseCurves` stores an arc that was
  exactly at the half-circle bound (judged the loader's way) at the bound of its NEW chord, and clamps any other shifted arc
  the loader would now drop to that bound. Cost: an ulp of change in a stored rise or radius, within GATE_TOLERANCE.
