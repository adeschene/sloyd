# Sloyd — cam-and-bolt joint (fu 568 chunk 2) — design

Date: 2026-10-30. Follows `2026-10-30-sloyd-cam-and-bolt-design.md` (chunk 1: the pair in ONE part; its §11 outlines this
chunk). The user asked to skip the questions ("skip the questions", 2026-10-30), so every decision below not quoted from
chunk 1's spec or an invariant is **my call**, marked as such, for the user to check while reading.

## 1. What and why

Chunk 1 lets one part carry a cam lock: a 15 mm cam bore in its broad face and an 8 mm bolt bore into its end, meeting
on purpose (`camBolt.ts`, inv 50). The bolt's other half, the bore it screws into in the mating part, is a `Cam bolt bore`
preset the user places by hand, and nothing lines it up with the bolt. In a carcass with a shelf between two sides, that
is four hand-placed bores per shelf that must each sit exactly on a bolt's axis.

This chunk adds **Add cam-and-bolt joint**: select two parts, the end of one (A, the shelf) butting a face of the other
(B, the side), and it lays out N fittings: the cam lock rows at A's end and, in B, one bore per fitting on that fitting's
bolt axis. It is one edit and one undo entry, with every refusal decided before `edit()`, as Add stretcher is (inv 60).

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) With exactly two parts selected, find the one **end-into-face** contact between them (§3.1), in either selection
  order.
- (G2) Plan the joint (§3.2): A's cam and bolt rows at that end (chunk 1's `defaultCamLock` layout, generalised to N
  fittings), and in B one blind bore per fitting, **coaxial** with that fitting's bolt bore (`boreAlongAxis`'s test,
  1e-9), through the ONE bore core (`boreRow`).
- (G3) Reuse what is there: A's end already carrying a whole cam pair keeps it (its stations decide the fittings), and a
  B bore identical to one the plan wants is not added again (§3.3). So a linked shelf that got its cam rows through
  its link joins its own side by adding only that side's bores.
- (G4) One store action, one `edit()`, one undo entry; every refusal a sentence before any mutation (§3.4); the section
  in the multi-selection panel (§4).
- (G5) No schema change. Nothing new is stored: A's rows are chunk 1's ordinary rows (a recognised pair), B's bores are
  ordinary single-bore `HoleRow`s.

**Non-goals** (each recorded as a follow-up at the end of the round)
- **Fit again.** Moving A after the joint leaves B's bores where they were: they no longer line up. There is no
  stale-joint note and no re-fit in this chunk (my call: finding the joint again later needs a recogniser across two
  parts, which this chunk does not need). Running Add again after a move reuses A's pair and adds new B bores at the new
  place; the old ones stay until deleted.
- **Dowels** beside each fitting. §11 of chunk 1 says "possibly"; left out to keep v1 narrow (my call).
- **Hardware uses** from the joint: inv 55 stands (hardware is typed, never derived from holes); fu 600 remains ask-first.
- **A joint granting support** in the design checks. A cam-bolt joint is not inv 39 (d)'s seated tenon, and no check
  reads it. A shelf between two sides is held "between" today anyway.
- A recogniser that knows a B bore is a cam bolt's (the cut list prints B's bores as ordinary hole lines).
- **Through an assembly mirror**: refused, as stretchers are (§3.4).
- A's end other than square stock: refused (§3.4), never planned around.

**Anti-goals** (failures even if it "works")
- **A document the action never touched is byte for byte as before.** Chunk 1's `defaultCamLock(b, end)` with no count
  returns exactly what it returns today (its tests unchanged).
- **No joint that does not line up.** Every planned B bore's world axis is the bolt bore's to 1e-9, by test, on turned and
  mirrored parts too. A plan that cannot line one up refuses; it never rounds a bore onto B's grid.
- **No bore the Holes panel would refuse.** Every new row on either part passes the same checks `addHoleRows` makes
  (tilt bound, head, `holesZoneRefusal`) and has no `holeFaults` (with the cam-pair exemption: A's pair is judged with
  both rows on the board, as `fitsAll` does).
- **No silent write to other parts.** A row written through a link or a definition lands on every user; each OTHER part
  that gains one is named in a note (stretchers' `stretcherLinkNote` pattern).

## 3. The planner (`document/camJoint.ts`, the ONE planner)

Pure, no store, in `document/`. It imports `camBolt.ts`, `holes.ts`, `holeFaults.ts`, `legSockets.ts` (`boreRow`,
`boreAlongAxis`), `tree.ts`, `treeEdit.ts` and the geometry helpers; nothing from `generate/` (layer order). Its
sentences live in `camJointText.ts` (as `stretcherText.ts`). Inv 44: every part↔world crossing goes through `toWorld` /
`fromWorld` / `boardExtents` and kin, never `board[dim] - u` at a call site.

### 3.1 Finding the joint

On the two selected WORLD parts P and Q (`worldParts`), using their world boxes (`boardExtents`):
- For each ordered pair (A, B) of {P, Q} and each end of A's LENGTH: A's length runs along world axis `k`; that end's face
  is at A's box min or max on `k`. It is a **candidate** when B's box has a face on `k` within `TOUCH` of that end face,
  facing it (B on the far side), and A's end rectangle (A's box on the two other axes) lies WITHIN B's face rectangle
  (each bound inside within `TOUCH`): "a whole end inside the contact", joinery's rule 2 (`sites.ts`), restated here
  because `document/` cannot import `generate/`. (My call: the same rule joinery uses, so a joint is found where Add
  joinery would see an end-into-face site.)
- **Exactly one candidate** is the joint. None refuses `CAM_JOINT_NONE`. More than one (two ends of A both touch B, or
  each part's end touches the other) refuses `CAM_JOINT_AMBIGUOUS`.
- Two parts end to end (both lengths along `k`) are never a candidate: joinery's rule 1, and a bolt into end grain does
  not hold. They refuse `CAM_JOINT_NONE`.

The joint is `{ a, b, end, k, side }`: A's world id, B's, A's joined end (`CutFrom`, in A's world frame), the world axis
and the direction from A into B.

### 3.2 The layout

**A's rows.** `defaultCamLock(a, end, count?)` (holes.ts) gains an optional `count`. Omitted, it is today's rule (two
fittings at 37 mm from each side when A's `along` span is at least 150 mm, else one centred) and returns today's rows
byte for byte. Given:
- `count = 1`: one fitting centred (`station = a[along] / 2`, `pitch = 0`);
- `count ≥ 2`: the outer two at 37 mm from each side, the rest evenly between: `pitch = (a[along] − 2·37 mm) / (count − 1)`,
  one division, never a running sum (inv 25's exactness);
- `count` not an integer from 1 to `CAM_JOINT_MAX` (my call: 12) refuses `CAM_JOINT_COUNT` (in the planner, before the
  preset is asked).
- `camFrom` (optional, `CutFrom`): which broad face the cam enters. Omitted, `'max'`, today's value.
The planner passes `camFrom` (my call, the advisor's catch: a housing on a shelf's top shows in every photo of the piece):
when A's broad face is horizontal (its `face` dimension on world Y), the default is the face pointing DOWN; otherwise
`'max'`. The panel's `Cam face` select (§4) names the two choices by world direction and overrides the default.
R12's floor (null at 1/2" or thinner) and R8 (null when the broad face is the length) are unchanged and become refusals
`CAM_JOINT_THIN` and `CAM_JOINT_ON_EDGE` naming A.

**B's bores.** For each hole of A's bolt row (`holeInstances`, after the cam rows are placed on A), the bolt's world axis
is its mouth centre and its bit (the `boreEnds` form). B's bore for that fitting is
`boreRow(B, face, from, mouth, dir, mm(5), mm(12))` (chunk 1 §4.2's sizes, my call kept):
- `face` is B's dimension on world axis `k` (`axisDimensions(B)[k]`), `from` the end of it facing A (`endFacing`);
- `dir` is the NEGATED bolt bit, `−bit`: a bolt's bit points into A, away from B, and B's bore runs the other way, from
  B's facing face into B (toward `side`);
- `mouth` is where the bolt's axis crosses B's facing face (`faceCrossing(B, boltMouth, dir, face, from)`, as
  `rungSocketRow` finds a socket's mouth), never A's mouth, which is only within `TOUCH` of it.
One single-bore row per fitting (my call: `boreRow` builds one bore, exactly; an N-hole row would need a pitch read back
off B's frame, a second, inexact route). `boreRow` returns zero tilts on an unleaned B (the axis is square to the face);
a non-zero tilt is a caller's error, thrown, as `rungSocketRow` throws.

**Coaxial by test**, not by construction alone: the plan asserts `boreAlongAxis(B, row, boltAxis)` for each B row before
returning (a failed assertion is a thrown bug, never a refusal sentence). `boreAlongAxis` accepts either direction, so a
test also asserts every B bore's far centre lies inside B's box (a reversed `dir` would bore out of B).

### 3.3 Reuse

- **A's end has a whole cam pair already** (`camPairRows(a)` holds a pair whose bolt row enters from `end` on A's length):
  A gains no rows; the fittings are that pair's holes, in order. The typed count is IGNORED and the panel says so (§4).
  More than one whole pair at that end refuses `CAM_JOINT_TWO_LOCKS`. A partial pair at that end (any hole of a row there
  paired, `camRowIds`, but no whole pair) refuses `CAM_JOINT_PARTIAL`.
- **A B bore already exists**: a planned B bore is not added when a stored single-bore B row is the same bore IN THE
  WORLD: mouth centres equal and bits equal (`boreEnds`, both points to 1e-9), same diameter, same depth. Never by
  `sameHoleRow`: `boreRow` picks `alongFrom`/`acrossFrom` by the nearer half (`min` on the exact middle), and a row lowered
  through a mirrored Shape user reads its flags flipped, so the same bore at B's exact middle can be stored as `max` (the
  advisor's catch). A test covers that case: one centred fitting into mirrored linked sides.
  Every planned row already present, and A's pair reused too, refuses `CAM_JOINT_ALREADY` ("already joined"). A planned
  row that MEETS an existing one without being equal is a `meets-hole` fault (§3.4).

### 3.4 Refusals, in order, all before `edit()`

1. Not exactly two parts selected (the panel does not show the section; the action returns null).
2. Either part LEANS (`leans`): `CAM_JOINT_LEAN`. (My call: the box contact is a pre-lean box, inv 57 R2.)
3. The parts' containers differ (`parentPath`): `CAM_JOINT_CONTAINERS`. A part reached through a mirrored instance:
   `CAM_JOINT_MIRRORED` (both as `legRefusal` in `stretchers.ts`).
4. The two parts share one storage target (`storageKey`): `CAM_JOINT_SAME_PART` (my call: a part cannot be bored into its
   own link-mate in one write).
5. §3.1: `CAM_JOINT_NONE`, `CAM_JOINT_AMBIGUOUS`.
6. A's joined end is not square stock: it carries a round tenon (`tenonAt`), a dovetail at that end, box-joint fingers
   at that end (`fingerSets`), an end angle cut, a curve or a profile reaching that end face: `CAM_JOINT_END_FEATURE`
   naming A and the feature word (my call: a cam lock in a tenoned or jointed end is not a joint anyone wants, and the
   box contact misreads a mitred end). The builder confirms each predicate's home.
7. §3.2's count, thin and on-edge refusals; §3.3's reuse refusals.
8. Per new row, A's first then B's: the `addHoleRows` checks (tilt bound, `headRefusal`, `holesZoneRefusal`, which must
   move from `store.ts` to a document module the planner can call: my call, one decider, the store re-imports it), then
   `holeFaults` on the part holding all its new rows (A's cam and bolt rows together, so the pair's exemption applies; B's
   N rows together). The first fault refuses with `camJointFaulted(part, words)`, worded through `holeText.ts`' fault
   words (as `stretcherSocketFaulted`).

### 3.5 The plan

```ts
interface CamJointPlan {
  joint: { a: string; b: string; end: CutFrom };      // world ids, A's joined end
  fittings: number;                                    // N
  reused: { a: boolean; b: number };                   // A's pair reused; how many B bores already there
  writes: { id: string; holes: HoleRow[] }[];          // per STORAGE target: a world occurrence id and its FULL new hole list
  notes: string[];                                     // one per OTHER world part whose resolved holes gain a row
}
export function camJointPlan(doc: SloydDocument, ids: [string, string], count: number | null): CamJointPlan | string;
export function defaultCamJointCount(doc: SloydDocument, ids: [string, string]): number | null; // the panel's default
```
`writes` follows `StretcherPlan.legs` exactly: new rows get fresh ids (`nextId`) in the plan, so the store writes what was
judged. `count: null` means the default rule.

## 4. The panel and the store

**Store:** `addCamJoint(ids: [string, string], count: number | null): { notes: string[] } | string | null`. Null and
nothing done while exploded (`readOnly()`, inv 47) or gesturing; a refusal sentence; else ONE `edit()` writing each entry
of `plan.writes` through `mapWorld` (as Add stretcher writes its legs, inv 46: a Shape user is lowered through its own
flag, a definition's part moves every copy), then `judgeHeld()`. One undo entry. Selection unchanged.

**Signature amended:** `addCamJoint(ids, count, camFrom: CutFrom | null)` and `camJointPlan(doc, ids, count, camFrom)`,
`null` the §3.2 default.

**Panel:** `panels/CamJoint.tsx`, `CamJointSection`, in the multi-selection Properties panel beside Box joints and
Dovetails, shown when exactly two PARTS are selected (no posture condition). It reads the plan for the current
selection and shows (my calls for every word below; a copy review may change them):
- a heading `Cam-and-bolt joint`;
- when a joint is found, one line: `<A>'s <end> end into <B>` (end words from the panel's existing end words);
- a `Cam face` select, two options named by the world direction each broad face of A points (`Underside` / `Top` when
  horizontal; else `Front`/`Back` or `Left`/`Right`), default per §3.2; hidden when A's pair is reused;
- a `Fittings` count field (integer, default `defaultCamJointCount`), hidden when A's pair is reused, replaced by the
  note `Uses the cam lock already at this end (N fittings).`;
- the button `Add joint`, disabled with the refusal shown as a `field-note` when the plan refuses (as Stretcher shows its
  refusal); after a click, the store's refusal (if the document changed in between) in a `field-error`, or the link notes
  in `field-note`s, held in the section's state as Stretcher holds them.

No other reader changes: A's rows print chunk 1's pair line, B's bores ordinary hole lines; the viewport, drawings,
diagrams and caps already draw both.

## 5. Records

`docs/invariants.md`: inv 50 gains one sentence (condensed in CLAUDE.md): **`camJoint.ts` `camJointPlan` is the ONE
two-part cam-and-bolt planner; every B bore is `boreRow`'s and coaxial with its bolt (`boreAlongAxis`) by test; nothing is
stored.** `docs/module-map.md` (the two new files, `holesZoneRefusal`'s move), `docs/follow-ups.md` (fu 568 narrowed to the
non-goals; new numbers for Fit again, dowels, the B-bore recogniser), `docs/rounds.md`, a browser check
`docs/browser-verification-cam-and-bolt-joint.md` (the joint added on a shelf between two sides, imperial and metric, a
turned B, a linked shelf pair reusing its rows, undo, a refusal shown; and, riding along, fu 590's new snap-marker hues live on
pine, walnut and plywood, after which `SnapMarker.tsx`' "owed the same live look" sentence is updated).

## 6. Tests (the builder's, at least)

- §3.1: found in both selection orders; none; ambiguous (each way); end to end; a gap over `TOUCH`; an end overhanging
  B's face.
- §3.2: `defaultCamLock(b, end)` unchanged (existing tests untouched); counts 1, 2, 5 exact stations; every B bore
  coaxial (`boreAlongAxis`) and fault-free, with A's pair recognised (`camPairRows`), on B turned each of the ways
  `axisFrame` allows, on a mirrored Shape user (`chiralPart`, never a symmetric fixture, inv 44), metric and imperial.
- §3.2: the default cam face is the underside of a flat shelf and `'max'` otherwise; the select's override; every B bore's
  far centre inside B's box.
- §3.3: reuse of A's pair (typed count ignored); a B bore present; both present (`CAM_JOINT_ALREADY`); two pairs; a
  partial pair.
- §3.4: each refusal in its order (mutate the order: swap two checks and see a test fail).
- Store: one undo entry; exploded and gesturing do nothing; notes for a linked A and a linked B; a stale selection.
- Each test justified by a refusal or an ordering is mutation-checked (CLAUDE.md working agreements).

## 7. Left to the builder

The exact sentences in `camJointText.ts` (plain, naming parts with `displayNames`); the predicates behind refusal 6 and
their order; where `holesZoneRefusal` lands; whether the panel's plan is memoised (it runs `holeFaults` per render).

## Amended (build)

Recorded by the build (Task 6, 2026-10-30). **Not yet approved by the user.** Rulings are from the SDD ledger
(`.superpowers/sdd/2026-10-30-sloyd-cam-and-bolt-joint/progress.md`); each changes or settles text above.

**Rulings**
1. **R1 (Task 2; §3.4 check 4): the same-storage-target test uses two users of one Shape** (linked parts at the root), not two placements of
   one definition: the definition case refuses at the containers check (3) first and is unreachable at check 4. Cost if wrong: one test reworked.
2. **R2 (Task 3; §3.2, §4): `camFaceOptions` returns exactly two `{ from, label }` entries** (no default flag); the default comes from
   `defaultCamFrom`. The plan's doc line was garbled. Cost if wrong: a panel prop reshaped.
3. **R3 (Task 3; §3.3): for the right side after the left joint is applied** the plan reads `reused.a === false` (the shelf's OTHER end has no
   pair), `reused.b === 1` (the side's bore arrived through the mirrored link) and the shelf's write adds only its cam rows; it is not
   `CAM_JOINT_ALREADY`. A second test applies both and re-plans the right: `CAM_JOINT_ALREADY`. Cost if wrong: test expectations reworked.
4. **R4 (Task 2; §3.4 check 6): the end-features refusal refuses only what changes A's END itself**: a round tenon, a dovetail or box-joint
   fingers at that end, an END angle cut (miter, bevel or taper of the end face), a curve whose outline reaches the end face, a profile running
   along one of the end face's own edges. A profile or chamfer along a LONG edge that merely runs out through the end face does not refuse;
   `holeFaults` decides any real clash (a roundover on a shelf's front edge is the common case, and the cam sits 37 mm in). Cost if wrong: a cam
   lock offered on a part whose long-edge profile does meet a bore, which `holeFaults` still refuses if they intersect.
5. **R5 (Task 2; check 6): edge banding (any side, the end included) does not refuse.** The model is the finished size (inv 54) and the bores
   are judged on it. Cost if wrong: a bolt bore through an end band; a one-line refusal later.
6. **R6 (Task 2; §3.4 check 7): check 7's refusals (count, thin, on-edge, two locks, partial, already) are decided in Task 3's planner**, not in
   `findCamJoint`: they need the count, face or layout. Their sentences were written in Task 2. Cost if wrong: none.
7. **R7 (Task 2; text): `camJointReused(1)` reads "1 fitting"** (grammar over the brief's literal). Cost if wrong: a word.
8. **R8 (Task 2; §3.1): more than one joint candidate refuses with `CAM_JOINT_NONE` instead of throwing.** Degenerate parts at or below
   2·`TOUCH` can reach it, and a throw in the panel's render would white-screen the app. Cost if wrong: a misleading "no joint" on a sliver part.
9. **R9 (Task 2; §3.4 check 4): the `holesKey` storage-target rule** (`shape:<id>` for a Shape user, else `part:<storageKey ?? id>`) replaces plain
   `storageKey`: plain `storageKey` never matches two linked root parts. Cost if wrong: none found.
10. **R10 (Task 3; §3.4 check 7): check 7 runs two locks, partial, count, on-edge, thin, already, in that order.** Reuse is decided before the
    count because a reused pair ignores the typed count (§3.3); on-edge before thin is `defaultCamLock`'s own order. Cost if wrong: a different
    sentence first when two refusals apply.
11. **R11 (Task 3; §6): "coaxial on every turn of B"** uses the 3/4" side at 90/270, a 12" × 12" post at all four turns and an on-edge side: at
    0/180 the plain side's width lies on X and no joint exists. Cost if wrong: none (each variant asserts the plan was found).
12. **R12 (Task 3; §6, inv 44): the mirrored-link fixture is hand-built** (a Shape with the right side at turn 270, `mirrored: true`, a chiral
    hole) because `linkByRole` links identical sides as plain users. Cost if wrong: a fixture reworked.
13. **R13 (Task 3; §3.2): B's new bores are judged with `holeFaults(…, { camPairs: false })`** (inv 50's planner rule): stricter, never looser.
    Cost if wrong: none observable.
14. **R14 (Task 3, 4, 5; §3.2): the planner's three "caller bug" throws stay, but neither the panel nor the store lets one escape.** The
    section's memo and `addCamJoint` catch a throw from `camJointPlan` and treat it as no plan (the panel hides its section; the store returns
    null and writes nothing), logging it with `console.error`. Cost if wrong: a silent no-op on a geometry bug instead of a crash.
15. **R15 (Task 5; §4): the joint line names A's end as the Holes panel does** (`min end` / `max end`, A's own frame), not by world direction,
    consistent with the Cam lock preset labels; a copy review may move both to world words (fu 606). Cost if wrong: one wording change in two places.
16. **R16 (Task 5; §6): the panel's link-notes test stubs the store's return** (wiring only); real link notes are proved in
    `store.camJoint.test.ts` and `camJoint.plan.test.ts`. Cost if wrong: none.
17. **R17 (final review; §3.2, §3.4 check 7): a typed count of 2 or more on an A whose span along the row is at most 2 × 37 mm refuses with
    `CAM_JOINT_NARROW`** (a new too-narrow sentence naming A and the count), decided in the planner after on-edge and before
    `defaultCamLock` (so before thin), never as a null from it (which reads as `CAM_JOINT_THIN`). `defaultCamLock` would lay out a zero or
    negative pitch, which `holeFaults` passes but `migrateDocument` drops, so the pair vanished on reload. A round-trip guard in
    `camJoint.plan.test.ts`' apply helper reloads every applied plan (`migrateDocument` after a JSON round trip) and requires every row kept.
    Cost if wrong: none (the loader would drop those rows).
18. **R18 (final review; §3.2, §3.5; the spec is silent, the controller's call, flagged to the user): when the trial write gives ANOTHER
    world part (a link or copy co-user of B) a new bore whose mouth does not lie against some other world part's box (within `TOUCH`), the
    plan refuses with `CAM_JOINT_BARE_FACE`, naming that part**: its bore would open onto a bare face (the outside of a carcass side whose
    link is a plain copy). Only B's bores, only on parts other than the two selected; a correctly mirrored link puts the co-user's bore on
    its inner face, against the shelf, and passes (R3, R12). Cost if wrong: refuses a linked layout where the copy's mating part is not
    placed yet (place it first), or the user may prefer a warning note instead.

**Differences from the spec as written**
- **`holesZoneRefusal` was not moved** (§5, §7). It stays in `store.ts`; `addCamJoint` calls it on each written part before `edit()`, as
  `addStretcher` does. Cost if wrong: a refactor later.
- **There is no AMBIGUOUS sentence** (§3.1, §3.4): many candidates refuse as none (R8), with `CAM_JOINT_NONE`.
- **The `holesKey` storage rule** (R9) is the check-4 mechanism, in place of plain `storageKey`.
- **Refusal 6 is narrowed** (R4, R5): it names what changes A's end, not every feature that touches the end's region; banding never refuses.
- **Check 7's order** is R10's, not the order §3.4 lists, with R17's narrow refusal between on-edge and thin.
- **Two refusals the spec does not list** (R17, R18): too narrow for the typed count, and a linked bore opening onto a bare face.
- **The throw guards** (R14): the panel and the store catch the planner's caller-bug throws.
- **Not done, recorded:** Fit again (fu 602), dowels (fu 603), the B-bore recogniser (fu 604), the joint as support in the checks (fu 605), world
  end words (fu 606), the build's minors (fu 607). Hardware from a pair stays fu 600.
- **The browser check** (`docs/browser-verification-cam-and-bolt-joint.md`) is written and pending; fu 590's snap-marker hues ride along, after
  which `SnapMarker.tsx`' "owed the same live look" sentence is updated.
