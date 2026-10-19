# Sloyd — swept rebuild speed, chunk c2 (design)

**Status:** draft, for the user's review (2026-10-19). Follows chunk c1 (byte-identical speed fixes, deployed as `index-TCisED7E.js`).
Follow-ups: 393(2), 394(5).

## 1. Goal

Every rebuild in `src/viewport/curvesPerf.test.ts` runs under 40 ms at idle (MINIMUM of 9), with margin for a loaded host. A resize
frame on a production build in the browser is measured before and after (the user's ruling: Node and the real browser).

**After c1 (alone, minimum of 9):**

| Row | ms | Guard |
|---|---|---|
| ogee loop | ~61 | 89 |
| cove loop | ~45 | 62 |
| bead loop | ~46 | 71 |
| two loops | ~36 | 51 |
| two-side cove | ~43 | 62 |

Every other row is under 40.

**What is spent where** (the c1 spike, on the ogee loop's 313 bodies and 1926 faces):
- **Seam subtraction** in the mesh: `uncovered` / `minusCover`, ~15 ms before c1's scalar rewrite.
- **`bodyEdges`:** ~15 ms, about 10 ms of it setup over every non-twin face.
- **The bodies:** ~11 ms.
- **Mesh emission:** ~10 ms.

On the dev build, React also spent ~100 ms reconciling one `<mesh>` per body. That is unmeasured on a production build.

**Non-goals:**
- **No change to the bodies.** `boardBodies` / `sweep.ts`' pieces stay byte for byte, so every reader of bodies is untouched:
  - drawings, through `worldBodies`, `curveEdgeLifts` and `bodyPlanes`;
  - section caps;
  - hole walls;
  - design checks;
  - snap points;
  - `smoothJoins`;
  - and every pin on them: `sweepEdges`' `BODIES` and `sweptIdentity`'s bodies and caps.
- **No change to what is cut, drawn or stored.**
- **No schema change.**

## 2. Approach (the user's choice A, refined in section 2)

Keep the pieces; change only how the screen mesh and the edge lines are built from them. Three stages, each its own task and review.

### 2.1 Stage 1 — one geometry per shaped part

- **Scope.** A part that `shapedPart` routes (curves or swept profiles) renders as ONE `<mesh>` with ONE `BufferGeometry`.
  - Today it renders one `<mesh>` per body (`BoardMesh.tsx` :163–183).
  - Every other part renders exactly as today, byte for byte (`bodyMeshIdentity` and the `BoxGeometry` route).
- **Merge.** `bodyMesh` per body is unchanged. A new `partMesh(board, bodies)` in `grainTiling.ts` lays the body meshes out back to back, material by material in BoxGeometry face order (0..5), one group per material. This is the pattern `holesMesh` already uses (`grainTiling.ts` :1054–1085). Body meshes are already board-centred.
- **Memo.** Memoised on the frozen bodies array, as `curvedPart`'s per-body work is now. A resize builds it once per new bodies object.
- **What stays the same.** These carry over to the one mesh:
  - the six grain materials;
  - `polygonOffset`;
  - the shared clipping plane and `clipShadows`;
  - `faded` (material keys and `renderOrder`);
  - shadows;
  - the `raycast` wrapper (`sectionRaycast` / `keptBySection`);
  - `onClick` and `onDoubleClick`;
  - `stopPropagation`, which stays load-bearing: the section cap is still a second mesh.

  Nothing in the app reads per-body mesh identity: Tape and Move pick snap points, nothing reads `faceIndex` or `e.object`.
- **Tests:**
  - `partMesh` equals the concatenation of the per-body `bodyMesh` outputs (positions, normals, uvs, groups merged per material), on every swept and curved fixture.
  - `curvesWatertight` runs over the merged buffer, with every directed edge matched.
  - `sweptIdentity`'s mesh slot is re-recorded once against `partMesh`.
  - `bodyMeshIdentity` is unchanged.
- **Measured.** A production build (`npm run build` + `vite preview`, or the container) in the browser: time from a Length commit to the next painted frame, for the ogee loop, before and after.

### 2.2 Stage 2 — internal faces known by construction

`sweep.ts`' `buildPieces` already knows, as it builds each band piece, which of its faces lie against another piece of the same part.
- **(i) Section diagonals.** A face on a cut between two convex pieces of one kept section (`keptSection`), within one skeleton face.
- **(ii) Path joins.** A face on the boundary between two adjacent skeleton faces (a bisector) where both sides are band pieces of the same profile with equal sections.
- **(iii) Band against rest.** A face where a band piece meets a rest piece of the outline.

**Tagging.** Such a face is tagged `internal` with its partner piece. A new tag, carried like `sweep` / `profileEdge`, and stated in inv 48's tag contract.

**The mesh.** A tagged face draws nothing when its partner is present in the part's FINAL bodies. Present means:
- the partner body (by piece identity, carried through later subtractions) exists in the final bodies; and
- it has a face, opposite and coplanar, whose polygon equals the tagged face's within `BODY_EPS`. That is `withoutSeams`' twin test.

A later subtraction (a run-out, a stop, another curve, a cut, an angle cut) that removed or reshaped either side fails this test.
Byte-identity is not required here. The criterion is the visible area within 1e-9 and the leak check.
- A tagged face whose partner is missing or changed goes through today's geometric route (`uncovered` / `minusCover`).
- Every untagged face does too.
- Conforming and welding (`insertOnEdges`, `centroidFan`, `CONFORM_EPS`) stay. The remaining faces still meet at T-junctions.

**Edges.** Internal faces are left out of `curvedEdges`' input altogether. A face that cannot be seen cannot carry a drawn line. The rest is unchanged.

**What is unchanged.** The bodies, the normal sources (`sweptNormals`, `runoutFor`, `stopRunoutNormals`, the junction override, chord radials) and the plans and UVs per face (inv 35).

**Tests:**
- **Coverage.** The visible surface's area per material is equal to today's within 1e-9, on every fixture in `sweptIdentity`'s list.
- **Leak check.** `curvesWatertight`: every directed edge matched, the holes' mesh included.
- **Normals.** `sweptNormals` and `stopNormals` hold: 1e-6 to the true surface, junction vertices on the band's normal.
- **Grain.** Each visible point keeps today's material and UV: sample face centroids and compare against today's mesh.
- **Edges.** `sweepEdges`: fast == reference on every b1/b2 case, the 153-case parametric sweep and the overlap cases. The crease-presence check (`CREASE_MIN`) still holds.
- **Partner rule.** A part where a run-out or cut removes one side of a tagged face: the face is drawn, and the leak check holds.
- **Mutations:**
  - drop every tagged face regardless of its partner;
  - drop none;
  - tag a face that is not internal.

  Each must fail.

**Expected.** The ogee loop at ~40 ms; the others under.

### 2.3 Stage 3 — swept edge lines from tags (conditional)

**When it runs.** Only if, after stage 2, any row is over 40 ms, or within ~15% of 40 (34 ms) in a full-suite run. Otherwise it is skipped, and the round's record says so.

**What changes.**
- `sectionSeams` decides EVERY line between two swept faces of one profile from tags. Today it decides only where both strips' merged spans are equal (`coveredBothSides`, Task 7 b2), and that rule stays.
- `bodyEdges` receives only faces with an undecided line: untagged faces, run-out and overlap faces, and swept faces adjacent to them.

**Tests.** The b2 judges:
- fast == reference on every b1/b2 fixture, the 153-case sweep, the overlap cases and the stop/station rails;
- `CREASE_MIN` presence;
- b1's edge hashes.

Each mutation of the new rule (decide a line whose strips differ; drop a run-out's wing; join across path ends) must fail.

## 3. Guards, measurement, deployment

- **Guards.** After each stage, measure every row (minimum of 9) alone and in one full run. Guards are lowered only, to ⌈worst × 1.25⌉, never raised; a 40 ms default row stays at 40.
- **Browser.** One production-build measurement of the ogee loop's resize frame, before stage 1 and after the last stage.
- **Live pass.** On the dev server (Playwright, software GL), check that the mesh's look is unchanged:
  - a swept loop, a stop, a two-side run, a section through a swept part, and fading;
  - picking and section-cut picking.

  The shading on real hardware is for the user's eye.
- **Branch.** `perf-c2`; merge and deploy on the user's word. No schema change, so rolling back to c1 (`65fb1fe`, `index-TCisED7E.js`) is free.

## 4. Risks

- **Stage 1 changes the draw-call structure.** One mesh means one shadow caster and one raycast target per shaped part. Risks:
  - `polygonOffset` and the section cap's z-fight behaviour, checked live;
  - a part with more than 65 535 vertices needs a 32-bit index. Today's per-body meshes are non-indexed; confirm and keep them non-indexed.
- **Stage 2's partner rule is the correctness hinge.**
  - A face dropped while its partner is gone opens a hole in the mesh. The leak check catches it, but only on fixtures it runs.
  - So the partner-removed fixtures are added explicitly: a stop and a cut through a band.
- **Stage 3 repeats b2's bug class** (phantom and missing lines). It is gated on need, and judged by the same tests that caught b2's.
