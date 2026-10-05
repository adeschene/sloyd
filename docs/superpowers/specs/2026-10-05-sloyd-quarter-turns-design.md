# Sloyd — quarter turns

**Date:** 2026-10-05 · **Status:** approved in conversation, section by section
**Builds on:** v3's orientation model (`posture`, `rotation`, `axisDimensions`), the joinery
rounds (`pocketFor`, invariant 41), and invariants 2, 11, 13, 16, 24, 35 and 38. Every rule there
still holds unless this document says otherwise.

**First of three rounds that make up "repeated parts", in the user's order:** quarter turns, then
copy in a row, then linking. Each gets its own spec, plan and live check.

## 1. Problem and goal

**The user's goal for repeated parts.**
- **Copy and link are separate actions.** Copying makes ordinary parts; linking ties existing parts
  together so editing one edits all.
- **What a link shares:** dimensions, material, grain and cuts.
- **Each linked part keeps its own position and its own turn.** The user's example: four table legs
  share the same mortises and posture, and each is turned so its mortises face its own rails.

**The model cannot express that today.**
- `rotation` is `0 | 90`, and `axisDimensions` only says which dimension runs along each world axis.
  It has no direction.
- Today's 90° is therefore a mirror across the X=Z diagonal, not a rotation.
- Two parts with identical cuts can face those cuts toward (+X, +Z) or, at most, toward (−X, −Z),
  never toward (−X, +Z). One corner of a frame is always unreachable.

**Goal:** four true quarter turns about the vertical, so identical parts can face their cuts in all
four directions. The 3D view, snapping, the design checks, joinery and textures must agree on where
every cut is.

**The user's rulings, made in conversation:**
- **Three rounds.** Quarter turns first, then copy in a row, then linking.
- **True rotations, and migrate.** Existing 90° parts with cuts are rewritten on load so they look
  exactly as before. Rejected: a separate mirror flag.

## 2. The turn model

**`rotation: 0 | 90 | 180 | 270`**, all true rotations about the vertical, counter-clockwise seen
from above.

- **Posture is unchanged:** it picks which dimension points up.
- **h0 and h1** are the two remaining dimensions, in `[length, width, thickness]` order.
- **Reversed** means the part's coordinate 0 sits on the world MAX side of that axis.

| Turn | X carries | Z carries |
|---|---|---|
| 0 | h0 | h1 |
| 90 | h1 | h0, reversed |
| 180 | h0, reversed | h1, reversed |
| 270 | h1, reversed | h0 |

Y always carries the up dimension, never reversed.

**Turn 0 is today's mapping for every posture.** Within a posture, the four turns are proper
rotations of that turn-0 frame: no turn changes a part's handedness.

**Turning a part does not move it.** `reorientedPosition` keeps its X/Z centre and its Y min, as
today. A 0° ↔ 180° or 90° ↔ 270° turn keeps the footprint, and only the cuts swing to the opposite
faces.

## 3. One home for the mapping

`geometry.ts` gains **`axisFrame(board): [AxisMap, AxisMap, AxisMap]`** for world X, Y and Z, where
`AxisMap = { dim: Dimension; reversed: boolean }`. It is the ONE place the turn table lives.

- **`axisDimensions(board)`** becomes `axisFrame(board).map((a) => a.dim)`. Its many direction-free
  callers do not change.
- **Helpers beside `axisFrame`.** Every crossing between a part's frame and the world goes through
  these:
  - part coordinate → world, for one value and for a span;
  - world → part coordinate, for one value and for a span;
  - which END of a part (`'min' | 'max'`) faces a given world side on an axis.

**The sites that must use them.** These are every crossing found by a search, all of which ignore
direction today:

| Site | What it does |
|---|---|
| `cuts.ts` `solidWorldBox` | where the 3D view draws each solid |
| `cuts.ts` `pointToLocalXYZ` | where the 3D view draws each edge |
| `snapPoints.ts` `boardSnapPoints` | the world → part step that feeds `stockProbe` |
| `snapPoints.ts` `toWorld` | cut snap points |
| `designCheck.ts` `worldSolids` | overlap checks and joinery's blockers |
| `joints/pocket.ts` `pocketFor` | world box → `Cut` |
| `joints/recipes.ts` `resize` | world side → part end passed to `rebaseCuts` |
| `joints/recipes.ts` `cutIntoEnd` | world end → a cut's `from` |
| `viewport/grainFaces.ts` `faceGrainKinds` | swaps the ± face slots on a reversed axis |
| `viewport/grainTiling.ts` `boardUVs` | reflects the span on a reversed axis, BEFORE the swap (invariant 35) |

**Unchanged because they work only in the part's own frame or with world boxes:** `cutRegion`,
`clippedRegion`, `boardSolids`, `boardEdges`, `stockProbe`, `cutShape`, `openSides`, `depthField`,
`diagram`, `tenons`, `cutlist`, `nesting`, `faceContacts`, `sites.ts`, `choose.ts` and the
viewport's framing and gizmo.

**Generate keeps producing 0° and 90°** (`orient` in `generated.ts`). Its parts start uncut, so a
true 90° and today's 90° look identical, and joinery then cuts through the new mapping.

## 4. Migration: schema 7 → 8

**`CURRENT_VERSION` becomes 8.**

**The argument for the bump is wrong geometry,** as v7's was. A v7 build opening a v8 file falls
back to 0° for 180 and 270, losing the turn silently and showing a different shape, then autosaves
it. The version gate refuses the file instead.

**The step, `trueTurnsToV8`.** It is a per-board step on RAW data, before `validateBoard`, in version
order (invariant 11).
- **Which parts it touches:** a board with `rotation === 90` AND at least one cut. Every other board
  passes through byte-identical.
- **What it does:** old 90° carried h0 on Z forward, and new 90° carries it reversed. So every cut on
  such a board is mirrored along h0 (`u → board[h0] − u`). For a cut, exactly one of these applies,
  since `face`, `across` and the position axis are three different dimensions:
  - **`face === h0`:** `from` swaps `'min'` ↔ `'max'`;
  - **`across === h0`:** `stopMin` and `stopMax` swap;
  - **position axis === h0:** the interval is first CLIPPED exactly as `validateCuts` clamps it
    (offset into `[0, board[h0]]`, then width into `[0, board[h0] − offset]`; a cut the clamp drops
    is left raw for it to drop), and then `offset` becomes `board[h0] − (offset + width)`, one sum.
    Reflecting the raw interval is a different cut whenever it runs past an end (final-review C1).
- **What it proves:** every migrated part's world solids are identical to before. That is tested
  (§6). For values that are not dyadic (millimetre entry), "identical" means within `FLUSH_EPSILON`,
  invariant 22's rule for computed values.

**The visible cost.** It falls only on existing 90° parts with cuts.
- **A symmetric part** is the same physical part at the bench. Its cuts may now be measured from the
  other end or face. It may also fall into a different cut-list row from an identical-looking 0°
  part, because the row key compares stored cuts exactly (invariant 18).
- **A one-handed part** (for example a stopped dado stopped at one end only): its cut sheet changes
  hand to match the 3D model. Which of the two was right before depends on the open handedness
  question below.

**Rollback.** Rolling back past this round strands version-8 documents. Export first.

## 5. Recorded, not fixed: handedness across postures

Postures differ in handedness today.
- **Flat and upright** map `(length, width, thickness)` onto the world one way, and **on-edge** maps
  it the other way.
- **So changing posture mirrors a one-handed part's cuts in the 3D view.**
- **It is also not established** which handedness the printed cut sheet's drawings assume. Some
  orientations may therefore show a one-handed part as the mirror of its sheet.

This round does not change it. Turn 0 keeps each posture's frame exactly, so nothing gets worse. It is
filed as a new follow-up (**215**), to investigate the sheet's convention and to decide whether
postures should become proper rotations of one frame. Linking does not need it, because linked parts
share a posture.

## 6. Controls

**Properties' Turn select** offers 0°, 90°, 180° and 270° (single-part panel only; turn is not a
group field, multi-select spec §1).
- **It goes through `updateBoard`.** The existing reorient predicate and `reorientedPosition`
  handle it unchanged.
- **Held points:** a turn moves the part's cut snap points. A held grab, tape anchor or tape hover on
  one is dropped by `updateBoard`'s existing point-precise rule (invariant 24), so nothing new is
  needed.
- **No new keyboard shortcut.**

## 7. Testing

**Unit tests, every new one mutation-tested.**

1. **The mapping agrees everywhere.** For every posture × turn (12 poses), on parts carrying random
   cuts, these must all equal one reference computed from `axisFrame`:
   - `boardSnapPoints`, `cutSnapPoints` and `worldSolids`;
   - `solidWorldBox` centres and sizes;
   - `pointToLocalXYZ`;
   - `boardUVs`' additive constant, the interior number invariant 35 says catches a direction.

   Mutation: drop the direction in any one site, and this must go red.
2. **Turns are true rotations.**
   - **Next turn.** Rotating a part's world geometry 90° about its centre gives the same part at the
     next turn.
   - **Handedness.** Each turn's mapping has positive handedness relative to turn 0.
   - **Full circle.** Four turns return the part to where it started.
3. **Joinery round-trip.** In all 12 poses, a world box turned into a cut by `pocketFor` removes
   exactly that box. This extends invariant 41's probe-every-pose test from 6 poses to 12.
4. **Joinery on turned parts.** `resize` and `cutIntoEnd` on 180° and 270° parts grow, shrink and
   refuse at the correct end. Use the existing recipe fixtures, turned.
5. **Migration.**
   - **Geometry kept.** Every migrated 90° part with cuts has identical world solids before and after.
   - **Nothing else touched.** 0° parts, uncut 90° parts and parts in v8 files come through
     byte-identical.
   - **Per-field mirroring.** Each of the three cases rewrites only its own field.
   - **The version gate.** `migrateDocument` accepts version 8 and still refuses a version above
    `CURRENT_VERSION`. That is the gate a v7 build applies to a v8 file.
6. **Properties.** The Turn select offers four values, and 180° keeps the footprint.

**Browser.** The live check is on the dev server, with the user watching.
- **Turned legs:** a square leg with mortises on two adjacent faces at 0°, 90°, 180° and 270°. The
  mortises should face into each corner of a frame.
- **Snapping:** onto a cut corner of a 180° part.
- **Plywood bands:** a cut plywood part at 180° and 270° (invariant 35).
- **An old file:** import a v7 file with a 90° part with cuts. It should look unchanged.
- **Joinery:** one run on a design with turned parts. This is one paid call, only with the user's
  approval.

**Follow-up 26a** (software GL) does not bear on this: no shader changes.
