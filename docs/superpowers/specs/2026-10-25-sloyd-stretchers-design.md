# Splayed legs, chunk 3: stretchers — design

Status: APPROVED by the user 2026-10-25 ("Approved, write the plan"); builder check taken 2026-10-25 (six questions, each answered as my call: §3.1, §3.3,
§3.4, §4, §6.1–6.3; three claims the code contradicted, corrected). Follow-up 438 (the splayed legs spec's §12 and the angled holes spec's §12 outline).
Chunk 1 (a part leans, schema 22), chunk 2 (angled holes, schema 23) and chunk 2b (round tenons, schema 24) are deployed
(`index-ObjqEMR0.js`).

The user asked for stretchers next and to skip the design questions, so every decision below that is not quoted from the
user is **my call** and is marked. The outline this follows was written in the angled holes spec (§12): "a rung between two
leaning legs at a typed height, its length and end angles from the legs' axes, round tenons into sockets bored in the legs
along the rung." The read-only survey behind it is in §10.

## 1. What and why

A staked stool's legs are braced by stretchers (rungs): a rung runs between two legs a few inches off the floor, its
round tenons glued into sockets bored in the legs. On splayed legs every number is awkward: the legs are farther apart at
the rung's height than at the seat, the rung meets each leg at a compound angle, and each socket is bored at an angle to the
leg's face. Today a woodworker can model none of it in Sloyd: a part laid between two leaning legs reports `unsupported` (fu
438: nothing is held "between" leaning parts), and working the length and the socket angles out by hand is the very job
Sloyd exists to do.

Chunks 2 and 2b built every piece but the action: a hole row may tilt and may sit in a leaning part (chunk 2), a part's end
may carry a round tenon, and a tenon seated in a matching socket is a joint the design checks hold (chunk 2b, clause (d),
inv 58). So this chunk is **one action, Add stretcher, plus its re-fit** — and, my call, **no schema change**: a stretcher
is an ordinary part with two round tenons, its sockets ordinary hole rows, and the joint between them is found structurally
as for a leg in a seat. Nothing new is stored, so rolling back past this round costs nothing.

Who it serves: someone modelling staked furniture (stools, benches, chairs, a splayed-leg table's low rungs), and — because
nothing in it needs a lean — a rung between two upright, unleaned legs too.

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) **Add stretcher**: with two upright legs selected, one action (one undo entry) adds a rung between them at a typed
  height: its length worked out from the legs, a round tenon on each end, and a socket bored in each leg along the rung's
  axis that the tenon seats in. The design check passes on the result: the rung is held by its two joints.
- (G2) **Fit the stretcher again**: after a lean edit and Level the ends (or a leg moved), the rung's panel says it no
  longer fits; one action re-plans it at its height, keeping the rung's, the tenons' and the sockets' ids.
- (G3) Every number the bench needs is printed: the rung's length and tenon lines on the cut list, each socket's tilt in
  the leg's hole line (both already exist), and the shoulder gap (§5.3) in the rung's readout.

**Non-goals for this chunk** (each a follow-up, §11)
- A rung that does not run along a world axis in plan (a diagonal or X stretcher). Sloyd's unleaned parts turn by quarter
  turns only, and a lean is for upright parts; a diagonal rung needs a new posture. Add stretcher refuses it.
- A stretcher between two rungs (an H stretcher's middle rung) or between parts that are not upright.
- Round (turned) rung stock. Sloyd's parts are boxes; the rung is square stock with round tenons.
- Aprons: a wide rail at a leg's top needs a compound-angle rectangular tenon.
- A shoulder cut to the leg's face (a coped or angled shoulder); the shoulder stays square (§5.3).
- Tapered tenons and sockets (fu 449); wedges and pins (fu 458).
- Generate or Refine authoring a stretcher (Refine already keeps tenoned and leaning parts exactly).

**Anti-goals** (failure even if it "works")
- **Support is never granted by proximity.** The rung is held only because its tenons are seated (chunk 2b's structural
  rule, unchanged). Add stretcher never adds a special case to the checks.
- **No overlap is made.** The rung's square shoulder never enters a leg's wood: its length is rounded DOWN, so the gap only
  grows.
- **A project without a stretcher is byte for byte as before**; no reader, check or drawing changes for it.
- **No socket is lost or doubled silently.** A re-fit moves the rows it made in place; a linked leg's socket is shared, said
  so, and reused, never bored twice (§6).

## 3. The geometry (my calls)

### 3.1 The rung's axis

Each leg's axis is `partAxis` (chunk 2b): the length's centre line through its placement and lean. The rung's axis is the
segment between the two points where the legs' axes cross the horizontal plane at the typed **height** `h` (world Y,
measured from the floor, `y = 0`, to the rung's axis). Both points are at height `h`, so the rung is level.

- **Along a world axis only.** The two points must differ in exactly one of X and Z, to 1e-6 (the stool's mirrored legs
  agree to ~1e-15). The rung's axis is then made EXACTLY axis-aligned: its cross coordinate is the two points' midpoint,
  and both sockets are bored along that exact line (never along the legs' own points), so the joints seat at 1e-9 by
  construction (builder check Q5). Otherwise: `These legs aren't square to each other at that height — a stretcher must run straight
  along the front, back or sides.` (A rung between a front leg and a back leg on the same side runs along Z; between the
  two front legs, along X.)
- **The legs must reach the height**: `h` must lie strictly between each leg's lowest and highest world Y on its axis,
  with the rung's section inside both, else `<Leg> doesn't reach that height.`

### 3.2 The rung part

A new part, my call: named `Stretcher` (`uniqueName` among the legs' container's siblings, inv 8), posture **flat**, its
length along the rung's world axis (turn 0 along X, 90 along Z), section **width × thickness = the typed rung size**
(square), centred on the axis. Material: the legs' if they share one, else the project default. Grain along the length.
It is added to the legs' container through the ordinary write-back (inv 46); legs in different containers refuse (`Select
two legs in the same assembly.`). A leg placed through a mirrored instance refuses (`… inside a mirrored copy …`), my call:
a later round can lower through the mirror.

### 3.3 Its length and its tenons

For each end, the **shoulder station** `sA`, `sB` is how far from the leg's axis point the rung's square section has fully
left the leg's wood: the largest distance, over the four lines parallel to the rung's axis through the section's corners,
from the axis point to where that line leaves the leg's (leaned) body. The shoulder must stand clear at every corner.

A round tenon lies INSIDE `Board.length` (chunk 2b, `shoulderAt`), so the stored length is the STOCK a woodworker cuts.
With `D` the distance between the two axis points (builder check Q3, my calls):
- the **stock length** `L` = `D` rounded DOWN to the drag grid (`snapToGrid`'s step: 1/16", 1 mm), the rung centred between
  the axis points, so each tenon's tip stops `(D − L)/2` short of its leg's axis — a tenon reaches the middle of the leg, the
  usual proportion for a rung (a typed depth is a follow-up);
- the **shoulder-to-shoulder** length `S` = `D − sA − sB` rounded DOWN to the same grid, its slack `(D − sA − sB) − S` split
  evenly between the ends, so every corner of each shoulder clears its leg by at least the measured gap;
- each end's tenon (`end` min and max), diameter = the typed tenon diameter, has the length that placement leaves (the two
  sum to `L − S`), stored exact. Both `L` and `S` print on the grid.
- The tenons are ordinary `RoundTenon`s; `tenonFaults` (the ONE decider) applies: a tenon wider than the rung's section
  refuses (`A round tenon must be narrower than the part's section.`, chunk 2b's sentence).

### 3.4 The sockets

Each leg gets one **blind** socket, a single-hole row bored along the rung's axis into the leg's face that the axis enters
(the face whose outward normal is nearest the direction toward the other leg), its mouth centre where the axis crosses
that face, its bit tilted to run along the axis (flag-relative slopes, `holeTilt.ts`), diameter = the tenon's, depth
measured along the bit from the mouth to the tenon's tip, **rounded UP** to `TENON_STEP` so the tip always seats
(`seatedIn`'s bottom rule, chunk 2b §5.1). `socketRow` is hard-wired to a seat (entry from its world-Y top face, through,
a leaning leg), so this is a NEW builder — a holder, a world line, an entry face, a depth — and the bit-slope arithmetic the
two share (a world direction into flag-relative slopes) is factored into ONE core both call, my call, so they cannot drift
(builder check). `fromWorld` on a leaning holder carries ~1e-15, well inside 1e-9.

`holeFaults` (the ONE decider, inv 50) judges each socket: a fault refuses the WHOLE action (unlike Bore leg sockets,
which notes a faulted seat socket and bores the rest: a rung with one socket is no stretcher), naming the leg
(`<Leg>'s socket would <words> — choose a different height, or a smaller tenon.`), the same shape as Bore leg sockets'
`socketFaulted`. Holes are leg-LOCAL, so a fault is the same in every user of a linked leg's Shape. Two rungs meeting a
leg at one height put their tips on the same axis point, so their sockets meet: that refusal is right (real rungs are
staggered for exactly this reason), and §4's default height staggers (builder check Q4). A socket past 45° refuses with `socketTooSteep`'s shape (unreachable on a sane stool: the rung's angle to
a leg's face is about the leg's lean).

## 4. The UI: Add stretcher

My call: a **Stretcher** section in the multi-selection panel (`N parts selected`), shown only when exactly two parts are
selected, both upright (leaning or not). Fields (`DimensionField`s, refusing out-of-range input, inv 5):
- **Height** — default one third of the lower leg's top height, rounded to the grid; if either leg already has a socket
  whose bore would meet the new one there, the default steps up by 1-1/2" (40 mm) until it clears (my call: the usual
  stagger between front/back and side rungs);
- **Rung size** — default 1" (25 mm);
- **Tenon diameter** — default 5/8" (16 mm);
- **Add stretcher**.

Every refusal is decided before any mutation and shown as the section's alert (`role="alert"`), the Bore leg sockets
precedent; a refused Add changes nothing. On success the new rung is selected (`selectionPatch`), and its readout (below)
shows. A socket fault on either leg refuses the whole action. Refused while exploded (inv 47) or mid-gesture.

The rung's own panel (one part selected) shows, under Round tenons, a **Stretcher** readout when both its tenons are
seated in sockets in two upright parts: `Between <A> and <B>, <h> up · shoulder gap up to <g>` (`<g>` the larger end's
widest corner gap, §5.3). When a tenon is no longer seated but its centre segment still meets an upright part's wood
(the structural finder, §6.2): `No longer fits <A> and <B> — Fit the stretcher again.` and a **Fit the stretcher again**
button.

## 5. What the checks and readers see

### 5.1 The checks (nothing new)

The rung is held by clause (d) through its two seated tenons (chunk 2b, inv 39): each leg reaches the floor without it.
Its tenons' wood is never a contact; its socket bores are ignored as every hole is. A stale rung (after a lean edit) is
reported as chunk 2b already reports it: an overlap, with the ` — its round tenon doesn't match the socket there` hint.
No check changes; the plan's tests pin that the stool with four stretchers is clean, and that removing one socket reports
the overlap.

### 5.2 Text, the cut list, drawings

All existing: the rung's two tenon bench lines and its length; each leg's socket hole line with its tilt words; the
diagrams, sections, Plans views and snap points of tenons and tilted holes. The one new string is §4's readout. A metric
project's numbers come through `units/length.ts` (inv 52).

### 5.3 The shoulder gap (my call: shown, not cut)

A leaning leg's face is not square to a level rung, so a square shoulder touches the leg at one corner and stands off it at
the others — by `side × tan(angle)` across the rung, about 0.2" for a 1" rung on the chunk 1 stool's 12° splay. Real staked
work hides this with round rungs; Sloyd's rung is square stock (§2), so the readout prints the gap and the woodworker
chooses to chamfer, pare or accept it. Cutting the shoulder to the face is a compound angle no single stored cut holds
(a follow-up).

## 6. Shared legs, re-fit, undo

### 6.1 Linked legs

A leg's holes are a SHARED field (inv 45), so a socket bored in a linked leg is bored in every user of its Shape — on the
chunk 1 stool, the front rung's socket in Front right appears in Back left too, exactly where the back rung's socket goes.
So, my calls:
- Add stretcher **reuses** an existing row in a leg when the planned tenon would be SEATED in it by `seatedIn`'s own test
  (not a looser tolerance: a row reused at 1e-6 could fail to seat at 1e-9, and the rung would look joined but be reported
  unheld; builder check) instead of boring another; a row the planned tenon meets but would not seat in refuses (`<Leg>
  already has a different socket there — remove it first.`).
- Rungs at different heights on a linked stool bore unused sockets in the mates (the back rung's height into the front
  legs too). That is accepted and named by the note; a woodworker who wants different heights front and back Unlinks the
  legs first.
- The success readout names any other part that received the socket through its link: `Back left got this socket too, through its link.`
  (an HTML note under the section, my wording, copy review).

### 6.2 Finding a stretcher's legs again

Structural, never stored (no schema change), and a NEW predicate (builder check: chunk 2b's `tenonInSeat` reads only the
`max` tenon, needs the tenoned part to lean, and measures a seat's stock between its level faces — none of which fits a
level rung in a leaning leg). My call, `rungLegAt(world, rung, tenon)`: the upright part, other than the rung, whose
(leaned) world BODIES the tenon's centre segment (shoulder centre → tip centre) meets, to `TOUCH`, the first in world order.
A rung is a **stretcher** when the rung is unleaned and both of its tenons find a leg, two different upright parts. Only
then do the readout, the stale note and Fit again appear. Fit again re-plans it between those legs at the rung's current
axis height. The socket each tenon used is the row it is seated in, or, once stale, the single blind bore of the tenon's
diameter in that leg nearest its tip (ties refuse: a hand-made duplicate needs a human).

### 6.3 Linked legs on a re-fit (builder check Q2, my call)

A re-fit moves socket rows, and a linked leg's rows are shared: re-fitting the stool's front rung moves Front right's
socket, which is also Back left's — the back rung's socket. So Fit again re-fits the **closure**: the selected rung, every
other stretcher seated in (or, stale, found at) a row the re-fit moves, and so on, all in ONE action and ONE undo entry.
Each rung is planned at its own height; a shared row planned by two rungs must agree (to 1e-9, after the exact-axis rule of
§3.1), else the whole action refuses (`These linked legs need their shared socket in different places: <rungs>.`). Any
rung in the closure that refuses refuses the whole action. On a symmetric stool the closure is its two front/back (or side)
rungs, and they agree by symmetry.

### 6.4 What a re-fit may change

The rung's length, position (and so its turn, if the rung's axis now runs along the other world axis — it refuses instead,
my call: a stool whose rung swung 90° is a different design), both tenons' lengths, and the two socket rows (re-tilted and
moved in place, ids kept). Nothing else. One undo entry. Held points are re-judged (`judgeHeld`, inv 24).

## 7. AI paths, joinery and Refine

Unchanged. Refine keeps a tenoned part and a leaning part exactly (chunk 2b, inv 56); joinery and Repair refuse a part with a
round tenon (`tenonRefusal`). The design schema is byte for byte the same.

## 8. What it costs if wrong (my biggest calls)

- **No schema change, legs found structurally.** If a later round needs to know a rung's legs while neither tenon touches
  them (a rung dragged away), the link is gone; a stored reference would then need a schema bump and inv 33's
  single-pass repair care (a field pointing at a board by id). Cheap to add later; never needed today.
- **Axis-aligned rungs only.** Covers the front/back/side rungs of a four-legged stool or table, not an X stretcher or a
  three-legged stool's rungs (whose legs are not square to each other). Lifting it needs a horizontal non-axis posture.
- **Square shoulder with a printed gap.** A woodworker who wants it flush pares it; Sloyd never pretends it is flush.
- **Tenon to the leg's axis.** The common proportion; a different depth is one edit of the tenon length after, and its
  socket then shows chunk 2b's stale tenon note until Fit again (which restores the default — a follow-up may keep a typed
  depth).
- **Reused shared sockets, re-fit as a closure.** A rung added on one side bores the link-mates' sockets on the other, and a
  re-fit re-fits every rung those shared rows hold; that is what the woodworker wants on a symmetric stool, and the note says
  it. On an asymmetric linked build it refuses rather than unseat a rung.
- **A new finder, not chunk 2b's.** `rungLegAt` reads the leg's leaned bodies; a rung whose tenon misses every leg after a
  big edit is just a part with two tenons (no readout), and the user re-adds it.

## 9. Records

Invariant 58 (round tenons) gains a stretcher clause (or a new inv 59, the builder's call by size): Add stretcher is ONE
action and ONE planner; its geometry and finder are structural; no schema. CLAUDE.md condensed; `docs/module-map.md`;
`docs/rounds.md`; `docs/follow-ups.md` (438 closed, the §11 follow-ups added); the feature-gaps row.

## 10. The survey, in brief

- `legSockets.ts`: `partAxis` (any part's world axis), `socketRow` (a seat's socket along a leg's axis — generalised
  here), `boreAlongAxis`, `isSocketOf`, `staleSocketOf`, `tenonInSeat` (the T9a centre-segment predicate),
  `socketPlan`/`boreLegSockets` (the one-action, one-undo shape this copies).
- `tenonJoints.ts`: `seatedIn`, `tenonJoints`, `tenonMeetsBore` — the joint the checks hold.
- `roundTenons.ts`: `tenonFaults`, `TENON_STEP`, `builtTenons`.
- `lean.ts`: `leanMap` (pivot, apply, applyDir), `leans`; `holeTilt.ts`: slopes and the 45° bound.
- `Properties.tsx`: the multi-selection panel (`N parts selected`) where the section goes; `Holes.tsx`: Bore leg sockets'
  section, the UI precedent.

## 11. Follow-ups to add

Diagonal and X stretchers; H stretchers (a rung between rungs); round (turned) rung stock; a shoulder cut to the leg's face;
a typed tenon depth kept across a re-fit; aprons; a three-legged stool's rungs.

## 12. Left to the builder

- The closed form of the shoulder station (a line leaving a convex leaned box) and of the socket's depth along a tilted bit.
- Whether the socket builder is one function with options or two thin wrappers over one core (ONE planner either way).
- The UI wording beyond the quoted sentences (copy review).
- Whether the stretcher clause joins inv 58 or opens inv 59.
