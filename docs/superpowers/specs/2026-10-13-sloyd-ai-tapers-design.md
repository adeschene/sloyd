# Sloyd — the AI integration meets tapers

**Date:** 2026-10-13. **Status:** design approved in conversation; spec awaiting review.
**Builds on:** the angle-cuts spec (`2026-10-12-sloyd-angle-cuts-design.md`, §6 refusals, §11 follow-ups),
the generate, generate-assemblies, joinery, refine and refine-joined specs. **No document schema change** (tapers are
already schema 14); only the *design* schema the model writes changes, so rollback is free.

## 1. Problem and goal

Angle cuts shipped (schema 14), but every Claude feature refuses or ignores them: Add joinery, Refine and Repair refuse an
angled document (`angledRefusal`, invariant 48), and Generate cannot express one (`convertPart` emits `angleCuts: []`;
the prompt says "each part is an axis-aligned box" while its Shaker note already mentions tapered legs).

**Goal (the user's words): one prompt gives tapered legs with joinery.** "Shaker side table with tapered legs" yields
legs tapered on their inside faces; Add joinery on that prototype yields mortise-and-tenon aprons with no false overlap,
held or tip report caused by the tapers. Refine keeps tapers rather than refusing or squaring them.

**Decided in conversation:**

- **Tapers only.** Miters, bevels and chamfers stay refused by joinery, Refine and Repair (follow-ups). Angle-aware joint
  kinds (splined/biscuited miters, fu 276) are out of scope.
- **A taper reaching into a joint refuses the joinery run** (not skip-that-joint, not shorten-the-taper), naming the part.
- **World directions** in the design schema (§2), not relative words ("inside") or stored local fields.
- **Four unlinked legs are acceptable.** Inside-face tapers make legs mirror images, so `linkByRole` (which judges by
  `sameShared`, angle cuts included) keeps them distinct; they count four against the distinct-part cap (60 at
  `detailed`). A mirrored-component leg is a follow-up (§9).

## 2. The design schema (`generated.ts`)

`partSchema` gains a **required** `tapers` array (the schema is sent as strict structured output,
`output_config.format: json_schema`, with every property required; an untapered part sends `[]`):

```json
"tapers": [{ "faces": ["+x", "+z"], "toward": "-y", "start": 22, "amount": 0.5 }]
```

- `Dir` = `"+x" | "-x" | "+y" | "-y" | "+z" | "-z"`, an `enum` (the schema already uses `enum` for `material`). No
  `minItems`/`uniqueItems`: counts and duplicates are enforced in `convertPart` (§2.2), keeping to keywords the schema
  already uses.
- `faces`: the world faces that slope. `toward`: the end that gets thinner. `start`: distance from that end where the
  taper begins (depth 0). `amount`: how much is removed at that end. One entry may name several faces sharing numbers
  (the usual leg).
- Assembly definitions write the same form in the definition's frame; Generate's placements are translations only (no
  mirror, no turn: fu 232), so directions carry unchanged.
- `isPart`/`partOf` (`parseDesign`) validate the new field's shape like the others.

### 2.1 Conversion

`convertPart` runs `orient()` first (unchanged: longest extent is `length`, shortest `thickness`), then for each
`(face, toward)` maps world to board-local **through invariant 44's helpers** (`axisFrame`, `endFacing` and friends),
never by hand: `toward` → the length end (`end: 'min' | 'max'`), each face → `face: 'width' | 'thickness'` and
`from: 'min' | 'max'`. It writes through **`taperCut`** — the same writer Properties uses — so a generated taper is
stored exactly as a hand-made one (`kind: 'taper'`), one `AngleCut` per face, ids minted as today.

**Fixed order.** `sameShared` compares angle cuts index by index, so `convertPart` emits a part's tapers in one canonical
order (by `face` in `DIMENSION_ORDER`, then `from`, then `end`, then `start`, then `amount`); `["+z","+x"]` and
`["+x","+z"]` give the same stored part.

**Numbers.** `start` and `amount` are snapped exactly as `size` is (`snap`, `SNAP_INCHES`) unless listed in the
conversion's `exact` set — Refine's `designValues` (§5) lists them, so a refined, untouched taper is stored exactly.

### 2.2 Refusals (design faults, reported to the model)

A part with any of these is rejected the way an unconvertible part is today (`rejectedViolations`), with a message naming
the part and the rule:

- `toward` is not along the part's length (e.g. a sideways taper on an apron).
- `faces` is empty, longer than 4, repeats a face, or names a face along the length or the end `toward` names (or its
  opposite end).
- `start` not in (0, length], or `amount` not > 0, or either non-finite (checked after the snap, as `size` is).
- `amount` removes more than the dimension behind that face — Properties' rule ("Removes more than the …") — and two
  tapers on opposite faces of one dimension together leave no wood.

## 3. Checks (`designCheck.ts`)

**The rule: a taper only removes wood, so a box check is wrong only where it relies on wood that is not there.** Fix
exactly those; leave the merely conservative ones.

### 3.1 Unchanged (conservative, never wrong)

- **Overlap** stays on `worldSolids` (pocket-cell boxes). A tapered part's real shape lies inside its box, so the check can
  report a false overlap but never miss one. Legs-and-aprons cannot reach a false one once §4's rule holds (no joint on
  tapered wood). Follow-up (§9).
- **Too small / too large / part count**: these are about stock, which is the full box (invariant 18).
- **`faceContacts`** (the source of joinery's sites) stays on boxes **on purpose** (§4.1).

### 3.2 `contactSolids(board)`: the flat-wood solids

One new function, the only place the checks read a taper: a part's solids **as far as contact can trust them**,
returned as `Box[]` in world space so existing consumers take it unchanged.

- **No taper (any part without one):** exactly `worldSolids(b)` — the same array contents, byte-for-byte, so
  every untapered result is unchanged (the `body.box` pattern of invariant 48).
- **Tapered:** the part's *tapered length* is the union, over its tapers, of `[0, start)` measured from each taper's
  `end`. Then:
  1. every pocket cell clipped, along the length, to the **square stations** (outside the tapered length) — a side face
     is trusted only where it is still flat, which is conservative for the faces adjoining a sloped one too (their
     corners are clipped by the taper);
  2. plus, for each end that a taper runs toward, a **zero-thickness slab** per pocket cell reaching that end: the cell's
     end-face rectangle shrunk by each taper's `amount` on its face and side (exact: a taper's depth at station 0 is its
     `amount`). When the square range is empty, or a taper's `start` equals the length, the far end is kept by (1)'s
     closed range at that end, so a full-length taper still offers its full far end face.

`contactSolids` reads only `kind: 'taper'` cuts; a document reaching the checks with any other angle-cut kind is
already refused upstream (§4, §5), and the function asserts it (throws: a programming error, not a user refusal).

**Invariant 48 amendment.** `boardBodies` stays the ONE place angle cuts become *drawn / edged / probed* geometry.
`contactSolids` is a second, deliberately narrower reader: tapers only, box-valued, conservative (it under-claims wood,
never over-claims), because every check consumer is box-based (invariants 38, 39). State this in the invariant.

### 3.3 Who reads what

| Consumer | Reads | Change |
|---|---|---|
| overlap (`checkDesign`) | `worldSolids` | none |
| held / hangs (`solidContactsOf`) | `contactSolids` | was `worldSolids` |
| grounding: floor seed (`groundedSet`) | box `min[1] <= TOUCH` | none (a tapered foot is still at the box's floor) |
| grounding: `connected` (`groundedSet`) | `contactSolids` | was whole boxes — a stretcher touching tapered air no longer connects |
| tips: footprint hull | corners of `contactSolids` touching the floor | was box corners — a leg tapered to 1" stands on 1"×1" |
| tips: centre of mass | box volumes | none; follow-up (§9) |
| `faceContacts` → `findSites` | boxes | none, on purpose (§4.1) |
| coverage denominators (between/lapped ≥ 50%) | the faces' `contactSolids` areas | was box faces |

**Invariant 38 amendment.** Held, hangs, `connected` and the tip footprint read `contactSolids`; overlap stays on
`worldSolids`; `faceContacts` stays on boxes.

## 4. Joinery (`generate/joints/`)

### 4.1 The taper-at-joint rule

For every joinery site (box `faceContacts` → `findSites`, unchanged), take its contact patch on each tapered participant.
If the patch's station range intersects that part's tapered length (§3.2, the half-open `[0, start)` from each taper's
end — `start` itself is allowed), **the whole run is refused**:

> *Leg 1's taper runs into its joint with Front apron — start it at 22" or less from the length min end, or remove it.*

The number is the patch's nearest station to that taper's end, through `formatLength`; the end is named in the fu 300
vocabulary (`faceName`: "the length min end"). One report per tapered part (its first conflicting site in document order,
the smallest such number across its sites), never one per joint.

**Why sites stay on boxes.** On `contactSolids` an apron meeting a taper would simply lose its contact and be left a
silent butt — the option the user declined. Box sites *find* the meeting; the rule refuses it. Once a run passes, every
site lies wholly on square wood, where box and real geometry agree, so recipes, `pocketFor`, blockers and trims are
unchanged.

**Resizes are covered.** A recipe that grows (tenon) or trims (rabbet) a part does so at the end meeting the other part,
whose patch is at station 0 of a taper toward that end — refused. Growing or trimming the *other* end leaves the taper's
stations alone: they are measured from the tapered end, and `rebaseCuts` does not touch angle cuts. Pinned by a test.

### 4.2 One decider

`joineryRefusal(doc, sites)` in `generate/joints/` (it needs `findSites`; `document` cannot import that) returns, in
order: the narrowed angled refusal (§4.3), else the taper refusal (§4.1), else null. The pure taper test is
`taperConflicts(flat, sites)`, exported for §5.3.

### 4.3 Refusal sites

| Site | Change |
|---|---|
| `angledRefusal`/`angledParts` (`angledRefusal.ts`) | count only angle cuts whose `kind !== 'taper'`; message unchanged |
| `runJoinery` entry (`run.ts` ~326) | calls `joineryRefusal` before any call or mutation (invariant 41) |
| `App.tsx` ~91 (`joineryRefusal` → `JoineryDialog`) | calls the same decider, fed by the existing `joinerySites` memo (sites are not found twice); the estimate stays suppressed on refusal |
| `repair.ts` ~101 (`repairDocument` returns null on angled) | narrowed: a taper-only document is repaired (its prune-and-prove never touches angle cuts) |
| `refine.ts` ~52 (`plainForRefine`) and ~81 (repair offered only on `'joints'`) | narrowed refusal; §5 |
| `refineDesign.ts` ~55 (`documentToDesign`) | narrowed refusal; §5 |
| `run.ts` ~252 comment ("unreachable: a refined design has no angle cuts") | becomes reachable; rewrite to say why the re-join cannot refuse (§5.4) |

After the run, joinery's existing `checkDesign` gate runs with §3's rules.

**Invariant 41 / 48 amendment.** Joinery accepts tapers and refuses any site on tapered wood; Refine accepts tapers it can
describe exactly; every other angle-cut kind still refuses.

## 5. Refine (`refineDesign.ts`, `refine.ts`, `designDiff.ts`)

### 5.1 Writing tapers out

`documentToDesign` no longer refuses a taper-only document. Each stored taper is written as §2's form:

- **Standard form is recognised structurally:** `points[0][0] === 0 && points[1][1] === 0` with `along === 'length'`.
  Then `amount = points[0][1]`, `start = points[1][0]`, `end = alongFrom` — read straight off the stored points.
  (`taperFields` derives `start` via `zeroStation`, which is not exact in floating point: `(0.1*3)/0.1` is
  `3.0000000000000004`. It stays the Properties reader; Refine does not use it for values.)
- Local face/side/end map back to world `Dir`s through invariant 44's helpers — the exact inverse of §2.1. A definition's
  parts use the definition frame; Refine already refuses turned, mirrored and nested assemblies.
- Tapers on one part sharing `toward`, `start` and `amount` merge into one entry with several `faces`.
- `start` and `amount` join `designValues`, so §2.1's conversion keeps them exact.

### 5.2 Refusal

A taper not in standard form (a hand-edited line that never reaches zero, or one stored deep-end-last, fu 297's
territory) refuses, naming the part: *"Leg 3's taper can't be described to Refine — edit it in Properties first."* (An
edit in Properties rewrites it in standard form through `taperCut`.) Refine never silently rewrites a taper it was not
asked to change. Decided before any call (new `RefineRefusal` reason, e.g. `'taper-form'`).

### 5.3 The same rule, on designs

`evaluateDesign` (shared by Generate and Refine) runs `taperConflicts` (§4.2) on the converted flat document and reports
each conflict as a **design fault** with its own `kind` (e.g. `'taper-joint'`) and `parts`, so `collapseViolations` and
problem comparison work by kind and parts. The model-facing message uses world words
(*"Leg 1's taper (toward -y) runs into its joint with Front apron — start it at 22 or less from its -y end"*).

It lives in `evaluateDesign` only, **not** in `checkDesign`: `checkDesign` is also joinery's gate, where a taper conflict is
impossible after §4's refusal and would only muddy the preexisting-problem comparison.

This is what makes the goal hold end to end: a Generate or Refine result can never be one Add joinery then refuses for
its tapers.

### 5.4 Joined Refine

Refining a joined project unjoins it (`gateUnjoin`, exact re-join) and re-joins afterwards with the recorded choices.
With tapers, (a) `gateUnjoin`'s exact (1e-9in) re-join must pass on a joined tapered document — pinned by a test; and
(b) the re-join's `runJoinery` entry cannot refuse on tapers, because §5.3 already rejected any design with a conflict —
pinned by a test, and the `run.ts` comment says so.

### 5.5 `designDiff`

Taper lines per part, by flat display name, numbers through `formatLength`:
*"Leg 1: taper added (+x, +z; 22" from the -y end, ½" off)"*, *"… taper changed (…)"*, *"… taper removed"*. Compared by
the §2 form (after the merge), so a reordering is not a change.

## 6. Prompt (`prompt.ts`)

`SYSTEM_PROMPT` stays a fixed prefix (a concept rides in the user turn), edited in place:

- "Each part is an axis-aligned box" → "… a box, optionally tapered".
- One short block on `tapers`: the fields; a taper runs along the part's length; the usual leg (the two inside faces,
  toward the floor); and the rule — **start a taper below anything that joins the part**, with a typical number for an
  apron. This is §4.1's rule worded for the model, not a second rule.
- `tapers: []` for every untapered part (the field is required).
- Shaker's "tapered or square legs" is now buildable; mid-century's "splayed legs" is not (fu 280): say to use tapers for
  that look until compound angles exist.
- The "same role only for identical parts" line stands; legs with mirrored tapers simply end up unlinked (§1).

`estimate.ts`'s ranges depend on the prefix length (`prefixChars` includes `DESIGN_SCHEMA`): re-measure, do not assume
(fu 236).

## 7. Delivery

Two chunks, each deployable and useful alone:

1. **Joinery and checks** (§3, §4, the Repair narrowing). Hand-tapered legs become joinable.
2. **Generate and Refine** (§2, §5, §6). One prompt gives tapered legs that pass joinery.

## 8. Testing

TDD; every plan-supplied test is mutated before it is trusted.

- **Conversion:** every world direction × the postures and turns `orient` produces, round-tripped through
  `documentToDesign` with exact equality; a chiral fixture so a mirrored mapping fails (invariant 44). Every §2.2
  refusal, including two opposite tapers that together remove all the wood. Face order does not change the stored part.
- **`contactSolids`:** untapered → equal to `worldSolids`; a stretcher lapped against the tapered length is not held,
  above `start` it is; a full-length taper keeps its full far end; a joined tapered leg (mortise cells) keeps its pocket
  cells; the footprint shrinks by the amount and a tip case flips because of it; `connected` no longer joins through
  tapered air.
- **Joint rule:** refusal before any call or mutation (assert call counts and the unchanged document, never message
  text); `start` exactly at the patch is allowed; a tenon grown at the untapered end leaves the taper's points identical;
  a non-taper angle cut still refuses; Repair runs on a taper-only document.
- **Designs:** the fault reaches the model through `evaluateDesign` (kind and parts); `checkDesign` never emits it;
  joined Refine: `gateUnjoin` passes and the re-join cannot refuse.
- **Refine:** standard-form recognition on a metric-typed amount (the float case above); the non-standard refusal;
  merge of faces; `designDiff` lines.

**Live check** (dev server, Playwright, the user watching): chunk 1 — a hand-tapered table, joinery refused, then
accepted after moving the taper (free: the refusal is pre-call; the accepted run needs a key and the user's approval).
Chunk 2 — **one paid Generate** ("Shaker side table with tapered legs") and **one paid Add joinery** on the result, each
approved by the user at the time. Production is verified by bundle hash and CSP only (the deployment rule).

## 9. Follow-ups this round leaves

- Mirrored-component legs (a Generate assembly with mirrored placements, so four inside-tapered legs share one Shape).
- Overlap stays box-based for tapered parts (false positives only).
- The tip check's centre of mass uses box volumes (`bodyVolume` exists; a body centroid does not).
- Miters, bevels and chamfers in the AI features; angle-aware joint kinds (fu 276).
- The joint rule is all-or-nothing; a per-joint skip was considered and declined.
