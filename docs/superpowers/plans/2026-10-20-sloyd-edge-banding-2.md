# Edge banding, chunk 2 (on screen and on paper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bands become visible: in the viewport a banded edge takes its band's look and a solid band draws its glue lines;
the Plans sheet draws glue lines and keys every banded part; part diagrams mark banded sides, note the band and the core
size, and a strip row's diagram draws its mitred ends.

**Architecture:**
- ONE new pure geometry function, `glueLines` in `banding.ts`: board-local segments for each unfaulted solid band's glue
  line on both broad faces, trimmed per the corner rule. The viewport and the Plans sheet both read it.
- The viewport paints by a POST-PASS over the existing mesh (`viewport/bandFaces.ts`, `bandedMesh`): triangles lying on a
  banded side's outline stretch move into extra material groups (index 6 and up). `bodyMesh`, `partMesh`, `boardBodies`
  are untouched. A part with no unfaulted band never reaches the pass, so its mesh is byte for byte what it was.
- Band types reach `drawView`, `partFeatures` and `buildDiagrams` as an OPTIONAL argument defaulting to none, so every
  existing caller and every band-free drawing, key list and diagram is byte for byte unchanged.

**Tech Stack:** TypeScript, React, react-three-fiber, Vitest. `npm test` does NOT typecheck; `npm run build` is the gate.

**Spec:** `docs/superpowers/specs/2026-10-19-sloyd-edge-banding-design.md` §8 "Chunk 2" (and §3.2 for the corner rule,
§7 for what stays un-split). Read §2.2, §3, §7, §8 before any task.

## Amended (planning)

Copied into the spec as *Amended (planning, chunk 2)* blocks in Task 5, for the user's review (Q1 is the user's ruling):

- **Q1 — a banded part's diagram is drawn at the FINISHED size** (the user's ruling, 2026-10-20, fu 395(1): "Finished +
  marks + core note"): heavy marks on the banded sides, the band line as a note, and a second note giving the core when it
  differs: `Drawn at the finished size; cut 35-1/2" × 19-1/2" before banding.`
- **Q2 — the viewport paints by moving triangles, not by recolouring a material slot.** A slot holds every face pointing one
  way (a dado wall, a hole facet, an internal seam), so the band look goes only to triangles lying ON the side's outline
  stretch. A banded part's bodies are then all drawn through `bodyMesh` (not `BoxGeometry`), which is visually the same.
- **Q3 — the looks.** Tape: the PART's material and colour with its long-grain texture (`wood → 'edge'`, `plywood → 'face'`,
  `mdf → 'face'`: no plies). Solid: the BAND's material colour and its `'edge'` texture. UVs on a band face are rewritten:
  u = distance along the side's stretch / tile u + the board's u offset, v = the thickness coordinate / tile v (tiles from
  `TILES[family][kind]`; none of the three looks uses FIT). Per-board variation stays in the UVs (inv 12).
- **Q4 — only SOLID bands draw glue lines** (spec §8: "a solid band draws its glue line"); a tape band with thickness draws
  none. A faulted band is painted with nothing and draws no line or mark (it already contributes nothing, §3.4).
- **Q5 — glue line extents** (§3.2's corner rule as lines): a strip that RUNS THROUGH draws its glue line over the part's
  full side length; one that GIVES WAY, or any strip under Mitred, draws it from core corner to core corner. Under Mitred a
  corner where both sides carry an unfaulted band with thickness also draws the mitre line, core corner to finished corner,
  ONCE: on the long-edge strip when it is solid, else on the end strip.
- **Q6 — Plans keys: one key line per (part, band type)**, `<type name>[ <thickness>]: <sides>` — `Maple edging 1/4": width
  min side, width max side`, `Iron-on veneer: length min end` (thickness omitted at 0). Its tag sits on the glue lines and
  on the part's own outline edges lying on a straight banded side's plane (so tape is keyed too). A band on a CURVED side
  (tape on an arch) is keyed through its stretch's chords: its feature's `tags` also list `featureTag(part, 'curve', id)`
  for every curve id on those chords (`owns` matches any listed tag), so no segment is retagged. An edge lying on two
  banded side planes (a corner's through-thickness edge) takes the FIRST side's tag in `BAND_SIDES` order.
- **Q7 — a strip's diagram** is its blank (cut length × band thickness, chunk 1's view) with each mitred end's waste drawn
  as a hatched polygon: the long point sits on v = 0 (the strip's finished edge), half the length allowance in from the
  blank's end; the short point on v = width, `n = width · tan(mitre)` further in. A square end draws nothing new. The view
  is not to scale (the sliver clamp makes sx ≠ sy, so a mitre reads steeper than it is; the setup line gives the angle).

## Global Constraints

- **Byte for byte, band-free:** `drawingIdentity.test.ts`, `diagramIdentity.test.ts`, `bandFreeIdentity.test.ts`,
  `profilesFinal.test.ts`, `PartDiagram.test.tsx`'s fingerprint, `bodyMeshIdentity.test.ts`, `sweptIdentity.test.ts` stay
  green UNCHANGED. Never re-capture a pin. A new field on `DiagramView` is OPTIONAL and set only on a banded view (the
  `sweeps?` precedent); `Seg2.feature` stays ABSENT (not undefined) on untagged segments.
- **No body changes** (spec §7): `boardBodies`, `bodyMesh`, `partMesh`, `partGeometry` untouched.
- `banding.ts` imports no `units` (inv 52). Strings are built in `bandText.ts`, `featureKeys.ts` (→ units) and copied
  verbatim by `diagram.ts` (inv 19).
- Every part↔world crossing goes through `toWorld` / `fromWorldOffset` / `pointToLocalXYZ` (inv 44); never `board[dim] − u`.
- Sides: `ProfileSide { across, from }`; `across: 'width'` is a long edge running along `length`, `across: 'length'` an end
  running along `width`. Canonical order `BAND_SIDES` (width-min, width-max, length-min, length-max). Side words without the
  article: `edgeName(...).slice(4)` → `width min side`.
- Tolerances: document-level tests (Task 1, Task 3's local endpoints, Task 4) compare exact or within `1e-9` (inv 22).
  The viewport post-pass (Task 2) reads FLOAT32 positions, so it uses `tol = 8 · 2⁻²³ · max(extents)` (a few float32 ulps
  of the part's largest coordinate) for both its on-chord and its normal test — never `1e-9` there.
- Branch `edge-banding-2` from master (Task 1 Step 0). Commit after each task, message ending
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Merge locally `--no-ff`; no pull request.

## Review Focus

1. **A turned or mirrored banded part.** The band look and glue lines must land on the band's world side for an upright,
   on-edge or quarter-turned part and for a mirrored copy (bands arrive flag-flipped through `placeBoard`). Task 2 pins the
   look on an upright 90° part; Task 3 pins a mirrored instance's tag on the Plans sheet.
2. **A band type edit with the same parts.** `withBandTypes` keeps `doc.boards`, so a cache keyed on the parts array
   (PlanFigure's `trioCache`, BoardMesh's memo) serves stale lines. Task 2 keys the memo on `bandViewSignature`; Task 3
   keys the trio cache on band types and pins it.
3. **A faulted band** (`too-thick`, a solid band on an arch): no paint, no glue line, no mark — but still keyed with
   ` — check the cut list` and noted. Tasks 1, 3, 4 pin it.
4. **The section plane through edging.** Viewport glue lines join the clipped edge buffer (automatic); on the Plans sheet a
   glue line on the removed side must vanish. Task 3 pins the section case.
5. **A rabbet or dado on a banded edge.** Only triangles ON the side's stretch take the look — a dado wall facing the same
   way keeps the part's. Task 2 pins it.

---

### Task 1: `glueLines` — the glue line geometry

**Files:**
- Modify: `src/document/banding.ts` (add `GlueLine`, `glueLines`; reuse the private per-side thickness from `judge`)
- Test: `src/document/banding.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GlueLine { side: ProfileSide; type: string /* band type id */; a: Point; b: Point } // Point: cuts.ts, board-local
  export function glueLines(part: Board, types: readonly BandType[]): readonly GlueLine[]
  ```
  Memoised per (part, types) and deep-frozen like the other results. Order: sides in canonical order; per side the run
  line at thickness 0, then at `part.thickness`, then its mitre lines (end 0 then end 1), each at 0 then `part.thickness`.
  `[]` when the part has no unfaulted solid band.

- [ ] **Step 0: Branch.** `git checkout -b edge-banding-2`
- [ ] **Step 1: Write the failing tests** in `banding.test.ts`, `describe('glueLines')`. Fixture: a 36 × 20 × 0.75 plywood
  part; a solid type `maple` (thickness 0.25); a tape type `tape16` (thickness 1/16); the built-in tape (thickness 0). A
  helper `at(g)` maps a line to `{ side: \`${across}-${from}\`, a, b }` with `[length, width, thickness]` triples.
  - `long rule, four solid sides`: 8 lines. width-min: `[0,0.25,0]→[36,0.25,0]` and the same at thickness 0.75;
    width-max at width 19.75 over length `[0,36]`; length-min at length 0.25 over width `[0.25,19.75]`; length-max at
    length 35.75 over the same.
  - `ends rule`: width-min over length `[0.25,35.75]`; length-min over width `[0,20]`.
  - `mitre rule`: 16 lines; every run line core corner to core corner; four mitre lines on the LONG sides only, e.g.
    width-min's end 0 `[0.25,0.25,0]→[0,0,0]` and end 1 `[35.75,0.25,0]→[36,0,0]`; none on length-min / length-max.
  - `mitre, solid long side, built-in tape end`: width-min over `[0,36]`, no mitre line (a zero-thickness neighbour).
  - `mitre, solid ends, tape16 on width-min`: length-min over width `[0.0625,20]` and its mitre line at end 0
    `[0.25,0.0625,·]→[0,0,·]` (the long side is tape, so the end strip draws it); tape draws no glue line.
  - `faulted draws nothing`: solid 12" bands on both ends of a 20"-long part (too-thick) → `[]`.
  - `tape only → []`; `no bands → []` and the same frozen object on a second call with the same (part, types).
- [ ] **Step 2: Run** `npx vitest run src/document/banding.test.ts -t glueLines` → FAIL (`glueLines` not exported).
- [ ] **Step 3: Implement `glueLines`** per Q5. With `t[i]` the unfaulted band thickness per `BAND_SIDES` index (0 when
  none/faulted) and `nb = long ? [2,3] : [0,1]`: offset `o = from === 'min' ? t[own] : part[across] − t[own]`; run dimension
  `r = long ? 'length' : 'width'`; `through = rule === 'long' ? long : rule === 'ends' ? !long : false`; `lo = through ? 0 :
  t[nb0]`, `hi = part[r] − (through ? 0 : t[nb1])`. Mitre line at end k when `rule === 'mitre'` and `t[nb_k] > 0`, skipped on
  an end strip whose neighbour long side holds an unfaulted SOLID band: from (r = k ? hi : lo, across = o) to (r = k ?
  part[r] : 0, across = from === 'min' ? 0 : part[across]).
- [ ] **Step 4: Run** the file → PASS. Mutate: swap `through`'s two branches, and drop the long-side skip — each must turn a
  test red; restore.
- [ ] **Step 5: Commit** `edge banding 2: glueLines — the glue line geometry per corner rule`

---

### Task 2: Viewport — band looks and glue lines

**Files:**
- Create: `src/viewport/bandFaces.ts`, `src/viewport/bandFaces.test.ts`
- Modify: `src/viewport/grainTiling.ts` (export `tileOf(family: GrainFamily, kind: GrainKind): [number, number]` reading `TILES`)
- Modify: `src/viewport/BoardMesh.tsx` (props, the `geometries` and `edges` memos, the materials list)
- Modify: `src/viewport/Viewport.tsx` (~:503: pass `bandTypes={doc.bandTypes}` and `catalog={catalog}`)

**Interfaces:**
- Consumes: `glueLines` (Task 1); `bandFaults`, `strips` (chunk 1); `faceOutline`, `sideStretch` (`profilePath.ts`);
  `fromWorldOffset`, `axisFrame` (`geometry.ts`); `grainFamily` (`grainFaces.ts`); `boardUVOffset`, `PartMeshData`.
- Produces (`bandFaces.ts`):
  ```ts
  export interface BandLook { side: ProfileSide; material: string; family: GrainFamily; kind: GrainKind }
  export function bandLooks(board: Board, types: readonly BandType[]): readonly BandLook[]   // unfaulted bands, canonical order
  export function bandViewSignature(board: Board, types: readonly BandType[]): string        // '' when no look and no glue line
  export type MeshData = { positions: Float32Array; uvs: Float32Array; normals?: Float32Array; groups: { start: number; count: number; materialIndex: number }[] };
  export function bandedMesh(board: Board, looks: readonly BandLook[], meshes: readonly MeshData[]): MeshData
  ```
  `bandedMesh` concatenates the meshes (groups 0–5 kept in BoxGeometry order, as `concatMeshes` lays them) and moves each
  triangle lying on look i's side into group `6 + i`, rewriting its UVs per Q3. `normals` present in the output only when
  every input has them. `bandViewSignature` = for each unfaulted band: side, kind, thickness, material (solid), plus
  `cornerRule` when any glue line exists.

- [ ] **Step 1: Write the failing tests** in `bandFaces.test.ts` (build inputs with `partGeometry(b).bodies.map((x) =>
  bodyMesh(b, x, [], bodies))`):
  - `a tape band paints its side only`: a 30 × 11.25 × 0.75 plywood part, built-in tape on width-max. Output has a group
    with `materialIndex: 6` and `count: 6`; every vertex of it maps back (through `fromWorldOffset`, extents/2 added) to
    local width 11.25; the total vertex count equals the input's.
  - `the look`: `bandLooks` → `[{ side: width-max, material: <part>, family: 'plywood', kind: 'face' }]`; a solid maple band
    → `{ material: 'maple', family: 'wood', kind: 'edge' }`.
  - `UVs follow the side`: for every vertex in group 6, `uv[1] − t / 16` is 0 (t the local thickness) and `uv[0] − σ·l / 24`
    is one constant for a single σ ∈ {1, −1} (l the local length: the stretch may run either way round the outline;
    plywood face tile 24 × 16; inv 35's interior-number rule).
  - `a turned part`: posture `upright`, rotation 90 — the moved triangles still map back to local width 11.25.
  - `a dado facing the banded side keeps the part's look`: the part with a dado whose wall faces +width — group 6 still
    holds 6 vertices, all at width 11.25.
  - `a metric part paints too`: 762 × 305 × 19 mm (`mm(762)`, … from `holes.ts`: non-dyadic) taped on width-max → group 6
    holds 6 vertices.
  - `an arched tape side`: an Arch on width-max (`defaultArch`), tape there — group 6 holds the arch's chord faces (every
    vertex within `tol` of a chord of `sideStretch`), more than 6 vertices.
  - `UVs off the band faces are what BoxGeometry drew`: for a plain box part, `bodyMesh`'s (vertex → uv) set per group 0–5
    equals `boardUVs`' per BoxGeometry face (as sets, positions keyed at float32), so adding a band does not jump the grain
    on the other faces.
  - `a faulted band paints nothing`: `bandLooks` is `[]` for a solid band on the arched side.
  - `bandViewSignature`: `''` for no bands; changes when the band type's thickness or material changes with the same part.
- [ ] **Step 2: Run** `npx vitest run src/viewport/bandFaces.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `bandFaces.ts`.** A triangle belongs to look i when its local normal has |thickness component| ≤
  1e-9 relative to its length, its normal points away from the part (dot with the side's outward local direction > 0), and
  all three vertices' (length, width) lie within 1e-9 of ONE chord of `sideStretch(board, faceOutline(board), side)`
  (straight sides: one chord). s = chord-start distance along the stretch + projection on that chord. Memoise the stretch
  per call, not across calls.
- [ ] **Step 4: Run** → PASS. Mutate: drop the outward-normal test (the dado case must fail); set `tol` to `1e-9` (the
  metric case must fail); restore. If the BoxGeometry-UV test fails, stop and report: the routing in Step 5 then needs the
  user's decision (it is not to be "fixed" by changing `bodyMesh`).
- [ ] **Step 5: Wire `BoardMesh.tsx`.** Props gain `bandTypes: readonly BandType[]` and `catalog: MaterialCatalog`.
  `looks = bandLooks(board, bandTypes)`. In `geometries`: when `looks.length > 0` and the part has bodies, build ONE
  geometry from `bandedMesh(board, looks, bodies.map((x) => bodyMesh(board, x, holes, bodies)))` (normals from the data
  when present, else `computeVertexNormals`), in place of the box/bodyMesh branches; the shaped branch passes its
  `partMesh` result as the one input. Holes stay their own geometry. Add `bandViewSignature(board, bandTypes)` to the memo
  deps. Materials: the six as today, then one per look: `map={faded ? null : grainTexture(look.family, look.kind)}`,
  `color={faded ? fadedColor : look.material === board.material ? color : catalog.color(look.material)}`, the same
  clipping and key pattern (`${6 + i}-${look.kind}-${faded}`).
- [ ] **Step 6: Glue lines in `edges`.** Append `glueLines(board, bandTypes).flatMap(({ a, b }) => [...pointToLocalXYZ(board,
  a), ...pointToLocalXYZ(board, b)])` to the edge buffer (after the rims), and add `bandViewSignature` to its deps. Same
  material, so the section plane clips them (inv 51).
- [ ] **Step 7: Run** `npm run build` → passes; `npx vitest run src/viewport` → green, `bodyMeshIdentity` and
  `sweptIdentity` unchanged.
- [ ] **Step 8: Commit** `edge banding 2: viewport — band looks by triangle, glue lines in the edge buffer`

---

### Task 3: Plans sheet — glue lines and band keys

**Files:**
- Modify: `src/document/drawing.ts` (`drawView` opts; `partSegments` band tagging; the glue segments)
- Modify: `src/document/featureKeys.ts` (`FeatureKind` gains `'band'`; `partFeatures` third parameter)
- Modify: `src/panels/PlanFigure.tsx` (`trioDrawings`/`trioScale` take band types; `PlanTrio`, `ExplodedFigure`,
  `SectionBlock` props), `src/panels/PlansSheet.tsx` (pass `doc.bandTypes`)
- Test: `src/document/drawingBands.test.ts` (new), `src/document/featureKeys.test.ts`, `src/panels/planKeys.test.ts`

**Interfaces:**
- Consumes: `glueLines` (Task 1), `bandFaults`.
- Produces:
  ```ts
  drawView(parts, view, offsets?, opts: { hiddenLines?: boolean; section?: Section; bandTypes?: readonly BandType[] } = {})
  partFeatures(b: Board, units: Units, bandTypes: readonly BandType[] = []): PartFeature[]
  trioDrawings(parts: readonly Board[], bandTypes: readonly BandType[]): readonly [Drawing, Drawing, Drawing]
  // band tag: featureTag(part.id, 'band', bandTypeId)
  ```

- [ ] **Step 1: Write the failing tests** (`drawingBands.test.ts`):
  - `glue lines are tagged segments`: the four-side maple part (long rule) in TOP with `bandTypes` → 4 visible segments
    tagged `p:band:maple` on the near broad face lying at the glue offsets; FRONT → the far face's glue lines hidden.
  - `outline edges on a straight banded side carry the tag`: built-in tape on width-min → the outline edges at width 0
    carry `p:band:band-iron-on`; edges elsewhere carry no `feature` key (`'feature' in s === false`).
  - `a corner edge takes the first side's tag`: maple on width-min and length-min → the through-thickness edge at
    (length 0, width 0), seen in FRONT or SIDE, carries `p:band:maple` once; with built-in tape on width-min and maple on
    length-min it carries `p:band:band-iron-on` (width-min comes first).
  - `no band types → no band segments`: the same part with `bandTypes` omitted draws exactly what a band-free copy draws.
  - `a section removes the far side's glue line`: a Side section at width 10 kept toward min → no `band` segment at width
    19.75.
  - `a mirrored instance`: a definition holding the part banded on width-min, placed mirrored across width
    (`assemblyDoc`-style fixture, `worldParts`) → its tagged glue line lies at the world position of the part's width-max
    side.
  - `faulted bands draw nothing`: too-thick ends → no `band` segment.
  In `featureKeys.test.ts`: `band keys` → `['Maple edging 1/4": width min side, width max side']` (type named `Maple
  edging`), `Iron-on veneer: length min end`, two types on one part → two features; tape on an arched width-max side →
  its feature's tags include `p:curve:<arch id>`; a faulted band's text ends ` — check
  the cut list`; `partFeatures(b, units)` with no band types returns what it returned before (no band feature). In
  `planKeys.test.ts`: `trioDrawings` returns different drawings for one parts array under two band type arrays (thickness
  0.25 vs 0.5).
- [ ] **Step 2: Run** these files → FAIL.
- [ ] **Step 3: Implement.** In `drawView`'s per-part segments, after the profile silhouettes, spread `glueLines(b,
  bandTypes)` as `{ A: toWorld(b, a), E: toWorld(b, b), feature: featureTag(b.id, 'band', type) }` (nothing when
  `bandTypes` is absent). In `partSegments`, an edge with no angle/curve tag whose two local endpoints both lie on an
  unfaulted band's straight side plane (`across` = 0 or `part[across]`, within 1e-9, and the side's stretch is one chord)
  gets the tag of the first such band in `BAND_SIDES` order. `partFeatures` pushes, per band type used on the part
  (canonical order of first use), one feature: tags `[featureTag(b.id, 'band', id)]` plus, for each of its unfaulted bands
  on a curved stretch, `featureTag(b.id, 'curve', c)` for every curve id `c` its chords carry (Q6), text per Q6 (`formatLength(thickness, units)`), faulted when any of its bands is
  in `bandFaults`, `trueAxis = axisOf(b, 'thickness')`. `trioCache` becomes `WeakMap<bandTypes, WeakMap<parts, …>>`.
- [ ] **Step 4: Run** the three files, then `npx vitest run src/document/drawingIdentity.test.ts
  src/document/profilesFinal.test.ts src/panels` → PASS, identity pins unchanged.
- [ ] **Step 5: Commit** `edge banding 2: Plans sheet — glue lines through the one hidden-line pass, a key per band type`

---

### Task 4: Part diagrams — band marks, notes and a strip's mitres

**Files:**
- Create: `src/document/bandText.ts` (moved verbatim from `cutlist.ts`: `sideWords`, `CORNER_WORDS`, `bandLine` — now
  exported; plus `coreNote`)
- Modify: `src/document/cutlist.ts` (import them; part rows call `buildDiagrams(board, units, doc.bandTypes)`; strip rows
  call `stripDiagrams(s, units)`)
- Modify: `src/document/diagram.ts` (third parameter; `bands?`, `bandNotes?`, `mitres?` on `DiagramView`; `stripDiagrams`)
- Modify: `src/panels/PartDiagram.tsx`, `src/styles.css` (`.cutlist-diagram-band`, `.cutlist-diagram-band-note`, the latter
  in the print list ~:1451)
- Test: `src/document/diagramBands.test.ts` (new), `src/panels/PartDiagram.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function bandLine(board: Board, types: readonly BandType[], units: Units): string | null   // bandText.ts
  export function coreNote(board: Board, types: readonly BandType[], units: Units): string | null    // null when core = finished
  export function buildDiagrams(board: Board, units: Units, bandTypes: readonly BandType[] = []): DiagramView[]
  export function stripDiagrams(s: Strip, units: Units): DiagramView[]
  // DiagramView gains (each present only when set):
  bands?: { side: ProfileSide; points: [number, number][] }[]   // (h, v) board inches = (length, width) on a thickness view
  bandNotes?: string[]                                          // on the first thickness view only
  mitres?: { poly: [number, number][] }[]                       // a strip view's mitre waste
  ```
  `coreNote` text: `Drawn at the finished size; cut <L> × <W> before banding.` with `formatLength(core.length, units)`
  and `formatLength(core.width, units)`.

- [ ] **Step 1: Write the failing tests** (`diagramBands.test.ts`):
  - `a banded part opens a thickness view with marks`: the 36 × 20 maple part (mitre) → its `thickness|min` view has
    `bands` for all four sides, width-min `points: [[0,0],[36,0]]`, length-max `[[36,0],[36,20]]`; `hLabel` `36"` (finished).
  - `notes`: `bandNotes` = `[bandLine(...), 'Drawn at the finished size; cut 35-1/2" × 19-1/2" before banding.']`; tape
    only (thickness 0) → just the band line (no core note).
  - `a part with a hole elsewhere still gets a thickness view`: a hole on a width face plus a band → a `thickness|min`
    view exists with `bands`.
  - `faulted band`: no mark for it, its band line note ends `— check: leaves no core`.
  - `no band types`: `buildDiagrams(board, units)` on the banded part equals today's output (no `bands`/`bandNotes` keys).
  - `strip mitres`: the mitred tabletop's width-min strip (finished 36, allowance 0.5, width 0.25, both ends 45°) →
    `mitres` `[{ poly: [[0,0],[0.25,0],[0.5,0.25],[0,0.25]] }, { poly: [[36.5,0],[36.25,0],[36,0.25],[36.5,0.25]] }]`
    (h = cut length 36.5); a square-ended strip's `stripDiagrams` equals `buildDiagrams(stripBoard(s), units)` exactly.
  In `PartDiagram.test.tsx`: a banded view renders four `polyline.cutlist-diagram-band` and two `p.cutlist-diagram-band-note`;
  a strip view renders its mitre polygons; the existing fingerprint test stays unchanged.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Move the band line verbatim (the existing `cutlistBands.test.ts` and `bandFreeIdentity` pin it).
  In `buildDiagrams`, after curves and BEFORE the empty-views fallback: when the part has bands and `bandTypes` is
  non-empty, every existing `thickness|*` view gets `bands` (else `ensure('thickness','min')` first); points from the
  side's `sideStretch` chords (model points; an unfaulted band only); the first thickness view in final sort order gets
  `bandNotes` (`bandLine`, then `coreNote` when non-null; faulted bands still appear in the band line). `stripDiagrams`
  returns `buildDiagrams(stripBoard(s), units)` with `mitres` set on its one view per Q7 when any end is mitred.
  PartDiagram draws each band as a polyline (`.cutlist-diagram-band`, `stroke-width: 6`, `stroke: currentColor`,
  `stroke-linecap: butt`) through the same point mapping as curves, after the outline; mitres as `.cutlist-diagram-angle`
  polygons; band notes after the curve notes.
- [ ] **Step 4: Run** the new tests, then `npx vitest run src/document src/panels` → PASS, identity pins unchanged.
- [ ] **Step 5: Commit** `edge banding 2: part diagrams — band marks, the band and core notes, a strip's mitres`

---

### Task 5: Live pass, docs and merge

**Files:**
- Create: `docs/browser-verification-edge-banding-2.md`
- Modify: `CLAUDE.md` (Status, Rounds row, inv 54 chunk 2 paragraph, inv 15 (`bandViewSignature` in BoardMesh's memo),
  inv 47 (band tags), the file index for `bandFaces.ts`/`bandText.ts`, the `→ units` edge rule's list (`bandText.ts` takes
  it), test count), `docs/history.md`, `docs/follow-ups.md`
  (395(1) closed by Q1; new residue entries: Q7's distortion, real-hardware looks), the spec (status
  line; Q1–Q7 as *Amended (planning, chunk 2)*)

- [ ] **Step 1: Full gate.** `npm run build` and `npx vitest run` → all green (record the count).
- [ ] **Step 2: Live pass on the dev server** (Playwright; leave test projects in place; never clear the profile): a plywood
  shelf taped on its front edge (the edge shows veneer, not plies); a plywood tabletop with 1/4" maple on four sides under
  each corner rule (maple-coloured edges, glue lines on top and bottom, mitre lines under Mitred); the Section through the
  edging (glue lines clipped); the Plans sheet (glue lines, the key line, a mirrored copy); the cut list's diagrams (marks,
  both notes, a strip's mitres); a real Chromium PDF of the cut list and Plans sheet (`page.pdf()`). Record DOM readouts,
  screenshots where spatial, and what software GL cannot confirm (owed to the user's eye: the looks on real hardware).
  Band and unband one plain part and compare the grain on its other faces (screenshots before and after).
- [ ] **Step 3: Docs** as listed above.
- [ ] **Step 4: Final whole-branch review**, fixes, then `git checkout master && git merge --no-ff edge-banding-2`, build
  and full run on the merged tree, delete the branch. Deploy only on the user's word.
