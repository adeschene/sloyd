# Through dovetails (dovetails chunk 2) — design

Status: APPROVED by the user 2026-10-27 ("Approved, write the plan"). Builder check taken 2026-10-27 (three questions: two settled as my
calls, §3.6 and G3; one ruled by the user, §5.3/§9; two claims the code contradicted, corrected in §5.1 and §5.3). Follow-up 484 (through dovetails; half-blind is a later chunk). Builds on box
joints (`2026-10-26-sloyd-box-joints-design.md`, inv 61): its §11 is the starting point. Decisions quoted from the user are
marked **(the user)**; everything else is **my call** and is marked where it matters.

## 0. What the user decided (2026-10-27, brainstorming)

- **Layout: hand-cut style, half pins at both edges** ("Hand-cut style, half pins at both edges"). Not jig spacing.
- **The user types the slope and the tail count; Sloyd does the rest** ("I pick slope and tail count; Sloyd does the rest").
- **Played back and confirmed** ("Yes, that's right"): every pin, half pins included, has ONE fixed narrow-end width, 1/4"
  (6 mm in a metric project), never typed; the tails share the rest equally; tails are exactly the pin board's thickness deep
  (flush, no proud ends); the user picks which part gets the tails, with a default from the parts' orientation; refused when a
  tail would come out narrower than its pins, and when the two parts differ in height along the joint.
- **The bench output: a cut-list line AND a dimensioned drawing** ("Both, the cut list line and a dimensioned drawing").
- **Both drawings, side by side**: the tail board's face and the pin board's end grain ("Both, side by side"; mockup
  `.superpowers/brainstorm/…/bench-drawing.html`, a 6" side, 4 tails, 1:8: chain 1/4", 1 3/16", 1/4", … along the end).
- **On the cut list sheet, next to the part's diagrams** ("The cut list sheet, next to the part's diagrams").
- **Through dovetails only this round** ("through dovetails are fine for the first round").
- The whole playback (flow, outputs, non-goals, the schema bump) — "Nothing, go ahead".

## 1. What and why

A through dovetail is the hand-cut corner of chests, carcasses and drawers: one board's end is sawn into flared **tails**, the
other's into **pins** that fit between them, and the joint cannot pull apart in the tails' direction. Today a woodworker using
Sloyd lays a dovetail out by hand on paper: tail widths from the board width, the slope, the pin size. Working those numbers out
and printing them at the bench is Sloyd's job.

Unlike box joints, a dovetail is not rectangular cuts. The tail board's waste (the pin sockets) is a trapezoidal prism through
its thickness; the pin board's waste (the tail sockets) is a trapezoid in its END face, cut back to a baseline, which no
current feature stores (a curve cut runs through the whole part, a rectangular cut has square walls). So, **my call: a dovetail
is a new STORED feature, `Board.dovetails`, parametric (the user's numbers, not the outline), and the schema goes to 26.**
Stored, not recognised from shape: the layout is defined by the user's inputs (slope, count), which a shape recogniser would
have to reverse out of floats; a stored feature keeps them exact, and nothing about it lives in `cuts`, so the cut-list tenon
finder and Refine's cut gate never see it (§7).

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) **Dovetail the corners**: select two or more parts; one action (one undo entry) finds every corner they make in pairs
  (box joints' corner rules, §3.1), runs both parts out to the outside faces, and stores a matching dovetail on both ends.
  The design check passes on a dovetailed drawer and a dovetailed carcass (§5.3).
- (G2) **The bench numbers**: one cut-list line per dovetailed end, and on the cut list sheet the two bench drawings side by
  side next to the tail part's diagrams (§5.2).
- (G3) **Change it by running it again**: running the action on already-dovetailed corners re-plans them in place (new slope,
  count, or swapped tails), one undo entry. **My call (builder check): change only what is asked.** On a corner already
  dovetailed, Tails left on Auto KEEPS its stored count (Auto applies only to new corners) unless the new slope faults it,
  then Auto lowers it as §3.2; the tail side stays where it is, and Swap flips it relative to the current side, not the
  default. The success note says what changed.
- (G4) **Refine keeps them**: as box joints (§7).

**Non-goals (follow-ups, §11)**
- Half-blind dovetails, and with them corners whose parts differ in height along the joint (fu 485: the drawer-front case).
- Dovetails on a part with a lean, angle cut, curve, edge profile, edge band, round tenon or box joint (§3.6).
- Proud tails, glue clearance (the model is the finished, flush joint; fu 487's dovetail twin).
- A typed pin width, variable spacing, jig spacing; sliding dovetails; a dovetail at an angle (a splayed box).
- Add joinery, Generate or Refine choosing a dovetail. The design schema is byte for byte the same.
- Dovetail callouts on the Plans sheet (the joint draws there as geometry, unlabelled).

**Anti-goals (failure even if it "works")**
- **No overlap, no gap.** Both ends are built from ONE planned layout; the two parts' wood in the corner square is an exact
  partition of it (to 1e-9), and the design check sees touching faces, never overlap.
- **A dovetail-free document is byte for byte as before** — no `dovetails` key on any part (never `[]`, never `undefined`), and
  every reader, check, drawing, mesh and cut-list line unchanged (identity tests).
- **Never silently wrong on an older build** — hence the schema bump (§8).
- **The bench drawing's numbers are the model's numbers**: the drawing is built from the stored layout through the ONE
  layout function, never re-derived in a component.

## 3. The geometry

### 3.1 Corners and run-out (carried over from box joints)

Corner finding, the candidate test, the "same height along the joint" refusal, one corner per part end, no three-way corners
(one dimension's ends only), siblings in one container, the mirrored-copy refusal, the linked-mate rule (§6), and the exact
run-out of both parts to the other's outside face are **box joints' rules unchanged** (box joints spec §3.1, §3.2 and its
*Amended (build)* rulings R-T3a–R-T3c; `boxJointPlan`'s corner finding and the resize core). My call: the builder factors the
shared corner finding and run-out out of `boxJoints.ts` into one place both planners call, never a copy (the ONE-home rule).

Names, per corner: **T** the tail part, **P** the pin part; `tT`, `tP` their thicknesses; **J** the joint line (the third world
axis); **H** the shared span along J. T's run dimension (the one running into the corner) is `dim_T` at end `end_T`; likewise P.

### 3.2 The layout (ONE function, the user's rule)

Inputs: `H`, tail count `N` (integer ≥ 1), slope `1:s` (`s` the run per unit of offset), pin width `p` (the narrow end).

- **`p`**: 1/4" in an imperial project, 6 mm (6/25.4") in metric **(the user: fixed, never typed)**. Stored on the feature, so
  a later units switch moves nothing (inv 52).
- Along J, at the **outside plane** (T's end face = P's outside face), the layout is a palindrome: half pin `p`, then `N`
  tails of `Te = (H − (N + 1)·p) / N` separated by `N − 1` pins of `p`, then a half pin `p`. Positions are computed directly
  from the part's own J min (`p + k·(Te + p)` for tail `k`), never as a running sum; the last segment ends at exactly `H`.
- **Moving inward** (into T toward its baseline, or across P toward its inside face) every tail–pin boundary moves INTO the
  tail by `x / s` at distance `x` from the outside plane: tails narrow, pins widen. The tails' angled extent is `tP` (T's
  depth); the pins' is `tP` too (P's own thickness): the two parts describe the same prism. At the inside plane a tail is
  `Te − 2·tP/s` and a full pin `p + 2·tP/s`, a half pin `p + tP/s`.
- **Depth**: T's tails run `tP` back from its end (to the baseline); P's sockets run `tT` back from its end.
- Because the layout is a palindrome along J, the direction a turn or a mirror gives J cannot matter (§6) — the asymmetric
  layout refusals fu 484 warned of do not arise.

**The fault (ONE decider, `dovetailFaults`) — my wording of the played-back rule**: a tail at its narrowest (`Te − 2·tP/s`)
must be at least as wide as a pin at its widest (`p + 2·tP/s`), judged at 1e-9. Also faults: `N` not an integer ≥ 1, `s`
outside [4, 12] (my call: 1:4 to 1:12 covers every slope in use; 1:6 and 1:8 are the norms), a depth reaching past the
part's own run size. Copy home `dovetailText.ts`.

**Defaults (my calls)**: slope 1:8. Tail count blank = **Auto**, per corner: `N = max(1, round(H / 1.5"))` (38 mm metric),
then lowered by one while the fault holds; a corner where even `N = 1` faults refuses. A 6" side gets 4, a 4" side 3, a 3"
side 2. A typed count applies to every corner in the action and refuses a corner it faults.

### 3.3 Which part gets the tails

Default **(the user: a default from orientation, with a swap; the rule is my call)**: box joints' phase rule — the part whose
run axis comes first in Z, X, Y. On a drawer that puts the tails on the sides (they run front to back), the pull-resisting
choice. A **Swap tails and pins** checkbox inverts it for every corner in the action; the success note names the tail parts
(`Tails on Side left, Side right.`), so the user sees the choice. My call, a small change from the playback ("the two part
names with a swap"): one checkbox, as box joints, because a drawer selection is four corners and a per-corner picker before
the click would need live planning, which the panel deliberately does not do (box joints §4).

### 3.4 What is stored (schema 26)

`Board.dovetails?: Dovetail[]`, at most one per end, only on a dovetailed part (no key otherwise). My call on the shape:

```ts
interface Dovetail {
  id: string;                    // inv 33 scope: per board (per shape for a shape)
  dim: 'length' | 'width';       // the run dimension (into the corner); J is the other non-thickness dimension
  end: 'min' | 'max';            // which end of `dim`
  role: 'tails' | 'pins';
  count: number;                 // N
  slope: number;                 // s, of 1:s
  pin: number;                   // p, the narrow-end pin width, inches
  depth: number;                 // tails: tP; pins: tT (the other part's thickness at planning)
  outside?: 'min' | 'max';       // pins only: the thickness face the pins are NARROW on (the corner's outside face)
}
```

Each part's geometry derives from its own feature and its own sizes only (`H` = its J size, the angled extent = `depth` for
tails, its own thickness for pins), so a part is self-describing. Every mirror is a flag flip (inv 44): along `dim` flips
`end`; along thickness flips `outside` (pins); along J flips nothing (palindrome). `dovetails` is SHARED in `LINK_FIELDS`
(as `tenons`, inv 45); a `dovetails` key present as `undefined` removes it (inv 46's rule for `tenons`). A `DOVETAIL_FIELDS`
table checked by `satisfies` (inv 40) decides "same dovetail" for cut-list grouping.

### 3.5 Geometry, faults, and every reader

`dovetails.ts` is the ONE home: the layout (§3.2), `dovetailFaults`, and the convex pieces. **A faulted dovetail builds
nothing** (the part reads as plain stock at that end), as a faulted tenon (inv 58). Authoring refuses a fault; an edit
elsewhere (a resize, a thickness change) that faults it KEEPS it and notes it, never clamps — the note in the part's Dovetails
section, and the design check reports the mismatch with the partner as overlap or a gap, as it would for any misfit.

**Bodies (inv 48)**: the dovetailed end's kept wood is a union of convex prisms — the part behind the baseline, plus one prism
per tail (T) or per pin and half pin (P). My suggestion, the builder's choice: each pocket cell intersected with each kept
piece (convex ∩ convex is convex). Bodies stay convex; a body nothing touches keeps its bytes. **Every reader is correct or
refuses** (the model is inv 59's rule): edges (`boardEdges`, inv 16: lines only where a feature is drawn, no facet lines), the
viewport mesh (watertight; UVs keyed by `boardUVSignature` including dovetails, inv 15; grain continuous across the joint,
inv 17), drawings (`drawView`; byte for byte for dovetail-free parts), section caps (`sectionCaps`), snap points (only on
drawn features; my call: tail and pin corners at the outside plane are snap points, nothing in air), picking. Round tenons'
view curves through `geometryBoard` are one possible route for T's sockets (they run through the thickness); P's sockets do
not run through and need body code of their own.

### 3.6 What a part may carry

As box joints §3.5: rectangular cuts running straight THROUGH the corner along the run dimension (a drawer bottom's groove)
are allowed and carried by the run-out; any other stock-removing cut in the corner region, and a hole row reaching it,
refuse; a lean, angle cut, curve, edge profile, edge band or round tenon anywhere on the part refuses (`<part> has <…> —
dovetails work on plain stock for now.`). **New, my call:** a part with a box joint refuses dovetails and a dovetailed part
refuses Box joint the corners (`<part> has box joints` / `<part> has dovetails`), and on a dovetailed part the Lean, Angle
cuts, Curves, Profiles, Banding and Round tenons sections refuse an ADD (`<part> has dovetails — remove them first.`), so no
reader ever meets a dovetail combined with those features. **Builder check, my call:** rectangular cuts and holes stay
editable as today EXCEPT where they reach a dovetailed end region (the span `depth` back from the end, whole section): an add
or an edit there refuses (`<part> has dovetails there — move it clear of the joint.`), from the Cuts and Holes sections, Add
stretcher, and joinery (a site whose pocket or bore would reach the region is skipped with box joints' reason). Then
`holeFaults`, `holes.ts` and the stock probe never meet dovetail waste; teaching them is a follow-up. Grooves carried
through at planning time (§3.6's first sentence) are the one exception, as on box joints.

## 4. The UI

Multi-selection view (`N parts selected`), a **Dovetails** section beside Box joints (my call on words; copy review owed):
- **Slope** `1 : [8]` (a number field; refuses outside 4–12).
- **Tails** `[Auto]` (blank = Auto per corner; an integer ≥ 1).
- **Swap tails and pins** (checkbox, off).
- **Dovetail the corners** (button; disabled only while a field fails to parse; refusals after the click, as Box joints).
- Success note (section state, cleared on selection change, as box joints D2): `Dovetailed 4 corners: 4 tails, 1:8.` (a
  per-corner form when they differ) + `Tails on <parts>.` + box joints' length-change lines.

Single-part view: a **Dovetails** section listing each dovetailed end as its cut-list line, any fault note, and **Remove**
(removes that end's dovetail only; my call: the partner keeps its own, and the check reports the overlap until the user
re-plans or removes it too — no stored partner link exists to follow).

Read-only while exploded (inv 47); one undo entry; every refusal before `edit()`; held points re-judged (inv 24).

## 5. What the readers see

### 5.1 Cut list lines (copy home `dovetailText.ts`, lengths through `units/length.ts`, inv 52)

Draft, copy review owed:
- Tails: `Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 3/4" deep, at the length max end; this part has the tails, 1 3/16" at the end.`
- Pins: `Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the pins, narrow on its thickness max face.`

Row identity: the row key (`cutlist.ts`, beside the other feature signatures; `cutSignature` itself takes rectangular cuts
only) adds a dovetail signature from `DOVETAIL_FIELDS` (ids ignored), so identical sides stay one row.

### 5.2 The bench drawings (the user: both, side by side, on the cut list sheet)

On the tail part's row, next to its diagrams: one pair per distinct layout on the part (a drawer side with the same
dovetail at both ends shows one pair, noted `both ends`). My call: the pin part's row carries its cut-list line only.
- **A — the tail board's face**: the end region, `H` wide, the baseline at `tP` (dashed), waste shaded. A dimension chain
  along the end: `p, Te, p, …, Te, p`; the baseline depth; the overall `H`; the slope `1:8`.
- **B — the pin board's end grain**: `H` by `tP`, the tail sockets shaded, the same chain along the **outside** face
  (labelled), the inside face labelled.
- Same scale, side by side, wrapping under each other on a narrow sheet.
- Inv 19: every measured string is assembled in the module that builds the drawing (never the component), the label size has
  its one home, any non-ASCII glyph (the mockup's `·`) is measured in a browser first. Chain values are display-rounded
  (inv 18: what is machined is never rounded in the model); the overall `H` is printed so the chain's sum can be checked.
- A cut list sheet with no dovetail is byte for byte as before.

### 5.3 The checks — **a check change, APPROVED by the user 2026-10-27** ("Approved, go with your proposal"; §9)

The overlap check measures pocket-cell boxes (inv 38); a dovetailed corner's two boxes interpenetrate, so without a change
every dovetail reports overlap. Proposed: a dovetailed part joins `realBodied` (with angle cuts and built round tenons), so
overlap is measured on real bodies. **Contact is a separate rule** (builder check: `contactRegions` is box-valued and built
from `pocketCells`, trimmed only for tapers, tenons and angle cuts, so joining `realBodied` alone leaves a dovetailed part's
full boxes as its contacts; they interpenetrate the partner's, which counts as no contact, and the carcass top would come back
unsupported). Proposed contact rule: a built dovetail's end region contributes, per tail or pin, the box INSCRIBED at its
narrowest width (the full depth, the full thickness for a tail or the run depth for a pin), plus the part behind the baseline;
never over-claiming wood, as `contactRegions` already promises. The angled cheeks are never contacts (inv 38 as written);
a tail's flat underside rests on the pin part's socket floor (its baseline face), and the inscribed boxes stay clear of the
partner's (they touch, never interpenetrate, along the square faces). A faulted dovetail builds nothing, so its part checks as
its dovetail-free twin. Dovetail-free results byte for byte unchanged. **Required fixtures**: a dovetailed four-sided drawer on
the floor, and a carcass whose top is dovetailed onto two sides (top off the floor, tails on the top: they sit on the pins'
baselines). Both must pass unchanged. If the carcass top comes back unsupported, STOP and bring it to the user: granting
support to a dovetail is an inv 39 change.

## 6. Linked parts, assemblies, copies

Box joints §6 and its D1/D3 rulings unchanged: siblings only, mates of a linked dovetailed part must come along (`select <mate>'s
corner too, or Unlink first`), the planned PARAMETERS must agree (`N`, `s`, `p`, depth, role, Shape-local end, outside face,
run-out size at 1e-9 per R-F1), write-back is `writeBackParts` (`keepWorld`, one edit per storage key, the split-link
refusal). **Because the layout is a palindrome, linked users mirrored along J, and unmirrored users at opposite turns, SUCCEED**
(a required test: both cases, plus Mirror's own pair). A part inside a mirrored copy refuses. A part inside a Definition edits
every copy.

## 7. AI paths, joinery, Refine, Repair

- **Joinery leaves a dovetailed part's size and place alone**, generalising box joints' rule (R-T6a): `<part> has dovetails, so
  joinery leaves its size and place alone`, decided before any mutation.
- **Refine keeps dovetailed parts exactly**: `keepsExactly` gains the dovetailed clause; root parts and their whole ASSEMBLIES
  are kept as box-jointed ones are (inv 56/61, box joints §7 Amended); a joined Refine fixes new sites touching a kept part as
  butt, keeps a recorded joint as recorded, and returns the design UNJOINED when the re-join would change a kept part (the (c)
  guard). The dovetail is not a cut, so nothing needs claiming before the gate — **the builder verifies that `gateUnjoin`
  never sees it** rather than assuming.
- **Repair** never changes a dovetailed part; a result that would refuses.
- Generate never authors a dovetail; the design schema and `toWireDesign` are byte for byte the same. Refine's design shows a
  kept part as fixed, as today.

## 8. Versioning (schema 26)

**The harm, argued for this field**: a 25 build rebuilds every part field by field (`validateBoard`), so it would DROP
`dovetails` silently, load both parts as full plain stock run out to the outside faces — two boards interpenetrating at every
corner — and then autosave that, losing the joint. Hence the bump: a 25 build refuses a 26 file. No upgrade step (absent means
none). Load validation: a malformed entry is DROPPED, the part kept — a non-object, `dim` not `length`/`width`, `end` not
`min`/`max`, `role` not `tails`/`pins`, `count` not an integer ≥ 1, a non-finite or non-positive `slope`, `pin` or `depth`, a
pins entry without a valid `outside` (a tails entry's `outside` dropped), a second entry for one `(dim, end)` (first wins);
canonical order; ids by `takeId`; a well-formed faulted one is KEPT. `docs/versioning.md` gets the row; the rollback line:
rolling back past this round refuses every project saved at 26 — export first.

## 9. What it costs if wrong (my biggest calls), and the user's pile

**Ruled by the user (2026-10-27, "Approved, go with your proposal"):**
1. **The design check reads dovetailed parts on their real bodies, and their contacts as inscribed boxes** (§5.3). Without
   it every dovetail reports overlap and a dovetailed carcass top comes back unsupported. With it, overlap is exact, the
   angled cheeks never count as contact, and each tail rests on the pins' baseline through its narrowest flat box. It widens
   which parts take the real-bodies path (inv 38) and adds a contact shape; it grants no new KIND of support (inv 39's
   rules are untouched; the carcass fixture's STOP rule still guards it).

**My calls, said plainly:**
- **A stored feature and a schema bump** rather than cuts + recogniser: the pins cannot be stored any other way; rollback past
  it refuses newer projects.
- **Auto tail count ~1 1/2" tails**, slope range 1:4–1:12, default 1:8.
- **One Swap checkbox**, not a per-corner picker.
- **A dovetailed part refuses other features' ADD** (§3.6): narrow, but no reader meets a combination it has not been taught.
- **Remove is per end**; the partner is not followed.
- **Bench drawings on the tail part's row only.**

## 10. Tests the builder owes beyond the usual

- **Partition**: per corner, the two parts' world kept pieces inside the corner square have total volume exactly the square's
  and no pair overlaps (to 1e-9), across `H`, `N`, `s`, metric/imperial `p`, turned parts and swapped roles. Mutate the layout
  (one tail 1e-6 wider; the pin slope sign flipped) and the test must fail.
- **The mockup's numbers**: 6" wide, 4 tails, 1:8, 3/4" pins part → chain 1/4", 1 3/16", 1/4", …, 1/4"; tails 1" at the
  baseline; pins 7/16" at the inside face, half pins 11/32".
- Faults: the narrowest tail against the widest pin at the boundary (exactly equal passes), mutated.
- Byte for byte: dovetail-free fixtures' cut list, drawings, plans, bodies, meshes (the existing identity tests) unchanged.
- Migration: 25→26 drops each malformed shape, keeps a faulted one; a 25 build's refusal of a 26 file.
- Mirrors (`chiralPart` and kin, inv 44): every flag flip has its exact inverse; linked users mirrored along J and at opposite
  turns succeed.
- §5.3's two fixtures; overlap on real bodies; a faulted dovetail checks as its plain twin.
- Each refusal decided before ANY mutation, one test per refusal.
- Refine on a dovetail-only project and on a joined cabinet with a dovetailed drawer keeps every dovetail exactly.
- Mesh watertight for a dovetailed part; a perf guard for a dovetailed drawer's rebuild (inv 50's minimum-of-9 rule).
- The bench drawing: its chain strings equal the cut-list line's numbers; no SVG label overlaps (the existing text-collision
  harness).

## 11. Records and follow-ups

New **invariant 62** (full in `docs/invariants.md`, condensed in CLAUDE.md): a dovetail is a STORED parametric feature
(schema 26); `dovetails.ts` is the ONE layout, fault decider and body source; one layout per corner, exact partition; a
dovetail-free document is byte for byte as before; every reader correct or refuses. Also `docs/module-map.md`,
`docs/versioning.md`, `docs/rounds.md`, the feature-gaps row, fu 484 (through done; half-blind open). New follow-ups:
half-blind dovetails (with fu 485); dovetails on featured parts; proud tails and glue clearance; a typed pin width and
variable spacing; joinery/Generate choosing dovetails; Plans-sheet dovetail callouts; a box joint and a dovetail on one part;
following a Remove to the partner.

## 12. Left to the builder

- Where the shared corner finding / run-out lives and its name (ONE home, both planners call it).
- The body construction route (§3.5), within inv 48.
- The bench drawing's scale, layout and styling within inv 19 and §5.2.
- Live-refusal plumbing (copy Box joints'), exact UI wording beyond the quoted sentences (copy review owed), the invariant's
  full wording.

## Amended (build)

Rulings and differences from the build (2026-10-27, branch `dovetails`, commits `e8ca93f`..`a38f216`, the final review's fixes last;
this record follows in its own commit; records in inv 62 and fu 497–515).
**Status: APPROVED by the user 2026-10-27 ("Approved, the amended build section"), after the deploy.** Each line says what was built and what it costs if the call is wrong.

**Spec differences**
- **SD1 — the body route (§3.5).** The builder's choice §3.5 left open: not "each pocket cell intersected with each kept piece" but the
  round-tenon route. `geometryBoard` appends each built dovetail's waste as square-span VIEW curves (`dovetailViewCurves`), so no new body,
  edge, mesh or UV code was written. The pins' sockets, which §3.5 said "need body code of their own", go through the same path: a view
  curve through the run dimension with one square stop at the baseline. The partition test (48 cases, mutated) and the watertight mesh
  test hold, and the perf guard for a dovetailed drawer passes (23 ms bound). *Cost if wrong:* the joint geometry would need its own body
  code if a later feature cannot ride view curves (half-blind's stopped sockets, fu 497).
- **SD2 — refusals on void store actions (§3.6).** `addCut`, `updateCut`, `addAngleCuts`, `addCurves`, `addProfiles` and `setBands` now
  return `string | null`; each panel shows the sentence as its alert. *Cost if wrong:* none found; callers that ignore the result
  compile unchanged.
- **SD3 — the last tail's far edge is `H − p`** (§3.2 gives every tail as `p + k·(Te + p) + Te`). There is one boundary, computed one
  way, so the layout closes at exactly `H`. Every reader takes bounds only from `dovetailLayout` (Task 2 ruling). *Cost if wrong:* an ulp
  in the last tail's width.
- **SD4 — the `depth` fault also covers two dovetails meeting (§3.2).** A part's two dovetails on one dimension whose depths together
  reach its size (to 1e-9) both fault `depth` (Task 4 ruling). *Cost if wrong:* that fault's note reads `it is deeper than the part` for
  an overlap.
- **SD5 — authoring refuses ANY fault, with a new sentence (§3.5).** A planned dovetail that would fault anything but `narrow` refuses
  with `<part> is too short for its dovetails.` (Task 4 rulings: the wording, and refusing every fault). *Cost if wrong:* one string.
- **SD6 — the zone exemption is any cut running straight THROUGH (§3.6).** §3.6 exempted only grooves carried through at planning
  time. The build also exempts a NEW or edited cut that runs straight through a dovetailed end along its run (`cutRunsThrough`, the
  corner planner's ONE predicate), in the store and in joinery (Task 5 and Task 8 rulings). Refusing every edit of a drawer bottom's
  groove would have been a usability regression. *Cost if wrong:* a user can cut a new through groove across a dovetailed end, which a
  hand-cut drawer also allows.
- **SD7 — a linked user mirrored along J at its mate's SAME turn refuses when the Shape takes PINS (§3.2, §6).** §3.2 says the
  palindrome removes the asymmetric-layout refusals, and §6 says linked users mirrored along J succeed. The build's carcass cases
  (`dovetailPlan.test.ts`: two upright sides linked to one Shape, J their width, Side right mirrored along J, and a flat top between them)
  show where that holds:
  - Side right mirrored along J at the SAME turn as Side left (90°), with the sides taking the TAILS (Swap): succeeds.
  - Unmirrored sides at 90° and 270°, taking the pins: succeeds.
  - Mirror's own pair (Side right mirrored at the inverse turn, 270°), taking the pins: succeeds.
  - **Side right mirrored along J at the SAME turn, taking the PINS (the default, tails on the top): REFUSED** with the disagreement
    sentence. Its pins would be narrow on its INSIDE face: the reflection keeps the narrow face on the same world side, which on the
    right side is the inside (Task 4 ruling; fu 507).
  So §6's "mirrored along J SUCCEED" holds only when the Shape takes the tails. *Cost if wrong:* a user with same-turn mirrored linked
  carcass sides must Swap or Unlink.
- **SD8 — the bench pair never wraps (§5.2 said it wraps on a narrow sheet).**
  - Each figure takes a fixed share of the row (`FIG_SHARE`) with a viewBox `FIG_W` wide, so its labels render at PartDiagram's size on
    any sheet, and two always fit side by side.
  - The chain is drawn in full (on one row, or two tiers) only when every label fits on its own span. Otherwise it labels each
    distinct value once at its first span and prints the overall `H` on BOTH figures.
  - These are the Task 7 rulings: keep the user's "side by side" and PartDiagram's label size.
  - The spec's mockup case (6", 4 tails, 1:8) draws the full chain on two tiers, where the mockup had one row.
  - *Cost if wrong:* a reworked label layout after the user sees it (fu 511).
- **SD9 — bench words (§5.2).**
  - The baseline label reads `baseline <depth>`.
  - A layout on one end carries a new note, `<dim> <end> end`.
  - The captions are `Dovetails — the tail board's face` and `Dovetails — the pin board's end grain`.
  - The labels are ASCII only, so no glyph needed measuring in a browser (§5.2's `·` is not used).
  - *Cost if wrong:* copy (fu 512).
- **SD10 — lengths print as `formatLength` gives them (§5.1).** `1-3/16"`, not the draft's `1 3/16"`: inv 52 governs (Task 5 ruling).
  The metric bench chain prints bare mm under the sheet's `Dimensions in mm` note (Task 7 ruling). *Cost if wrong:* none (one home).
- **SD11 — joinery's dovetail reason, and pockets into a dovetailed part (§3.6, §7).**
  - A site whose pocket, rabbet or half-lap notch would reach a dovetailed end's zone is skipped or refused with the DOVETAIL sentence
    (`<part> has dovetails, so joinery leaves its size and place alone`), not box joints' reason.
  - The site is judged by a probe pocket through the store's `dovetailCutRefusal`, so a through groove joins (Task 8 ruling).
  - Unlike box joints, a pocket INTO a dovetailed part is not always allowed.
  - *Cost if wrong:* Add joinery skips some sites near a dovetailed end that the user expected joined.
- **SD12 — more refusals than §3.6 listed.**
  - Bore leg sockets with Tenon the legs refuses to fit a round tenon to a dovetailed leg (Task 5).
  - Add stretcher and Bore leg sockets refuse a socket in a zone, as §3.6 named.
  - Fit the stretcher again has no zone check (fu 508).
  - *Cost if wrong:* none found; each is a refusal before any change.
- **SD13 — Refine's words name dovetails (§7 said "as box joints").**
  - The why-word is `has dovetails`.
  - A kept assembly's note line, the header and the dialog's kept line name `dovetails`, and name both kinds when an assembly holds both.
  - `keptAssemblyLinkRefusal` is worded by the holding definition's kind: two new sentences.
  - The (c) reason has a dovetail form.
  - These are Task 8's rulings, including "both when both" reaching `keptNote`.
  - *Cost if wrong:* copy (fu 512), and a longer model note for a mixed assembly.
- **SD14 — one keep predicate.** Every keep and leave-alone site reads `cornerJointed` (a finger set or a stored dovetail). The finger
  claim sites stay finger-only: a dovetail is not a cut, and `gateUnjoin` never sees one (pinned). *Cost if wrong:* none found.
- **SD15 — module homes (§12, left to the builder).**
  - The shared corner planner is `cornerPlan.ts` and the shared words are `cornerText.ts` (Task 1 R1: the `JointKind` interface
    shapes were the implementer's, box joints byte for byte unchanged).
  - The layout lives in the leaf `dovetailModel.ts`, re-exported from `dovetails.ts`, to avoid an import cycle with the copy home.
  - *Cost if wrong:* none found.

**Final review rulings (2026-10-27, commit `a38f216`)**
- **SD16 — the tail count is bounded.** `DOVETAIL_COUNT_MAX` = 100 (as `HOLE_COUNT_MAX`; §3.4 set no bound): load DROPS an entry with
  more (the part kept), the planner refuses a typed count over it with the count sentence (now `A tail count must be a whole number from
  1 to 100.`) and starts Auto at most at it, and the Tails field reads more as a parse error (button disabled). `Te` has ONE O(1) home,
  `dovetailTailWidth`, read by `dovetailFaults`, `dovetailLine` and `dovetailLayout`: a stored count of 1e9 had allocated a ~16 GB bounds
  array just to read `Te`. *Cost if wrong:* a 101-tail joint can't be typed.
- **SD17 — one tail reads `1 tail`.** Every printed count (the success note, its per-corner lines, the too-narrow sentence, the cut-list
  line) goes through `tailWord`. At one tail (Auto bottoming out, or a typed 1) the refusal is `<A> and <B> are too narrow for even one
  tail at 1:<s> — try a shallower slope or a wider part.`; a typed count of 2 or more that faults keeps `… too narrow for <N> tails at
  1:<s> — try fewer tails.` *Cost if wrong:* copy (fu 512).
- **SD18 — a re-plan keeps the stored pin width (G3: change only what is asked)**, as it keeps the count: the current tails end's `pin`;
  only a new corner takes `pinWidth(doc.units)`. *Cost if wrong:* an old imperial pin survives a units switch until the user removes and
  re-adds the joint.
- **SD19 — the perf guard includes the mesh.** `src/viewport/dovetailsPerf.test.ts` times the dovetailed drawer's `partGeometry` (bodies,
  edges) AND `partMesh`, the minimum of 9, bound 41 ms (3 × the 13.45 ms median measured quiet); the document guard (23 ms, bodies and
  edges) is unchanged beside it. *Cost if wrong:* none (a guard).
- **SD20 — a misfit GAP is NOT reported (§3.5 holds only for overlap).** §3.5 says the design check reports a misfit with the partner
  "as overlap or a gap". Only overlap is reported: the checks have no gap kind, so a pins part THINNED after dovetailing (its partner's
  tails now longer than it is thick) leaves a gap the check passes, and the tails part's cut-list line and bench drawing keep the OLD
  depth (the stored `depth`, set at planning) until the corner is dovetailed again. Escalated to the user; fu 514. *Cost if wrong:* a
  stale depth on the shop sheet until re-run.

**Ruling lines from the build ledger, each with its cost if wrong**
- **Task 2:**
  - The fault boundary's mutation is the slack's sign (−1e-9 → +1e-9), not the plan's `<` → `<=`, which is equivalent at the 1e-9 slack.
    *Cost:* none; the boundary is pinned either way.
  - `links.test.ts` and `shapes.test.ts` were edited beyond version numbers: they list the shared fields, so the new SHARED field had to
    appear. *Cost:* a field-list test that changed with the code it pins.
- **Task 3:**
  - `drawing.ts` is unchanged: dovetail outlines are straight, so no segment is curve-tagged. *Cost:* a future arc-bearing joint view
    would need the exclusion.
  - A hole inside a dovetail socket is not a hole fault: the zone refusals keep holes out at every authoring path. *Cost:* a hole wall
    meshed through socket air in a rare edited state (fu 506).
- **Task 4:**
  - `EndFlips.thickness` is unreachable but kept threaded. *Cost:* a dead parameter.
  - G3's "the note says what changed" is met by the success note (N, slope, `Tails on …`), with no extra line. *Cost:* copy review may
    add one.
- **Task 7:**
  - Front and back stay separate cut-list rows when their pins are narrow on different part-local faces (inv 40's part-local identity).
    *Cost:* a dovetailed drawer's front and back read as two rows (fu 510).
  - The bench label size and chain modes: see SD8.
- **Task 8:**
  - Joinery's pocket check is `dovetailCutRefusal` (through grooves exempt), matching the store: see SD6 and SD11.
  - Joining the drawer bottom FIRST, then dovetailing (or box-jointing) the corners, makes Refine refuse with `GATE_REFUSAL`. This is
    pre-existing (fu 493's mechanism) and was not fixed here. The other order works (pinned). *Cost:* users who join first hit
    `GATE_REFUSAL` until fu 493 is done; fu 493 now names this as the common drawer workflow.
- **Pre-flight R1:** `JointKind`'s `addAt` and `signature` shapes were the implementer's, and Task 4 extended them for the pins' outside
  face. *Cost:* an interface reshuffle; none happened.
- **Pre-existing, recorded (Task 2):** `updateBoard` on a mirrored linked part throws when its patch carries `tenons`, now also
  `dovetails` (fu 505). *Cost:* none today; no production caller sends either key.

## Copy review (2026-10-27)

The user approved nine wording changes across box joints and dovetails ("Apply all of them"); the sentences quoted above are the
built wording, superseded where fu 512 lists the new text. Refine's done view now names each kept part's own reasons
(`Kept exactly as is: Drawer (dovetails)`).
