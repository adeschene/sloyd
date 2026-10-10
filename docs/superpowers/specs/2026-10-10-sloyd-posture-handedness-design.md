# Posture handedness and true sheet views — design (follow-up 215)

Date: 2026-10-10. Status: approved in conversation (approach and all three sections); this file is its
written form. Schema 11 → 12.

## 1. The problem (measured 2026-10-10, fu 215's probe)

**Postures differ in handedness.** `axisFrame` (`src/document/geometry.ts`) places a part's
(length, width, thickness) on world (X, Y, Z) at turn 0 as:

| Posture | X | Y (up) | Z | Determinant |
|---|---|---|---|---|
| flat | length | thickness | width | −1 (a mirror of the part's own basis) |
| on-edge | length | width | thickness | **+1** |
| upright | width | length | thickness | −1 |

Turns within a posture are proper rotations, so each posture keeps its hand at every turn. Consequences:
changing a part's posture mirrors a one-handed part's cuts on screen; and the cut list's row key omits
posture (`cutlist.ts`: "where a part sits, not how it is cut"), which holds only if postures share a hand
— today a flat and an on-edge part with the same stored one-handed cuts are mirror images in the model yet
share one row.

**Half the sheet's views are mirrored.** Every view draws its earlier in-plane dimension (by
`DIMENSION_ORDER`) growing right and its later one growing DOWN (SVG y), for BOTH sides of a face, so one
side of every face is the mirror of the face seen from outside. Against `axisFrame` for every
posture × turn × face × side: flat/upright draw T max, W min, L max true and T min, W max, L min mirrored;
on-edge the reverse.

## 2. The decisions (the user's)

- Unify handedness IN THE MODEL: change **on-edge** (flat and upright, the common postures, keep their
  frames exactly), by reversing its **thickness** axis — an on-edge part's broad faces trade the names
  min/max side (arbitrary for a board on edge); no dimension moves to another axis.
- Then draw every sheet view TRUE by flipping the **vertical** page direction on the views that are mirrored
  (length keeps reading left to right everywhere).

## 3. The model (schema 12)

**`axisFrame`.** For `posture === 'on-edge'`, the entry whose `dim === 'thickness'` has its `reversed`
flag toggled, in every turn. The turn table is otherwise unchanged; each turn remains a proper rotation of
the new turn 0 (the toggle composes with the turn because a quarter turn about Y carries thickness's world
direction along with it). Every dimension stays on the same world axis, so `axisDimensions`, extents,
`orient` (Generate), `documentToDesign` (Refine), grain face kinds and snap-point axes are unaffected. With
cuts mirrored (below) the world solids are identical, and `boardUVs` works in world-offset space, so every
UV is identical (verified by reading `grainTiling.ts`; the UV signature changes only because cut values do).

**The v11 → v12 step, `onEdgeToV12`.** Mirrors the stored cuts of every on-edge part along `thickness`
with the existing `mirrorCutAlong(cut, 'thickness', thickness)` (clip first, one sum, no snap — inv 44's
one legitimate hand reflection; do not tidy it):

- root parts (`doc.boards`) and parts inside definitions (`doc.definitions[].boards`) whose own posture is
  on-edge, against their own thickness;
- every Shape whose posture is on-edge, against the Shape's thickness (posture, thickness and cuts are
  SHARED fields — `LINK_FIELDS` — so all of a Shape's users are on-edge and mirroring the Shape once
  covers them all); shaped parts carry no cuts of their own.

**Placement.** AFTER validation (it needs validated posture and sizes, and for a file below v11 the Shapes
`linksToShapes` builds from the validated parts), AFTER the v10→v11 `linksToShapes` step and BEFORE
`repairTree`, guarded by `d.version < 12`. Like v8 it is **not idempotent** (it mirrors): the guard is all
that stops a v12 file being re-mirrored on every load. A pre-v8 file gets v8's mirror (raw, along h0 for
90° parts) and then this one; the steps compose in order. `CURRENT_VERSION` becomes 12; a build below 12
refuses a v12 file (the existing gate).

**Consequences.** Changing posture no longer mirrors a part's cuts. Two parts with the same stored cuts are
the same physical part whatever their posture, so the cut list's grouping becomes correct with no change
to its key; its comment gains one sentence saying why posture may be omitted (one hand everywhere since
v12). Joinery's recorded joints (`unjoin`) read cuts in the part's frame, so a migrated joined design still
passes the gate (pinned by a test). CLAUDE.md: invariant 44 (the turn table now has one posture-dependent
reversal; all postures share a hand), the Versioning table (a v12 row: per-part/per-Shape, after
validation; harm a build one version back would do: refuses the file — rollback strands projects), and
Status.

## 4. The sheet

- The views of **thickness / min**, **width / max** and **length / min** draw their vertical dimension
  growing UPWARD (their min edge at the bottom). The other three views are unchanged. With one hand in the
  model this is a fixed per-view rule, not posture-dependent.
- The flip is a per-view flag on `DiagramView` (e.g. `vUp: boolean`), set in `buildDiagrams`; the
  geometry (`h`/`v` spans in board inches, `cutRegion`) is unchanged. `PartDiagram` / `diagramScale`
  place vertical spans from the bottom when the flag is set.
- Leaders follow the drawing: position and stop leaders for the vertical axis measure from the edge that
  is the view's min end (the bottom on a flipped view), and their before/after (min/max) order follows the
  drawn direction. The prose ("from the width min end", "(max side)") keeps its names; the picture now
  shows which edge that is.
- Inv 19 holds (labels measured and drawn by the same strings; no font-size in CSS).

## 5. Tests

- **Turn table:** every posture has determinant −1 at every turn (replaces "turn 0 is unreversed for every
  posture" in `geometry.test.ts`); every turn is a proper rotation of turn 0, with `chiralPart` (inv 44).
- **Migration:** a hand-built v11 file with on-edge parts — at the root, inside a definition, linked (a
  Shape with two users), and turned 90° — loads with world cut solids identical to before (computed under
  the OLD frame by hand or by a frozen copy of the old mapping in the test, not by the code under test);
  flat and upright parts are byte-identical; loading the result again does not mirror again; a pre-v8
  on-edge 90° part passes both steps correctly; a migrated joined design passes `gateUnjoin`.
- **The probe as a test:** every posture × turn × face × side is a true view (determinant of
  (page right, page up, outward normal) mapped to world = +1), using `buildDiagrams`' flags.
- **Cut list:** a flat and an on-edge part with the same stored stopped dado are physically identical
  (same world-solid shape up to a rigid motion) and share a row.
- **Hand-written on-edge fixtures** (e.g. `snapPoints.test.ts`' posed on-edge board, `designCheck.test.ts`'
  on-edge rail tenons) get their expectations re-derived by hand.
- Mutation-test every new test. **Live check** on the dev server: an on-edge part with a stopped dado,
  saved under v11, looks the same after reload under v12, and its six sheet views read true.

## 6. Rollback

Schema 12: rolling back to a build understanding 11 refuses every project saved after the deploy (they
are v12). The deploy record says so and that exporting first is the remedy.
