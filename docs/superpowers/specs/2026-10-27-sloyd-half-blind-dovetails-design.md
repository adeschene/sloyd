# Half-blind dovetails (dovetails chunk 3) — design

Status: APPROVED by the user 2026-10-27 ("Approved, write the plan"), all five items in §9 as proposed. Builder check taken 2026-10-27: two questions, both settled as my calls
(Swap on a half-blind corner, §4; disagreeing ends, §8), one claim the code contradicted (corrected in §3.3) and one reader
added (the bench, §5.2). The user said "you pick, just start" (2026-10-27): they chose to skip the
brainstorming questions, and Claude picked this gap (`docs/feature-gaps.md` §1, fu 497). **Every decision here is my call**
unless it is quoted from an earlier round's ruling, and the ones that matter most are collected in §9 for the user. Builds on
through dovetails (`2026-10-27-sloyd-dovetails-design.md`, inv 62, schema 26) and its *Amended (build)* block: everything that
spec settled holds unless this one says otherwise.

## 1. What and why

A half-blind dovetail is the drawer-front joint. The front (the PIN part) is thicker than the sides' tails are long. Its
sockets stop short of the front's outside face, so the front shows no end grain. The solid wood left in front of the
sockets is the **lap**. The sides (the TAIL part) are cut exactly as for a through dovetail, only shorter: tails `tP − lap`
long, where `tP` is the front's thickness. Through dovetails (schema 26) cannot express it. Their pin sockets run through
the pin part's whole thickness. So today a woodworker modelling a drawer either fakes the front with through dovetails,
which show end grain on the face, or leaves the corner butt-jointed.

## 2. Goals, non-goals, anti-goals

**Goals**
- (H1) **Dovetail the corners, half-blind.** The Dovetails section gains a joint-kind choice (§4). With Half-blind, one
  action (one undo entry) does everything through dovetails do: finds the corners, plans the layout and stores a matching
  dovetail on both ends. The difference is that the tails part's end runs out to the LAP PLANE, `lap` in from the pin part's
  outside face, rather than to that face, and the pin part's sockets stop at the lap plane.
- (H2) **The bench numbers.** The cut-list line names the joint `Half-blind dovetails` and gives the lap. The bench pair
  draws the lap (§5.2).
- (H3) **Change it by running it again** (through dovetails' G3: change only what is asked). A re-plan keeps a corner's
  stored kind and lap unless the user asks for another (§4).
- (H4) **Every reader is correct or refuses** (inv 62). This covers bodies, edges, mesh, section caps, snap points, the
  checks, joinery, Refine, Repair and the cut list.

**Non-goals (follow-ups, §11)**
- **Parts of different heights along the joint** (a drawer front taller than its sides, fu 485). fu 497 bundled it with
  half-blind. It is split off here because it changes the SHARED corner finding (the heights refusal in `planCorners`),
  which box joints read too, and it needs its own layout rule for the wood that sticks out. Box joints and both dovetail
  kinds should get it together, in one later round. The heights refusal stays exactly as it is.
- Rabbeted (lipped) half-blind fronts and overlay fronts: the front sticking out past the sides.
- Half-blind on one end and a through dovetail on the OTHER part's end at one corner. That is not a joint: both ends of a
  corner always carry the same kind.
- Everything inv 62's follow-ups already list: dovetails on featured parts (498), proud tails (499), typed pin width or
  spacing (500), joinery or Generate choosing one (501), Plans callouts (502), a box joint and a dovetail on one part (503).

**Anti-goals**
- **No overlap, no gap.** The two parts' wood in the corner is an exact partition (to 1e-9) of the tails part's footprint
  within the pin part. The lap belongs to the pin part alone. Mutated tests (§10).
- **A through-dovetailed document is byte for byte as before.** No `lap` key on a through entry: never `0`, never
  `undefined`. Its cut list, bodies, meshes, edges and bench drawings are unchanged (identity tests over the existing
  dovetail fixtures, as well as over the dovetail-free ones).
- **Box joints byte for byte as before.** The corner planner's new hook (§3.1) is optional, and box joints do not implement
  it.
- **Never silently wrong on an older build.** Hence the schema bump (§8).

## 3. The geometry

Names as in the dovetails spec §3.1: **T** the tail part and **P** the pin part; `tT` and `tP` their thicknesses; **J** the
joint line; **H** the shared span along J. New: **`lap`**, the thickness of solid wood P keeps in front of its sockets,
measured from P's OUTSIDE face (the face T's end used to land on).

### 3.1 Run-out: the tails end stops at the lap plane

Through dovetails run both parts out to the other's outside face. For half-blind, **P runs out exactly as before** (to T's
outside face). **T runs out to the lap plane**, the plane `lap` inside P's outside face, so its new size is `lap` shorter
than through's.

**The mechanism, a correction the review asked for:** `moveEnd` lands a world part's moving MIN face EXACTLY on `op.far`.
So the inset must move `far`, not only `size`. `JointKind` gains ONE optional hook. With the corners found and before any
end moves (planCorners step 4), the kind may give, per corner end, an **inset** (≥ 0), the distance that end stops short of
the other part's outside face. When the inset is non-zero, step 4 builds that end's `EndOp` with:
- `far` moved `inset` back into the other part (toward its inside face);
- `size` computed from that `far`;
- `depth = other.thickness − inset`.

Everything downstream reads those three numbers: the exact run-out (inv 25), the corner region, the stored `depth`, the
replay on a linked Shape's own board, and the link signature (depth, final size). Box joints do not implement the hook (no
inset). This needs the tails side decided BEFORE the ends move, so the dovetail kind's tails-side rule (the dovetails spec
§3.3 and G3: a re-plan's current tails part, else `RUN_RANK`, then Swap) is factored into one function. Both the inset
hook and `planCorner` call it, so both read the same answer. A part with two corners has each end's inset decided by its
own corner.

**The candidate test needs no change.** A half-blinded T's end already lies inside P's thickness slab (`reach` accepts
it), and a re-plan back to through moves it out to `far` again.

### 3.2 The layout and the faults

The layout is `dovetailLayout` unchanged (the palindrome along J, at the plane where T's end lands). Only the angled extent
`X` changes, the distance over which a tail narrows and a pin widens:
- through: `X = tP` on both parts (as now);
- half-blind: **`X = tP − lap`** on both parts. T's tails are `depth = tP − lap` long. P's sockets run from the lap plane to
  its inside face, which is also `tP − lap`.

**`dovetailFaults` (the ONE decider) reads it:** for a pins entry, `X = b.thickness − (d.lap ?? 0)` (tails as now:
`X = d.depth`). A new fault, **`lap`**, applies to a pins entry whose `lap` is not strictly inside its own thickness
(`lap ≤ 1e-9` or `lap ≥ thickness − 1e-9`), and it is judged BEFORE `narrow`. The order becomes `count`, `slope`, `lap`,
`depth`, `narrow`. A tails entry's `lap` is a record only (§3.3) and never faults. The planner's `narrow` probe
(`planCorner`) builds each side's trial `Dovetail` WITH the lap, so Auto counts and refuses on the true extent. (Without
this, Auto would under-count tails and some valid corners would refuse.)

**Lap, Auto (my call):** a third of P's thickness, rounded to the nearest 1/16" (imperial) or whole mm (metric), and at
least 1/8" (3 mm). That gives 1/4" on a 3/4" front, 3/16" on a 5/8" one, 5/16" on a 7/8" one, and 6 mm on an 18 mm one. A
typed lap must be greater than 0 and less than P's thickness; anything else refuses with the lap sentence before any
change. Rounding applies only to Auto's choice. A typed lap is stored exactly (inv 25).

### 3.3 What is stored (schema 27)

```ts
interface Dovetail {
  // … every schema-26 field unchanged …
  lap?: number;   // half-blind only, on BOTH ends of the corner: the pin part's lap, inches. Absent = through.
}
```

- **Both entries carry it**, so each part is self-describing (the dovetails spec §3.4's rule). P's geometry and fault read
  it. T's geometry does not (its `depth` already says how long the tails are), but T's cut-list line and bench drawing need
  to know the joint is half-blind, and how thick the lap is.
- **`DOVETAIL_FIELDS` gains `lap`** (inv 40; the `satisfies` table forces it), so a half-blind side and a through side are
  different rows, and so are two laps. **Builder check (code contradicted the identity anti-goal):** `dovetailValues` writes
  every field, an absent one as `undefined`, so a through entry would gain a `|undefined` suffix and every through cut-list
  row's `key` string would change. `dovetailValues` therefore OMITS an absent `lap` (an absent key reads as nothing, a present
  one as `|lap=<value>`), pinned by an identity test on a through row's key.
- **Mirrors: `lap` flips under nothing.** It is a distance measured from `outside`, which already flips along the thickness
  (inv 44). `mirrorOne` is unchanged.
- **Linked parts:** `lap` joins the kind's `signature` (Shape-local, exact), so linked users must agree on it as on
  everything else.

### 3.4 Geometry and every reader

All of it is through dovetails' route (SD1: square-span VIEW curves through `geometryBoard`), with the outline cut short:
- **T (tails):** `dovetailViewCurves` unchanged. It reads `depth`, which is already `tP − lap`.
- **P (pins), half-blind:** each tail socket is the same prism along `dim` (from the baseline to the end, one square stop
  at the baseline). Its outline in (J, thickness) runs from the **lap plane** (`v = lap` in from the `outside` face) to the
  inside face. At the lap plane it has the tail's outside-plane bounds; at the inside face each side is
  `(thickness − lap)/s` further in. The outline touches the inside face and the end face only. The lap slab is uncut wood.
- **Snap points (`dovetailCorners`, inv 16, a reader the review found):** a half-blind P's corners sit on the LAP PLANE
  (at the end face and at the baseline), never on the outside face, which is unbroken lap wood with nothing drawn there.
  T's are unchanged (on its end face).
- **The checks (`dovetailContacts`, inv 38):** P's pin boxes span the thickness from the lap plane to the inside face, with
  the pins' inscribed width taken at the lap plane. P also gains one contact box for the lap slab (its whole J span, run
  `depth`, thickness from the outside face to the lap plane), which is where T's end faces rest. No new kind of support
  (inv 39 untouched). A faulted half-blind dovetail builds nothing and checks as its plain twin.
- **Zones (`dovetailZones`, §3.6 of the dovetails spec):** unchanged. They are `depth` back, whole section, so P's zone
  includes its lap.

**The risk, tackled first (the review):** the dovetails spec's SD1 named half-blind's stopped sockets as the place view
curves might not hold. The pins outline is new in that it does NOT run from face to face. **Plan Task 1 is the proof**: a
half-blind pins part through `geometryBoard` and `boardBodies`, with a watertight mesh (`curvesWatertight`'s harness),
edges (no facet lines, a line only where the socket is drawn), section caps, and the 1e-9 partition against its tails
partner, mutated. **Fallback if it fails:** a lap-slab split. The pins part's dovetailed end is described as two
pieces — the lap slab (plain) and the remainder (through sockets over a part `thickness − lap` thick) — built as two
convex bodies through the same view-curve path. If that also fails, STOP and bring it to the user before writing body code
of its own.

## 4. The UI

The multi-selection **Dovetails** section gains two controls before the button (my calls on words; copy review owed):
- **Joint** select: `As they are` (default), `Through`, `Half-blind`. **As they are** keeps each corner's stored kind on a
  re-plan, and a NEW corner is through. This is H3, the same rule as Tails left on Auto keeping the stored count. It is the
  fix for the review's finding: with a plain Through/Half-blind default, re-running on a half-blind drawer just to change the
  slope would silently turn it through and lengthen the sides. `Through` and `Half-blind` set every corner in the action.
- **Swap on a half-blind corner (builder check, my call):** the stored lap belonged to the old pin part, so when Swap
  changes which part takes the pins, a blank Lap is chosen by Auto again against the NEW pin part's thickness (a typed lap
  still applies as typed). The planner's probe judges `lap` as well as `narrow`, so a lap that does not fit the new pin part
  refuses with the lap sentence, never `dovetailTooShort`.
- **Lap** `[Auto]`, a length field enabled when the select would make any corner half-blind (`Half-blind`, or
  `As they are`, since a selection's corners may already be half-blind). Blank means Auto on a new half-blind corner and
  the stored lap on a re-plan. A typed lap applies to every half-blind corner in the action. A lap typed while every corner
  ends up through is ignored, and the note does not mention it.
- The success note keeps its form and names the kind: `Dovetailed 2 corners, half-blind: 4 tails, 1:8, 1/4" lap.` When
  corners differ it uses the per-corner form, as now.

The single-part Dovetails section is unchanged: each end's cut-list line (§5.1) and Remove.

## 5. What the readers see

### 5.1 Cut-list lines (`dovetailLine`, copy home `dovetailText.ts`)

A through line is byte for byte as now. Half-blind (drafts, copy review owed):
- Tails: `Half-blind dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the tails, each 1-3/16" wide at the end.`
- Pins: `Half-blind dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the pins, their narrow ends 1/4" in from its thickness max face (the lap).`

### 5.2 The bench drawings

**My call: no third figure** (fu 497 anticipated one). The pair stays, A (the tail board's face) and B (the pin board's
end grain), and B carries the lap:
- **A:** unchanged in form. The baseline is at `depth = tP − lap`.
- **B, half-blind:** `H` by `tP` as now. The lap is drawn as a solid band along the outside face, with a dimension
  `lap <x>`. The sockets are shaded from the lap plane to the inside face, and the chain runs along the **lap plane** (where
  the pins' narrow ends are), labelled as now.

**Builder check, a reader to fix:** the bench's `layoutKey` gains `lap` (else a through and a half-blind tail end of the
same depth on one part merge into one `both ends` bench), and figure B's pin-board thickness is `depth + lap`, not `depth`.

A third figure, the pin board's inside face showing the socket depth `tT`, is left out: that number is already in the
cut-list line (`… deep`), and the pair's width share (SD8) is set for two figures. If the user wants it, it is a
follow-up. A sheet with only through dovetails is byte for byte as before.

## 6. Linked parts, assemblies, copies

As through dovetails (§6 and SD7), with `lap` in the signature (§3.3) and the inset applied on the Shape's own board
through the same `EndOp`. fu 507's refused case (a linked user mirrored along J at its mate's same turn, taking the pins)
is unchanged: the narrow face, and now the lap, would land on the wrong side.

## 7. AI paths, joinery, Refine, Repair

Unchanged rules: `cornerJointed` already covers any stored dovetail. Joinery leaves the part alone, Refine keeps it,
Repair never changes it, and Generate never authors one. The builder pins one half-blind case at each site rather than
assuming it works.

## 8. Versioning (schema 27)

**The harm, argued for this field.** A 26 build validates dovetails field by field (`validateDovetails` rebuilds each
entry from the known keys), so it DROPS `lap` silently. It would then load the front's sockets as through sockets cut
through its face, and the sides `lap` short of the old outside face. That leaves a visible notch row on every drawer front
and a gap behind each tail, and autosave would then lose the lap for good. Hence the bump: a 26 build refuses a 27 file.
No upgrade step (absent means through).

**Load:** `lap`, when present, must be finite and > 0, or the ENTRY is dropped (the part kept), as for `depth`. A `lap` on
one end of a corner and not the other cannot be detected on one part and is not judged at load. It is a misfit the checks
report as overlap, like any other misfit (but see fu 514: a gap is not reported). **Builder check, my call:** when a corner's
two ends disagree (one carries `lap`, or the values differ), the PINS entry decides the kind and lap for `As they are`: its
lap is the one that shapes geometry. A well-formed but faulted lap (`≥` the
thickness) is KEPT and noted.

`docs/versioning.md` gets the row. **Rollback:** back to the dovetails commits (schema 26) refuses every project saved at
27; export first.

## 9. The user's pile (decisions only the user should make)

1. **Schema 27 and its rollback cost** (§8): after this ships, rolling back past it strands every project saved since.
2. **The scope split** (§2): the front taller than its sides (fu 485) is NOT in this round, and the heights refusal stays.
   This is the biggest departure from fu 497 as written.
3. **The Joint select's `As they are` default** (§4), rather than a two-way Through/Half-blind choice.
4. **Lap Auto = a third of the front's thickness** (§3.2), rather than a fixed 1/4" (the pin width's rule).
5. **No third bench figure** (§5.2).

## 10. Tests the builder owes beyond the usual

- **Task 1, the proof (§3.4):** a half-blind pins part's watertight mesh, edges, section caps and bodies. The partition
  against its tails partner: the two parts' kept wood inside the corner box sums to its volume, no pair overlaps (to 1e-9),
  and the lap slab belongs only to P. This runs across `H`, `N`, `s`, `lap`, turned parts and swapped roles. Mutated:
  shifting the lap plane by 1e-6 and flipping the outline toward the outside face must each fail.
- **The run-out:** a min-side AND a max-side tails end land exactly on the lap plane (`far ∓ lap`), across turns and a
  mirrored Shape's own board. Mutated: an inset that changes only `size` must fail for the min side.
- **Faults:** `lap` at 0, at the thickness and just inside each bound; `narrow` judged on `tP − lap` (a corner that faults
  as through and passes as half-blind); Auto's count on the true extent.
- **Identity:** every existing through-dovetail fixture's cut list, bodies, meshes, edges and bench drawings are byte for
  byte unchanged, and box joints' tests are untouched.
- **Snap points:** none on a half-blind P's outside face; each sits on the lap plane.
- **The checks:** a half-blind drawer (half-blind front, through back) on the floor passes. The carcass fixture with a
  half-blind top passes too, under the dovetails spec §5.3's STOP rule: if it comes back unsupported, bring it to the user.
- **The UI rule:** `As they are` keeps a half-blind corner half-blind on a slope change, and keeps its lap. `Through`
  converts it, with the sides lengthened by exactly `lap`.
- **Migration:** 26→27 loads with no change. A malformed `lap` drops the entry, and a faulted one is kept.
- **The bench:** B's lap label and chain strings equal the cut-list line's numbers, with no label overlap (the collision
  harness).
- Each refusal is decided before any mutation, with one test per new sentence.

## 11. Records and follow-ups

Inv 62 is extended (full in `docs/invariants.md`, condensed in CLAUDE.md): `lap`, the inset hook, `X = tP − lap`. Also
`docs/module-map.md`, `docs/versioning.md`, `docs/rounds.md` and the feature-gaps row. **fu 497** is closed for the
half-blind joint and its bench figure; its heights half moves under fu 485, re-worded to cover box joints and both
dovetail kinds. New follow-ups: rabbeted (lipped) and overlay fronts; a third bench figure if wanted.

## 12. Left to the builder

- The hook's name and exact signature (one optional `JointKind` member; box joints untouched).
- Factoring the tails-side rule into one function both calls read.
- The bench figure B's lap band styling, within inv 19 and SD8.
- Live-refusal plumbing for the Lap field, copying the Tails field's.

## Amended (build)

Rulings and differences from the build (2026-10-27/28, branch `half-blind`, commits `48d2f92..7e6beae`; this record follows in its own
commit; records in inv 62 (and inv 38's clause) and fu 485, 497, 516–521).
**Status: APPROVED by the user 2026-10-28 ("Approved, the amended build section"), after the deploy.** Each line says what was built and what it costs if the call is wrong.

**Spec differences**
- **HB-SD1 — a typed lap of 0 or less reads the parse sentence, not the lap sentence (§3.2).** §3.2 says a typed lap outside (0, `tP`)
  "refuses with the lap sentence". The build splits it: a typed lap ≤ 1e-9 or NaN refuses with the Lap field's parse sentence `A lap must
  be a length more than 0.` (from the planner too, `DOVETAIL_LAP_PARSE`), and only a lap at or past the pin part's thickness reads `<part>
  is too thin for a <lap> lap.` (Task 3 ruling, made in Task 4; the alternative read `Front is too thin for a 0" lap.`). *Cost if wrong:*
  one string.
- **HB-SD2 — Through lengthens each END by `lap`, so a side with two half-blind ends grows `2·lap` (§10).** §10's "the sides lengthened by
  exactly `lap`" is per end; the tests assert each end's span (Task 3). *Cost if wrong:* none (the spec's wording; the geometry is the
  spec's §3.1).
- **HB-SD3 — the pins' contact boxes are the through ones (§3.4).** §3.4 says P's pin boxes "span the thickness from the lap plane to the
  inside face". The build keeps each pin's inscribed box over the WHOLE thickness (its narrowest J span, which at the lap plane has the
  outside plane's bounds) and adds the lap-slab box: in front of the lap plane that wood is lap, so nothing is over-claimed (Task 5).
  *Cost if wrong:* none found; a stricter box would change no verdict (no tested verdict depends even on the slab box, HB-R8).
- **HB-SD4 — the lap band is light, and its label has no tick (§5.2).** §5.2 asks for "a solid band along the outside face, with a
  dimension `lap <x>`". The build draws a `.cutlist-bench-lap` band at fill-opacity 0.06 with a 1.5 stroke along the lap plane (the waste
  fill is 0.22, so a heavier band could read as waste), and puts `lap <x>` on the outside face's label row as free text, without a
  dimension tick (Task 6 review; deferred to the browser check). *Cost if wrong:* a restyle after the user sees it (fu 520).

**Build rulings (the ledger's `Ruling:` lines)**
- **HB-R1 (pre-flight) — the plan's narrow example replaced.** (H=3, N=2, s=6, p=1/4, t=3/4) does not fault as through (Te 1.125; through
  X = .75 gives .875 ≥ .5); replaced by (H=2, N=2, s=4, p=1/4, t=3/4): through faults (.25 < .625), lap 1/2 (X = .25) passes (.5 ≥ .375),
  checked by hand. *Cost if wrong:* none (test numbers only).
- **HB-R2 (Task 1) — one existing test edited:** `dovetails.test.ts`' DOVETAIL_FIELDS list gains `'lap'` (the plan mandates the field, the
  test pins the exact list, as the links/shapes tests in the dovetails round). *Cost if wrong:* none.
- **HB-R3 (Task 1) — `FAULT_REASONS.lap` added in `dovetailText.ts`**, outside the brief's files: `Record<DovetailFault, …>` forces it,
  and inv 62 makes `dovetailText.ts` the copy home. *Cost if wrong:* none.
- **HB-R4 (Task 1) — "no snap point on the outside face" excludes the part's own outline corners**, which are real wood; the test forbids
  points at the inner layout bounds and strictly inside the face. *Cost if wrong:* none.
- **HB-R5 (Task 3) — `dovetailedLines`' `units` and `lap` are optional, and a layout with a lap and no units THROWS.** Required parameters
  would have edited an existing copy test; a throw beats a silent imperial default. *Cost if wrong:* a future caller without units throws
  (loudly).
- **HB-R6 (Task 3) — a typed lap ≤ 0 or NaN never reads "too thin for a 0" lap"**: the planner returns the Lap field's parse sentence
  (HB-SD1; Task 4 owns the sentence). *Cost if wrong:* one string.
- **HB-R7 (Task 3) — the inset refusal (step 3a) runs before step 4's plain-stock test**, as the plan ordered (pinned: a round tenon on
  Back still gives the lap sentence). *Cost if wrong:* a lap refusal shows ahead of a feature refusal on another part.
- **HB-R8 (Task 5) — the lap-slab contact box is kept though no verdict depends on it**: §3.4 asks for it, and it never over-claims;
  removing it fails only its own presence test. *Cost if wrong:* none.
- **HB-R9 (Task 6) — Review Focus 3's "linked mirror twins" replaced by linked UNMIRRORED sides for the mixed drawer.** Mirror-twin sides in
  a half-blind-front, through-back drawer refuse at the same turn and split into two cut-list rows as Mirror's own pair; both are
  pre-existing for a through drawer with unequal front and back (inv 40's part-local identity, fu 510's class), so they went to fu 519,
  ask first. *Cost if wrong:* a user's mirrored sides in a mixed drawer read as two rows (or refuse).
- **HB-R10 (Task 7) — `cutRunsThrough`'s through-groove exemption kept on a half-blind PINS part**: the groove runs on the inside face
  along the run and leaves through end grain the side covers; the lap's face is untouched unless the groove is deeper than `tP − lap`,
  which is an ordinary visible cut. *Cost if wrong:* a user can cut a groove that breaches the lap without a refusal (fu 521 (7)).
