# Sloyd — Fit the cam-and-bolt joint again (fu 602) — design

Date: 2026-10-31. Follows `2026-10-30-sloyd-cam-and-bolt-joint-design.md` (the joint, chunk 2, deployed `640d64c0`), whose
non-goals deferred this as fu 602. The user chose this round from the residue ("Fit the joint again (Recommended)") and asked
to skip the questions ("skip the questions", 2026-10-31). So every decision below that is not quoted from the joint spec, an
invariant or fu 602 is **my call**, marked as such, for the user to check while reading. The advisor reviewed the approach
before this was written; its catches are marked.

## 1. What and why

Add joint lays out a cam lock at the end of A (the shelf) and one 5 mm × 12 mm bore per fitting in B (the side), each bore on
its fitting's bolt axis. Nothing about the joint is stored. Move A (or B) afterwards and B's bores stay where they were: they
no longer line up, nothing says so, and running Add joint again reuses A's pair and bores a second set beside the old one,
which stays until the user finds and deletes it (fu 602).

This round lets the joint be **fitted again**: with A and B selected, the section sees that B's bores have drifted off A's
bolt axes and offers **Fit the joint again**. That moves those bores in place onto the axes (ids kept), as one edit and one
undo entry, with every refusal decided before `edit()`, as the stretchers' Fit does (inv 60). A's own panel says when its
joint no longer lines up.

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) **Loose bores.** When the joint's plan reuses A's whole cam pair (`reused.a`) and some of the bores it wants in B are
  missing, find B's bores that line up with no cam bolt (§3.1). If they are the missing bores **shifted by one common
  offset**, adopt the NEAREST such set (§3.2).
- (G2) **Move them.** The plan moves each adopted row in place in B's hole list (its index and id kept, its values the
  planned row's) instead of adding a new row. Every check that judges a new B bore judges a moved one (§3.3).
- (G3) **Say so.** The two-part section relabels its button **Fit the joint again**, with a line saying B's bores no longer
  line up (§4.1). A's single-part panel notes a joint that no longer lines up, decided by the same planner (§4.2).
- (G4) **One planner, one action.** It is `camJointPlan` and `addCamJoint`, extended. There is no second planner and no new
  store action. Inv 50's sentence stands as written: "`camJoint.ts` `camJointPlan` is the ONE two-part cam-and-bolt planner"
  (my call: Fit is the joint's plan finding its old bores, not a different plan).
- (G5) No schema change. Nothing new is stored.

**Non-goals** (each recorded as a follow-up at the end of the round)
- **Re-fitting A.** A's cam rows are never moved, re-laid or re-counted. Fit moves only B's bores onto A's stored axes.
  After a change to A's pair itself (count, pitch, cam face), no shifted set matches; Add joint then adds bores as today
  and the old ones stay (§3.2).
- **A turned B, or B's face changed.** Loose bores are only ever looked for on the face of B toward A (§3.1).
- **Deleting stray bores.** A loose bore that no fit adopts is left alone and never named (my call). Finding strays (the
  extra set an Add-after-a-move made under the old behaviour) is a follow-up.
- **A note on B's own panel.** A side carrying several shelves would need every neighbour's plan per render. A's note
  covers the case (my call).
- **A closure** like the stretchers' (§6.3 there). A row that lines up with any bolt anywhere is never loose (§3.1), so a
  fit can never pull a bore out from under another joint, and no closure is needed (my call).

**Anti-goals** (failures even if it "works")
- **A document where no fit happens is byte for byte as before.** When no set is adopted, `camJointPlan` returns exactly
  what it returns today. Every existing `camJoint.*` test stays unchanged except where a fixture deliberately sets up a
  fit.
- **Never move a bore that lines up with a cam bolt**, on B or on any part that carries B's rows (§3.1). A bore of another
  joint, reached through a link or a definition, is never loose.
- **Never guess between two equally near sets.** A tie refuses (§3.2).
- **No bore the Holes panel would refuse.** A moved row passes `holeFaults` (`camPairs: false`), R18's bare-face check and
  the store's dovetail zone gate, exactly as a new one does (§3.3).
- **A moved bore must not fault against its own old self.** The trial list REPLACES the row; it never appends a copy (the
  advisor's catch). Otherwise a fit of less than 5 mm reads `meets-hole` against the bore it is moving, which is the very
  case this round fixes.

## 3. The planner (`document/camJoint.ts`)

Everything here sits in `camJointPlan`, after check 7's reuse decision and B's `planned`/`existingBore` step, and before
check 8. It applies only when A's pair is REUSED and at least one planned bore is missing. When A's rows are new, B's bores
cannot have been this joint's, so nothing is looked for (my call).

### 3.1 Loose bores

A stored row `r` of B is a **candidate** when all of these hold:
- **Its shape is the planner's B bore:** `count === 1`; no head; no tilt (`tiltAlong`/`tiltAcross` absent or 0); diameter
  `mm(5)` and depth `mm(12)`, each to 1e-9; and the same `face` and `from` as the planned rows (B's dimension on the joint's
  axis `k`, entering from the face toward A). With those fields equal, its bit is the planned rows' bit, and the test
  asserts that.
- **It is not a planned bore that is already there** (`existingBore` matched it).
- **It lines up with no cam bolt anywhere.** On EVERY world occurrence of B's storage target (B itself, every other user of
  its Shape, every other placement of its definition: the parts the trial write would change), its world bore is coaxial
  (`boreAlongAxis`) with no bolt hole of any whole cam pair (`camPairRows`) on ANY world part. That means every part, not
  just A, and the bolt axes taken hole by hole (`boltAxes`). The advisor's catch: one shelf's joint must never take a bore
  another shelf's bolt uses, directly or through a link.

`boreAlongAxis` accepts either direction along the line, and that is fine here: a candidate is on B's facing face, so a bolt
coaxial with it is a bolt into that face.

### 3.2 Adopting a shifted set

Let `M` be the planned bores that are missing (in plan order) and `C` the candidates. A **shifted set** is a choice of `|M|`
distinct candidates and one world vector `d` such that, for each missing bore `m`, a chosen candidate's mouth centre is
`m`'s plus `d`, to 1e-9 per coordinate. Each candidate pairs with exactly one `m`. Moving a row in place keeps its bit, and
both lie on one face, so `d` lies in that face's plane. Every `d` worth trying is (some candidate's mouth) − (`M[0]`'s
mouth), so the search is at most `|C|` offsets, each checked against `|M|` bores.

- **No shifted set:** nothing is adopted. The plan is today's (new bores added), byte for byte.
- **One or more:** adopt the one with the smallest `|d|` (Euclidean). This is the stretchers' "nearest, ties refuse"
  (`usedRow`). The advisor's catch: a "only when unique" rule refuses a side carrying three identically jointed shelves after
  the side moves 1", because each shelf's pair is a shift of every other's. Nearest takes each shelf's own bores.
- **Two sets whose `|d|` differ by at most 1e-9:** refuse, `CAM_JOINT_TWO_FITS(B)`. Wording is my call: `<B> has two sets
  of bores this joint could fit — remove the ones you don't want first.` It sits in check 7's order (R10) after
  `CAM_JOINT_ALREADY` and before check 8's faults.

An adopted set needs every missing bore matched: a partial match (one bore deleted by hand) is not a shifted set, and the
plan adds bores as today (my call: simple, and nothing is lost).

The plan gains `moved: number`, the count of rows moved (0 when none). `reused.b` keeps its meaning (planned bores already
present). The rows moved get the planned values with the candidate's `id`. Rows not adopted stay byte for byte.

### 3.3 Judging and writing a moved row

- **B's trial list** is B's holes with each adopted row REPLACED at its index by its moved value, then any still-missing
  rows appended with fresh ids. With an adopted set, every missing row is moved, so none is appended. `bAfter` is that
  list.
- **Check 8** runs `holeFaults(bAfter, r, { camPairs: false })` on every moved row and every new row, in B's list order.
- **R18** (`CAM_JOINT_BARE_FACE`): the trial write's other carriers of B's rows are checked for every MOVED row as well as
  every new one, compared by value, not by "id not seen before". A moved row whose co-user copy would open onto no part
  refuses, naming that part.
- **The store's dovetail zone gate** already passes moved rows. `newRows(before, after)` keeps a row whose id is the same
  but whose values differ (`store.ts`, `sameHoleRow`). This was verified for this spec. A test pins it: a fit that would
  carry a bore into a dovetailed B's zone refuses with the zone sentence.
- **Notes:** an OTHER world part whose holes change only by moved rows gets `camJointMovedNote(part)` (my wording: `<part>'s
  bores moved there too, through its link.`). One that gains a row keeps `camJointLinkNote`. One that has both gets the
  link note (my call: one note per part).
- **Held points:** `addCamJoint` already runs `judgeHeld()` after its `edit()`. A tape anchor on a moved bore's rim drops
  (inv 24, point-precise), and a test pins it.
- **Writes:** unchanged in form. B's entry is its FULL new hole list. `addCamJoint` writes every entry whose list changed,
  through `mapWorld`, in ONE `edit()`, so there is one undo entry.

## 4. The panels

### 4.1 The two-part section (`panels/CamJoint.tsx`)

When the plan has `moved > 0`:
- Under the joint line, a note: `<B>'s bores no longer line up with <A>'s cam locks.` (`camJointStale(a, b)`, my wording).
- The button reads **Fit the joint again** (`FIT_CAM_JOINT`) instead of **Add joint**, with the same handler
  (`addCamJoint`). The Cam face and Fittings fields are already hidden because A's pair is reused, and the reused note
  stays.
- When the plan refuses with `CAM_JOINT_TWO_FITS`, the button reads Fit the joint again, disabled, with the refusal shown
  as today's refusals are (my call: a refused fit still says what it would have done).

The memo's signature reads only A and B (fu 607). The loose test now reads every part's bolts, so a third part's change can
leave the section stale until the selection changes. The click-time re-plan in the store is the backstop: nothing wrong is
written. That is accepted and recorded, not fixed here (the advisor's point).

### 4.2 A's single-part panel

A `Cam-and-bolt joint` readout in the single-part Properties panel, beside `StretcherReadout` (placement is the builder's
call), shown only when a fit EXISTS. For each world part `B` (other than A) whose box butts one of A's ends (the
`candidatesFrom` box test, cheap, run first), it runs `camJointPlan(doc, [A, B], null, null)`. It shows a note for each B
whose plan has `moved > 0` or refuses `CAM_JOINT_TWO_FITS`: `No longer lines up with <B>'s bores — select both to fit the
joint again.` (`camJointStaleNote(b)`, my wording). A plan that would only ADD bores (a Cam lock whose side was never bored)
shows nothing. The advisor's catch: "never joined" must not nag as "moved". A throw is caught and logged (R14) and shows
nothing.

The memo's signature for this readout covers A and every part whose box butts A's ends: all world parts, as one string
(inv 43's primitive rule). It is recomputed when any part changes. That is acceptable at Sloyd's part counts, and the
builder measures it on the largest fixture (`shakerTableFixture`).

## 5. Text (`camJointText.ts`)

New, all my wording, for the copy review with fu 606 and 607: `CAM_JOINT_TWO_FITS(b)`, `camJointMovedNote(part)`,
`camJointStale(a, b)`, `camJointStaleNote(b)`, `FIT_CAM_JOINT = 'Fit the joint again'`.

## 6. Tests (at least; every test justified by an ordering, a refusal or a nearest choice is mutation-checked)

- **The basic fit.** Join a shelf to a side, move the shelf up 2": the plan moves 2 rows (ids kept, indices kept), every
  moved bore is coaxial with its bolt, and after applying, a re-plan is `CAM_JOINT_ALREADY`. The same for moving B instead
  of A, metric and imperial.
- **A small move:** an offset of 2 mm (under the bore's 5 mm) fits without `meets-hole` (the replace-not-append rule).
  Mutate: append instead and see `meets-hole`.
- **Three shelves on one side, the side moved 1":** each shelf's fit takes its own bores (nearest). Mutate: take the
  first set found instead and see a test fail.
- **A tie:** two candidate sets equally far: `CAM_JOINT_TWO_FITS`. Mutate the tie tolerance.
- **Never loose:** a bore that lines up with another shelf's bolt directly, and one that lines up only on a link co-user
  (mirrored linked sides, R12's fixture), is never adopted.
- **Shape:** a single shelf-pin-like bore of a different diameter or depth, a headed bore, a tilted bore and a 2-count row
  are never candidates. A hand-placed chunk-1 `Cam bolt bore` off its axis IS adopted (the advisor's point: that is the
  hand-placement pain the joint exists to fix).
- **Partial:** one of two old bores deleted by hand: no fit; Add adds bores as today.
- **A's pair changed** (count edited in Holes): no fit; Add as today.
- **Byte for byte:** with no candidates, the plan deep-equals today's (`moved: 0`).
- **R18 on a moved row:** a plain linked side whose co-user copy would open onto a bare face refuses.
- **Store:** one undo entry; undo restores the old rows exactly; a moved bore's tape anchor drops (`judgeHeld`); exploded and
  gesturing do nothing; the zone gate refuses a move into a dovetailed B's zone; the moved-note for a linked B.
- **Panels:** the section's relabelled button and stale line; A's readout appears only with a fit (not for a never-bored
  Cam lock) and names the right B.
- Every applied plan round-trips through `migrateDocument` with every row kept (R17's guard, already in the apply helper).

## 7. Records

`docs/invariants.md` inv 50: one sentence added to the joint's clause, condensed in CLAUDE.md: **a fit moves only LOOSE B bores
(lining up with no cam bolt on any carrier), the nearest shifted set, ties refused, in place.** Also update
`docs/module-map.md`, `docs/follow-ups.md` (fu 602 closed; new numbers for this round's non-goals: strays, B's own note, a
partial match), `docs/rounds.md`, the feature-gaps Holes row, and a browser check
`docs/browser-verification-cam-joint-fit.md`. Its steps: join a shelf between two mirrored-linked sides, move the shelf up,
read A's note, select both, Fit the joint again, check that both sides' bores line up (X-ray or a section), undo, and see a
refusal shown.

## 8. What it costs if wrong (my biggest calls)

- **The planner's shape is the loose test.** A single, square, headless 5 mm × 12 mm bore on that face that lines up with no
  bolt is taken for an old joint bore. A user who bored one such bore for some other purpose and then moved a shelf near it
  could see it moved. The fit is shown before the click (the button's label), and undo restores it. A tighter test would
  need a stored joint (a schema bump, inv 33's care).
- **Nearest, ties refused.** A side whose shelves all moved by different amounts could pair a shelf with a neighbour's old
  bores when the neighbour's set is nearer than its own. That needs a move larger than half the shelf spacing; the fit is
  undoable and visible.
- **No partial match.** A user who deleted one old bore gets a fresh set and a stray, as today.
- **The single-part note recomputes on any part change.** If it is measurably slow on large projects, a follow-up narrows the
  signature.

## 9. Left to the builder

The exact placement of A's readout; the search's loop shape (any correct one: the bound is small); whether `moved` rows are
reported in the plan as ids or as a count beyond `moved` (the tests need ids, so the builder may add them).

## Amended (build)

Recorded by the build (Task 5, 2026-10-31), from the SDD ledger (`.superpowers/sdd/2026-10-31-sloyd-cam-joint-fit-again/`).
**Awaiting the user's approval.** Each ruling changes or settles text above.

**Rulings**
1. **R1 (§9): `moved` is ids (`string[]`), in B's list order**, not a count. Cost if wrong: a type narrowed to a number and the tests reworked.
2. **R2 (§3.1, §6): the co-user test raises the right side 1/4".** `boreAlongAxis` is an infinite-line test and a mirror across X keeps y
   and z, so with the literal numbers the "judge the loose test on B alone" mutation could not fail. Cost if wrong: one test's numbers.
3. **R3 (§6): the first link test uses the 3"-deep mirrored fixture with one centred fitting.** Cost if wrong: a fixture swapped.
4. **R4 (§6): the pair-count-3 test also moves the shelf 2"** (3 missing bores against 2 candidates), so it tests "no shifted set", not
   "nothing to fit". Cost if wrong: one test's setup.
5. **R5 (§3.2): two stray bores at the same mouth make two equally near sets and refuse as a tie** (`CAM_JOINT_TWO_FITS`). Kept; the
   sentence reads oddly for duplicates (copy review). Cost if wrong: a word, or a de-duplication rule.
6. **R6 (§4.1): on a tie the section hides Cam face and Fittings too** (A's pair is reused, so the fields mean nothing), a reading made at
   review; the refusal stays as the note and the button is disabled. Cost if wrong: the fields shown on a tie.
7. **R7 (§4.2): the readout memos on the document reference (`s.doc`)**, not a whole-document JSON signature: the same recompute rule (the
   document is immutable) without serialising on every store update (fu 611). Cost if wrong: a recompute on edits that touch nothing near.
8. **R8 (§5): the store needed no change** (§5): `newRows` already compares by value, so the zone gate holds for a moved row, and `judgeHeld`
   already runs after the write; `addCamJoint`'s doc comment says it also fits.
9. **R9 (§4.2): a fit found but refused for another reason shows no stale signal. For the user's ruling.** `stale` (`panels/CamJoint.tsx`) and
   `camJointStaleFits` key only on `moved.length > 0` or `CAM_JOINT_TWO_FITS`. When the planner adopts a set and check 8 (`camJointFaulted`) or
   R18 (`CAM_JOINT_BARE_FACE`) then refuses, A's panel shows no note, and the section shows `Add joint` disabled with the Cam face and Fittings
   fields though A's pair is reused. Nothing wrong is written. The remedy would be a plan field saying a fit was attempted on refusals. Cost if
   wrong (left as is): a user who moved a shelf into a fault sees the fault sentence but not that the joint no longer lines up (fu 613).
10. **R10 (§3.2, §4.2): with one fitting the shifted-set test rules nothing out, and nothing caps the distance. For the user's ruling.** With one
   missing bore (the default on ends under 150 mm), any loose 5 x 12 mm bore anywhere on B's facing face is adopted, the nearest first. So a Cam
   lock never bored into its side but facing one stray bore (e.g. from a deleted shelf 15" away) is offered Fit, the stray is moved, and A's
   readout says "No longer lines up". This partly undoes section 4.2's "never joined must not nag". Cheap remedy if wanted: a distance cap (e.g.
   half the shelf's width along the end). Cost if wrong (left as is): an unrelated bore moved (visible on the button and undoable) (fu 614).

**Differences from the spec as written**
- `moved` is ids (R1); a tie hides the section's fields (R6); the readout's memo key is `s.doc` (R7).
- **Not done, recorded:** strays after an Add-after-move (fu 608), a note on B's own panel (fu 609), a partial match (fu 610), the readout's
  recompute (fu 611), the build's minors (fu 612), the two open points for the user's ruling (R9, R10; fu 613, 614).
- **The browser check** (`docs/browser-verification-cam-joint-fit.md`) is written and pending.
