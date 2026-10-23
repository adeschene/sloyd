# Sloyd: Generate and Refine author edge profiles and edge bands

**Date:** 2026-10-23 · **Status:** APPROVED 2026-10-23 (builder-checked; the user answered all four §11 questions). Chunk 1 (bands) plan: `docs/superpowers/plans/2026-10-23-sloyd-ai-bands.md`.
**Builds on:** the AI-holes spec (`2026-10-23-sloyd-ai-holes-design.md`: the pattern this copies — world words in the
design schema, one converter module per feature, an exact-entry map for Refine, faults kept and fed back), the profile runs
spec (`2026-10-17-sloyd-profile-runs-design.md`: the stored `ProfileCut`, its runs and `profileFaults`), the edge banding
spec (`2026-10-20-sloyd-edge-banding-design.md`: `Band`, `BandType`, `cornerRule`, `bandFaults`), the refine-features spec
(Refine carries what it cannot author, inv 56) and the shop-words spec (the change list's words). Every rule there still
holds unless this document says otherwise.
**No document schema change** (`ProfileCut`, `Band`, `BandType` unchanged; schema 20; rollback is free). **`DESIGN_SCHEMA`
and `SYSTEM_PROMPT` change**, so a live grammar compile is required before each chunk ships (fu 322).

**Origin:** follow-up 430. Since the AI-holes round Claude authors holes, but edge profiles and edge bands are only
carried by Refine: "round over the top's front edge" or "band the plywood shelves" does nothing, and a generated plywood
bookcase never has edging.

**The user's direction (2026-10-23):** they chose fu 430 as the next round and said "skip the questions and draft the spec".
Every decision below that is not inherited is marked **(my call)**; the ones that most change what gets built are
collected in §11.

## 1. Goal, non-goals, anti-goals

**Goal:** the design format gains edge profiles and edge bands in world words. Generate can band the exposed edges of sheet
parts and profile the edges of tops; Refine can add, change and remove both on instruction. An untouched profile or band
comes back stored **exactly** as it was.

**Non-goals:**
- **Curves stay carried** (fu 363, its own round). **A part with curves keeps its profiles AND bands carried** (my call,
  builder check B5): the model sees only a box, so a station on an arched side or a band on a curved stretch would fault
  for a reason it cannot see. Such a part shows `profiles: []` and `bands: []`, as a two-side run does (§4.2).
- **Two-side profile runs (profile runs b2) are not in the design form** (§2.1): a part that has one keeps ALL its
  profiles carried, as today (§4.2).
- **The corner rule is not in the design form** (my call): Generate stores the default (`long`), Refine carries the
  original's `cornerRule` exactly.
- **Band types are not designed** (my call): the model picks from a closed list (§3.1); it cannot set a tape's width, a
  solid band's allowances or a price.
- Joinery is unchanged: it rules out the joint kinds whose zone a profile or band enters (inv 41, joinery chunks 2–3).

**Anti-goals (a failure even if the tests pass):**
- **An untouched profile or band comes back different**: its run, stations, sizes, facing, side or band type differ.
- **One lost without saying so**: Refine drops or moves a profile or band and the change list doesn't say.
- **A grammar refusal in production**: a schema ships without a successful live compile.
- **Edging bought twice or on hidden edges by default**: Generate bands an edge that meets another part (the joinery then
  rules the joint out, P11) or bands every edge of every part.
- **A band type flood**: Refine mints a new band type on every run instead of reusing the project's.

## 2. The design form

Both arrays are REQUIRED on every part (strict output; unused is `[]`), and reuse the `dir` `$def`.

### 2.1 `profiles` (my call: the shape)

```json
"profiles": [{ "edge": ["+y", "+z"], "kind": "roundover", "size": 0.25, "fillet": 0, "depth": 0,
               "facing": "face", "allRound": false, "start": 0, "end": 24 }]
```

- **`edge`:** the two faces that meet at the routed edge, as a chamfer's `edge` (the model already writes those). Exactly
  one must be a BROAD face (on the part's thickness axis): it is the face the bit runs on (`ProfileCut.face`). The other
  is the SIDE (`ProfileSide`, across length or width). Order is free; the converter tells them apart.
- **`kind`**, **`size`** (roundover/cove/bead radius, ogee size, thumbnail reach), **`fillet`** (roundover/cove/ogee:
  0 = none; bead: the quirk, > 0; ignored for a thumbnail), **`depth`** (thumbnail only; ignored otherwise), **`facing`**
  (`face` or `edge`, for asymmetric kinds; ignored for symmetric ones, stored `face`).
- **`allRound: true`** is a loop (`{ loop: true }`) around the broad face; `edge`'s side then only names the face, and
  `start`/`end` are ignored.
- **`start`, `end`:** where the run starts and stops along the edge, measured from the part's own `at` along the world axis
  the edge runs on, so a moved part changes nothing (the hole `offset` rule). A value within 1/32in of 0 or of the part's
  extent is a THROUGH end (out through that end face); anything between is a stopped end (a station). So a full-length
  edge is `start 0, end <extent>`.

Why this shape: the chamfer's two-face `edge` is already learnt; world part-relative stations are the hole offset rule;
`allRound` avoids a two-level union the grammar would pay for.

### 2.2 `bands` (my call: the shape)

```json
"bands": [{ "edge": "+z", "edging": "veneer" }]
```

- **`edge`:** the side face banded (one of the four sides of the broad face; a broad face itself is a shape fault).
- **`edging`:** a string from a closed enum (§3.1).

### 2.3 The grammar budget (fu 322)

**Superseded for chunk 2 by "Chunk 2, revised" below** (the profile form as specced was probed and refused; the angle
arrays merge to make room). The text that follows is kept as written for chunk 1.

Two chunks, two compiles (§10). Each chunk's first task is one paid probe (max_tokens 16) with the full Refine schema, a
custom material and a custom band type included. Fallbacks if refused, one probe each, in order:
1. `fillet`/`depth` merge into one `detail` number (its meaning per kind).
2. `facing` drops: asymmetric kinds are stored `face`; an `edge`-facing original is carried (as two-side runs are).
3. `allRound` drops: a loop is carried.

The compiled form is recorded in fu 322 and this spec's Amended block. Probes count against the 10 paid runs
pre-approved per feature.

## 3. Conversion

Two new modules beside `holeWorld.ts`: **`profileWorld.ts`** and **`bandWorld.ts`**, each the ONE place its feature
crosses between design and stored form. Directions through `dirToLocal`/`localToDir`, positions through the axisFrame
helpers (inv 44). Model-facing text only (no `→ units`).

### 3.1 Band types: the `edging` enum (my call)

The enum is built per call (as the material enum is, `catalogOf`):
- `"veneer"`: the built-in Iron-on veneer (`BUILT_IN_BAND_ID`).
- one key per band type the project already has (Refine), its id;
- `"solid <material>"` for every SOLID material in the catalog (built-in and custom): solid edging of that species.

Converting `"solid <m>"`: reuse the project's first solid band type with that material and the default thickness (1/4in,
`newBandType`'s default); else mint one through `newBandType('solid', …)` with its material set and the name
`<Material label> edging` (unique among the project's, `freeName`'s rule). **A Refine never mints a type the project
already holds** (anti-goal).

**Minting is one design-wide pass, with plumbing (builder check B4; the existing code drops unknown types).** Before any
part converts, `mintBandTypes(design, bandTypes)` walks every part and assembly part, resolves each `edging` key to a type
id (minting each new `solid <m>` once), and returns the full type list. That list must reach, by name:
- `designToDocument` (today `bandTypes` comes only from `opts.bandTypes`, generated.ts; the load gate drops a band whose
  type is unknown);
- `evaluateDesign` / `bandFaults` (a minted type's thickness decides faults);
- **both** Refine paths, which today rebuild the result with `bandTypes: doc.bandTypes` (run.ts, plain and joined) and
  would discard a minted type;
- Generate's created project.

### 3.2 Design → stored

**Profiles** (`profilesFor(board, entries, exact?)`):
- `edge` → (`face`, `side`); `allRound` → `{ loop: true }`; else `start`/`end` → two `ProfileEnd`s on that side, then
  `canonicalRun` (the stored order).
- Numbers (`size`, `fillet`, `depth`, stations) snap to 1/64in or a whole mm, nearer (the hole grid, `holeSnap`); a value
  in the exact set is kept.
- **Ends are measured from the NEARER end** of the run dimension (ties `min`), the holes rule (my call, builder check B1),
  so a stopped run stays put relative to its nearer end on a later resize. A value in the exact set is never snapped to a
  THROUGH end (B3): the 1/32in through rule applies only to the model's own new numbers.
- **Shape faults** reject the part (`RejectedPart` reason `'profile'`, fed back like `'hole'`) — EXACTLY the loader's drop
  rules for profiles (so every stored profile survives an echo, B3), plus the design-form rules: no broad face or two in
  `edge`; a side not perpendicular to the broad face. A zero-length or reversed station run is NOT a shape fault: it stores
  and is the strict `stop-off`, as the loader keeps it.
- **Strict faults** (`profileFaults`: `overlap`, `runs-off`, `stop-off`, `too-tight`) keep the profile; each is a design
  violation `'profile-fault'` fed back (the holes precedent, inv 50/53); if one survives the loop it is kept and listed.
- One canonical order (`PROFILE_FIELDS`), because `sameShared` compares in order.

**Bands** (`bandsFor(board, entries, catalog)`): `edge` → `ProfileSide`; `edging` → a band type id (§3.1);
`canonicalBands` (one per side, first wins — a second band on one side is a shape fault, fed back). `bandFaults` keep
the band and are fed back as `'band-fault'`.

### 3.3 Stored → design

`worldProfiles(b)` and `worldBands(b)`, sorted canonically. `worldProfiles` returns **null** for a part with a two-side
run (§4.2); `worldBands` never does.

### 3.4 Exactness for Refine

- `designValues` adds every profile number and station; the exact set keeps them unsnapped.
- **The exact-entry maps** (as `originalHoles`): `PartCarry.originalProfiles` / `originalBands`. A returned profile whose
  WORLD form on the NEW part equals an original's world form (each original placed on the new part through
  `worldProfiles`; never `sameProfile` on stored fields, whose station `from` the design form does not carry — B1) is
  restored as it was, with its id and its stored `from`s; a returned band equal to an
  original band (side and type) is kept as it was. Untouched entries, and entries on a part that only moved, come back
  exactly. In the original's order when every entry is restored (the holes M3 rule).
- **On a resize**, a profile whose stations the model kept in world terms is re-derived from the model's numbers (the
  holes ruling, §11 Q1 of the AI-holes spec: the model now sees them, so its positions win); a full-length run stays
  full-length (its THROUGH ends follow the new extent).

## 4. Refine

### 4.1 Authored, not carried
- `carryFromOriginal` stops carrying `profiles`, `bands` (except §4.2); they come from the model. `cornerRule` stays
  carried (non-goal).
- `carriedKinds`, the note, `featureTurned`, `carriedSummary`: their kinds become **curves and hardware**. Profiles and
  bands leave the model-facing NOTE ("These parts carry curves or hardware…").
- **The frame rule (inv 56)** narrows: a part keeps the original's frame unconditionally only when it carries CURVES (or,
  §4.2, carried profiles). A part whose frame features are only holes, profiles and bands follows `keptFrame`'s rank +
  thickness rule, and is otherwise `orient`ed with its features converted from world words (the exact-entry swaps
  skipped).
- **The change list** (`diffDesigns`) gains profile and band lines in shop words, per part:
  `Top: 1/4" roundover added on the top/front edge`; `Top: roundover on the top/front edge removed`;
  `Top: roundover on the top/front edge now 3/8"`; `Shelf: edging added on the front edge (Oak edging)`;
  `Shelf: edging on the front edge now Iron-on veneer`; `Shelf: edging on the front edge removed`. Matched on raw
  directions (the shop-words rule). `ChangeKind` gains `'profiles'` and `'bands'`.
- `KEEP_LINE` adds "profiles and edging".
- Pre-existing `'profile-fault'`/`'band-fault'` are in `preexisting` (problemKey includes the entry), as for holes.

### 4.2 Two-side runs stay carried (my call)
A part with any two-side profile run (`!oneSide(run)` and not a loop) has its profiles NOT shown: its design part gets
`profiles: []`, its TS-only `carry.profiles` holds them all (as today), the note names that part as carrying edge profiles
Sloyd keeps, and any `profiles` the model returns for it are ignored, with a line in the done view. It keeps its frame (curves' rule). Rare (b2 is hand-authored);
refusing Refine instead would regress today's behaviour.

## 5. Linking

`turnCandidates` re-stores profiles and bands under each candidate turn through the world forms (with an exact set: a
turn must not move a stop), as it does holes; a profile or band that would re-store with a shape fault blocks that turn.
Parts with curves (or carried profiles) still never turn. `alignedTo` adopts the representative's profile ids on a match
(bands carry no id).

**A limit (builder check B2):** turns are quarter turns about vertical. Two case sides with pins on their INSIDE faces and
edging on their FRONT edges are MIRROR images: a 180° turn puts the edging at the back, and no turn maps one onto the
other. Edged sides without pins link with no turn; pinned AND edged sides do not. §11 Q1 decides what happens.

## 6. The prompt (my call: defaults)

`SYSTEM_PROMPT` describes both arrays and the `edging` choices, with plain defaults:
- **Edging:** band the EXPOSED front edges of plywood (sheet) parts — shelves, case sides, tops, dividers — with
  `"solid <the project's solid species>"` when the piece has solid wood, else `"veneer"`. Never band an edge that meets
  another part (joinery cannot join through edging), and never band solid-wood parts.
- **Profiles:** only when asked, or a small roundover (1/8 to 1/4in) on the exposed top edges of a solid-wood tabletop
  where the style calls for it; otherwise the existing chamfer guidance stands. Keep profiles off edges that meet other
  parts.
- `[]` for every part without them.

`estimate.ts`' chars-per-token figure is re-measured (the prefix grows).

## 7. Generate

The same converters. A generated edged or profiled project goes straight to Add joinery and Repair, which already accept
both (joinery chunks 2–3). Minted solid band types appear in Materials & prices.

## 8. Invariants and records

- **Inv 53** and **inv 54**: "Refine carries them" becomes "Generate and Refine author them in world words
  (`profileWorld.ts` / `bandWorld.ts`, the ONE converters; untouched entries return exactly), except a part with a
  two-side run, whose profiles stay carried".
- **Inv 56**: the unconditional frame keep narrows to curves (and carried profiles); the PROHIBITION is rewritten
  accordingly, in full in `docs/invariants.md` and condensed in CLAUDE.md.
- **Inv 48**'s design-schema clause: still part and direction once in `$defs`.
- Follow-ups: 430 closes; 322 records the compiled forms; `docs/versioning.md` unchanged (no schema bump).

## 9. Testing

- **Round trips, every posture × all four turns**, on `chiralPart`: every stored profile kind, facing, through/station
  ends and a loop; bands on all four sides. Design → stored → design is exact. Mutate every shape fault.
- **Strict faults** keep the entry and raise `'profile-fault'`/`'band-fault'`; mutate to reject, and the test fails.
- **Refine exactness**: an untouched stopped profile measured from its max end, and a band of a custom type, come back
  with their stored fields and ids; mutate the exact-entry map away, and it fails. A resized part's full-length run stays
  full-length.
- **Band types**: `"solid oak"` reuses the project's Oak 1/4in type; mints `Oak edging` once when absent; a second
  `"solid oak"` in the same run reuses the minted one. A Refine echo mints nothing.
- **Two-side runs**: a part with one keeps all its profiles carried; returned profiles for it are ignored and noted.
- **Frame rule**: a profiled-only part turned in plan is oriented like its plain twin; a curved part still keeps its frame.
- **Linking**: two equal edged parts link (with the `alignedTo` id change; mutate it and they don't); a part turned a
  quarter in plan with its edging re-stored links to its twin. Pinned-and-edged sides per §11 Q1.
- **Change list** lines in shop words, matched on raw directions.
- **Schema and prompt pins** updated; `$defs` form pinned.
- **Live, paid** (≤ 10 per feature, the user's ruling 2026-10-22), on the dev server with stored-entry readouts:
  compile probe(s); Generate "a plywood bookcase with oak edging"; Generate "a cherry side table with a rounded-over
  top"; Refine "add a cove to the top's front edge"; Refine "remove the edging from the shelves" on a banded project.

## 10. Chunks (my call)

1. **Bands** (smaller: two fields, the `edging` enum, band type minting). Its compile gates it.
2. **Profiles** (the larger form, the frame-rule narrowing for profiled parts, two-side carry). Its compile gates it.
   **Revised 2026-10-23:** chunk 2 first merges the four angle arrays into one, then adds profiles — see "Chunk 2, revised".

Each chunk ships on its own (merge, deploy). If a chunk's form never compiles, that chunk stops and comes back to the user.

## 11. Questions for the user

1. **Pinned and edged case sides (§5):** they are mirror images and cannot link through a turn. Accept two distinct parts
   (they count against the part cap; record a follow-up for mirrored linking), or make linking try a reflection (new work
   in `roleLinks.ts`, storing the second side as a mirrored use of the Shape)?
2. **Edging choices (§3.1):** `veneer`, an existing band type, or `solid <species>` minted at 1/4in as `<Species> edging`.
   Is 1/4in solid edging the right default, and is minting new types acceptable?
3. **Generate's default (§6):** band the exposed front edges of plywood parts by default (my call), or only when asked?
4. **Chunks (§10):** bands first, shipped alone, then profiles?

**The user's answers (2026-10-23):** (1) two distinct parts for now, mirrored linking recorded as fu 432; (2) solid edging
minted at 1/4in as `<Species> edging`, reused after; (3) Generate edges the exposed front edges of plywood parts by
default; (4) bands first, shipped alone, then profiles.

**My calls from the builder check, for your eye:** profiles and bands on a CURVED part stay carried (§1); two-side runs
stay carried (§4.2); a station is measured from its nearer end, and untouched profiles are matched in world form (§3.2,
§3.4); band types are minted in one design-wide pass threaded through every path (§3.1).

## Chunk 2, revised (2026-10-23)

The user asked whether the schema could be trimmed, then: "Go ahead, revise the chunk 2 spec". Everything in §2.1 and
§3–§9 about profiles still holds; this section changes the design form AROUND them and wins where it differs.

### R1. Why (the probes, fu 322)

Base: the shipped Refine form with 1 custom solid, 1 custom sheet, 1 custom band type.
- Base + §2.1's `profiles` (9 fields): **refused**, 3,452 chars (`req_011CgK1EepMgmGMwUVjD4ARb`).
- Base with the four angle arrays merged into ONE `angles` array (R2) + §2.1's `profiles`: **compiled**, 2,805 chars
  (`req_011CgK1FhrhkS9XP5obZb297`) — smaller than today's form; at the upper bound (6 custom materials, 4 custom band types)
  **compiled**, 3,003 chars (`req_011CgK1HAcoVCSHiF2fewT5E`).
- Base with bands and profiles folded into one `edges` array, angles untouched: **refused**, 3,248 chars
  (`req_011CgK1GN4r8AQ7VqiSxKuXd`).

So the grammar's cost is the number of distinct object SHAPES, not characters: merging shapes frees room; adding fields to
an existing shape does not. §2.3's fallbacks are dropped (none is needed).

### R2. One `angles` array (replaces `tapers`, `miters`, `bevels`, `chamfers` in the DESIGN form)

```json
"angles": [{ "kind": "taper", "dirs": ["+x", "+z"], "toward": "-y", "values": [22, 0.375] }]
```

| `kind` | `dirs` (count) | `toward` | `values` (count) | today's form |
|---|---|---|---|---|
| `taper` | the sloping faces (1–4) | the thin end | `[start, amount]` (2) | `WorldTaper { faces, toward, start, amount }` |
| `miter` | `[end]` (1) | the long point | `[angle]` (1) | `WorldMiter { end, longPoint, angle }` |
| `bevel` | `[face]` (1) | the long point | `[angle]` (1) | `WorldBevel { face, longPoint, angle }` |
| `chamfer` | the two faces of the edge, in order (2) | ignored; written as `dirs[0]` **(my call: an echo is stable)** | `[leg, leg]` in `dirs` order (2) | `WorldChamfer { edge, legs }` |

- **The internal form does not change (my call).** `parseDesign` splits `angles` by `kind` into the TS-only
  `GeneratedPart.tapers / miters / bevels / chamfers` it has today, in array order, so every converter (`taperCutsFor`,
  `angleWorld.ts`), the exact-angle map, `diffDesigns`, `turnCandidates` and their tests are untouched. Only `designSchema`,
  `parseDesign`, `documentToDesign` (Refine's writer) and the prompt change.
- **A wrong count for its kind is a shape fault** (rejects the part, fed back) with the existing reason for its kind
  (`'taper'` or `'angle'`), e.g. `has a miter with 2 directions; a miter takes 1`. A count the old form would have accepted is
  never refused.
- **Refine's writer** emits tapers, then miters, bevels and chamfers, each in its existing canonical order, so an echo
  round-trips exactly as today.
- **Holes, bands and §2.1's `profiles` keep their own shapes** (they compiled as they are).

### R3. Records

Inv 48's design-schema clause becomes: "part, direction and `vec3` ONCE in `$defs`; the four angle kinds share ONE item
shape (`angles`). A new design-form feature joins an existing item shape where it can — each new SHAPE costs grammar (fu
322)." The AI-angles and AI-tapers specs get a pointer to R2 (their world words are unchanged; only the JSON envelope is).

### R4. Testing (added to §9)

- Parse: every kind round-trips `angles` → split → `documentToDesign` → `angles` exactly; mutate each count rule.
- Every existing angle and taper test keeps passing unedited below `parseDesign` (the internal form is unchanged); the
  schema fixture is re-captured (verified: the four arrays replaced by `angles` plus `profiles`, nothing else).
- **Live re-check of the angle features (paid; the risk is the model writing a generic record less precisely):** Generate
  "a Shaker side table" (inside-face tapers toward the floor, chamfered top edges); Generate "a picture frame" (miters, long
  point outside); Refine an existing tapered/mitered project with an unrelated change ("make it 2 inches taller") and
  confirm every angle cut comes back exactly. If the angle output regresses, stop and come back before profiles.
- Then §9's profile checks. Budget: one compile probe of the final schema + ~3 angle runs + ~3 profile runs, within 10.

### R5. Order (my call)

One round, one deploy. The plan's first task builds the FINAL schema (merged `angles` + `profiles`) and probes it once; the
angle merge is then finished and live-checked BEFORE any profile conversion is built, so a regression stops the round early.

### R6. Builder check of chunk 2 (2026-10-23) — Claude's calls, these win over §2–§9 and R2

1. **An oversized straight profile is a strict fault too.** `profileFaults` judges only `stop-off`/`overlap` for a straight
   (one-side, unswept) run; the panel catches an oversized one through `curveFaults` on its view curve (`curveRefusal.ts`).
   The design fault module (`profileDesignFaults.ts`, like `bandDesignFaults.ts`) therefore reports `profileFaults` AND, for
   a straight run, `curveFaults(profileAsCurve(p))` (`runs-off` / `cuts-through`), each as `'profile-fault'` (kept, fed back);
   `carryText.faultKeys` reads the same helper so the done view agrees. Skipped on a part with curves (carried, as bands).
2. **B3 read precisely:** an end EXACTLY 0 or EXACTLY the part's extent along the run is always a THROUGH end; only the
   1/32in tolerance is withheld from exact-set values (so a stored stop 1/64in from an end stays a stop). `designValues`
   holds every part's size, so the literal reading would have stopped every full-length Refine edge at L.
3. **Which profiles are carried:** `carriedKinds` = curves and hardware, plus `profiles` when the part has curves or ANY
   two-side run, plus `bands` when it has curves. `featureTurned` still faults a turned part with carried profiles (its only
   guard once `keptFrame` keeps the frame). The note's wording is unchanged (it already lists edge profiles per part). A
   carried part's returned profiles (and bands) are IGNORED SILENTLY, as chunk 1 does for bands: the note tells the model,
   and nothing the user has is lost — §4.2's "line in the done view" is dropped.
4. **Where `angles` lives:** `documentToDesign` keeps writing the internal `GeneratedDesign` (`designValues` reads its
   `tapers`/`chamfers`); ONE serialiser, `toWireDesign(design)` (generated.ts), turns it into the model's JSON (`angles`
   merged, TS-only fields dropped) for `refineMessage` and the estimate's character count. **A wrong count for its kind**
   (R2) is recorded at parse in a TS-only `GeneratedPart.angleFaults?: string[]` (the one new internal field) and rejected per
   part in `convertPart` with the kind's reason; an unknown `kind` is impossible (enum). Today's whole-response refusal for a
   two-face-less chamfer becomes this per-part rejection (a strict improvement).
5. **Square stock:** a profile `edge` with no face on the thickness axis is a shape fault whose text NAMES the broad faces
   (`has a profile on +x/+z, but <Part>'s broad faces are +y and -y`), so the model can correct it; no re-encoding.

## Amended (execution)

Rulings made while building chunk 1 (bands), on branch `ai-bands` (2026-10-23). Where one differs from the text above, this block wins.

- **Ruling 1 — the minting catalog (§3.1).** `designToDocument` mints against `catalogOf({ materials: opts.materials ?? [] })` (built-ins plus the
  project's customs), the same catalog `parseDesign` judged the keys by. Cost if wrong: a custom solid's minted type takes a wrong name.
- **Ruling 2 — no exact-band map (§3.4).** Bands carry no numbers: the canonical bands of the same sides and types ARE the stored ones. Cost:
  nothing unless band order mattered elsewhere (it is canonical already).
- **Ruling 3 — the grammar fallback (§2.3; fu 322).** Probe 1 (`vec3` inline, 3,267 chars, 8 edging keys) was refused
  (`req_011CgJpd3fNoqKzSmffAtj5M`); fallback (a) moved `vec3` into `$defs` and referenced it, no change of meaning, and compiled at 2,911 chars
  (`req_011CgJpkiPjQyZQA8DGccLtW`). Fallback (b) (a plain-string `edging` checked at conversion) was not needed. Cost: none semantically;
  headroom is thin, and profiles (chunk 2) will not fit without a much smaller form — revisit §2.3 before planning it.
- **Ruling 4 — `idOf` throws on an unknown key (§3.2).** Callers pass keys from the same design and the enum stops unknowns at parse. Cost if
  wrong: a crash instead of a fault on an unparsed path.
- **Ruling 5 — minting skips curved parts (§3.2).** A curved part's model bands are ignored, so its edging keys mint nothing (no orphan type,
  the "band type flood" anti-goal). Cost if wrong: none visible.
- **Ruling 6 — `collapseViolations` keys `'band-fault'` by message**, as `'hole-fault'`, so two faulted edges of one assembly part do not
  merge. Cost: one extra file in the diff (`assemblyChecks.ts`).
- **Ruling 7 — the band-fault `shown` copy** follows the holes pattern (the same phrase, bench edge words via `edgeName`); no verbatim text was
  given. Cost: wording the user may adjust.
- **Ruling 8 — change-list type names read from the AFTER document only (§4.1).** A removal names no type, so only the new name is ever
  printed. Cost: none unless a removal line should name its type.
- **Final review I1 — no band faults fed back for curved parts.** `bandDesignFaults` skips a part with curves: its bands are carried and the
  model sees `bands: []`, so their faults go only to `carriedSummary`'s check line (`faultKeys` counts band faults only on a curved part),
  never to the repair loop. Without it a resize of an arched, edged apron spent unfixable paid repair rounds and could keep an attempt
  that ignored the instruction. Cost: none (one skip, pinned by a mutated test).

### Chunk 2 (execution)

Rulings made while building chunk 2 (profiles and the merged `angles` array), on branch `ai-profiles` (2026-10-23; ledger
`.superpowers/sdd/2026-10-23-sloyd-ai-profiles/progress.md`). Where one differs from the text above (R1–R6 included), this block wins;
the records (invs 40, 41, 48, 53, 56; fu 322, 425, 430, 434) describe the code as merged.

- **Ruling 1 — `carriedView` follows R6.3.** Task 5 owned `carryText.ts` too: a part's profiles stay in the note, `featureTurned` and
  `carriedSummary` only when it has curves or a two-side run, and `faultKeys`' profile keys likewise. Cost if wrong: the done view lists
  authored profiles as carried.
- **Ruling 2 — "a straight run" (R6.1) is `oneSide(p.run)` and not `isSwept`**; `profileAsCurve` is called only for those (it throws on a
  loop or a two-side run). Cost: none. Residue: a stop that falls back to straight is judged by its swept faults only (fu 434).
- **Ruling 3 — no paid run before the prompt landed** (`SYSTEM_PROMPT` and `KEEP_LINE` named the old arrays until Tasks 2 and 6). Cost: none.
- **Ruling 4 — `run.test.ts`' fakes send internal-form fixtures through `toWireDesign`** at the boundary, still exercising the parse.
  Cost: the fixtures do not show the wire form literally.
- **Ruling 5 — `taperCutsFor`'s face-count messages are unreachable from model output** (the parse's count rule catches them first); they
  stay for direct callers. Cost: a dead branch on the model path.
- **Ruling 6 — no "side not perpendicular to the broad face" fault (§3.2, plan).** Once `edge` must hold exactly one face on the thickness
  axis, every other face is a side and perpendicular; two faces that do not meet are the "two broad faces" fault. The code has no such
  branch. Cost: none.
- **Ruling 7 — `allRound` keeps the two-face `edge` rule** (strict; the prompt says a loop names the broad face AND a side). Cost: a
  fed-back fault when the model writes one face.
- **Ruling 8 — `profileDesignFaults` also skips a part with any two-side run** (its profiles are carried, R6.3); a loop's message reads
  `<broad> all round`; identical messages per part are deduped. Cost: none.
- **Ruling 9 — `faultKeys`' profile gate is unreachable through `carriedSummary`** (only carried parts reach it); kept, with no claiming
  test. Cost: none.
- **Ruling 10 — an echo onto a resized part is restored AS STORED (§3.4 governs).** A returned profile equal to an original's world form
  on the ORIGINAL part (the model wrote the old numbers back) is restored as it was: its THROUGH ends follow the new extent, a stop keeps
  the end it is measured from (`restoreProfiles`, `sameWorldProfile`'s `aBoard`). This narrows §3.4's last bullet ("re-derived from the
  model's numbers"): only a profile matching neither world form is re-derived. Cost if wrong: a model that meant to stop at the old length
  gets a full run.
- **Ruling 11 — every displayed profile difference gets a change-list line**: fillet (a bead's quirk), depth and facing as well as size and
  run (§4.1's examples showed only size; the anti-goal "lost without saying so" governs). Cost: one more line kind.
- **Ruling 12 — "Roman ogee" keeps its capital R** mid-sentence (a proper noun). Cost: none.
- **Ruling 13 — the kind words have ONE home in `profiles.ts`** (`PROFILE_KIND_WORD`; `PROFILE_KIND_LABEL` derived for the panel); and
  `profilesView.test`'s "a migrated profile part takes no turn" was rewritten to the intended behaviour (it now turns). Cost: none.
- **Ruling 14 — a stopped run that stays stopped is compared by its STORED ends** (side and `at`/`through`): an unchanged stop on a resized
  part prints no profile line; a changed span prints `now stopped from <a> to <b>` (world offsets from the part's min, in the document's
  units). Cost: one more line form.
- **Ruling 15 — the prompt's "like a chamfer's edge" became "like a chamfer's dirs"** (the plan's pinned text was stale after the angles
  merge; evidence over authored text). Cost: none.
- **Ruling 16 — Ruling 10's accepted cost, stated:** a model that keeps a stop at the same world place on a resized part, with no other
  change, gets it restored as stored (the stop moves with its end), and the change list shows only the size line (fu 434 (6)).

**Where the code differs from the text above, beyond the rulings:**
- **`profilesFor` takes a fourth argument, `known`** (Task 6, fix round 2): the part's own stored distances (each `at` and its `L − at`).
  An EXACT station is never rounded to a decimal grid (1/3 stays 1/3); one whose computed distance lands within 1e-9 of a known distance
  takes it exactly, so a turn and its turn back cannot drift (`turnCandidates`). A computed distance within 1e-9 of its hole-grid value
  takes the grid value even when exact.
- **A station past one end is measured from the other end** (Task 3, fix round 1): a resize can leave a station beyond the part, and the
  loader keeps it, so it is never a shape fault (B3); `stop-off`/`runs-off` judge it.
- **§4.1's note wording is unchanged** (R6.3): an authored part simply drops out of it, because `carry.profiles` is `[]`; a carried
  part's returned profiles are ignored silently (no done-view line, R6.3 over §4.2).
- **§6's estimate re-measure was not done**: `CHARS_PER_TOKEN` stays 2 (conservative; a re-measure needs a paid run). `refineMessage` and
  the estimate count the wire form (`toWireDesign`).
- **R6.4 as built:** the wrong-count fault's reason is `'taper'` when any taper entry faulted (recognised by its text prefix, fu 434 (3)),
  else `'angle'`.

**Final review (b501592..b4f096f) and its two fix waves:**
- **Important — every moved stop printed "now stopped"**, an unchanged stored stop on a resized part included: fixed by Ruling 14
  (`7f1ec20`); the re-review found the stopped→stopped test still missed a changed stored stop when the world span was echoed alongside
  another field change, fixed in round 2 (`f1b979b`, Ruling 16 recorded).
- **Minors fixed:** the prompt's stale "chamfer's edge" (Ruling 15); `profileDesignFaults`' `shown` lowercased Roman ogee and read
  "on all round" (now `all round <face>`); a new faulted profile hid behind an original's on the same edge (the message lacked the span;
  a stopped run's span now rides in `message`, decimal inches, and `shown`, display units, so the two key and dedupe apart).
- **Deferred:** fu 434 (two homes for the profile name text; the metric `shown` span and metric turn unpinned; the taper fault's text
  prefix; the duplicated copy in `partOf`/`wirePart`; `alignedTo`'s stored-order comparison; Rulings 10/16's cost).
