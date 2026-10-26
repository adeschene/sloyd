# Splayed legs, chunk 2c: square-set legs and compound level cuts — design

Status: APPROVED by the user 2026-10-26 ("Approved, write the plan"); builder check taken 2026-10-25 (five questions answered as my calls: §3.2, §4,
§4.1, §4.2, §8; four claims the code contradicted, corrected). Comes before chunk 3, stretchers (fu 438), which is parked at its Task 1 on branch
`stretchers` (`52e975f`).
**Built 2026-10-26; merged `447df4b` and DEPLOYED 2026-10-26 as `index-3F79fb4S.js`** (plan Tasks 1–9; schema 25);
browser verification PASS 7/7; final review approved. Later rulings: the *Amended (build)* block at the end, which wins
where it differs from the text — APPROVED by the user 2026-10-26.

## 0. How this round came about

Stretchers' Task 2 found what its spec missed. A compound lean (rake AND splay) twists a square leg about its own axis:
`leanMap` composes `m = T · Ry(τ)`, turning the facing dimension onto the sightline (chunk 1's seam-free choice, so that
Level the ends stays ONE end miter). On the chunk 1 stool (rake 8°, splay 12°) that twist is about 33.5°. A level rung then
meets the leg's face at about 34°: bored through the leg's centre, a 5/8" socket breaks out of the leg's side, and only
3/8" fits. Asked how to proceed, the user chose **"Untwisted legs first"**: a splayed leg keeps its faces square to the
stool's sides, the way square splayed legs are set at the bench, and Level the ends gains a compound end cut. They asked to
skip the design questions, so every decision below that is not quoted from the user is **my call** and is marked. The
read-only survey behind it is in §9.

## 1. What and why

A square leg can be set in a compound splay two ways:
- **turned to its lean** (today): one face looks along the sightline. Its foot and top cut level with ONE end miter (a
  slope along one dimension). Its faces sit about 34° off the stool's sides, so a rung or apron meets them askew;
- **square to the sides** (new): the leg is tilted, never turned. Its faces stay within about 1° of the stool's sides (0.83°
  at 8°/12°, 1.92° at 15°/15° — measured; a square leg leaning two ways cannot keep both faces exactly square, and the pure
  tilt splits the remainder evenly). Its level foot and top are a **compound** cut: sloping across both the width and the
  thickness. That is the bench reality of a square splayed leg: the foot is cut to a compound angle.

This round adds the second setting and the compound end cut it needs, and makes it the default for a newly leaned part
(my call, §3.2).

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) A lean may be **square-set**: the part is tilted onto its slopes with no turn about its axis.
- (G2) An end miter may slope across BOTH cross dimensions (a **compound miter**), stored, loaded, drawn, cut-listed and
  exported exactly; Level the ends writes one on a square-set leg.
- (G3) Every reader of an angle cut is correct for a compound miter (the survey's 24 silent readers, §9), or refuses it
  with a sentence where it cannot be correct (joinery, Refine's world words).
- (G4) A project saved before this round is byte for byte as before: its leans stay turned, its cuts single-slope.

**Non-goals**
- Authoring a compound miter by hand in Angles (the row shows its bench line and Remove, as a levelled offset miter does
  today); a compound bevel, chamfer or taper.
- Generate or Refine describing either (the design schema is unchanged; Refine keeps leaning parts exactly already).
- Stretchers (chunk 3, resumed after this round).

**Anti-goals**
- **No silent re-twist.** A build that cannot carry `square` or a compound slope refuses the file (schema bump, §3.4) —
  never loads a square-set leg as turned, or a compound cut as a single slope.
- **No reader misreads a compound miter as a single-slope one.** Every reader that cannot represent it says so or
  refuses; none quietly drops the second slope (the survey found `miterFields`, `worldAngles`, `copyAngleCut`,
  `validateAngleCuts` and `rebaseAngleCuts` would).

## 3. The model (schema 25)

### 3.1 Stored form (my calls)

- `Lean` gains `square?: true`: present only when the lean is square-set; absent means turned (every lean stored before this
  round). `face` keeps its meaning and is still stored (a square-set lean ignores it for the map; switching back to turned
  uses it).
- `AngleCut` gains `across?: { rise: number; from: CutFrom }`, legal only on a miter on an end (`kind 'miter'`, `face
  'length'`): the depth also grows by `rise` per inch across the third dimension (`throughOf(c)`, the one that is neither
  `face` nor `along`), measured from that dimension's CENTRE, increasing away from its `from` side. So the depth at station
  `s` and cross position `t` is `depthAt(c, s) + rise · (t − T/2)` with `t` measured from `from` (`T` the part's size in
  that dimension). Anchored at the centre, so the depth on the part's axis is the single-slope `depthAt` exactly — round
  tenons' `centreDepth` stays exact (my call, for that reason). `rise > 0` (a zero rise is no `across`: never stored).
- Flags, never arithmetic (inv 44): a mirror along the through dimension flips `across.from`; along `along`, `alongFrom` as
  today; the exact inverse reuses the stored object.

### 3.2 The map, and the default

- `leanMap`: `m = T` for a square-set lean (no `Ry(τ)`), `T · Ry(τ)` otherwise, unchanged. `T` is already mirror-equivariant
  (`S · T · S` is the flipped lean's tilt), so mirror conjugation (§3.4 of chunk 1) holds with no seam case.
- **Default, my call:** `setLean` on a part that does not lean yet writes `square: true`. A part already leaning keeps its
  setting through rake and splay edits. Existing projects and every fixture that builds a lean directly keep turned.
- The Lean section gains a **Set** select: `Square to the sides` / `Turned to the lean (one-cut ends)`. Changing it is a lean
  edit that makes the ends stale (`Level the ends again`, the existing note). Holes (builder check Q1, my calls):
  - a Set change turns the part about its length by the seam-free twist τ (about 33.5° at 8°/12°), carrying its holes
    with it, so on a holed part it is refused when τ ≠ 0, verbatim: `Changing how this leg is set would turn it about its
    length and move its holes — remove the holes first.` When τ = 0 (a rake-only or splay-only lean, where square and turned
    are the same map) it is allowed;
  - today's face-flip refusal (`LEAN_TURNS_HOLES`, `lean.face !== b.lean.face`) applies only to a TURNED lean: on a
    square-set lean the stored `face` does not reach the map, so a rake → 0 edit turns nothing and is allowed;
  - `setLean`'s no-op test (inv 4) compares `square` too.

### 3.3 Level the ends on a square-set leg

`levelPlan` writes, at each end, ONE miter whose plane is the floor (or top) plane exactly: `along` = the dimension whose
slope is larger (ties: width), `points` its single-slope line through the end's centre, `across` the remaining slope. The
existing rules stand: lengths rounded UP to the drag grid, the top through R (or `topAt`), holes kept in the wood
(`levelEndHoles`), any end miter replaced, other end kinds refuse. The guard that throws when the floor normal leaves the
length × face plane applies only to a turned lean. `sameLevelLine` / `isLevelled` compare `across` too.

### 3.4 Schema 24 → 25

A bump for the refusal gate (CLAUDE.md's rule: argue this field's harm): a schema-24 build loading a 25 file would DROP
`square` (the leg re-twists 33°: its level cuts no longer level, its sockets point wrong) and DROP `across` (a compound foot
loads as a single slope: a foot that rocks). Both silent; the bump turns them into a refusal. No step upgrades anything
(absent fields default). The loader validates `across` (finite `rise > 0`, a legal `from`, only on an end miter; otherwise
the CUT is dropped as malformed, inv 11's rule) and `square` (exactly `true`, else dropped from the lean).

## 4. Readers (each made correct, or refusing)

The survey (§9) lists them by file. The rules, my calls:
- **Geometry**: `keptHalfSpace` adds the across term to the plane's normal and offset; everything that reads the plane
  (bodies, probes, snapping, hole faults, drawing tags, diagram wedges' polygons) then follows. `depthAt` stays the
  single-slope line; a new `depthAtCross(c, s, t)` is the full depth, and every reader that wants the depth at a corner or
  a disc's edge calls it (`angleCutRemovesNothing`, `touchedRegion`, `shortPointLine`, `overruns`, `tipFarthest`,
  `deepestDepth`).
- **Copies and identity**: `copyAngleCut` copies `across` (a fresh object); `ANGLE_CUT_FIELDS` gains it (`satisfies` forces
  the table) and `angleCutValues` FLATTENS it as it does `points` (today it pushes a field raw, so an object would compare by
  identity; builder check); so `sameAngleCut`, link sharing, `geometryKey`, the UV signature and the cut list's row
  key see it.
- **Text**: the bench line for a compound miter, verbatim: `Compound miter at the length <end> end: <a>° across the <along>,
  <b>° across the <through>` (degrees from the two slopes, display only); `shortPointLine` from the four corners'
  full depths. The diagram draws the wedge in both cross views.
- **Mirrors**: `mirrorAngleCut` flips `across.from` along the through dimension; `lowerAngleCuts` round-trips it.
- **Authoring**: `miterFields` returns null for a compound miter (the row then shows the bench line and Remove only, as a
  levelled offset miter does today); `miterCut` never writes one.
- **Round tenons** on a compound end: `centreDepth` exact by construction; `deepestDepth` takes the four corners' full
  depths; `tipFarthest` takes the minimum of the affine depth over the tenon's disc, `centre − r · hypot(k, rise)` (`k` the
  along slope), never probes at ±r along each axis, which over-reports seating (builder check).
- **Refusals** (decided before any mutation; like the lean and tenon steps, each refuses the whole run naming the FIRST such
  part). Builder check Q2, my calls: a compound cut comes only from Level the ends on a leaning part, which `leaningRefusal`
  already refuses, so these fire only after Clear lean. ONE new step, `compoundRefusal`, called wherever `tenonRefusal` is
  and right after it (lean, tenon, compound, then angle cuts): `joineryRefusal` (`Add joinery can't join a part with a
  compound end cut yet: <name>.`), Repair beside its lean and tenon calls, under the same gate (`Repair can't join a part
  with a compound end cut yet: <name>.`), and a joined Refine (`Refine can't keep joints with a part with a compound end
  cut yet: <name>.`). `rebaseAngleCuts` is then never reached for one.
- **Refine keeps** a part with a compound miter exactly (`keepsExactly` gains it, so `worldAngles` never misreads one).
  Builder check Q3, accepted knock-ons: such a part is never linked by role (`turnCandidates`), and inside an assembly it
  makes Refine refuse (`leaningInAssembly`'s rule), exactly as a leaning part does. The kept-list wording does not change
  (a compound cut only exists on a leg that leans, or did).

### 4.1 Clear lean (builder check Q4, my call)

Clear lean keeps the compound end cuts, as it keeps single-slope level miters today ("never refused, cuts untouched"). The
cleared part is then a non-leaning part with a compound cut: its rows show the bench line and Remove, joinery refuses it,
Refine keeps it. Removing the cuts on Clear would change an existing action's behaviour for a rare case; Remove is one
click.

### 4.2 Branch (builder check Q5, my call)

This round builds on `master`. Stretchers (`stretchers`, Task 1 at `52e975f`: the bore core in `legSockets.ts`) is rebased
onto master after this round merges; the overlap is small (`legSockets.ts`' `sameCuts` reads `sameLevelLine`).
- **Lean records**: `leanFlip`, `validateLean`, `setLean`, `sameShared`, write-back's lean lowering and the memo keys
  (section caps, BoardMesh) carry `square`.

## 5. Stretchers, afterwards

On a square-set stool a level rung meets a leg face within about 1°, so stretchers' spec stands as written (5/8" sockets
centred, the ~0.2" shoulder gap). When chunk 3 resumes, Add stretcher refuses a turned leg with `Set <Leg> square to the
sides first (Lean).` (my call, recorded there), and its fixture is a square-set stool.

## 6. What it costs if wrong (my biggest calls)

- **Square-set is the default for a new lean.** A woodworker who wanted one-cut ends picks `Turned to the lean`. Cheap to
  flip the default later; existing projects are untouched either way.
- **The across term is anchored at the centre.** Chosen so the axis depth (round tenons) stays exact. A reader that assumed
  a min-face anchor would be off by `rise · T/2`; the tests pin a corner depth for that reason.
- **No hand-authored compound miter.** Only Level the ends makes one; a woodworker who needs one elsewhere cannot type it
  (a follow-up).
- **A schema bump.** Rolling back past this round refuses every project saved at 25 (export first).

## 7. Records

A new invariant 59 (or clauses in 48 and 57, the builder's call by size): the compound miter (stored form, the centre
anchor, `depthAtCross`, flag flips) and the square-set lean (`m = T`); inv 40's table, inv 44's flips, inv 45 (`square`
in `sameShared`), inv 57 (the default; Level the ends' compound cut), inv 41 (the joinery refusal), inv 56 (Refine keeps
a compound cut). `docs/versioning.md` (v25), CLAUDE.md condensed, module map, rounds, follow-ups (hand-authored compound
miter; compound bevel/chamfer), the feature-gaps row.

## 8. Left to the builder

- The closed form of the compound plane from the floor (or top) plane, and the degrees in the bench line.
- Whether `depthAtCross` lives in `angleCuts.ts` (expected) and the exact helper names.
- The Set select's position in the Lean section; wording beyond the quoted sentences (copy review).

## 9. The survey, in brief

A read-only survey (2026-10-25) found 34 non-test files reading angle-cut geometry or fields. With a second slope, 24
readers would misread it silently (among them `copyAngleCut`, `validateAngleCuts`, `angleCutRemovesNothing`,
`touchedRegion`, `miterFields`/`miterCut`, `mirrorAngleCut`, `angleLine`/`shortPointLine`, `overruns`, the diagram wedge,
`tipFarthest`, `deepestDepth`, `sameLevelLine`, `clearsTenon`/`angleConflicts`, `rebaseAngleCuts`, `worldAngles`), one site
throws (`levelPlan`'s floor-normal guard), and the field table forces a compile error (`ANGLE_CUT_FIELDS`). The twist has
one gate (`seamFree` / `twistOf` in `leanMap`); every other `leanMap` caller applies the map and is twist-agnostic, but the
lean record is rebuilt field by field in `leanFlip`, `validateLean` and `setLean`, compared in `sameShared`, and keyed in
two viewport memos.

## Amended (build)

**APPROVED by the user 2026-10-26, every ruling in this block, in bulk** (walked through in plain terms first, in the owed-reviews pass).

Rulings made while building, on branch `square-legs` (2026-10-26; the SDD ledger and the task reports). The code plus these rulings
govern; where one differs from the text above, this block wins. Records: invariant 59
new (§7's choice: a new invariant, not clauses in 48 and 57), invariants 40, 41, 44, 45, 48, 56, 57 and 58 extended
(`docs/invariants.md`); follow-ups 470–474, 438 amended.

- **Ruling T1a — the stored forms' knock-ons (§3.1, §3.4).** `across` is judged on the RESOLVED kind (a missing `kind` on an end cut
  derives `miter` and keeps a good `across`); `groupSignature` carries `square` (so the write-back splits a Shape whose users differ
  only in it), `lowerLean` compares it, `sortAngleCuts` stays antisymmetric once value lists differ in length, and `mirrorAngleCut`
  gains the through-dimension branch (§4's flip). 44 existing tests changed: the field-table pin gains `across`, and the version
  pins move 24→25 (and the first refused version 25→26), as at the schema-24 bump. Cost: none.
- **Ruling T1b — `rise` has an upper bound (§3.4).** The loader also DROPS a cut whose `rise` is above `1 + 1e-9`: the 45° lean
  bound means a level cut's across slope never exceeds 1, and an unbounded `rise` could overflow `rise · T/2`. Cost: none (only a hand-edited file carries a steeper one).
- **Ruling T2a — three readers exported for direct pins.** `tipFarthest`, `deepestDepth` and `overruns` are exported so the
  single-slope identity tests read them directly. Refinements of §4 found in the build: `deepestCorner` reads all FOUR corners, so a
  `rise` of either sign built in code is answered, and `tipFarthest` is `max(0, centre − r·hypot(k, rise))` (clamped at 0, as the
  single-slope tip is). Cost: none.
- **The T3 API choice — the Set is a `setLean` patch field (§3.2).** `LeanWorld.square?: boolean`, no new action: `{ square }` alone
  keeps both slopes bit for bit, writes nothing on a part that does not lean, and may combine with a slope edit; `leanTwist` (the τ a
  turned lean would apply, through `twistOf`) and `LEAN_SET_TURNS_HOLES` are exported for the gate and the panel. Cost: none.
- **Ruling T3a — the Set gate judges the TURNED end (§3.2).** A Set change on a holed part is refused when τ of the lean on the turned
  side of the change is not 0: the old lean when leaving turned, the new one when entering it. So a combined `{ square: true, splay:
  0 }` on a turned 8°/12° holed leg is refused (the leg still loses its ~33.5° twist, though τ at the new slopes is 0). Cost: none.
- **Ruling T3b — interim only.** Between Tasks 3 and 4 Level the ends threw on a new square-set two-slope leg (the floor-normal guard).
  Resolved by Task 4 (`eaf1406`): the guard applies to a turned lean only. Nothing of it remains on the branch. Cost: none.
- **Ruling T3c — τ = 0 compared exactly.** `leanTwist` returns exactly `+0` for a rake-only or splay-only lean in every turn and face
  tried, so the gate compares `!== 0` with no tolerance (pinned). Cost: none.
- **Builder note T4 — the along tie (§3.3).** `along` is the cross dimension whose world height changes faster under the map, `width`
  when `|w|_y + 1e-9 ≥ |t|_y`: at rake = splay the two slopes are equal only to float precision, so the tie needs the tolerance
  (Task 4 review M4, accepted as designed). The directions are `axisFrame`'s, signed by `reversed` (a leg turned 180° otherwise
  got the wrong `across.from`). `legSockets.ts` needed no change (§4.2 expected one): its `sameCuts` reads `sameLevelLine`. Cost: none.
- **Ruling T5a — the feature key's words (§4 Text).** A compound miter keys on the Plans sheet as `Compound miter <a>° × <b>°`, along
  then across, the chamfer's `a × b` form (the spec quoted none). Cost: copy review (fu 473).
- **Ruling T5b — a compound cut also draws in its along face's views (§4 "both cross views").** Its plane shows on both cross faces,
  so the diagram opens an along face's view too (the stool leg gains `width|min` beside `thickness|min`); each side's polygon is
  drawn on its own face (`wedgeOn`), which also fixes the clip that ignored `n[through]`. Single-slope parts are unchanged
  (`diagramIdentity`). Cost: none.
- **Ruling T5c — a rare missing wedge, parked.** A face whose only existing views sit on the wedge's empty side draws the cut nowhere
  (a corner-only compound cut plus dados that opened exactly those views): fu 472. Cost: a rare
  missing wedge.
- **Ruling T6a — the model-facing keep reason (§4 Refine keeps).** A part kept for its compound cut alone (a cleared leg) reads
  `"<leg>" has a compound end cut and is kept as is: …` in the USER-turn note (without it the empty reason list printed
  `undefined`); `keptNote`'s header and every UI sentence are unchanged, as §4 said. Cost: model
  wording only (fu 473).
- **Ruling T6b — defence in depth beyond `keepsExactly` (§4).** `worldAngles` returns null for a part with any `across` cut, and
  `angleRatiosOf` skips such a cut, so even a direct caller never reads a compound miter as a plain one (null makes Refine refuse,
  `'angle-form'`, or keeps the part unturned). Cost: one guard each.
- **Ruling TFa — the compound bench line names its long corner (§4 Text; final review M1).** The line §4 quotes named no long point,
  so mirror-twin legs (Front right, Front left) printed two cut-list rows with identical text. It now reads, verbatim:
  `Compound miter at the length <min|max> end: <a>° across the <along>, <b>° across the <through>, long corner at the <along>
  <min|max> side and the <through> <min|max> side`. The long corner is the end face's corner of least full depth (the end is
  longest there; the corner a woodworker marks first), picked by the single miter's long-point rule (`miterLongSide`, ties to
  `alongFrom`) on the along dimension and by `depthAtCross` at that station on the through one (ties to `across.from`):
  `compoundLongCorner` (`angleCuts.ts`). The square stool's feet: Front right `…, long corner at the width max side and the thickness max side`, Front left `…, long corner at the width min side and the thickness max side`. §4's text above
  is left as written. Cost: copy review (fu 473).
