# Sloyd — edge profiles, chunk 1: full-length profiles (design)

Date: 2026-10-17. Follow-up 365 (its full-length half), and fu 386 (a live drawing defect the probe found). Status: design
approved in chat by the user 2026-10-17 ("Yes, write the spec"); written spec approved by the user ("Approved, write the plan"); implemented, plan `docs/superpowers/plans/2026-10-17-sloyd-edge-profiles.md`. **No schema change** (17):
rolling this chunk back costs nothing.

## 1. Purpose and rulings

Routed edges (roundover, cove, ogee, bead, thumbnail) are on nearly every piece. Today a woodworker can get a roundover only
by knowing that a Rounded corner whose Through is set to Length rounds a long edge. A cove or an ogee needs a hand-written
file, and even then it reads as "Curve: 1 arc and 2 lines".

**The probe (2026-10-17, before this spec).** On a 36 × 20 × 3/4 top and 36 × 10 × 3/4 shelves, a full-length profile is
already an ordinary `CurveCut` running along the edge (`through` = the edge's run).

| Case | Faults | Path | Watertight | Rebuild, min of 9 |
|---|---|---|---|---|
| Four 3/8" roundovers (two along the length, two along the width) | none | clip | 0 open edges | 5 ms |
| A 3/8" cove | none | split | 0 | 2 ms |
| A 3/8" Roman ogee, both S orientations | none | split | 0 | 4–6.5 ms |
| Mixed axes (roundovers and coves) | none | mixed | 0 | 12 ms |

What is missing is identity, rows and words. It also found **fu 386**: with curves on BOTH `through` axes (a top rounded on
all four edges), the exploded isometric loses its outline: 24 visible segments where the two long edges alone give 58.

User rulings (brainstorm, 2026-10-17):

- **R1 Chunks.** Chunk 1 (this spec) covers full-length profiles plus the fu 386 fix, with no schema change. Chunk 2 covers
  stopped profiles and blind curved recesses, with one stored range along `through` (schema 18, its own spec). A scooped
  seat is a doubly-curved surface outside the line/arc prism model: out of scope.
- **R2 Joinery.** `curvedRefusal` stays: Add joinery, Refine and Repair refuse a profiled project, as they refuse every
  curved one. Joinery acceptance stays with fu 363.
- **R3 Placement.** Profiles get their own **Profiles** section with `+ Add profile ▾`. Each row has an Edge (the Chamfer
  row's vocabulary), a Profile and its sizes. A profile shape running along a length or width edge reads as a profile; the
  same shape running through the thickness stays a Curves **Rounded corner**.
- **R4 The set.** Roundover, Cove, Roman ogee, Bead, Thumbnail, and an optional **Fillet** on roundover, cove and ogee.
- **R5 Grain.** The accepted arc grain seam (fu 336) stands for profiles too. Chunk 1 records how it looks on real hardware.
- **Approach A** (chosen). Profiles are plain `CurveCut`s recognised structurally, as Arch, Bow and Rounded corner are.
  Rejected:
  - B, a stored `profile` tag: a schema bump for nothing the shape does not already say.
  - C, a `Board.profiles` array: it would duplicate the curve pipeline.

Non-goals:
- stopped profiles and recesses (chunk 2);
- scooped or dished surfaces;
- profiles that follow a curved edge (a roundover around an arch);
- joinery on profiled parts;
- a grain fix;
- Generate/Refine writing profiles (fu 363).

## 2. The profiles

### 2.1 Frame

A profile sits on one of the part's edges that runs along the **length or the width**. `through` is the edge's run, and
`[u, v] = uvDims(through)`. The edge's corner is stored as `uFrom` / `vFrom`; in local `(u, v)` it is `(0, 0)`, with wood
toward +u and +v.

Each outline is written in a **canonical frame `(a, b)`**:
- **a** runs along the **top** face T, measured into that face from the corner;
- **b** runs along the **edge** face E, down from T.

`Facing` picks which of the two faces is T:
- `facing: 'v'` means T is the face at v = 0, i.e. dimension v's `vFrom` side. Then `(u, v) = (a, b)`.
- `facing: 'u'` means T is the face at u = 0. Then `(u, v) = (b, a)`: points swapped and every arc's `side` flipped (a
  reflection reverses travel handedness).

A symmetric profile (Roundover or Cove with no fillet) is written with `facing: 'v'` and reads back as either.

Arc sides follow `arcOf`: bowing LEFT of travel puts the centre on the right. Every outline starts at `(0, 0)` and closes
exactly there (P1). Each arc's radius is stored as `radius` (never `rise`), computed by the same expression in writer and
reader so the bits agree.

### 2.2 Outlines (canonical frame; `f` = fillet, 0 = none)

| Profile | Fields | Waste outline, from (0,0) | Arc centres |
|---|---|---|---|
| **Roundover** | radius r, fillet f | line (r+f, 0); arc **left** r to (f, r); line (0, r) when f > 0; line (0, 0) | (r+f, r): convex, tangent to both faces |
| **Cove** | radius r, fillet f | line (r+f, 0); arc **right** r to (f, r); line (0, r) when f > 0; line (0, 0) | (f, 0): concave, sharp at both faces |
| **Roman ogee** | size s, fillet f | line (s+f, 0); arc **right** s/2 to (s/2+f, s/2); arc **left** s/2 to (f, s); line (0, s) when f > 0; line (0, 0) | (s/2+f, 0) then (s/2+f, s): concave entering T sharp, convex rolling onto E tangent |
| **Bead** | radius r, quirk k | line (r+k, 0); line (r+k, k); line (r, k); arc **left** r to (0, r+k); line (0, 0) | (r, r+k): a roundover set k below T behind a k × k quirk, tangent into the quirk floor and onto E |
| **Thumbnail** | reach a, depth d (d < a) | line (a, 0); arc **left** R to (0, d); line (0, 0), with R = (a² + d²) / (2d) | (a, R): tangent to T, a crisp line on E |

- Roundover with f = 0 is **exactly** `cornerCurve({ through, uFrom, vFrom, radius: r })`: its bytes are pinned against
  `cornerCurve` in a test.
- A fillet sets the profile f in from the edge face, leaving an f-wide shoulder on E, as a bit set deeper than tangent does.
- Every arc is minor:
  - the quarter arcs (roundover, cove, bead, each ogee half) have radius ≥ half their chord;
  - the thumbnail's central angle is acos((R − d) / R) < 90°.

### 2.3 Module: `document/profiles.ts`

```ts
export type ProfileKind = 'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail';
export interface ProfileEdge { through: 'length' | 'width'; uFrom: CutFrom; vFrom: CutFrom }
export interface ProfileFields extends ProfileEdge {
  kind: ProfileKind; facing: 'u' | 'v';
  size: number;        // roundover/cove/bead: radius; ogee: s; thumbnail: reach a
  depth?: number;      // thumbnail only: d
  fillet?: number;     // roundover/cove/ogee: f (absent or 0 = none); bead: the quirk k (required, > 0)
}
export function profileCurve(f: ProfileFields): Omit<CurveCut, 'id'>;
export function profileFields(c: Omit<CurveCut, 'id'>): ProfileFields | null;
export function defaultProfile(board: Pick<Board, Dimension>, kind: ProfileKind, edge?: ProfileEdge, facing?: 'u' | 'v'): Omit<CurveCut, 'id'>;
export const PROFILE_EDGES: readonly ProfileEdge[];   // the 8 edges whose run is length or width
```

The module's runtime imports are `curves` and `geometry` only.

- **`profileFields` reads by rewriting.** For a curve whose `through` is `length` or `width`, and for each kind and each
  facing, it lifts the candidate parameters from the stored points, writes them with `profileCurve`, and returns the first
  candidate whose output deep-equals the stored curve (ids aside). It returns null for anything else, including every
  `through: 'thickness'` curve (R3). An exact, structural reading, like `archFields` and `cornerFields`.
- **Bead** stores its quirk in `fillet` (required, > 0) so one field carries the step.
- **`defaultProfile`** uses the router-bit sizes:

  | Profile | Default |
  |---|---|
  | Roundover | 1/4" |
  | Cove | 3/8" |
  | Ogee | 1/2" |
  | Bead | 1/4" with a 1/16" quirk |
  | Thumbnail | 3/4" × 1/4" |

  - Fillet is 0.
  - The default edge is the top long edge: `through: 'length'`, `uFrom: 'max'` (width max), `vFrom: 'max'` (thickness max),
    `facing: 'v'` (top = thickness max).
  - Every length is scaled by one factor `k = min(1, (board[aDim] / 2) / aExtent, (board[bDim] / 2) / bExtent)`, where
    `aDim`/`bDim` are the dimensions the canonical a and b axes run along under the facing, and `aExtent`/`bExtent` are the
    profile's extents along them. So a thin strip still gets a proportionate profile, and a thumbnail's 3/4" reach along a
    20" top is not shrunk by the 3/4" thickness. *Amended (planning, 2026-10-17): per axis; one factor over both axes'
    minimum would have halved the thumbnail on every 3/4" top.*
- **Mirroring (inv 44).** `mirrorCurveCut` flips `uFrom`/`vFrom` and never touches coordinates, so a mirrored profile reads
  back as the same kind with the mirrored edge. This is pinned with `chiralCurved`-style fixtures across all 8 edges × both
  facings.

### 2.4 Rounded corner vs Roundover (R3)

A Rounded corner IS a roundover of the edge running along `through`. The rule is display only, by `through`:
- `through: 'thickness'` reads as a Curves **Rounded corner** (`cornerFields`, unchanged). `profileFields` returns null.
- any other `through` reads as a **Roundover** profile.

Consequences:
- The Curves section lists only curves `profileFields` rejects.
- The Rounded corner row's **Through** select is removed: a corner through the length is a Roundover, so it is added under
  Profiles.
- The Curves Kind select offers "Rounded corner" only when the curve's `through` is `thickness`.
- A stored corner through the length or width (possible on master today) appears under Profiles after this chunk, unchanged
  in its bytes.

## 3. Properties: the Profiles section

`panels/Profiles.tsx`, after Curves.

- **Heading:** `Profiles · n`. **Menu:** `+ Add profile ▾` with Roundover, Cove, Roman ogee, Bead, Thumbnail, each through
  `defaultProfile` on the default edge, one `addCurves` call (one undo entry). Following the existing precedent, a preset
  whose default would fault (`curveFaults`, or a hole put into its waste) is **withheld**. Details are in the project's
  units, e.g. `1/4" radius, on the top long edge`.
- **A row:** the bench line, then these controls.
  - **Edge:** a select over `PROFILE_EDGES`, worded as the Chamfer row's edges (`Width max side · thickness max side`).
  - **Profile:** a select over the five kinds. A change keeps the edge and facing and takes the new kind's default sizes
    (`defaultProfile(board, kind, edge, facing)`), the Kind-select rule.
  - **Size fields:**
    - Radius (roundover, cove, bead);
    - Size (ogee);
    - Reach and Depth (thumbnail);
    - Fillet (roundover, cove, ogee; 0 = none);
    - Quirk (bead).
  - **Facing:** shown for ogee, bead, thumbnail and any profile with a fillet > 0. Its options read `Top: <face>`, for the two
    faces of the edge.
  - **Remove.**
- **Refusals** reuse the curve row's rules, moved out of `Curves.tsx` into a shared `panels/curveRefusal.ts`
  (`pastHalfCircle`, `refusalFor`, `holeRefusal`, unchanged) so both sections call one decider:
  - an edit is refused when it would pass a half circle, ADD a curve fault, or put a hole into the waste;
  - a fault a later resize causes is KEPT and noted (`… at this size.`);
  - Thumbnail's Depth must be less than its Reach (`Depth must be less than the reach`);
  - Fillet ≥ 0;
  - min/max refuse, never clamp (`DimensionField`).
- **Stored writes** go through the existing `addCurves`, `updateCurve` and `removeCurve`. No store change.

## 4. Words and drawings

- **Bench line** (`curveText.ts`, `curveLineBase`, which dispatches to `profileLine` when `profileFields` reads). Faces are
  named with `angleText`'s `faceName`. Examples:
  - `Roundover 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length`;
  - `Cove 3/8" …`;
  - `Roman ogee 1/2" …, top on the thickness face (max side)`;
  - `Bead 1/4" with a 1/16" quirk …, top on …`;
  - `Thumbnail 3/4" × 1/4" …, top on …`;
  - a fillet adds `, with a 1/16" fillet`;
  - a faulted profile ends with `— check: …` (existing).
- **The four-edge collapse** (`curveLineEntries`, THE home of collapses). Four profiles with equal kind, sizes, fillet and
  top face, on the four edges of one face, collapse to one entry:
  `Roundover 1/4" on all four edges of the thickness face (max side)`. That face is their shared T, or for a symmetric
  roundover or cove, their shared corner face. The existing four-corner collapse is unchanged.
- **Plans key line** (`featureKeys.ts`, `partFeatures`): the profile's short words, `Roundover 1/4"` or
  `Roman ogee 1/2" (4×)`, never positions.
- **Part diagrams:** notes come from `curveLineEntries` as today. The waste hatch and the sharp-vertex lines are unchanged.
  - A roundover draws no line at its tangent ends (inv 16).
  - A cove draws a line at both ends.
  - An ogee draws one at its sharp T entry only, none at its tangent S join or its tangent E end.
  - A thumbnail draws one on E.
  This is pinned per profile.
- **fu 386** is diagnosed (superpowers:systematic-debugging) and fixed test-first, in `drawView` or in the curved part's
  occluders/edges, wherever the cause is. The pin: a top with four roundovers (two axes) draws its exploded isometric with
  every outline segment the single-axis pairs draw, plus the segment-count and identity checks the drawing tests already
  use. It is the plan's first task: the feature's main use case depends on it.

## 5. Performance and watertightness

- `viewport/curvesPerf.test.ts` gains:
  - a top with four roundovers on two axes;
  - a shelf with an ogee and a bead, mixed axes;
  each at most 40 ms, the minimum of 9.
- `viewport/curvesWatertight.test.ts` gains the same two parts plus a cove, a thumbnail and a filleted ogee (every directed
  edge matched).
- The probe measured 2–12 ms; these pin it.

## 6. Testing

TDD throughout; every refusal, withhold, collapse and reader test is mutated. The tests cover:

- **`profiles.test.ts`:**
  - each writer's exact outline and arc centres (`arcOf`);
  - Roundover f = 0 byte-equal to `cornerCurve`;
  - read-by-rewrite round trips for 5 kinds × 8 edges × 2 facings × fillet 0 / > 0;
  - null for every `through: 'thickness'` curve and for each existing Arch, Bow and odd curve;
  - mirroring;
  - `defaultProfile` scaling on a thin strip;
  - `curveFaults` empty for every default on a 3/4" board.
- **`curveText` tests:** each bench line, metric, the four-edge collapse (and a non-collapse when one differs), and a
  faulted profile.
- **Panel tests (`Profiles.test.tsx`):**
  - add (one undo entry), withhold, each field, the Profile change, Facing shown or hidden, refusals;
  - the Curves section no longer listing profiles;
  - the corner row's Through select gone;
  - Kind's Rounded corner gated on `through`.
- **Drawings:** fu 386's pin; the sharp-line rule per profile.
- **Live pass on the dev server (Playwright).** A table top with four roundovers, a shelf with an ogee, a bead and a
  thumbnail, then:
  - the viewport, the Plans sheet (exploded and trio) and the part diagrams;
  - metric;
  - a stored through-length corner from before the chunk, appearing under Profiles.
  Test projects are left in place (the user's ruling). The look on real hardware (the seam, R5) is owed to the user's eye.

## 7. Follow-ups this chunk leaves

- **Chunk 2 (fu 365's remainder):** stopped profiles and blind curved recesses, via one stored range along `through`
  (schema 18).
- Profiles following a curved edge, and scooped seats: recorded as out of model.
