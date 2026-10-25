# Sloyd — module map

> Split out of `CLAUDE.md` on 2026-10-20: the annotated source tree, as maintained. `CLAUDE.md`
> keeps a short index and the per-file rules. Where a file's own doc comment is the stated single
> source of truth, read it there. Rules are in `docs/invariants.md` (`inv N`).


An index; the rules are in Invariants (`inv N`). The fully annotated tree as of
2026-10-07 is in `docs/history.md`. Where a file's own doc comment is the stated single
source of truth — `tapeHover`'s clearing enumeration, `tapeAxis`'s structural rule,
`TapeAxis`'s world-vs-board-local argument, `woodCut`'s seam argument, `App.tsx`'s
`pending` — **read it there.**

```
src/
├── units/            length.ts (Units; parseLength/formatLength(…, units)/canBeginLength; capture set {0-9 . -}; formatMm,
│                     formatLengthBare, formatSize, floorToTick; inv 52), nominal.ts
│                     (NOMINAL_SECTIONS, nominalName — EXACT at 1e-9, either order —, stockLengthText: whole feet `8′`),
│                     quantity.ts (board/square feet, two decimals fixed)
├── document/
│   ├── types.ts          Board, Cut, Shape, ShapedBoard, StoredBoard, Instance, Definition,
│   │                     SloydDocument, FlatDocument, MATERIALS, sheet stock, HoleRow (`Board.holes`, `Shape.holes`)
│   ├── document.ts       create/validate/migrate (inv 11); takeId (inv 33); trueTurnsToV8 /
│   │                     mirrorCutAlong (inv 44); validateGuides, validateShapes; the curve validator holds an arc within 4 ulps
│   │                     of its coordinates past the half-circle bound TO the bound (fu 416), drops one further past;
│   │                     schema 21 keeps `mirrored` on a SHAPED part only when literally true (mirrorFreeIdentity.test.ts pins a
│   │                     flag-free document byte for byte)
│   ├── ids.ts            nextId, the one id minter
│   ├── names.ts          uniqueName / dedupeNames among siblings (inv 8); derivedName,
│   │                     the derived-PROJECT name ("— refined 2", fu 237)
│   ├── geometry.ts       axisFrame, the ONE turn table, and its crossings (inv 44);
│   │                     boardExtents/boardCenter/reorientedPosition (inv 2), boardsBounds (the PRE-lean box: read through
│   │                     worldBounds.ts)
│   ├── lean.ts           the ONE home of the lean math (splayed legs §3.3): slopes ↔ degrees, resultant, sightline;
│   │                     leanMap (rotation about the top-face centre; apply/applyDir/inverse/inverseDir on WORLD points of the
│   │                     pre-lean placement; null for no or zero lean), worldSlopes, chooseFace, seamFree, leanFlip (mirrors),
│   │                     leans (the cheap predicate), pivotKeptPosition (a resize keeps the pivot), withinBound (inv 57)
│   ├── holeRebase.ts     rebaseHoles (joinery's resize re-anchor, moved from generate/joints/recipes.ts) and levelEndHoles
│   │                     (Level the ends' end-face rule: rows follow the wood, a tilted row's mouth slides along its bit;
│   │                     angled holes §7), storableRow (the loader's keep test for a re-anchored row)
│   ├── legSockets.ts     Bore leg sockets (angled holes §5), the ONE decider, pure: legsUnder(world, seat, units) (leaning parts whose
│   │                     level top is within TOUCH of a down face, overlap > REST_AREA — from checkTolerances.ts —, OR a TENONED leg:
│   │                     tenonInSeat — its top tenon's centre segment, shoulder centre → tip centre, in the seat's stock over a down face,
│   │                     the axis meeting that face inside its outline; the ONE predicate staleSocketOf shares, ruling T9a — and
│   │                     isLevelled, round tenons §6.3), partAxis (ANY part's world axis, min → max; WorldAxis), legAxis (partAxis
│   │                     pointing up, leaning parts only), boreEnds, boreAlongAxis (THE coaxial test, 1e-9: isSocketOf and the tenon
│   │                     joint's seatedIn each add their own rule on it), socketRow (a through row on the leg's
│   │                     axis, entering from the top, `othersOf` layout, nearer end/side), isSocketOf (a through bore from the top, 1e-9) / staleSocketOf (tilted, through, from the top;
│   │                     the axis line through a leg top in the TOUCH band; none for a matched leg), socketPlan (every copy plans its own legs; lowered
│   │                     STORED row sets compared as a multiset, flag-free, 1e-9; a faulted socket left out as `note`); its five sentences, verbatim;
│   │                     round tenons §6: socketPlan's `tenonLegs` → `legs` (world patches, one per storage target), fitTop (levelPlan with
│   │                     `topAt` the seat's top, the shoulder clearing the underside, the length rounded UP to tenonStep), legTenonPlan
│   │                     (fitTop judged by tenonFaults), fitLegs (every storage group judged against its own seat; socketsDisagree;
│   │                     Level the ends' refusal refuses all; a faulted fit named in `note`), changesNothing (inv 4)
│   ├── levelEnds.ts      Level the ends (splayed legs §5, inv 57): levelPlan (two end miters along seamFree's face, each end's
│   │                     length change rounded UP to the grid, top through R — the recognised top cut on the axis, else the pivot),
│   │                     isLevelled, levelCutOf (ANY end miter is a level cut), sameLevelLine/depthFromMin; the refusals, verbatim;
│   │                     round tenons: levelPlan's `opts.topAt` (a given top height, Tenon the legs) and roundUp exported (THE rounding rule)
│   ├── leanContacts.ts   the checks' lean crossing (inv 38, 39, 57): worldBodyFaces (moved here from designCheck.ts, re-exported
│   │                     there; the lean composed), levelFaces (±Y within LEVEL_EPS 1e-9), overlapArea (plan polygons)
│   ├── leanKeep.ts       Refine's keep (inv 56, 57): keepsExactly (THE predicate: leans, a tilted hole row — angled holes §9 — or a
│   │                     round tenon, hasTenons, faulted included — round tenons §9), whyKept (the note's reason words),
│   │                     keptParts (THE decision: ROOT stored parts whose resolved form keepsExactly + their
│   │                     Shapes + flat names), leaningInAssembly ('lean-assembly'), keptNote (the USER-turn note, real bounds, why kept)
│   ├── worldBounds.ts    partBounds / partsBounds, the ONE real-bounds helper (splayed legs §6.1 R2): a leaning part's
│   │                     world box from its LEANED body vertices; lean-free = boardsBounds exactly. Every world-box reader
│   │                     (group move, Copy in a row, section heading/span, Gizmo, framing, explode, Plans dimensions, the
│   │                     drawing's boardBox, the design checks' boxes, Refine's kept note) uses it
│   ├── frames.ts         placeBoard / placeInstance, the ONE composition (inv 46); mirrorPart/withMirror/toLocal (mirrored frames);
│   │                     mirrorFeatures (mirrorPart's feature half: what a mirrored user resolves through, inv 44); mirrorInPlace
│   │                     (features mirrored + turn negated, box kept; the checkbox's operation at chain turn 0, used by tests)
│   ├── mirrorCut.ts      mirrorCutAlong (moved verbatim), mirrorCut, clamp (inv 44)
│   ├── tree.ts           occurrence paths, isCovered, worldParts (THE walk), flatDocument; mirroredAt (assembly parity),
│   │                     sideAt (assembly parity XOR the part's own `mirrored` flag, inv 46); treeRows carries a part's flag
│   ├── treeEdit.ts       every write-back: applyWorldEdits (storageKey), lowerEdit,
│   │                     translateItems, writeBackFlat (inv 46); lower/lowerCuts are the exact inverse
│   │                     of a mirrored placement; postureRefusal (flat<->upright across a mirror), sameSideFirst (both by sideAt);
│   │                     lowerOwnMirror (a mirrored user's features into its Shape's hand against withShapeFeatures, inv 44);
│   │                     regroupShapes: exact membership through each user's own flag, flaggedKeys (inv 46, fu 432)
│   ├── treeOps.ts        group/ungroup, shareInstance, makeUniqueItem, removeItems, turnInstance;
│   │                     setMirrored / mirroredCopy over placedBox / replaceKeepingBox (mirrored instances); Ungroup's plain
│   │                     path strips a part's own `mirrored` (plainOf)
│   ├── treeRepair.ts     repairTree, dropUnresolved (load repair)
│   ├── shapes.ts         resolveBoard (THE shape reader; applies a user's own `mirrored` via mirrorFeatures), shapeUsers,
│   │                     prune/dissolveShapes (inv 45); plainOf (strips `shape` and `mirrored`), withoutFlag (a shaped record unflagged)
│   ├── links.ts          LINK_FIELDS (the ONE shared/own table), sameShared, linkPlan (inv 45; refuses
│   │                     a member with no occurrence on the source's side of a mirror; `mirrored` is OWN; `mirrorMate`: a user
│   │                     of the source's Shape with the other flag is not "changing")
│   ├── linksToShapes.ts  the v10→v11 step (and linkByRole's builder; keeps a mirror candidate's `mirrored` flag)
│   ├── cuts.ts           cutRegion, pocketCells, pocketEdges (inv 16's exact grid path), clippedRegion (THE clip),
│   │                     cutShape (THE description of a cut), cutLabel, openSides,
│   │                     storedAsShape, cutsThatRemoveStock, CUT_GEOMETRY_FIELDS (inv 40)
│   ├── angleCuts.ts      AngleCut model (inv 48): ANGLE_CUT_FIELDS (inv 40), keptHalfSpace, depthAt/zeroStation, touchedRegion
│   │                     (the box a cut can remove) / splitRegion (a cell split around it: contact's flat wood),
│   │                     mirrorAngleCut (inv 44), deriveKind; the shop-field conversions per kind — taperFields,
│   │                     MiterFields/BevelFields (stored slope RATIO, miterRatio 45° → 1), ChamferFields (12 canonical
│   │                     CHAMFER_EDGES, exact legs) — each with its xCut writer and default; imports only types/geometry
│   ├── angleText.ts      angleLine (THE bench line for every angle cut; faceName: a length face is an END),
│   │                     shortPointLine (corner minimum, fu 281; an end chamfer leaving a tongue excluded, fu 385), angleDegrees (→ units)
│   ├── angledRefusal.ts  TaperConflict / taperJointRefusal; AngleConflict / jointRefusal (THE joint-refusal message, one sentence per part)
│   ├── holeTilt.ts       THE tilt math (angled holes, schema 23, inv 50): acrossOf (moved here from holes.ts, re-exported), isTilted,
│   │                     bitVector (board-local, unnormalised, face-axis component ±1), tiltDegrees / tiltResultantDeg /
│   │                     tiltSightlineDeg (lean.ts' two conversions restated — an import would cycle — and pinned equal by test),
│   │                     withinTiltBound (THE bound, loader and store), retilt (the edit rule: a new face/from drops the tilt)
│   ├── roundTenons.ts    THE round tenon (schema 24, inv 58): TENON_FIELDS (inv 40) / tenonValues / sameTenon / copyTenon, tenonsOf,
│   │                     hasTenons, tenonAt, withTenons (canonical order; an empty list REMOVES the key), mirrorTenons / lowerTenons
│   │                     (inv 44: the ends swap along the length), TENON_STEP / tenonStep (1/64", 0.1 mm; a TYPE-only Units import, no
│   │                     → units edge), endCutOf (the end's own cut: none, its one miter — the tip —, or 'other'), shoulderAt,
│   │                     tenonZone, tenonFaults (THE fault decider: too-wide, too-long, cut-reaches-shoulder, meets-feature —
│   │                     conservative boxes, curves and profiles through featureRegions' shapedFeatures over profileView),
│   │                     addedTenonFaults (the edit rule), defaultTenon (spec §4; a `metric` boolean, not Units), builtTenons (THE list
│   │                     of tenons that build: fault-free, memoised per board object, frozen), onTenonSurface (snapPoints: no sloped-face
│   │                     corners on the round side), tenonViewCurves (the waste as two overlapping square-span view curves, ids
│   │                     `tenon/<id>/a|b`; appended by profiles.ts' geometryBoard)
│   ├── tenonJoints.ts    THE tenon joint (round tenons §5, invs 38, 39): seatedIn (builds, single bore, same diameter, boreAlongAxis,
│   │                     enters by > TOUCH, a blind bottom not passed by the tip's FURTHEST point, tipFarthest), tenonJoints (every seated
│   │                     tenon in a flat document, world order, the FIRST match wins), staleTenonOf (a found leg's top tenon seated in
│   │                     none of the seat's bores: the Holes section's note), withoutTenon (world bodies clipped to the shoulder's kept
│   │                     half-space: the overlap waiver and checkedLevelFaces), tenonMeetsBore (the overlap's mismatch hint)
│   ├── checkTolerances.ts TOUCH and REST_AREA, in a LEAF module (imports nothing): legSockets.ts and tenonJoints.ts read them, and
│   │                     designCheck.ts (which re-exports both, so every old import site stays valid) imports tenonJoints, so taking them
│   │                     from designCheck would cycle (designCheck → tenonJoints → legSockets → designCheck; ruling T7d)
│   ├── holes.ts          THE hole geometry (inv 50): HOLE_FIELDS (inv 40; holeRowValues appends each PRESENT tilt key's name
│   │                     then value, Ruling P1), sameHoleRow, copyHoleRow, mirrorHoleRow (inv 44; the tilt rides the flags),
│   │                     Hole's `bit` and `reach` (axial), tiltedHole (THE gate of every tilted branch), holeRegion (a bore's box,
│   │                     exact for a tilted one), holeBottom,
│   │                     mm (n / 25.4, as parseLength), defaultHole/defaultShelfPinRow/defaultHingeCup (35 mm × 1/2", 3" from
│   │                     the min end of the LONGER in-face dimension, 22.5 mm in; fu 343), holeInstances/boardHoles, holeRing/
│   │                     holePrism (memoised by frozen Hole identity), clipPolygon/clipPlan/minusPrism/minusCover, holeRims, insideHole
│   ├── holeWorld.ts      THE world-words hole converter (inv 50; model-facing, no → units edge): holeSnap (nearer of 1/64 in and whole mm), worldHoles
│   │                     (stored rows → WorldHoleRow), holeRowsFor (world rows → stored, the grid on the STORED distances; shape faults = loader drop rules + the 1/32 plane rule + MAX_MAGNITUDE; canonical
│   │                     alongFrom 'min', 'max' when min cannot express a loader-legal row; across side nearer, else far), sameHoles (centres as a SET),
│   │                     sortHoleRows
│   ├── holeDesignFaults.ts holeDesignFaults: a strict fault in a model-authored row → 'hole-fault' violations (message names the row's first centre; `shown`
│   │                     copy through holeText, so this module takes the → units edge, not holeWorld)
│   ├── holeFaults.ts     holeFaults (THE strict rule: breaks-out, off-flat, meets-hole, too-deep, too-shallow; a tilted bore exact or
│   │                     CONSERVATIVE, never under — the unclipped mesh trusts it), tooShallow, stockChecks, holeInStock (clean);
│   │                     intoCurve: a hole meeting a curve's waste is a breaks-out carrying `curve` (not `edge`); a round
│   │                     tenon's square-span view curves are skipped (its own meets-feature judges a hole in its zone)
│   ├── holeText.ts       holeLine (THE bench line; pitch at 1/64 at least, whole mm shown; a faulted row's `— check:`),
│   │                     holeFaultText (THE fault words), distinctFaults (too-deep and too-shallow once), endWord/edgeName (→ units);
│   │                     a tilted row's words (the angle off square and sightline, or the end/side a one-plane tilt leans toward;
│   │                     a blind one's `, depth measured along the bit`); socketFaultWords (a fault as what a socket would do);
│   │                     faultKey (a breaks-out keyed `:edge` or `:curve:<id>`, distinctFaults on the same key);
│   │                     curveWord (THE one home of hole-into-curve words: "the roundover", "the cove", … or the curve kind)
│   ├── tenonText.ts      THE round tenon words (→ units: it produces strings): tenonFaultText (the fault copy, verbatim), tenonLine (THE
│   │                     bench line; the diameter at hole precision, holeLengthText; a faulted one's `— check:`), shoulderFromFarEnd
│   │                     (THE shoulder number, bench line and Properties readout), TENON_END_TAKEN / TENON_END_FIXED /
│   │                     TENON_SIZE_POSITIVE (the store's non-fault refusals, ruling T8b), tenonStale, legTenonFaulted
│   ├── holeDrawing.ts    holeDrawingSegments: one part's hole lines for the Plans sheet (inv 50), world space — every rim as a
│   │                     DRAWING_HOLE_SEGMENTS (96)-gon, a rim edge-on to the view as ONE segment (chunk 2 R2), then the wall's two
│   │                     silhouettes (none looking down the axis); built only through `toWorld` (inv 44); decides nothing hidden;
│   │                     a tilted bore (tiltedLines): mouth and exit rims on the face planes, a blind bottom square to the bit, silhouettes along the bit
│   ├── curves.ts         THE curve model (inv 53): CURVE_FIELDS (inv 40), CURVE_TOLERANCE 0.005 / SEGMENTS_MAX
│   │                     (round tenons: CurveSpan.square and squareSpan — a span whose stops are plain walls with no run-out, a tenon's waste)
│   │                     24 / STORED_MAX 64, copyCurve, mirrorCurveCut (inv 44), localSegments/arcOf (LocalArc: centre, radius,
│   │                     rise, crown), curveOutline (chords ON the arc), smoothLines, bowsInto, wasteContains/isAir (P3),
│   │                     circleMeetsWaste/rectMeetsWaste, rectOverlapsWaste (joinery's open test, P4: a side counts only where
│   │                     wasteOnSegment finds a stretch of it inside) / wasteOnSegment (P6's end-line length), curveFaults (THE decider: runs-off, cuts-through), convexPieces (ear
│   │                     clip), curvePlan (CLIP or SPLIT; the strengthened P6), splitPieces; writers/readers archCurve (a notch's rise is half its STORED chord, fu 416)/archFields,
│   │                     bowCurve/bowFields, cornerCurve/cornerFields, deriveCurveKind, curveKindWord, presets defaultArch/
│   │                     Notch/Bow/Corner/Corners; CurveSpan / ViewCurve / spanOf (a stopped profile's VIEW-ONLY `span: {lo, hi, stopLo, stopHi}`,
│   │                     never stored; `curveValues` appends it only when present, P18); runtime imports `geometry` only
│   ├── curveDrawing.ts   curves on paper (inv 47, 53): DRAWING_CURVE_TOLERANCE 0.001 / DRAWING_CURVE_SEGMENTS_MAX 96,
│   │                     curveDrawEdges (each model chord + a fine path of nodes ON the true arc; ends stay on the chord, Q4;
│   │                     deep-frozen, memoised), curveSilhouettes / silhouetteLines (Q1; the probe offset); EDGE_ON 1e-9 / facing (THE one
│   │                     facing test, fu 386), outlineFaces, curveEdgeLifts (every model edge's along-view probe lift); imports geometry, bodies, snapPoints, curves
│   ├── profiles.ts       edge profiles (inv 53): ProfileKind/PROFILE_KINDS, PROFILE_KIND_WORD (THE kind words, Roman ogee capitalised; PROFILE_KIND_LABEL
│   │                     derived for the panel), ProfileEdge/PROFILE_EDGES (8: long edges and ends, never through
│   │                     the thickness), profileCurve (THE writer), profileFields (THE reader: rewrite + exact sameCurve; a thumbnail with
│   │                     depth = size reads as a Roundover), profileAsymmetric (symmetric kinds stored at facing 'v'), defaultProfile
│   │                     (scaled per axis), DEFAULT_PROFILE_EDGE; the stored form (schema 18): PROFILE_FIELDS, profileValues/sameProfile/
│   │                     copyProfile, endToEnd, profileToFields/profileFromFields (v is always thickness: face = vFrom, side = u at
│   │                     uFrom, facing v ↔ 'face'), profileAsCurve (THE profile → geometry step), profileOf (the migration's reader),
│   │                     mirrorProfile (flag flips; a station run swaps on every mirror), geometryBoard (THE geometry view: curves then
│   │                     profiles as chunk 1's CurveCuts, memoised per part, idempotent, the same object with no profiles; a stopped one carries `span`;
│   │                     round tenons: each built tenon's view curves appended last; profileView is the view WITHOUT them, read by
│   │                     shapedFeatures so a tenon is never a feature of itself);
│   │                     a2: runDim, travelSign, endPos (THE station → coordinate), oneSide, canonicalRun (P11), profileSpan,
│   │                     profileFaults / viewProfileFaults (THE profile fault decider: stop-off, overlap; b1: runs-off, too-tight,
│   │                     overlap on the path's cover; memoised per view, deep-frozen); b1: the view's `profiles` holds exactly the SWEPT
│   │                     profiles (Q1; straight ones stay view curves), sweptProfiles, shapedPart (THE routing predicate: curves or swept
│   │                     profiles), fallsBack / runsStraight (the straight fallback: a saved End to end too tight to follow stays a2's view
│   │                     curve, I1 — ONE decision, in geometryBoard), reachDepth; b2: stopFallsBack (Q10: a saved one-side station run's
│   │                     fallback, decided FIRST — phase 1, every other profile by its shape, every path by stored presence —, memoised per
│   │                     part), harmFaults (what its following ADDS to another profile, against b1's all-straight baseline; part of its swept
│   │                     judgement), fallbackCause (the cause from the judgement that DECIDED the fallback), skeletonFits (memoised on chain
│   │                     content); the decision order: stops first, then every other judgement (phase 2) reads a fallen-back stop as straight;
│   │                     stop-off before runs-off; a two-side run never falls back
│   ├── profilePath.ts    THE place a run becomes a path (b1, spec §3.3): faceOutline (the rectangle with the through-thickness curves' chord
│   │                     chains spliced in, each chord carrying its curve id and true arc), sideStretch (a side's chords; ends 'sharp' or
│   │                     'arc'), profilePath (the path at the TANGENT POINT: every fault and decision reads it; ends through / station /
│   │                     B1a mitre; `cover`, THE overlap source) vs builtPath (the same plus B1's ε past a station — construction only),
│   │                     isSwept (Q2: a loop, or an End to end whose stretch is not its side's one straight segment); memoised, frozen;
│   │                     b2: stationPoint (B2: THE station → outline point on its side's stretch, on the MODEL chords; a vertex belongs to the
│   │                     run-side chord, Q11), the `'stop'` PathEnd (`at`, `tangent` and inward `normal` from the station's full model chord,
│   │                     Q12), stopZone (Q13: the end-chord zone), throughConsistent (Q17), stopRun (one side or two; the re-entry and CROSSED
│   │                     rules → null), judgedPath (the skeleton's path: `snap`, Q13's zone — never a fault's), `Opts` (`build`, `snap`,
│   │                     `presence`, `keep`, `without`), neighbourTakes (Q18's widened B1a; never against a fallen-back stop); isSwept (Q9)
│   │                     also a two-side run, or a one-side station run whose fault path is not one curve-free chord
│   ├── skeleton.ts       planChain, pathSkeleton (the path's truncated straight skeleton: a swallowed chord collapses, its neighbours
│   │                     rejoin), station clips (b2: a `stop` clip — the plane across the stop's model chord, its ray N, `end` lo/hi); a leaf
│   │                     below profiles/sweep so the fault decider can ask for it without a cycle
│   ├── featureRegions.ts joinery's shaped-feature tests (inv 41, chunk 2): shapedFeatures, featureMeetsBox, featureTouchesEnd, runsOutThrough, crossSectionOverlaps; curves.ts `rectOverlapsWaste` (open) / `wasteOnSegment`, sweep.ts `sweptWasteMeetsBox` (conservative box form), profiles.ts `PROFILE_KEYS`; bandRegions (chunk 3, P9/P10: each band's strip, the TYPE's thickness in from its side × the full run × the thickness, as stored; thickness-0 tape null; a missing type skipped — also `sites.ts`' inset clearance); featureRegions.test.ts
│   ├── sweep.ts          THE place a swept profile becomes geometry (b1, Q3, inv 48): sweptPlan/sweptPieces (skeleton faces × the kept
│   │                     section's convex pieces, plus the rest of the outline), keptSection (WALL_MARGIN 1/64": a wall at the reach held
│   │                     inside the band), builtSwept (the unfaulted swept profiles), sweptRunouts (a B1 station's a2 run-out),
│   │                     sweptAirTester / sweptWasteMeets (probe, hole faults), sweptWasteMeetsBox (joinery's conservative box form, P4), sweptNormals (smooth shading), sweptInnerLine (diagrams);
│   │                     the tag contract (`curve` on an outline chord's plane, `profileEdge` + `sweep` on a section face); memoised, frozen;
│   │                     b2: sweptStops (each stop's `StopFrame`, read off the BUILT path; memoised per view, frozen), bandReach; a B1 station
│   │                     clips only its own END of the band (`clipFaces`/`clipWave`: from that end to the first face wholly kept), a stop never
│   │                     clips; `SweptPlan.bands`/`restMore` only when an open path's two ends overlap (`endOverlaps`, `convexMinus`,
│   │                     `simpleLoops`, `trimWave`): the overlap takes BOTH chords' kept sections (any new plan reader takes `bands` when present);
│   │                     the `overlap` face tag on faces an overlap piece cuts; the probe past a stop is band air ∪ cutter air (a union)
│   ├── seams.ts          (chunk c2) seamIndex and `uncovered` (moved verbatim from grainTiling), `twinFaces` (exact opposite coplanar twin seams; one test shared with
│   │                     `withoutSeams`), `faceCover` (the mesh's and the fast edges' ONE cover of a face by the other bodies, memoised on frozen bodies)
│   ├── sectionEdges.ts   profileEdgeName / profileEdgeOf (moved from bodies.ts, re-exported there) and sectionEdgeNamer: one section-edge
│   │                     naming for a2's run-outs and b1's bands; a leaf
│   ├── sweptEdges.ts     sweptSmoothPair (inv 16): which two faces of one swept profile meet with no crease, both ways
│   ├── runout.ts         THE run-out geometry (profile runs a2; inv 48, 53): BEARING 1/4", profileSection, sectionFrame, runoutAxis,
│   │                     runoutPieces (the profile revolved about the bit's axis in INSCRIBED sectors — ρ_eff = m·(x−axis)/cos h,
│   │                     exact on every sector ray, so no step at the station), profileWasteContains/profileWasteTester (the closed
│   │                     oracle), profileAirTester (stockProbe's open form, P3), runoutNormal(s) (smooth shading), runoutReach (P14);
│   │                     b2: StopFrame ({at, F, N, end}: the station's MODEL chord, Q12), stopAxis (`at − BEARING·N`), stopRunoutPieces (a2's
│   │                     inscribed sectors in that frame; a2's functions untouched), stopRunoutNormals (the revolved normal about stopAxis)
│   ├── curveText.ts      curveLine/curveLines (THE bench lines; four equal corners collapse; four equal unfaulted profiles on one face
│   │                     collapse — a stopped profile never; profileName, filletWords), curveFaultText, profileFaultText / profileFaultNote
│   │                     (THE fault words) (→ units); b1: sweptLine (`<name> all round <face>`, `, round the corner(s)`, `, top on the
│   │                     edge`), RUNS_STRAIGHT_NOTE (the fallback's row note; the bench line has none); b2: runsStraightNote(kind) (the note
│   │                     by cause: too tight, would overlap another profile, would run off the part), stopWords (`, from <a> to <b>
│   │                     (stopped)` one side; `, from <Start> round <between> to <Stop> (stopped)` two, `<between>` walking the sides in travel
│   │                     order — never the path), sweptRun (a stop's `round the corner(s)` only for a through end at a corner arc)
│   ├── bandModel.ts      edge banding's stored model (inv 54; imports only `ids` and `types`): BUILT_IN_BAND (`band-iron-on`),
│   │                     BAND_KINDS, CORNER_RULES, BAND_SIDES (canonical: width-min, width-max, length-min, length-max), BAND_FIELDS
│   │                     (inv 40), canonicalBands, mirrorBands (inv 44: a flag flip), copyBand/sameBands/bandValues, withBands,
│   │                     withBandTypes, newBandType (`Tape 2`, `Solid edging`), sameBandType
│   ├── banding.ts        THE band arithmetic (inv 54; re-exports bandModel; no `units`): coreSize, strips (per corner by
│   │                     `endModesOf`: Mitred only where a mitre can be cut, fu 419; a mitre at `atan(n / t)`), tapeRuns (true arcs; a corner arc shared by two taped sides half each), bandFaults
│   │                     (needs-straight, no-side, too-thick, tape-narrow) / bandFaultText, bandsMeetAtCorner (THE corner-words and
│   │                     Corners-select rule), cutStock (core copies, `bands: []`), stripBoard, stripId, bandSignature; memoised per
│   │                     (part, band types), deep-frozen; glueLines (chunk 2: THE glue-line geometry, board-local, per corner rule);
│   │                     visibleRun(part, side, t) (joinery-features chunk 3, P12: THE visible run from the stored rectangular cuts — a
│   │                     cut through the thickness and through the band at a run end shortens it; memoised per part, side and t, frozen),
│   │                     read by strips, tapeRuns (line chords clipped, arcs whole) and glueLines (F1: nothing after give-way, nothing);
│   │                     tests bandingVisible.test.ts (+ generate/joints/bandingVisible.joined.test.ts, the metric applyJoints case)
│   ├── bandText.ts       bandLine (THE band line, moved from cutlist.ts), coreNote (`Drawn at the finished size; cut … before banding.`) (→ units)
│   ├── bandWorld.ts      THE world-words band converter (inv 54; AI-bands; model-facing, no → units edge): mintBandTypes (ONE design-wide pass:
│   │                     `veneer` → the built-in, a type id → itself, `solid <m>` → the project's first 1/4in solid type of m, else ONE minted
│   │                     `<Label> edging`; idOf throws on a key never given), bandsFor (world bands → stored, canonical; shape faults: a broad face,
│   │                     two edgings on one edge, a non-direction), worldBands (stored → WorldBand, the built-in as `veneer`)
│   ├── bandDesignFaults.ts bandDesignFaults: a band fault on a model-authored band → 'band-fault' violations, one per (part, side, kind)
│   │                     (`message` the edge in world words, `shown` in bench words via holeText's edgeName); SKIPS a curved part (its
│   │                     bands are carried: carriedSummary reports them, never the model; final review I1)
│   ├── profileWorld.ts   THE world-words profile converter (inv 53; AI-profiles, fu 430 chunk 2; model-facing, no → units edge): profilesFor
│   │                     (WorldProfile[] → stored, canonical: edge = one broad face + one side, allRound → loop; an end exactly 0 or the extent
│   │                     is THROUGH, within 1/32in only when not exact, else a station from the NEARER end on the hole grid (holeSnap) unless
│   │                     exact; `known` stored distances keep a turn exact; shape faults = the loader's drop rules + the edge rules, the text
│   │                     naming the broad faces), sortProfiles (PROFILE_FIELDS order), worldProfiles (stored → design form; null for a run on two
│   │                     sides), sameWorldProfile (THE exact-entry match: world forms, stations within 1e-9; `aBoard` reads an original on the
│   │                     ORIGINAL part, Ruling 10)
│   ├── profileDesignFaults.ts profileFaultKinds (THE design-path fault kinds: profileFaults + a straight run's curveFaults runs-off/cuts-through,
│   │                     R6.1; also read by carryText.faultKeys), profileDesignFaults ('profile-fault' violations, one per part, edge, kind and
│   │                     fault; a stopped run's span in `message` (decimal inches) and `shown` (display units); SKIPS a part carriesProfiles names)
│   ├── hardwareModel.ts  hardware's stored model (inv 55; imports only `./types`): HARDWARE_FIELDS (inv 40), HARDWARE_COUNT_MAX (999),
│   │                     PACK_SIZE_MAX, canonicalHardware, copyHardwareUse/sameHardware/sameHardwareType, withHardwareUse, mergeHardware
│   │                     (Ungroup); `hardware` is a SHARED field in LINK_FIELDS (inv 45)
│   ├── hardware.ts       THE hardware arithmetic (inv 55; no `units`): hardwareTotals (a part per placement, an assembly per placement of
│   │                     its definition, the project once; hidden parts count; where-used lines per STORED holder), hardwareUsedBy, holderHardware
│   │                     (STORED arrays, never resolveBoard's copy: live bug c9d5c08), holderPlacements; memoised and deep-frozen
│   ├── outline.ts        unionOutline + SECTION_EPS, moved from section.ts (re-exported there): the caps' and
│   │                     curvedEdges' boundary of coplanar convex pieces
│   ├── angleWorld.ts     WorldMiter/WorldBevel/WorldChamfer: design miters, bevels, chamfers in world words; angleCutsFor (design →
│   │                     stored via the Properties writers), worldAngles (structural standard forms), angleRatiosOf (the exact-angle
│   │                     map), ratioFor, sortAngleCuts (the one stored order)
│   ├── taperWorld.ts     Dir/WorldTaper: design tapers in world words; dirToLocal/localToDir (inv 44), worldTapers
│   │                     (stored → design form, structural standard form), taperCutsFor (design → taperCuts, §2.2 rules)
│   ├── bodies.ts         boardBodies (pocket cells clipped by angle cuts), bodyEdges, boardEdges (inv 16);
│   │                     partGeometry: THE cached reader of both, plus the frozen `holes` (shared, frozen; see per-file rules);
│   │                     curve waste clipped or split (`BodyFace.curve` on chord faces), curvedEdges (BUILT
│   │                     edges, inv 53), edgesOf (THE three-way choice: pocketEdges / curvedEdges / bodyEdges), SMOOTH_EPS; a stopped profile's band and
│   │                     run-out faces tagged `runout: 'lo'|'hi'` and `profileEdge` (profileEdgeName / profileEdgeOf: THE one builder
│   │                     and parser), smoothJoins / runoutSilhouettes (a2); b2: a stop's run-out (`stopRunoutPieces`, after B1's) on faces tagged
│   │                     `BodyFace.stop` (its `runout` is then the path's face-frame END); `BodyFace.overlap`; curvedEdges registers each stopped
│   │                     swept profile in a2's `stopped` map behind an `ownEnd` guard; `sectionSeams` decides a line only where both strips
│   │                     cover it (`coveredBothSides`) and never takes a face away from `bodyEdges`
│   ├── tenons.ts         findTenons
│   ├── cutlist.ts        buildCutList (inv 18) — stock, not remainder; `number` (THE row number, display order) and `boardIds`
│   ├── depthField.ts     buildDepthField (inv 20)
│   ├── diagram.ts        buildDiagrams, one view per (face, from); per view `holes` (circles down the axis), `holeSides`
│   │                     ({axis, bottomAt}: dashed depth boxes across it) and `holeNotes` ({row, text}: bench lines), in THREE
│   │                     passes — every row's entry view opened first, then circles and sides, notes last in STORED row order (chunk 2 R3);
│   │                     per view `curves` (waste polygons, hatched), `curveLines` (sharp-vertex lines, only on a face
│   │                     the vertex lies on) and `curveNotes` (`curveLineEntries`); a curve opens its through face's min view only when
│   │                     neither side exists, AFTER holes' entry views; per view `tenons` (DiagramTenon: end, diameter, shoulder, and
│   │                     `tip` — each side's station at the miter plane — on a mitered end's side views; round tenons §8): built tenons
│   │                     only, on their own end view and every side view (a tenoned part with no side view opens thickness/min); a
│   │                     tenon's square-span view curves are never drawn as curves
│   ├── nesting.ts        buildNesting, shelf FFD; formatDims (invs 19, 22, 23); packOnto (by-the-piece boards,
│                         grain locked, largest size opened first) and grainFootprint
│   ├── materials.ts      custom materials (inv 49): validateCustomMaterial(s), mintMaterialId, MaterialCatalog —
│   │                     catalogOf(doc) (built-ins + doc.materials, memoised on the array) / builtInCatalog; materialUses (band
│   │                     types' solid materials included, inv 54),
│   │                     pruneMaterials, upsertMaterials (same object when unchanged), pickerLibrary (one label per picker)
│   ├── purchase.ts       (by the piece: the cheapest of a plan per preferred opener when priced, fu 269) ShopSettings + defaultShop/validateShop (browser-level prices; built-in AND custom-shaped ids
│   │                     validated by kind; a top-level `extra` folded back on read); buildPurchase: the cut
│                         list's Buying section (bd ft × waste, packed boards swapped down to the cheapest size
│                         that still holds them — a heuristic, sheets × price), every string built here (→ units)
│   ├── snapPoints.ts     board/cut/guide snap points, towardFor, offsetPoint (inv 26); toWorld (then the lean) and its
│   │                     inverse fromWorld (exact for an unleaned part; ~1e-15 through a lean); a leaning part's lattice is built and stockProbe-filtered pre-lean, then mapped;
│   │                     hole centres ('face-center', entry
│   │                     and through exit); stockProbe treats a hole's mouth as air (inv 16's exception); b2: each swept stop offers its
│   │                     section's two junction points on the stop plane as `'corner'`s (Q25, from `sweptStops`)
│   ├── row.ts            rowLayout (gap/pitch/fit-across; refusal CODES; no rounding, inv 25)
│   ├── generated.ts      DESIGN_SCHEMA (part + direction + vec3 in `$defs`; the four angle kinds in ONE `angles` item: the API's grammar cap), parseDesign, designToDocument (assemblies → a TREE;
│   │                     `Authored` maps flat names back to what the model wrote; MAX_MAGNITUDE re-exported from geometry.ts); convertPart's keptFrame (THE frame decision,
│   │                     inv 56: curves/carried profiles always keep; holes, bands and/or authored profiles by the rank + thickness rule) and restoreHoles (the exact-row swap; the original order when every row is restored);
│   │                     AI-bands: `vec3` now in `$defs` too (fu 322), WorldBand, edgingKeys (THE `edging` enum: veneer, type ids, `solid <id>`),
│   │                     parseDesign checks edging, designToDocument mints band types once (bandWorld) and always sets `bandTypes`;
│   │                     a curved part's bands are carried, its model bands ignored (carriesCurves); RejectedPart reason `'band'`;
│   │                     AI-profiles: WorldAngle (the wire `angles` item), parseDesign splits it into the internal tapers/miters/bevels/chamfers
│   │                     (a wrong count → TS-only angleFaults, the part rejected 'taper' or 'angle'), toWireDesign (THE serialiser for
│   │                     refineMessage and the estimate: angles merged, TS-only fields dropped); WorldProfile, profiles converted via profileWorld
│   │                     (RejectedPart reason `'profile'`) unless carried (profilesCarried → carriesProfiles); restoreProfiles (the exact-entry
│   │                     swap, only in a kept frame; also matches an echo on the ORIGINAL part, Ruling 10; original order when all restored);
│   │                     keptFrame keeps unconditionally only for carried curves or carried profiles
│   ├── roleLinks.ts      linkByRole: role + sameShared classes → linksToShapes (inv 45); tries the part, its turns, then
│   │                     mirrorCandidates (the part and each turn candidate through mirrorFeatures, turn kept, flagged; none when
│   │                     rect cuts do not survive two mirrors exactly), each put in the representative's order (inOrderOf); a mirror
│   │                     candidate left in no shared Shape is restored to the original part;
│                     turnCandidates (other quarter turns keeping the world box and grain axis; every kind re-stored via taperWorld/angleWorld; none
│                     for rectangular cuts or a cut either cannot describe), alignedTo (adopts the representative's angle-cut, hole-row and profile ids; profiles matched by sameProfile in stored order); a HOLED part is turned too (re-stored via worldHoles/holeRowsFor with an exact set, inv 56), a BANDED part (re-stored on the same world edges via worldBands/bandsFor, AI-bands), and a PROFILED part (re-stored via worldProfiles/profilesFor with an exact set and `known`, AI-profiles); none for curves or carried profiles (carriesProfiles)
│   ├── assemblyChecks.ts distinctParts, distinctPartsViolation, collapseViolations (one report
│   │                     per authored fault; "fix the assembly" only for overlaps; hole-, band- and profile-faults keyed by message)
│   ├── featureCarry.ts   carryFromOriginal (Refine carries curves, the profiles of a part with curves or a two-side run, a CURVED part's bands, every banded part's cornerRule and hardware onto (holes, a plain part's bands and other profiles are authored, invs 50, 54, 53; originalProfiles feeds the exact-entry map) returned parts by flat name, in the
│   │                     ORIGINAL frame; replaced carryGrain; inv 56), carriesProfiles (THE carried-profiles predicate: curves or a run on two sides), featuredKinds (the carry gate), carriedKinds (what the model never sees: bands only on a curved part, profiles only when carriesProfiles), hasFrameFeatures, featureTurned ('feature-turned', fed to the
│   │                     repair loop via EvaluateOpts.extraFaults)
│   ├── carryText.ts      kindsText, carriedView (a part's counts as carriedKinds sees them), featuredNote (the USER-turn note in refineMessage), carriedSummary (RefineOutcome.carried {notKept, check}, computed
│   │                     plain-to-plain BEFORE runJoinery; shown in full by RefineDialog; faultKeys counts band faults only on a curved part, profile faults (profileFaultKinds) only when carriesProfiles)
│   ├── refineDesign.ts   documentToDesign (Refine's input + refusals, incl. 'taper-form'/'angle-form', 'lean-assembly' — and 'lean-joint' from refine.ts' plainForRefine —; kept leaning parts skipped by boxes() and the pre-checks; designToDocument's `kept` opt drops a reused kept name (`replaced`) and puts the kept records first, no floor shift while kept, inv 56; definitions normalised; pre-checks judge a
│   │                     featured part in its own frame, inOwnFrame; bands via worldBands, a curved part's shown as []; profiles via worldProfiles, a curved or two-side part's shown as []), designValues (exact values kept, profile numbers included; angles via the exact-angle map), definitionCorner
│   ├── designDiff.ts     diffDesigns — what a refine changed, by flat display name (→ units); taperLines/angleLines (kind `angle`;
│   │                     a bevel placed by face AND long point); holeLines (a same-looking add+remove pair is one "moved" line); bandLines (kind `bands`: edging added/removed/now <type> per world edge,
│   │                     type names from the AFTER document); profileLines (kind `profiles`: added/removed/`now …` for size, fillet, depth, facing
│   │                     and run, matched on raw edge directions and kind; a stop that stays stopped judged by its STORED ends, Ruling 14);
│   │                     matched on raw directions, worded through shopWords in each side's own frame
│   ├── shopWords.ts      directions in shop words for a PERSON (no → units): faceWord (top/bottom; inside/outside toward the
│   │                     frame's centre — a placement's own parts, else the piece; centred → left/right/front/back, +z the
│   │                     front), endWord (absolute), facesText, centreOf (shop-words spec)
│   ├── designCheck.ts    checkDesign; worldSolids, the ONE world-solid mapping (invs 38, 39); partMass and the body overlap
│   │                     for angled parts (fu 302/303); jointViolations (the model-facing `angle-joint` fault);
│   │                     contactRegions / contactSolids / isAngled: the checks' flat-wood-only reader (invs 38, 48); leaning parts
│   │                     (inv 39, 57): LeanView (floor / rests / unlevelled / feet), the `Level the ends` hint; TOUCH and REST_AREA
│   │                     re-exported from checkTolerances.ts; round tenons (§5.2): realBodied (isAngled or built tenons), the joint
│   │                     (`tenonJoints`: pairBodies' waiver, `joint` in groundedSet, isHeld's clause (d) with its groundedWithout guard),
│   │                     `stands` (a tenoned part's floor test on its shoulder-trimmed wood), checkedLevelFaces (a leaning part's level
│   │                     faces cut at its shoulders), TENON_HINT (the overlap's mismatch hint);
│   │                     leanFreeChecks.test.ts pins lean-free results byte for byte
│   ├── featureKeys.ts    THE feature keys (feature callouts spec §3): partFeatures (identity, owned segment tags, key line —
│   │                     a short bench line, no positions —, fault suffix, true axis/normal), featureTag, FAULT_SUFFIX; b2: every stopped
│   │                     run, swept or straight, one side or two, keys `<name><fillet>, stopped` (Q22); leanNote / leanNotes
│   │                     (the Plans sheet's lean note from WORLD slopes, once per keyed part; inv 47, 57)
│   ├── drawing.ts        drawView: exact hidden-line vector drawing; every segment TAGGED with its feature (`Seg2.feature`); edges from boardEdges (inv 16) plus hole lines from
│   │                     holeDrawingSegments, occluders from worldBodies (the bodies, angle cuts included, holes not), via partGeometry;
│   │                     a curved part's edges come through `curveDrawEdges`, plus `silhouetteLines`; `opts.section` clips lines and occluders to
│   │                     the kept side and returns `caps` (from sectionCaps; absent without a section); a leaning part never
│   │                     takes the box path, its normals turned by the lean, its edges lifted (leanLifts → curveDrawing's
│   │                     ownWoodLift), boardBox from partBounds (inv 47, 57)
│   ├── explode.ts        explodeOffsets (hierarchical, floor-lifted), EXPLODE_SPREAD/INNER
│   ├── sectionView.ts    section views on the Plans sheet (fu 256): sectionViewOf (flipped = the proper opposite view), markedView,
│   │                     sectionTitle (→ units; from the piece's own min), cuttingLine (null off the piece), hatchPatterns (touching
│   │                     caps differ; boxes first)
│   ├── section.ts        THE section cut (inv 51): Section, keptBySection (THE side test), sectionPlaneOf, sectionSpan,
│   │                     sectionCaps (board-local caps minus bores, a per-part local cache; a leaning part's caps clipped in the
│   │                     pivot frame, its bores subtracted board-local first, and returned in leaned WORLD coordinates,
│   │                     buildLeaningPieces, inv 51; a tilted bore the plane meets skips fu 348's rings fast outline), unionOutline
│   │                     (moved to outline.ts and re-exported)
│   ├── dimensions.ts     overall + chain dimension values and strings per axis (fitting is panels/planDims.ts)
│   ├── plans.ts          planAssemblies: what the sheet draws (copies, mirrored parity); `keyed` / pieceKeyed: which trio keys a part
│   ├── hardwareTree.test.ts  (hardware through the tree: copy, Ungroup merge, Make Unique, repairTree, joinery split)
│   └── treeFixtures.ts, turnFixtures.ts   TEST-ONLY (assemblyDoc; chiralPart, inv 44; chiralCurved);
│                         curveFixtures.ts (TEST-ONLY ARCH, CORNER: never import a test module, it re-registers its suite);
│                         sweepFixtures.ts (TEST-ONLY b1: apronArch, topCorners, notchEdge, frontOnly, plainLoop; b2: twoSide,
│                         stopOnCorner, stopOnArch, stopOnNotch, bowFront, frontAndEnds, twoSideSharp, chiralTwoSide, zoneStop,
│                         wrapThree, wrapFour, the station runs stationRightToBack/FrontToBack/FrontToRight, shortEnds, cornerGap,
│                         cornerGapAs, overlapKinds/overlapCases; chiralAll, all six feature kinds with a hand, for mirrored links;
│                         loader-free);
│                         meshCases.ts (TEST-ONLY c2: sweptIdentity's swept fixtures, moved verbatim, shared by the mesh and edge tests);
│                         shakerTableFixture.ts (the generated, joined, refined Shaker table);
│                         stoolFixture.ts (TEST-ONLY splayed legs: stoolLegs — four levelled legs, rake 8°, splay 12°, linked
│                         in two Shapes —, stoolSeat, stoolDocument, stoolWithCut);
│                         holesSquareCases.ts (TEST-ONLY angled holes: SQUARE_CASES, the square rows whose geometry
│                         holesSquare.snapshot.json holds — captured from the code BEFORE the tilt, so square holes stay byte for byte)
├── store/
│   ├── store.ts          state, edit(), undo/redo/restore, selectionPatch, held points,
│   │                     hiddenIds, copyInRow, group/link/unique actions (invs 4, 24, 34, 42–46); mirrorLinkedPart (the
│   │                     Mirrored checkbox: flag + turn inverseTurn(2a + r), world X, inv 46); linkBoards' part-level flags;
│   │                     setLean (one write per Shape; keepSign / rakeSign / splaySign; refusals LEAN_NOT_UPRIGHT,
│   │                     LEAN_PAST_BOUND, LEAN_TURNS_HOLES — the seam re-choice on a holed part) and levelEnds (inv 57; writes
│   │                     the plan's holes with length and angle cuts); HOLE_TILT_PAST_BOUND from addHoleRows/updateHoleRow; patchBoard's pivot-keeping
│   │                     resize; moveGroupTo rounds the delta when a part leans; round tenons (inv 58): addTenon / updateTenon /
│   │                     removeTenon (world part, through mapWorld; refused with tenonFaultText or a T8b sentence before edit(); the
│   │                     length never changed; store.roundTenons.test.ts) and boreLegSockets' `tenonLegs` (the seat's rows and every
│   │                     leg patch in ONE edit); copyBoard re-mints tenon ids
│   │                     (source's Shape users keep theirs, others take the source's); store.mirrorLinks.test.ts
│   │                     addHoleRows/updateHoleRow/removeHoleRow (one edit, held points re-judged after);
│   │                     addCurves/updateCurve/removeCurve, the same shape
│   ├── assemblyPick.ts   clickTarget (inv 46)
│   ├── selectionGesture.ts  selectByClick, clearOnMiss (shared by viewport and parts list)
│   └── visibility.ts     visibleBoards, the ONE visibility filter (inv 43)
├── storage/          index.ts (THE import site: the chosen adapter, fu 8), types.ts (StorageAdapter), browser.ts, libraryIndex.ts (invs 7, 29–31); get/setShopSettings
│                     (`sloyd.shop.v1`: reading never writes, so a newer build's value survives a rollback; a write
│                     folds `extra` into `materials`); get/setMaterialLibrary (`sloyd.materials.v1`, layout 1; an
│                     unusable or newer value reads empty with `readFailed`, and the dialog never saves over it);
│                     exportProject/exportImage share ONE anchor download helper
├── llm/              types.ts (LlmClient, opaque LlmMessage, inv 37), anthropic.ts
├── generate/         prompt.ts (limitLines; SYSTEM_PROMPT teaches the wire `angles` item and the `profiles` array, AI-profiles), concepts.ts (batch planning), estimate.ts (cost ranges: measured
│                     chars/token, cached prefix, every repair round high; fu 236), refine.ts (refineMessage — names the project's band types
│                     (`Edging types in this design`), KEEP_LINE names edging and edge profiles, the design sent through toWireDesign —, detailFor), run.ts (runRepairLoop, evaluateDesign — THE design evaluation
│                     shared by Generate and Refine, hole, band and profile design faults included, runRefine — the result's own band types, plain and joined —, runJoinery),
│                     joints/{pocket,sites,recipes,choose,unjoin,repair,tapers,featureZones}.ts (featureZones.ts: `featureAllowed` + `RuledOut`, per-site ruling-out of joint kinds by watched trials (inv 41; rabbet and half-lap units; a stopped dado per stop end, `endHits`, narrowing `stopEnds` to the ends that clear — "Offer clear ends", chunk 3; bands judged in the original frame, P9–P11, word `edge band`); recipes' `JoinWatch` (observer of cuts and resizes during a trial) and `rebaseHoles` (from `document/holeRebase.ts`) / `rebaseCurves` / `rebaseProfiles` (re-anchored on resize, undone by `resizeAt`; `sameCurves` / `sameProfiles` in the gate; featureZones judges curves and profiles in the original frame, P5, and exempts a curve or straight profile that only meets a growing end when its waste on an `END_FACE` (1e-6) slab stays out of the tenon section, `meetsOnly`, fu 415; `rebaseCurves` re-stores an arc at the half-circle bound at its new chord's bound, C1; tests: holesOracle / curvesOracle / bandsOracle (the backstops), holesRebase / curvesRebase, featureZones(.curves, .bands), joinWatch); sites.ts `rangesOf`' inset clearance (`bandClearance`, chunk 3 F2: a stop end beside a receiver band raises the smallest inset to clear its strip); `document/ruledOutText.ts` (`FeatureWord`, `profileWord` (`<kind> profile`), `ruledOutLine`: the run-summary notes, one line per ruled-out site, shown in the run's outcome notes; spec §3.5); holes.ts `holeRegion`; tapers.ts: taperConflicts, angleConflicts + clearsTenon, jointFaults (model-facing `angle-joint`, for evaluateDesign), joineryRefusal(entry, …) — the ONE joinery refusal decider, `leaningRefusal` first (JoineryEntry 'joinery' | 'repair' | 'refine', one sentence each; Repair and a joined Refine call it directly, inv 41, 57), then `tenonRefusal` (round tenons §9: a part with any stored tenon, one sentence each; Repair and a joined Refine call it too, after the lean); inv 41; recipes' `refaceFromEnd` re-stores an end cut from another face, fu 205, and `rebaseAngleCuts` keeps angle cuts on their wood, fu 307); unjoin + gateUnjoin
│                     read joints back, proved by an exact (1e-9in) re-join (readJoints = the lenient
│                     body); runJoinery's `fixed` keeps recorded joints passing validChoice, `alsoPresent`
│                     = original's problems; repair.ts = fu 240's prune-and-prove (a stray must be empty
│                     and its twin the same stored part; evidence rule); joints/fixtures/ = damaged docs made by the buggy 4a340f7
├── useGenerations.ts, useJoinery.ts, useRefine.ts, useRepair.ts   write only via createProject(…, {activate:false}) (inv 36)
├── viewport/         NO unit tests by design. Viewport, BoardMesh (inv 21), MoveTool +
│                     moveCandidates, TapeTool, Gizmo (invs 3, 10, 42; dragTarget rounds a leaning part's DELTA, the handle at partBounds' centre, inv 57) + gizmoPatch.ts (the flip fix and size ceiling, tested), GuideMarkers,
│                     SnapMarker, snapPick (screen-space nearest, on purpose), grain*.ts,
│                     framing.ts (pure, TESTED: STANDARD_VIEWS = the Plans sheet's views, viewDirection, subsetBounds
│                     with explode offsets, zoom/distance); Viewport's `ViewportHandle` (showView, capture — the clean
│                     frame hides Gizmo/MoveTool/TapeTool by a `hidden` prop, NEVER by unmounting them)
│                     (invs 12, 14, 15, 17, 35), pointer.ts, gridDensity, screenScale, extent;
│                     grainTiling.ts' hole path (inv 50): bodyMesh (holed faces; seam faces subtracted only in holed
│                     bodies), faceTriangles (rings as holes, clip-split fallback), holeMesh (one hole's wall + bottom;
│                     clean = unclipped), holesMesh (every hole of a part, ONE geometry); holesPerf.test.ts (the guard);
│                     a tilted bore: elliptical rings on the face planes, ringDisc (its conservative disc for the clearance
│                     tests, fu 451), the far ring at `reach` or the bottom disc square to the bit (holeBottom); watertight
│                     sectionPlane.ts (THE shared clipping plane, inv 51); BoardMesh draws its part's cap (a leaning part: its group gets the lean as ONE derived transform, the `leaned` memo, and its cap is drawn as a sibling at identity, inv 57); sectionPerf.test.ts
│                     grainTiling's drawsAsBox (THE BoxGeometry-or-bodyMesh routing: a box no hole reaches,
│                     on a part WITHOUT curves), bodyMesh's radial normals on chord faces and curvedPart (seams dropped, welded,
│                     conformed); conform.ts (insertOnEdges, centroidFan, welder, CONFORM_EPS 1e-7); capFill.ts (THE cap fan,
│                     moved out of BoardMesh; conformed for a curved part); curvesPerf.test.ts (the guard),
│                     curvesWatertight.test.ts (every directed edge matched), bodyMeshIdentity.test.ts (holed, uncurved: master's bytes)
│                     bandFaces.ts (edge banding chunk 2): bandLooks, bandViewSignature (BoardMesh's memo key), bandedMesh (THE band paint:
│                     a post-pass moving on-side triangles into groups 6+, UVs along the stretch); bandFaces.test.ts
│                     c2: grainTiling's `partMesh` (a shaped part's ONE geometry, six material groups; no memo on the bodies, A3: they are shared across poses and ids), twinSkip.test.ts
│                     b1: bodyMesh shades a swept profile's faces by `sweptNormals` (sweptNormals.test.ts; per face, so a ~0.005 rad step at a
│                     tangent point); `runoutFor` falls back to `runoutOf` for every view-curve id; b2: a `stop` face takes its cutter from the
│                     stop frames only (`stopRunoutNormals`), any other run-out face from `sweptRunouts` only; a vertex ON a stop plane takes the
│                     band's normal (`stopJunctions`); stopNormals.test.ts
├── panels/           DimensionField/NameField (invs 5, 9), Properties (the Mirrored checkbox on a linked part), CopyInRow,
│                     PartsList (a mirrored part's ⇋ badge, `role="img"` "Mirrored"),
│                     Toolbar, TapeReadout (invs 27, 28), GuidesList, ProjectMenu (CLAUDE.md's per-file rule, in full: a row click closes the
│                     menu at once; `onOpen` resolves null or why the project cannot be opened (`storage.readProject`, asked only
│                     on failure so the switch path keeps `loadProject`), and a failure reopens the menu on that row with the
│                     message, focus on the caret, fu 35),
│                     SettingsDialog, GenerateDialog, JoineryDialog, RefineDialog, RepairNotice, CutList, PartDiagram,
│                     SheetLayout (index labels are cut-list ROW numbers via its `numbers` map; a callout's number sits in a row outside the
│                     drawing's nearer long edge — `packRow`, measured boxes, ordered by the part's centre — with a leader from the
│                     part's near edge to its own number), diagramScale, diagramLabels (inv 19); planBalloons
│                     (anchorsFor / layoutBalloons: the exploded view's balloon columns; with none it IS layoutSingle); planKeys (a trio's
│                     feature tags: chooseView, letters, anchors, merge and push; pure — view order true and visible, visible, true
│                     and hidden, any hidden, ties Front, Side, Plan; same-letter tags within a diameter merge, others pushed out
│                     along their leaders and clamped inside the figure, a tag that still overlaps not drawn and its letter noted); Popover (Claude ▾, More ▾; an item may carry a
│                     `title`, and `items` may be a function, called on each render while open),
│                     Banding (the Banding section, the additions' pattern: while no selected part is banded only `+ Add banding ▾`; once
│                     any is, a select per side, `Band ▾` — each type's all edges / long edges / ends, Remove all bands —, Corners only where
│                     `bandsMeetAtCorner`; both menus end with `New solid edging…` (`onNewBandType`: App opens Materials & prices with
│                     `newBand`, a new Solid row's name focused — read off the KEPT state, StrictMode runs initializers twice); options judged on focus, a refused one greyed with its reason; Mixed
│                     writes nothing untouched; one `setBands`, one undo entry) on bandingRefusal.ts (bandEditRefusal: an ADDED band
│                     fault on any selected part; bandsShownCorner),
│                     ViewportControls (tools/view over the canvas), ActionBar (three actions, More ▾,
│                     trash), GuidesFooter (opens itself when the guide count goes up), PlansSheet / PlanFigure /
│                     planLayout / planDims (the Plans sheet: figures, one-scale third-angle layout, dimension fitting;
│                     PlanFigure's `pathOf` chains a segment into the previous subpath only when its start meets the previous
│                     end AND it is the same part, so a hidden rim dashes continuously); PartDiagram draws hole ellipses
│                     (rx = r·sx, ry = r·sy), centre crosses, dashed sides and the hole notes (keyed by row); a tilted bore's
│                     ellipse as a `<path>` of TILT_ELLIPSE_POINTS points in user units and its slanted band (`quad`);
│                     MaterialsDialog ("Materials & prices": built-in prices, custom definitions + prices, library rows;
│                     one Save = one project edit + library + prices; refuses, never clamps) on materialsDraft.ts (THE
│                     pure rows/refusals/planSave/rebaseRows) and MaterialDefinition; its Edge banding section on bandTypesDraft.ts
│                     (THE pure band rows: newBandRow, fromDraft, bandRowRefusal — an ADDED fault judged against the STORED band
│                     types, a name clash refused only when typed —, planBandTypes, rebaseBandRows; kind from `+ Add band type ▾`,
│                     never a select, P3; delete refused while used, `Used by N parts` in world parts); its Hardware section on hardwareTypesDraft.ts (THE pure
│                     hardware rows/refusals: name, clash, pack size, price; delete refused while used, `Used by N — remove it from them first.`); CutList's Buying section
│                     AngleCuts (the Angles section: "+ Add ▾" — Taper, Miter, Miter both ends, Bevel, Chamfer —
│                     and one row per kind), AngleField (DimensionField with a degree parse/format; max floored to 0.1°; `min0`, a mixed
│                     `null` value); Lean (the Lean section, upright parts only: Rake/Splay magnitude fields + direction selects,
│                     the resultant/sightline readout, the position note, the stale-ends note, `Level the ends` and the stale
│                     note single-selection, `Clear lean`; inv 57);
│                     Holes (the Holes section: "+ Add hole ▾" — Hole, Shelf-pin row, Hinge cup —, one row type; an edit refused
│                     when it ADDS a fault; Count 1→more seeds a pitch, chunk 1 R5; Tilt toward end / side with the Tilt end /
│                     Tilt side selects and the `off square · sightline` readout, retilt on a face/flag/along change only;
│                     Socket diameter + Bore leg sockets on an unleaned part with legs under it, the stale-socket note; round tenons:
│                     the checkbox `Tenon the legs (replaces their top tenons)`, on by default, and the stale tenon note per found leg);
│                     RoundTenons (the Round tenons section, after Holes, round tenons §4: one row per end — Top/Bottom upright, else
│                     Length min/max end —; `Add round tenon` with defaultTenon, withheld with its fault when the store would refuse it;
│                     Diameter, Length, `Shoulder … from the …`, `Seated in …'s socket.`, the kept-fault note, Remove; every decision
│                     the store's addTenon / updateTenon / removeTenon), CountField (DimensionField, whole numbers; also the hardware counts, `Enter a whole number, 1 to 999`);
│                     Hardware (the Hardware section: `+ Add hardware ▾`, a count per type, `New hardware type…`; a part, an assembly or, with
│                     nothing selected, the project — inv 55; reads `holderHardware`, whose arrays are STORED);
│                     Curves (the Curves section: "+ Add curve ▾" — Arch, Half-round notch, Bow, Rounded
│                     corner, Rounded corners —; rows by derived kind; a Kind select (`curveAs`) whose options are judged ONLY while it has focus — never per render, every edit frame is one; refusalFor: half circle first, then an ADDED curve fault,
│                     then a hole into the waste) — on curveRefusal.ts (Draft, Control, HALF_CIRCLE, pastHalfCircle, holeRefusal,
│                     refusalFor, optionReason: shared with Profiles; b1: profileRefusal / profileFaultsBefore / curveEditRefusal — a curve edit
│                     that ADDS a profile fault is refused naming the profile, `Too tight for the roundover — reduce the roundover first.`;
│                     b2: an added stop-off reads `A stop on the roundover runs off the part — move it first.`);
│                     Curves skips profiles and offers Rounded corner through the thickness only;
│                     Profiles (the Profiles section: "+ Add profile ▾" — a preset takes the FIRST edge its default fits, DEFAULT_PROFILE_EDGE first,
│                     and its detail names that edge (I1); withheld only when no edge fits; rows:
│                     Face, Side (hidden on a loop), Run (End to end / Stopped / All round; Stopped on any side since b2, B7 lifted), Stop side (b2,
│                     Stopped only, default the Side: on a two-side run Side moves only Start and Stop side only Stop (`moveEnd`); on a one-side
│                     run Side moves both ends (a2; an end it runs off is greyed) and Stop side onto an ADJACENT side moves the station nearer the
│                     shared corner (`moveNearer`, R5), onto the OPPOSITE side keeps the station shown as Start (R6) or the kept side's extent (R7);
│                     a moved end keeps the number it shows unless that adds an own fault, a moved through end is always seeded `min(3, L/4)` in
│                     from the corner; Face on a two-side run swaps Start and Stop; one `set`, one undo entry), Start/Stop (each from its own
│                     side's run dimension's min end; one side: the lower and higher
│                     station; a typed 0 or full length — as the field SHOWS it — is a through end, I2, on two sides only where `throughConsistent`;
│                     crossed ends refused on one side, two sides shown as stored), Profile (a change takes the new kind's default; options judged on focus, a refused one greyed with
│                     its reason, fu 388), the size, Depth (thumbnail), Fillet or Quirk (bead),
│                     Facing for asymmetric kinds (`Top: the edge` on a loop or two-side run); a fallen-back run's note by cause
│                     (`runsStraightNote(fallbackCause(…))`); an edit refused when it ADDS a fault to ANY profile on the part, the row's own
│                     in `PROFILE_REFUSAL` words, another's through `curveEditRefusal`)
├── styles.css        surface ROLES over --grey-*/--walnut-*; palette.test.ts pins contrast (4.5:1)
└── App.tsx           layout, autosave/restore, the ONE keydown effect (inv 27), `pending`
                      (inv 29), switchToken (inv 32), `.app-shell` inert behind any modal; `FEATURE_CHECK_FAILED` (the joinery
                      dialog REFUSED when checking features against joints throws, fu 244, P8)
```

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.
