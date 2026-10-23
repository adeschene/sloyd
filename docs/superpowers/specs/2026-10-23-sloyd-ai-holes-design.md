# Sloyd: Generate and Refine author hole rows

**Date:** 2026-10-23 · **Status:** approved 2026-10-23 (builder-checked; the user took my calls on all three §11 questions); implemented on branch `ai-holes` (not yet merged).
**Builds on:** the holes spec (`2026-10-14-sloyd-holes-design.md`: the stored `HoleRow`, `holeFaults`), the AI-angles spec
(`2026-10-13-sloyd-ai-angles-design.md`: the pattern this follows, world words in the design schema, one converter
module, exact round trips for Refine), and the refine-features spec (`2026-10-22-sloyd-refine-features-design.md`: Refine
carries features it cannot author). Every rule there still holds unless this document says otherwise.
**No document schema change** (`HoleRow` is unchanged, schema 20; rollback is free). **`DESIGN_SCHEMA` and `SYSTEM_PROMPT`
change**, so one live grammar compile is required before the change ships (fu 322).

**Origin:** follow-up 329, "Generate and Refine authoring holes". Since 2026-10-23 Refine keeps a project's holes, but
neither Generate nor Refine can add, move or remove one. So "add shelf-pin holes to the sides" does nothing, and a
generated bookcase never has them.

**The user's direction (2026-10-23):** they chose "Claude authors holes" as the next round and then said "just look at the
code and draft the spec", skipping the questions. Every decision below that is not inherited is marked **(my call)**. The
ones that most change what gets built are collected in §11.

## 1. Goal, non-goals, anti-goals

**Goal:** the design format gains hole rows in world words. Generate can drill shelf-pin rows, pull and knob holes and
through holes. Refine can add, move, change and remove rows on instruction. An untouched row comes back stored
**exactly** as it was.

**Non-goals:**
- Curves, profiles and bands stay carried, not authored (later rounds, each with its own live compile).
- No counterbores, countersinks, half-holes or pointed bottoms (fu 330, 331, 334). The design format holds what `HoleRow`
  holds.
- No dowel joints from holes (fu 404). Joinery is unchanged: it rules out the joint kinds whose zone a hole enters (inv 41).
- The design checks still ignore holes (inv 38).

**Anti-goals (a failure even if the tests pass):**
- **An untouched row comes back different.** Its `alongFrom`, `acrossFrom`, `station`, `inset`, `pitch`, `depth` or
  `diameter` differs, or it moves on the wood.
- **A row lost without saying so.** Refine drops or moves a row, and the change list doesn't say.
- **A grammar refusal in production.** The schema ships without a successful live compile.
- **Holes in the wrong place on a mirrored pair.** The left and right sides of a case get their pins on the outside
  faces, or the two sides stop linking as one part because their rows mirror.

## 2. The design form

### 2.1 One new required array **(my call: the shape)**

`partSchema` gains a required `holes` array (strict output; an unused one is `[]`). It reuses the `dir` `$def` and
`vec3Schema`:

```json
"holes": [{ "face": "+x", "diameter": 0.25, "depth": 0.375, "through": false,
            "offset": { "x": 0.75, "y": 6, "z": 2 }, "toward": "+y", "count": 20, "pitch": 1.25 }]
```

- **`face`:** the face the holes are drilled into (any of the six). The drill runs inward from it.
- **`diameter`**, and **`depth`** (inches from the face). **`through: true`** means the holes go right through, and
  `depth` is then ignored.
- **`offset`:** the FIRST hole's centre, measured from the part's own `at` (its minimum corner) along the world axes.
  So it does not change when the part moves. It lies on the face plane: on the `+x` face, `offset.x` equals the part's
  `size.x`; on `-x`, it is 0. **(my call, after the builder check: a world point broke on every move.)**
- **`toward`:** the direction the row continues from the first hole. It is perpendicular to `face`, and checked even when
  `count` is 1.
- **`count`** (1 to `HOLE_COUNT_MAX`) and **`pitch`** (centre to centre).

Why this shape: the model already thinks in world boxes (`at`, `size`). A first-hole point inside the box plus a
direction is what it can reason about ("2in from the front edge, starting 6in up"). Stations and insets measured from named ends are
Sloyd's stored encoding, derived by the converter, as `orient` derives length, width and thickness.

### 2.2 The grammar budget (fu 322) **(my call: the fallback order)**

The array is larger than an angle array (8 fields, 3 `dir` refs, one `vec3`). **The first plan task is the live compile:**
one paid probe (max_tokens 16, as in fu 322) with the full Refine schema, a custom material included. If the API refuses
it, the fallbacks are tried in this order, each with one more probe:
1. `vec3Schema` moves into `$defs` and is referenced (it is used at least 3 times).
2. `through` is dropped: a `depth` ≥ the part's extent along the drill axis means through.
3. `toward` and `pitch` collapse into one `step: vec3`, the offset from one hole to the next.

The form that compiles is recorded in fu 322 and in this spec's Amended block. The probes count against the 10 paid
runs pre-approved per feature.

## 3. Conversion: `document/holeWorld.ts`

A new module beside `angleWorld.ts`. It is the ONE place a design hole row crosses to a stored `HoleRow` and back.
Directions go through `dirToLocal`/`localToDir`, points through the axisFrame helpers (inv 44), never by hand.
Model-facing text only (no `→ units` edge).

### 3.1 Design → stored: `holeRowsFor(board, rows, exact?)`

- `face` → (`face` dim, `from`); `toward` → `along` dim.
- **Canonical row direction (my call):** the row is stored measured from its local `along` MIN end (`alongFrom: 'min'`).
  When `toward` points the other way, the row is reversed: the last hole becomes the first. So the same holes described
  from either end store identically, and two mirror-image sides can link (§5).
- **The across side:** `acrossFrom` is the side the centre is NEARER (ties: `min`), and `inset` its distance from that
  side. **(my call)** A row then stays put relative to its nearer edge when the part is resized later (the shelf-pin case:
  2in from the front stays 2in from the front).
- **Numbers: the hole grid (my call, after the builder check).** The converter is imperial (`SNAP_INCHES`, and "All
  numbers are inches" in the prompt), but cabinet holes are often metric (5 mm pins, the 32 mm system, the app's own
  shelf-pin preset). So hole numbers (`offset`, `depth`, `pitch`, `diameter`) snap to whichever is NEARER: the 1/64in grid
  or a whole millimetre (ties: imperial).
  - So 1.26 becomes 32 mm (1.25984in) exactly, 0.197 becomes 5 mm, and 0.25 stays 1/4in.
  - A value in the exact set is kept as it is.
  - Part sizes and positions are unchanged (1/16in, inv 25).
- **Shape faults** (reject the part, `RejectedPart` reason `'hole'`, fed back like `'angle'`). They are EXACTLY the
  loader's drop rules (`validateHoleRows`), so every stored row round-trips:
  - a non-finite number;
  - `diameter ≤ 0`;
  - `depth ≤ 0` when not through;
  - `count` not an integer in 1..`HOLE_COUNT_MAX`;
  - a negative `pitch`, station or inset;
  - `toward` on `face`'s axis.

  Plus one design-form rule: `offset` off the face plane by more than 1/32in. A loader-legal oddity such as `pitch = 0`
  with `count > 1` is not a shape fault. It is the strict fault `meets-hole`.
- **Strict faults** (`holeFaults`: `breaks-out`, `off-flat`, `meets-hole`, `too-deep`) do NOT reject the part. The row is
  stored, and each fault becomes a design violation `'hole-fault'` fed back to the model. If one survives the loop, it is
  kept and listed with the new issues, under the inv 50 rule that a faulted but well-formed row is KEPT and noted. **(my
  call; §11 Q2.)**
  - The producer is `holeDesignFaults(flat)`, in `holeWorld.ts`. `evaluateDesign` and `runRefine`'s `preexisting` both call
    it; it lives outside `checkDesign`, which ignores holes (inv 38).
  - `problemKey` for `'hole-fault'` includes the row: face, first centre and fault kind. So an original row's fault never
    hides a NEW faulted row on the same part. The model text is decimal inches, for example `Side's hole row on -x breaks out of the face at
  hole 20.` A metric project gets a `shown` copy, as in fu 355.
- **One canonical order:** a part's rows are sorted by their stored fields (`HOLE_FIELDS` order), because `sameShared`
  compares holes index by index.

### 3.2 Stored → design: `worldHoles(b)`

One entry per row, in design form, sorted canonically. It never returns null, because every stored row has a world
reading. Refine writes it into `documentToDesign`'s parts. `turnCandidates` uses it too (§5).

### 3.3 Exactness for Refine

- **The exact set:** `designValues` adds each row's `offset` components, `depth`, `pitch` and `diameter`.
- **The exact-row map** **(my call)**: a map from flat part name to that part's ORIGINAL stored rows. When Refine
  converts a returned row, it tries the original rows of the same part. One is used as it was (same `alongFrom`,
  `acrossFrom`, numbers, id) when, **placed on the NEW part**, its world form (canonical direction) equals the returned
  row's exactly.
  - Untouched rows, and rows on a part that only moved, come back exactly. That includes a row measured from its
    farther side, or from the max end, as a person entered it.
  - When the model resizes a part and keeps the holes where they were in the box, the original row may no longer
    reproduce them, because it is measured from the end that moved. It is then re-derived from the model's numbers. The
    holes stay where the model put them, and the row is re-encoded from the nearer side. **(my call; §11 Q1.)**
  - It applies only in the original's frame. A part with holes keeps that frame (the refine-features frame rule, inv 56,
    already counts holes), so for a matched holed part this always holds.

## 4. Refine

- **Holes stop being carried.** `carryFromOriginal` leaves `holes` out of `carry`; they now come from the model.
  `carry.frame` is still set when the original has holes (the frame rule is unchanged), so the exact-row map stays valid.
- `featuredNote`, `featureTurned` and `carriedSummary` stop counting holes. Their kinds are curves, profiles, bands and
  hardware. A part with only holes is no longer named in the note, judged as turned, or listed in Not kept or Check at
  the new size, because what happens to its holes is now in the change list.
- **The change list** (`diffDesigns`) gains hole lines, per part, comparing design forms (`offset`, relative to the part,
  so a moved part changes nothing) at display precision, one per change. Examples: `Side: 20 holes added on +x, 1/4" Ø`;
  `Side: hole row on +x removed`; `Side: hole row on +x now 3/8" deep`. Rows are matched by `face` plus first centre; an
  unmatched pair is a removal plus an addition. `ChangeKind` gains `'holes'`.
- **`KEEP_LINE`** adds "holes" to its list ("…tapers, miters, bevels, chamfers and holes"). Every Refine message changes
  anyway with the schema.
- **Pre-existing faults:** an original row's own `hole-fault` is in `preexisting` (problemKey), so it is not pushed back
  as new.
- **The joined path** is unchanged. The plain parts' rows go to the model in world words and come back. `runJoinery`
  rules out the kinds a hole's zone enters and rebases rows on grown parts (inv 41).

## 5. Linking: mirrored sides stay one part

`turnCandidates` today returns nothing for a holed part, so a case's left and right sides, with pins on their inside
faces, stay two distinct parts. They count twice against the distinct-part cap. Two changes:
- `turnCandidates` re-stores hole rows under each candidate turn through `worldHoles` and `holeRowsFor`, as it re-stores
  angle cuts (AI-angles §7). Curves, profiles and bands still block turning. A row that would re-store with a shape fault
  blocks that turn.
- **`alignedTo` aligns hole ids too** (the builder check). `sameShared` compares hole rows WITH their ids, and every
  generated row gets a fresh id. So a part whose rows equal the representative's, index by index after the canonical
  sort, takes the representative's row ids first, as it does for angle cuts. Without this, no two holed generated parts
  ever link, turned or not.

## 6. The prompt

`SYSTEM_PROMPT` describes the `holes` array, with plain defaults **(my call)**:
- **Shelf pins:** on the INSIDE faces of case sides, in two rows (2in in from the front and back edges), 1/4in diameter,
  3/8in deep, 1-1/4in apart, starting and ending a few inches from the top and bottom. For the metric 32 mm system,
  write 0.197 (5 mm) and 1.26 (32 mm); Sloyd stores them as exact millimetres (§3.1).
- **Pulls and knobs:** a through hole of 3/16in, centred on a drawer front or near a door's opening edge.
- Keep holes at least 1in away from where parts join, because joinery will not cut a joint through a hole.
- `"holes": []` for every part without them.

The fixed prefix grows, so `estimate.ts`' measured chars-per-token figure is re-measured, as for angles.

## 7. Generate

The same converter. Generate's results carry holes, so a generated holed project goes straight to Add joinery and Repair,
which already accept holes.

## 8. Invariants and records

- **Inv 48**'s design-schema clause is extended: "the design schema defines part, direction (and, if §2.2's fallback 1 is
  taken, vec3) ONCE in `$defs`".
- **Inv 50:** "Refine carries holes" becomes "Generate and Refine author holes in world words (`holeWorld.ts`, the ONE
  converter); an untouched row returns exactly (exact-row map)".
- **Inv 56:** holes leave the carry. The frame rule still counts them.
- Follow-ups: 329 closes; fu 322 records the compiled form.

## 9. Testing

- **Conversion, every posture × all four turns:** design → stored → design round-trips exactly, on `chiralPart` with a row
  on each of three faces. Mutate every shape fault. The canonical order holds: two input orders give one stored part.
- **Strict faults:** a breaking-out row is stored and raises `'hole-fault'`. Mutate: reject the part instead, and the test
  fails.
- **Refine exactness:** an untouched row measured from its FARTHER side and from its max end comes back with its stored
  `acrossFrom`/`alongFrom` and its id, and so does one on a part that only moved. Mutate: drop the exact-row map, and it
  fails. A resized part whose holes the model kept in place is re-derived, and its holes are where the model put them. A
  metric 5 mm / 32 mm row keeps its exact numbers.
- **Hole grid:** 1.26 → 32 mm, 0.197 → 5 mm, 0.25 → 1/4in, 0.3125 → 5/16in.
- **Canonical direction:** one row written `toward +y` and `toward -y` stores identically.
- **Every loader-legal stored row round-trips** through `worldHoles` → `holeRowsFor`, including `pitch = 0` with
  `count > 1` (it raises `meets-hole`; the part is not rejected).
- **`problemKey`:** a new faulted row on a part whose original already had one is fed back.
- **Linking:** two sides with pins on their inside faces (mirror images) link as one Shape through a 180° turn. Mutate
  the `turnCandidates` guard back, or drop the `alignedTo` hole-id alignment, and they don't.
- **Linking, unturned:** two equal holed parts with fresh ids link (fails without the `alignedTo` change).
- **Change list:** a line for added, removed and changed rows.
- **Carry:** holes no longer in `carry`, the note, `featureTurned` or `carriedSummary`. Curves and bands are unchanged.
- **Schema and prompt pins** are updated. A test pins the `$defs` form.
- **Live, paid** (pre-approved up to 10 per feature, the user's ruling 2026-10-22):
  - the compile probe(s) (§2.2);
  - Generate "a bookcase with adjustable shelves";
  - Refine that bookcase with "move the shelf pins 1 inch closer to the front", then "add a knob hole to the door" on a
    cabinet;
  - checked on the dev server, with the readout of the stored rows.

## 10. Chunks

One chunk **(my call)**. The compile probe is its first task and gates the rest. If no form compiles, the round stops and
comes back to the user before anything else is built.

## 11. The user's rulings (2026-10-23)

"Go with your calls on all three": (1) the model's hole positions win on a resize, and the row is re-encoded from the
nearer side; (2) a strict fault keeps the row, flags it and feeds it back; (3) imperial defaults, with 32 mm written as 1.26
and stored exactly. The questions as asked:

1. **Resized parts (§3.3):** the model now SEES the holes and writes them. When it resizes a part, its hole positions win.
   The row is re-encoded from the nearer side, rather than kept "measured from the end it names" (your ruling for carried
   features, which still holds for curves, profiles and edging). Is that right for holes?
2. **A strict fault from the model (§3.1):** keep the row and flag it (my call, the inv 50 precedent), or reject the whole
   part as an angle fault does? Rejecting can lose a part if the model never fixes it.
3. **Prompt defaults (§6):** imperial (1/4in pins, 1-1/4in apart), with the 32 mm system written as 1.26 and stored as
   exact millimetres. Or should cabinets default to the 32 mm system?

## Amended (execution)

Rulings made while building, on branch `ai-holes` (2026-10-23). Where one differs from the text above, this block wins.

- **Canonical direction has a fallback (§3.1).** A row is stored `alongFrom: 'min'` EXCEPT when a loader-legal row cannot be expressed from min
  (its min-most hole lies past the min end): then it is stored from `'max'`. The across side is the nearer one, falling back to the far side
  when the centre lies past the nearer. Needed so every loader-kept (faulted) row round-trips.
- **`sameHoles` compares centres as a SET**, not by index, so a max-stored original matches its canonical re-derivation in the exact-row map.
- **`holeDesignFaults` lives in its own module** (`src/document/holeDesignFaults.ts`), because its `shown` copy goes through `holeText` (the
  `-> units` edge) and `holeWorld.ts` stays model-facing and units-free.
- **The hole-fault message includes the row's first centre** (§3.1: key = face + first centre + kind): "<Part>'s hole row on <face> starting at
  x, y, z in <phrase>." `problemKey` includes the message for this kind, and `collapseViolations` groups hole-faults by message minus the
  part-name prefix, so two different faults on one part are never merged.
- **`turnCandidates` passes an exact set** (the part's own `worldHoles` numbers) to `holeRowsFor`, so a re-stored row never snaps: a turn must
  not move a hole. Parts with curves, profiles or bands still never turn.
- **The model-facing NOTE drops "holes,"** from its list of carried features: holes are in the format now. `PartCarry.holes` is gone;
  `PartCarry.originalHoles` (in the carried frame) feeds the exact-row swap.
- **The prompt's word is "drilled"** for hole rows.
- **Compiled form (fu 322):** first probe, no fallback; the Refine form with the catalog is 2,952 chars; request `req_011CgJGkuYyCJ51nxdbdHDTn`.
- **A holes-only part the model turned is oriented (§3.3, §4; final review C1).** A part whose ONLY frame features are holes keeps the carried
  frame only while the returned box's extent on the ORIGINAL thickness world axis is still a smallest extent (ties allowed). Otherwise it is
  encoded by `orient`, the exact-row swap is skipped, and its holes convert from the model's world words in the new frame. Parts with curves,
  profiles or bands keep the frame always (`featureTurned` covers them). One decision, `keptFrame`, where `convertPart` picks the frame.
  Without it an upright 0.75 x 30 x 11.25 side returned lying flat was stored with thickness 11.25, silently.
- **Superseded by the rank rule (§3.3; residual R1, the user's approval, 2026-10-23).** A holes-only part keeps the carried frame only when
  EVERY world extent keeps its rank against the original's (the result's axes sorted by extent in the original's order; a tie on either
  side may stay or swap). C1's thickness-only test missed a turn ABOUT the thickness axis: a flat 30 x 12 shelf returned with 30 and 12
  swapped in plan kept flat/0 and was stored length 12, width 30, grain across, while its plain twin re-oriented to flat/90. Otherwise
  `orient`, no exact-row swap, as for C1. A holes-only part whose stored thickness is not its smallest extent, echoed, keeps its frame
  (rank unchanged). A holes-only tapered part widened past its length is now oriented like its plain twin and its taper's `along` fault is
  fed back (refine-features spec, Amended).
- **The hole grid applies to the STORED distances, not the world offsets (§3.1; final review I1).** `holeRowsFor` computes the raw local
  positions from the model's numbers, chooses the canonical end and side (reversing in raw numbers), then snaps the station (from the
  measured end), the inset (from the measured side), depth, pitch and diameter with `holeSnap`. A value whose world-offset source is in the
  exact set is kept unsnapped, but any computed distance within 1e-9 of its grid value takes the grid value even on the exact path (inset
  drift). Every stored number is then checked finite and within MAX_MAGNITUDE (I2), a failure rejecting the part with reason `'hole'`.
- **A no-op Refine keeps the stored row order (§3.3; final review M3).** When EVERY returned row on a part is restored by the exact-row map
  and the counts are equal, the ORIGINAL stored order is kept (Plans callout letters follow `b.holes`' order); otherwise canonical.
- **Diff wording (§4; final review M1, M2).** A direction change reads `now running toward <dir>`, and only between two rows of more than
  one hole (a single bore grown into a row is not "moved"); a row shrunk to one reads `now 1 hole`.
