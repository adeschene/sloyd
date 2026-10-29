# Sloyd — module map

> Split out of `CLAUDE.md` on 2026-10-20: the annotated source tree, as maintained. `CLAUDE.md`
> keeps a short index. The per-file rules not covered by an invariant (moved here 2026-10-26) are
> at the end, in full: they are rules, not annotation. Where a file's own doc comment is the stated single
> source of truth, read it there. Rules are in `docs/invariants.md` (`inv N`).


An index; the rules are in Invariants (`inv N`). The fully annotated tree as of
2026-10-07 is in `docs/history.md`. Where a file's own doc comment is the stated single
source of truth — `tapeHover`'s clearing enumeration, `tapeAxis`'s structural rule,
`TapeAxis`'s world-vs-board-local argument, `woodCut`'s seam argument, `App.tsx`'s
`pending` — **read it there.**

```
src/
├── units/            length.ts (Units; parseLength/formatLength(…, units)/canBeginLength; capture set {0-9 . -}; formatMm,
│                     formatLengthBare, formatSize, floorToTick, ceilToTick; inv 52), nominal.ts
│                     (NOMINAL_SECTIONS, nominalName — EXACT at 1e-9, either order —, stockLengthText: whole feet `8′`),
│                     quantity.ts (board/square feet, two decimals fixed; weight and density text: formatWeight, formatDensity, densityText, parseDensity, densityLimitText — weight, inv 63)
├── document/
│   ├── types.ts          Board, Cut, Shape, ShapedBoard, StoredBoard, Instance, Definition,
│   │                     SloydDocument, FlatDocument, MATERIALS, sheet stock, HoleRow (`Board.holes`, `Shape.holes`);
│   │                     Dovetail (`Board.dovetails?`, schema 26, inv 62; `lap?` after `outside`, schema 27, half-blind only, on both entries)
│   ├── document.ts       create/validate/migrate (inv 11); takeId (inv 33); trueTurnsToV8 /
│   │                     mirrorCutAlong (inv 44); validateGuides, validateShapes; the curve validator holds an arc within 4 ulps
│   │                     of its coordinates past the half-circle bound TO the bound (fu 416), drops one further past;
│   │                     schema 21 keeps `mirrored` on a SHAPED part only when literally true (mirrorFreeIdentity.test.ts pins a
│   │                     flag-free document byte for byte); CURRENT_VERSION 27 and validateDovetails (dovetails, inv 62: a malformed entry
│   │                     dropped, the part kept; a faulted one kept; ids per board; document.v26.test.ts; v27: a present `lap` not
│   │                     finite and > 0 drops the entry, a valid one copied on either role, no key when absent; document.v27.test.ts)
│   ├── ids.ts            nextId, the one id minter
│   ├── names.ts          uniqueName / dedupeNames among siblings (inv 8); derivedName,
│   │                     the derived-PROJECT name ("— refined 2", fu 237)
│   ├── geometry.ts       axisFrame, the ONE turn table, and its crossings (inv 44);
│   │                     boardExtents/boardCenter/reorientedPosition (inv 2), boardsBounds (the PRE-lean box: read through
│   │                     worldBounds.ts)
│   ├── lean.ts           the ONE home of the lean math (splayed legs §3.3): slopes ↔ degrees, resultant, sightline;
│   │                     leanMap (rotation about the top-face centre; apply/applyDir/inverse/inverseDir on WORLD points of the
│   │                     pre-lean placement; null for no or zero lean), worldSlopes, chooseFace, seamFree, leanFlip (mirrors),
│   │                     leans (the cheap predicate), pivotKeptPosition (a resize keeps the pivot), withinBound (inv 57); square-set legs (schema 25,
│   │                     inv 59): leanMap is m = T for a square-set lean (`square: true`), T · Ry(τ) otherwise; leanTwist (the τ a TURNED
│   │                     lean would apply, through twistOf: the store's Set gate); leanFlip keeps `square`
│   ├── holeRebase.ts     rebaseHoles (joinery's resize re-anchor, moved from generate/joints/recipes.ts; stretchPart calls it one row at a time, inv 64) and levelEndHoles
│   │                     (Level the ends' end-face rule: rows follow the wood, a tilted row's mouth slides along its bit;
│   │                     angled holes §7), storableRow (the loader's keep test for a re-anchored row)
│   ├── legSockets.ts     Bore leg sockets (angled holes §5), the ONE decider, pure: legsUnder(world, seat, units) (leaning parts whose
│   │                     level top is within TOUCH of a down face, overlap > REST_AREA — from checkTolerances.ts —, OR a TENONED leg:
│   │                     tenonInSeat — its top tenon's centre segment, shoulder centre → tip centre, in the seat's stock over a down face,
│   │                     the axis meeting that face inside its outline; the ONE predicate staleSocketOf shares, ruling T9a — and
│   │                     isLevelled, round tenons §6.3), partAxis (ANY part's world axis, min → max; WorldAxis), legAxis (partAxis
│   │                     pointing up, leaning parts only), boreEnds, boreAlongAxis (THE coaxial test, 1e-9: isSocketOf and the tenon
│   │                     joint's seatedIn each add their own rule on it), boreRow (THE bore core, stretchers §3.4: a world mouth
│   │                     and bit direction into a single-hole row — fromWorld of two points, flag-relative slopes, a zero slope
│   │                     omitted, `othersOf` layout, nearer end/side; the tilt bound the caller's), socketRow (a seat's THROUGH row
│   │                     on the leg's axis, entering from the top, through boreRow; pinned by literal), rungEntryOf (a leg's LONG
│   │                     face whose leaned outward normal is nearest the direction toward the other leg, first in axisFrame order on
│   │                     a tie), faceCrossing (THE line-meets-a-face test: the t, or null when parallel or off the face, 1e-9),
│   │                     rungSocketRow (a rung's BLIND row along its world axis, the depth to the tip rounded UP to the step;
│   │                     socketTooSteep past the bound; throws for a line off the face or a tip short of the mouth, ruling T1a), isSocketOf (a through bore from the top, 1e-9) / staleSocketOf (tilted, through, from the top;
│   │                     the axis line through a leg top in the TOUCH band; none for a matched leg), socketPlan (every copy plans its own legs; lowered
│   │                     STORED row sets compared as a multiset, flag-free, 1e-9; a faulted socket left out as `note`); its five sentences, verbatim;
│   │                     round tenons §6: socketPlan's `tenonLegs` → `legs` (world patches, one per storage target), fitTop (levelPlan with
│   │                     `topAt` the seat's top, the shoulder clearing the underside, the length rounded UP to tenonStep), legTenonPlan
│   │                     (fitTop judged by tenonFaults), fitLegs (every storage group judged against its own seat; socketsDisagree;
│   │                     Level the ends' refusal refuses all; a faulted fit named in `note`), changesNothing (inv 4)
│   ├── stretchers.ts     Add stretcher and Fit the stretcher again (splayed legs chunk 3, inv 60), the ONE planner, pure, no → units
│   │                     edge (a TYPE-only `Units`; its sentences come from stretcherText.ts and carry no length): rungLine (the legs' axis points at y = h, exactly one of X/Z apart by > 1e-6,
│   │                     made exactly axis-aligned; out of reach / not square), shoulderStation (the four corner lines' exits from
│   │                     the leaned bodies — bodySpans, THE line-vs-body clip, cornerExits —, the largest), gapOf (the shoulder gap,
│   │                     ruling P1), fitOn (L and S floored to the grid, the slack split, the tips; the entry-face pre-check
│   │                     onEntryFace, ruling T1a), stretcherPlan (every refusal in order, the rung as a WORLD part, `container`,
│   │                     `legs` one per storage target, `notes`, `gap`; reuse by seatedIn unless another part's tenon holds the row —
│   │                     holderOf, THE held test, shared with usedRow; ruling TFa —, holeFaults on a trial document),
│   │                     defaultHeight (a third of the lower axisTop, snapped, stepped 1-1/2" / 40 mm past a `meets-hole` or a taken row, ≤ 20
│   │                     steps), axisTop, rungSize / rungTenon and RUNG_SIZE / RUNG_TENON / RUNG_STAGGER (the defaults),
│   │                     rungLegAt (THE finder: the first UPRIGHT part in world order a tenon's centre segment meets by > TOUCH),
│   │                     stretcherOf (an unleaned, level rung whose two tenons find two different legs; `seated`, `height`, `gap`;
│   │                     legs in tenon order), refitPlan (the closure — every stretcher using a row a member uses, one per stored
│   │                     rung, rulings T3d/T3e —, each re-planned at its own height; rows moved in place, ids kept; usedRow's stale
│   │                     rule: the nearest blind bore of the diameter not holding another part's seated tenon; throws for a
│   │                     non-stretcher); stretchers.test.ts
│   ├── stretcherText.ts  THE stretchers words (→ units: it produces strings), verbatim: the refusals (stretcherTurnedLeg,
│   │                     STRETCHER_SIZE_POSITIVE, STRETCHER_NOT_SQUARE, stretcherOutOfReach, STRETCHER_CONTAINERS, stretcherMirrored,
│   │                     stretcherSocketFaulted, stretcherTaken, stretcherDifferentSocket, stretcherClosureDisagrees, stretcherTurned, stretcherAmbiguous), stretcherLinkNote,
│   │                     stretcherReadout / stretcherStale (the rung's readout, formatLength with the document's units; the gap rounded UP,
│   │                     ceilToTick, under "up to"), the
│   │                     section's heading, fields and buttons; STRETCHER_NOT_A_STRETCHER (internal, ruling T4b)
│   ├── boxJoints.ts      Box joints (dovetails chunk 1, inv 61), THE layout, THE recogniser and THE planner, pure, no → units edge (a TYPE-only
│   │                     `Units`): fingerLayout (equal fingers `w`, ONE odd finger `odd`, a sliver under w/4 merged; null when N < 5),
│   │                     segment (direct from the start edge, the odd one at `oddEnd`, never a running sum), notchCuts (full-thickness
│   │                     notches, `along` asserted), fingerSets / fingerSetAt (SHAPE only; FingerSet nests `layout`, reports `fingerAtMin`
│   │                     and `oddEnd`, part-local), fingerAtMaxOf (re-exported from the leaf
│   │                     `fingerParity.ts`, the even-N parity, which `boxJointText.ts` imports too: no cycle),
│   │                     defaultFingerWidth, boxJointPlan (every refusal in order, corners found by touching ends AND overlapping J
│   │                     spans, the parts as WORLD parts, link post-condition) and applyBoxJoints (writeBackParts, keepWorld); boxJoints.test.ts.
│   │                     Since dovetails: the box-joint KIND (`JointKind`) of cornerPlan.ts's shared planner (the corner finding, run-out,
│   │                     region refusals and linked-Shape planning moved there unchanged); featureOf refuses a dovetailed part (`dovetails`,
│   │                     read from the leaf dovetailModel.ts)
│   ├── fingerParity.ts   Box joints' even-N parity (fingerAtMaxOf), a leaf importing nothing, read by boxJoints.ts and boxJointText.ts
│   ├── boxJointText.ts   THE box joints words (→ units: it produces strings), verbatim: the refusals (boxCutInTheWay … boxLinkSplit), the
│   │                     success lines (boxJointedLines, boxLengthLine), fingerSetLine (the cut list's and the diagram's), the joinery
│   │                     reason (boxJointedLeftAlone), Refine's (boxJointsThroughJoints, boxJointJoinChanged), the section's words; since
│   │                     dovetails the shared corner sentences are cornerText.ts', re-exported here under their old names (BOX_NO_CORNER,
│   │                     boxIgnored, boxHeights, boxTwoCorners, boxContainers, boxLinkedMate, boxLengthLine), and BoxFeature gains `dovetails`
│   ├── cornerPlan.ts     THE corner planner (dovetails chunk 2, factored out of boxJoints.ts unchanged; invs 61, 62), pure, a TYPE-only `Units`
│   │                     (no → units edge: every sentence comes through the kind's CornerCopy): CornerEnd / Corner / EndOp, EndFlips
│   │                     (`dim`, `j`, `thickness`; flipsOf — `thickness` unreachable, no posture's mirrorDim is the thickness), CornerCopy,
│   │                     JointKind (featureOf, removeAt, planCorner, addAt, signature, and the ONE optional hook `inset` — half-blind:
│   │                     how far an end stops short of the other part's outside face; box joints do not implement it), RUN_RANK (Z, X,
│   │                     Y: who takes the leading role), planCorners' STEP 3a (every corner's insets, side 0 then 1, before any end moves;
│   │                     a string refuses) and step 4's inset EndOp (`far` moved `L` back into the other part, the size from that `far`,
│   │                     `depth − L`; an end with no inset takes the original expressions),
│   │                     corner finding (touching ends AND overlapping J spans), the exact run-out (resizeEnd), the corner region,
│   │                     cutRunsThrough (THE "runs straight through the corner" predicate, also read by dovetails' zone check), linked-Shape
│   │                     planning (Shape-local signatures, sizes at 1e-9), planCorners and writeCorners (writeBackParts, keepWorld, the link
│   │                     post-condition)
│   ├── cornerText.ts     the corner planner's SHARED words (→ units: it produces strings), moved verbatim from boxJointText.ts: NO_CORNER,
│   │                     cornerIgnored, cornerHeights, cornerTwoCorners, cornerContainers, cornerLinkedMate, cornerLengthLine
│   ├── dovetailModel.ts  the stored dovetail's model, a LEAF (types only; so dovetails.ts, boxJoints.ts and dovetailText.ts read it with no
│   │                     cycle): DOVETAIL_FIELDS (inv 40) / dovetailValues / sameDovetail / copyDovetail, byDovetailEnd (canonical order),
│   │                     dovetailsOf, hasDovetails, dovetailAt, withDovetails (an empty list REMOVES the key; `lap` in DOVETAIL_FIELDS,
│   │                     and dovetailValues OMITS an absent lap — a present one appends `|lap=<v>` — so through keys are unchanged), and THE layout:
│   │                     dovetailLayout (bounds computed directly, the last tail's far edge `H − p`) and jointLineOf (re-exported from
│   │                     dovetails.ts, the layout's documented home)
│   ├── dovetails.ts      THE dovetail (schema 26, inv 62; half-blind's lap, 27), numbers only (a TYPE-only `Units`): pinWidth (1/4", 6 mm), autoTailCount (1.5",
│   │                     38 mm), autoLap (half-blind: t/3 to 1/16" or 1 mm, at least 1/8" or 3 mm; branches on `units.display`),
│   │                     dovetailFaults (THE fault decider: count, slope, lap — a PINS entry's lap not strictly inside its thickness —,
│   │                     depth — two depths meeting folded in —, narrow at 1e-9, the pins' X = thickness − (lap ?? 0)),
│   │                     builtDovetails (THE "which build" list, memoised per board object, frozen), mirrorDovetails / lowerDovetails (inv
│   │                     44: flag flips), dovetailViewCurves (the waste as square-span view curves, ids `dovetail/<id>/<k>`; appended by
│   │                     profiles.ts' geometryBoard; a half-blind pins outline runs from the LAP PLANE to the inside face), dovetailCorners (snap corners at
│   │                     the outside plane; a half-blind pin's on the lap plane), dovetailZones / dovetailZoneRefusal
│   │                     / dovetailCutRefusal (spec §3.6: a cut or hole reaching a dovetailed end; a through groove exempt by
│   │                     cutRunsThrough), and the dovetail KIND of cornerPlan.ts: dovetailPlan (every refusal in order; Auto, re-plan G3,
│   │                     Swap; DovetailOptions `joint` 'keep' | 'through' | 'half-blind' and `lap`, both optional; `corners[].lap`) and
│   │                     applyDovetails (writeCorners); dovetailCornerStyle (exported, THE tails-side and lap decision — the re-plan's
│   │                     current tails part else RUN_RANK, then Swap; the kind by `joint`, under keep the PINS entry's lap; the lap typed,
│   │                     else kept when the pins part is unchanged, else autoLap; a lap outside the pin part refuses — read by the kind's
│   │                     `inset` and by planCorner, so both see one answer; planCorner's narrow probe carries the lap, addAt spreads it on
│   │                     both entries only when non-null, the signature appends it); dovetails.test.ts, dovetailGeometry.test.ts, dovetailPlan.test.ts
│   ├── dovetailText.ts   THE dovetail words (→ units: it produces strings), verbatim: the planner's refusals, the success lines
│   │                     (dovetailedLines, dovetailTailsOn), dovetailRemoveFirst / dovetailMoveClear (spec §3.6), the joinery reason
│   │                     (dovetailedLeftAlone), Refine's (DOVETAIL_KEPT_WHY, dovetailJoinChanged, dovetailedAssemblyLinked,
│   │                     mixedAssemblyLinked), dovetailFaultText, the panel's words, dovetailLine (THE cut-list line; `Te` from the ONE
│   │                     layout; ONE template for both kinds: `Half-blind` head and the pins clause's lap when `lap` is present), slopeText,
│   │                     the bench drawings' words (BENCH_*, benchBaseline, benchEnd, benchLap); half-blind: dovetailTooThin, DOVETAIL_LAP_PARSE
│   │                     (the Lap field's parse error and the planner's answer to a lap ≤ 0), the Joint select's and Lap field's words,
│   │                     FAULT_REASONS.lap, dovetailedLines' half-blind forms (`units`/`lap` optional; a lap without units throws); re-exports cornerText.ts' shared
│   │                     sentences; reads the layout from the leaf dovetailModel.ts, never dovetails.ts (whose copy table imports this)
│   ├── dovetailBench.ts  the bench drawings' model (spec §5.2, inv 19; → units: formatLengthBare, bare mm in metric): dovetailBenches (one
│   │                     pair per distinct FAULT-FREE tails layout, two equal ends one pair `both ends`), BenchFigure (outline, waste
│   │                     polygons, the chain `p, Te, p, …` at each span's middle, labels by BenchLabelKind, the layout's bounds, figure A's
│   │                     baseline; half-blind: figure B's `lap`, its height `depth + lap`, sockets from the lap plane, the chain at the lap
│   │                     plane, a `lap <x>` label kind; layoutKey appends the lap only when present); every string assembled here, never in
│   │                     the component
│   ├── dovetailFixtures.ts TEST-ONLY (never import it from a module): expectPartition, the world partition of a dovetailed corner (the
│   │                     two parts' kept pieces fill the corner square exactly, no shared volume, to 1e-9), read off the INPUT fixture's
│   │                     outside faces (inv 23); used by dovetailPlan.test.ts; half-blind: halfBlindCorner (a through corner with the tail
│   │                     part shortened by the lap, its numbers asserted off the INPUT parts) and expectLapSlab (the slab is the pin part's
│   │                     wood alone); expectPartition finds the tails entry by `depth === thickness − (lap ?? 0)`
│   ├── resizeEnd.ts      resizeEnd (joinery's resize core, moved from generate/joints/recipes.ts, `onResize` where the Tap was) and the
│   │                     rebase helpers (refaceFromEnd, rebaseAngleCuts, rebaseCurves, rebaseProfiles); recipes.ts still re-exports
│   │                     the four for the unedited tests (fu 495); stretchPart calls the last three ONE FEATURE AT A TIME on a one-feature
│   │                     copy (near → the far end, far → the fixed end, inv 64) — never `resizeEnd` itself (inv 64's prohibition)
│   ├── levelEnds.ts      Level the ends (splayed legs §5, inv 57): levelPlan (two end miters along seamFree's face — on a SQUARE-SET
│   │                     lean, inv 59, one compound miter per end along the larger slope, ties width, `across` the rest, its line
│   │                     through the through centre; dirOf: a dimension's world direction signed by `reversed` —, each end's
│   │                     length change rounded UP to the grid, top through R — the recognised top cut on the axis, else the pivot),
│   │                     isLevelled, levelCutOf (ANY end miter is a level cut), sameLevelLine (compares `across` too)/depthFromMin; the refusals, verbatim;
│   │                     round tenons: levelPlan's `opts.topAt` (a given top height, Tenon the legs) and roundUp exported (THE rounding rule)
│   ├── leanContacts.ts   the checks' lean crossing (inv 38, 39, 57): worldBodyFaces (moved here from designCheck.ts, re-exported
│   │                     there; the lean composed), levelFaces (±Y within LEVEL_EPS 1e-9), overlapArea (plan polygons)
│   ├── leanKeep.ts       Refine's keep (inv 56, 57): keepsExactly (THE predicate: leans, a tilted hole row — angled holes §9 —, a
│   │                     round tenon, hasTenons, faulted included — round tenons §9 — or a compound end cut, hasCompoundCut — inv 59),
│   │                     whyKept (the note's reason words; `has a compound end cut` only when nothing else applies, a cleared leg),
│   │                     keptWhy (the done view's per-name reasons, nouns — `leaning`, `round tenon`, `dovetails`, a placement's kind —
│   │                     `Kept exactly as is: Drawer (dovetails)`; the copy review 2026-10-27; model-facing words stay in whyKept),
│   │                     keptParts (THE decision: ROOT stored parts whose resolved form keepsExactly + their
│   │                     Shapes + flat names; box joints, inv 61: also `definitions`, `instances`, `placements` of a kept ASSEMBLY),
│   │                     leaningInAssembly ('lean-assembly'; keptForMoreThanFingers, so box joints alone never refuse), keptAssemblyLinkRefusal,
│   │                     keptNote (the USER-turn note, real bounds, why kept; one line per kept placement); dovetails (inv 62):
│   │                     cornerJointed (THE corner-joint predicate — a recognised finger set OR a stored dovetail — read at every keep and
│   │                     leave-alone site; keepsExactly = keptForMoreThanFingers || cornerJointed), CornerKind / definitionKind /
│   │                     assemblyKind / kindHasBoxJoints / kindHasDovetails (a kept assembly's words, both kinds when both), whyKept's
│   │                     `has dovetails`, keptAssemblyLinkRefusal worded by the holding definition's kind
│   ├── worldBounds.ts    partBounds / partsBounds, the ONE real-bounds helper (splayed legs §6.1 R2): a leaning part's
│   │                     world box from its LEANED body vertices; lean-free = boardsBounds exactly. Every world-box reader
│   │                     (group move, Copy in a row, section heading/span, Gizmo, framing, explode, Plans dimensions, the
│   │                     drawing's boardBox, the design checks' boxes, Refine's kept note) uses it
│   ├── frames.ts         placeBoard / placeInstance, the ONE composition (inv 46); mirrorPart/withMirror/toLocal (mirrored frames);
│   │                     mirrorFeatures (mirrorPart's feature half: what a mirrored user resolves through, inv 44; tenons by mirrorTenons,
│   │                     dovetails by mirrorDovetails, no key added for a part with none); mirrorInPlace
│   │                     (features mirrored + turn negated, box kept; the checkbox's operation at chain turn 0, used by tests)
│   ├── mirrorCut.ts      mirrorCutAlong (moved verbatim), mirrorCut, clamp (inv 44)
│   ├── tree.ts           occurrence paths, isCovered, worldParts (THE walk), flatDocument; mirroredAt (assembly parity),
│   │                     sideAt (assembly parity XOR the part's own `mirrored` flag, inv 46); treeRows carries a part's flag
│   ├── treeEdit.ts       every write-back: applyWorldEdits (storageKey), lowerEdit,
│   │                     translateItems, writeBackFlat (inv 46), writeBackParts (box joints, inv 61: full after-states, keepWorld, one edit per
│   │                     storage key, regroupShapes); lower/lowerCuts are the exact inverse
│   │                     of a mirrored placement; postureRefusal (flat<->upright across a mirror), sameSideFirst (both by sideAt);
│   │                     lowerOwnMirror (a mirrored user's features into its Shape's hand against withShapeFeatures, inv 44);
│   │                     regroupShapes: exact membership through each user's own flag, flaggedKeys (inv 46, fu 432); dovetails (inv 62):
│   │                     lower and lowerOwnMirror lower them (lowerDovetails), storedValue reads an empty or undefined `dovetails` as ABSENT,
│   │                     groupSignature carries their sorted dovetailValues, withShapeFeatures carries `shape.dovetails`
│   ├── treeOps.ts        group/ungroup, shareInstance, makeUniqueItem, removeItems, turnInstance;
│   │                     setMirrored / mirroredCopy over placedBox / replaceKeepingBox (mirrored instances); Ungroup's plain
│   │                     path strips a part's own `mirrored` (plainOf); every copy site copies `dovetails` (copyDovetail) when present
│   ├── treeRepair.ts     repairTree, dropUnresolved (load repair)
│   ├── shapes.ts         resolveBoard (THE shape reader; applies a user's own `mirrored` via mirrorFeatures), shapeUsers,
│   │                     prune/dissolveShapes (inv 45); plainOf (strips `shape` and `mirrored`), withoutFlag (a shaped record unflagged);
│   │                     resolveBoard copies a Shape's dovetails, adding no key when it has none
│   ├── links.ts          LINK_FIELDS (the ONE shared/own table), sameShared, linkPlan (inv 45; refuses
│   │                     a member with no occurrence on the source's side of a mirror; `mirrored` is OWN; `mirrorMate`: a user
│   │                     of the source's Shape with the other flag is not "changing"); `dovetails` SHARED (inv 62): sharedOf copies it only
│   │                     when present, sharedPatch reads a present `[]` or undefined as a removal, sameShared compares it in order with ids
│   ├── linksToShapes.ts  the v10→v11 step (and linkByRole's builder; keeps a mirror candidate's `mirrored` flag)
│   ├── cuts.ts           cutRegion, pocketCells, pocketEdges (inv 16's exact grid path), clippedRegion (THE clip),
│   │                     cutShape (THE description of a cut), cutLabel, openSides,
│   │                     storedAsShape, cutsThatRemoveStock, CUT_GEOMETRY_FIELDS (inv 40); stretchCut (inv 64: a rectangular cut
│   │                     across a stretch line — near keeps its distance to the fixed end, far to the moving end, a crossing cut grows its
│   │                     one length on `d`; on a shrink it must cover the removed band, else `'crosses'`; the SAME object when unchanged)
│   ├── angleCuts.ts      AngleCut model (inv 48): ANGLE_CUT_FIELDS (inv 40), keptHalfSpace, depthAt/zeroStation, depthAtCross /
│   │                     deepestCorner (a compound miter's full depth, schema 25, inv 59: every corner or disc-edge reader; deepestCorner all
│   │                     four corners), hasCompoundCut (THE predicate: joinery's compoundRefusal, Refine's keepsExactly), touchedRegion
│   │                     (the box a cut can remove) / splitRegion (a cell split around it: contact's flat wood),
│   │                     mirrorAngleCut (inv 44), deriveKind; the shop-field conversions per kind — taperFields,
│   │                     MiterFields/BevelFields (stored slope RATIO, miterRatio 45° → 1; miterFields null for a compound miter; compoundLongCorner, its long corner for the bench line, TFa), ChamferFields (12 canonical
│   │                     CHAMFER_EDGES, exact legs) — each with its xCut writer and default; imports only types/geometry
│   ├── angleText.ts      angleLine (THE bench line for every angle cut; faceName: a length face is an END),
│   │                     shortPointLine (corner minimum, fu 281, a compound end's corners through depthAtCross; an end chamfer leaving a tongue
│   │                     excluded, fu 385), angleDegrees (→ units); the compound miter's bench line (inv 59)
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
│   │                     enters by > TOUCH, a blind bottom not passed by the tip's FURTHEST point, tipFarthest — exported; a compound tip's
│   │                     max(0, centre − r·hypot(k, rise)), inv 59), tenonJoints (every seated
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
│   │                     stored via the Properties writers), worldAngles (structural standard forms; null for a part with any `across` cut,
│   │                     ruling T6b), angleRatiosOf (the exact-angle map; skips a compound miter), ratioFor, sortAngleCuts (the one stored
│   │                     order; the shorter values list first, antisymmetric)
│   ├── taperWorld.ts     Dir/WorldTaper: design tapers in world words; dirToLocal/localToDir (inv 44), worldTapers
│   │                     (stored → design form, structural standard form), taperCutsFor (design → taperCuts, §2.2 rules)
│   ├── bodies.ts         boardBodies (pocket cells clipped by angle cuts), bodyEdges, boardEdges (inv 16); the geometry key
│   │                     carries each angle cut's and hole row's ID because a clipped face names its cut (`BodyFace.cut`) and
│   │                     `bodyMesh` looks it up by id;
│   │                     partGeometry: THE cached reader of both, plus the frozen `holes` (shared, frozen; see per-file rules);
│   │                     curve waste clipped or split (`BodyFace.curve` on chord faces), curvedEdges (BUILT
│   │                     edges, inv 53), edgesOf (THE three-way choice: pocketEdges / curvedEdges / bodyEdges), SMOOTH_EPS; a stopped profile's band and
│   │                     run-out faces tagged `runout: 'lo'|'hi'` and `profileEdge` (profileEdgeName / profileEdgeOf: THE one builder
│   │                     and parser), smoothJoins / runoutSilhouettes (a2); b2: a stop's run-out (`stopRunoutPieces`, after B1's) on faces tagged
│   │                     `BodyFace.stop` (its `runout` is then the path's face-frame END); `BodyFace.overlap`; curvedEdges registers each stopped
│   │                     swept profile in a2's `stopped` map behind an `ownEnd` guard; `sectionSeams` decides a line only where both strips
│   │                     cover it (`coveredBothSides`) and never takes a face away from `bodyEdges`; geometryBoard appends the JOINT views
│   │                     (each built round tenon's, then each built dovetail's square-span view curves; one memoised view per part,
│   │                     `jointViews`), and profileView is the view without them (`jointBases`), so judging a joint never reads its own waste
│   ├── tenons.ts         findTenons
│   ├── cutlist.ts        buildCutList (inv 18) — stock, not remainder; `number` (THE row number, display order) and `boardIds`;
│   │                     dovetails (inv 62): setupLines prints one dovetailLine per STORED dovetail (after the finger-set lines, before the
│   │                     square-tenon lines), rowKey appends dovetailSignature only when the part has one, and a row with a fault-free
│   │                     tails dovetail carries `benches` (dovetailBenches; the key absent otherwise)
│   ├── depthField.ts     buildDepthField (inv 20)
│   ├── diagram.ts        buildDiagrams, one view per (face, from); per view `holes` (circles down the axis), `holeSides`
│   │                     ({axis, bottomAt}: dashed depth boxes across it) and `holeNotes` ({row, text}: bench lines), in THREE
│   │                     passes — every row's entry view opened first, then circles and sides, notes last in STORED row order (chunk 2 R3);
│   │                     per view `curves` (waste polygons, hatched), `curveLines` (sharp-vertex lines, only on a face
│   │                     the vertex lies on) and `curveNotes` (`curveLineEntries`); a curve opens its through face's min view only when
│   │                     neither side exists, AFTER holes' entry views; per view `tenons` (DiagramTenon: end, diameter, shoulder, and
│   │                     `tip` — each side's station at the miter plane — on a mitered end's side views; round tenons §8): built tenons
│   │                     only, on their own end view and every side view (a tenoned part with no side view opens thickness/min); a
│   │                     tenon's square-span view curves are never drawn as curves; an angle cut's wedge through wedgeOn (a single-slope
│   │                     cut the old expression; a COMPOUND one, inv 59, through compoundWedges: both cross faces, each side's polygon on
│   │                     its own face, a face's min view — else its max — opened when neither exists; fu 472)
│   ├── nesting.ts        buildNesting, shelf FFD; formatDims (invs 19, 22, 23); packOnto (by-the-piece boards,
│                         grain locked, largest size opened first) and grainFootprint
│   ├── materials.ts      custom materials (inv 49): validateCustomMaterial(s), mintMaterialId, MaterialCatalog —
│   │                     catalogOf(doc) (built-ins + doc.materials, memoised on the array) / builtInCatalog; materialUses (band
│   │                     types' solid materials included, inv 54),
│   │                     pruneMaterials, upsertMaterials (same object when unchanged), pickerLibrary (one label per picker)
│   ├── align.ts          align and space evenly (align spec): AlignItem, alignDeltas (to the item selected first), distributeDeltas
│   │                     (equal gaps, outer two fixed, inner placed from the first), itemExtents (partsBounds, leaned); alignText.ts the copy
│   ├── stretch.ts        THE stretch decider (inv 64): stretchPlan(doc, ids, axis, size, line) → StretchPlan | { refused } | null (the
│   │                     size, the line strictly inside, the no-op; the top-down walk: stays / moves whole / spans, a spanning assembly
│   │                     descended, a spanning part through stretchPart per occurrence; on a shrink a MOVES node with min < s + |δ| refuses
│   │                     inRemovedBand, the line included, Rulings 7 and 9; writeBackParts keepWorld, then ONE translateItems
│   │                     over the moved paths deduped by itemKey — `moves` counts occurrences, Ruling 4; the copies post-condition over
│   │                     every worldParts occurrence within 1e-9, then cornerPlan's link post-condition); nearlyEqual; the preview and the
│   │                     store both call it. No → units edge
│   ├── stretchPart.ts    THE spanning-part stretch (inv 64): stretchPart(b, k, s, δ, units) → Board | { refused } — `d` from axisDimensions,
│   │                     the far end endFacing(b, k, 1), the band [u, u] (grow) or the removed wood (shrink); refusals in order: thickness,
│   │                     lean, compound, too short, finger sets, dovetails (Ruling 1: corner joints first), cuts (stretchCut), angle cuts,
│   │                     holes, curves, curves-and-profiles, profiles (per station), round tenons; prisms along `d` (throughOf === d,
│   │                     curve through === d) pass unchanged (Ruling 2); near / far features through rebaseAngleCuts / rebaseHoles /
│   │                     rebaseCurves / rebaseProfiles, one feature at a time. A TYPE-only `Units` (no → units edge)
│   ├── stretchText.ts    THE stretch words (→ units: it prints lengths): the refusals (STRETCH_LINE_INSIDE, STRETCH_SIZE_POSITIVE, thicker,
│   │                     leansText, compoundText, crosses, boxJointsAcross, dovetailsAcross, tenonCentred, curvesAndProfiles, tooShort,
│   │                     copiesDiffer, linkDiffers, inRemovedBand), the panel's words (STRETCH_HEADING, STRETCH_AT, AXIS_LABEL, FROM_WORD, STRETCH_MIDDLE,
│   │                     STRETCH_GO, STRETCH_CANCEL) and previewText (`<from> → <to>: grows <names> · moves <n> · <m> stay`)
│   ├── stretchFixtures.ts TEST-ONLY (never import it from a module): the 48 × 30 × 24 apron table (mortises stored from either end, tenon
│   │                     cheeks), the same table with its end frames as two placements of one definition, `placedTable` (the table as
│   │                     ONE placement, turned 90 or mirrored), `bookcase` (pin rows full-height or short, dadoed shelves, plywood back),
│   │                     `dovetailedDrawer` (dovetailPlan's drawer, planned) and `placedChiral`; every number dyadic
│   ├── views.ts          saved views (saved views spec §2): `rekeyViews(doc, rekey, lift)` applies an edit's item-path re-key (and a dissolved
│   │                     assembly's `lift`) to every view's `hidden`, in the SAME edit as the live `hiddenIds`; `validateViews` is in document.ts (schema 29)
│   ├── labels.ts         THE part-label home (part labels): LABEL_STOCKS (Avery 5160/5163, L7160/L7163, exact geometry), defaultStock,
│   │                     stockCells, cellBox, labelsOf (one PartLabel per piece, from buildCutList), pagesOf (startAt) (→ units)
│   ├── weight.ts         THE weight home (inv 63): woodVolume (boardBodies volumes, memoised on PartGeometry), stripVolume, coreWeight,
│   │                     stripWeight, weightOf / selectionWeight (WeightSummary); numbers only (no → units)
│   ├── purchase.ts       (by the piece: the cheapest of a plan per preferred opener when priced, fu 269) ShopSettings + defaultShop/validateShop (browser-level prices; built-in AND custom-shaped ids
│   │                     validated by kind; a top-level `extra` folded back on read); buildPurchase: the cut
│                         list's Buying section (bd ft × waste, packed boards swapped down to the cheapest size
│                         that still holds them — a heuristic, sheets × price), every string built here (→ units)
│   ├── snapPoints.ts     board/cut/guide snap points (and sameSnapPoint, here because the store needs it), towardFor, offsetPoint (inv 26); toWorld (then the lean) and its
│   │                     inverse fromWorld (exact for an unleaned part; ~1e-15 through a lean); a leaning part's lattice is built and stockProbe-filtered pre-lean, then mapped;
│   │                     hole centres ('face-center', entry
│   │                     and through exit); stockProbe treats a hole's mouth as air (inv 16's exception); b2: each swept stop offers its
│   │                     section's two junction points on the stop plane as `'corner'`s (Q25, from `sweptStops`); a BUILT dovetail offers its
│   │                     outside-plane corners as `'corner'`s (dovetailCorners, deduped against the lattice; the sockets are air to stockProbe; a
│   │                     half-blind pin's corners on its LAP PLANE, nothing on its unbroken outside face)
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
│                     for rectangular cuts or a cut either cannot describe), alignedTo (adopts the representative's angle-cut, hole-row and profile ids; profiles matched by sameProfile in stored order; tenon and dovetail ids when sameTenon / sameDovetail match in canonical order); a HOLED part is turned too (re-stored via worldHoles/holeRowsFor with an exact set, inv 56), a BANDED part (re-stored on the same world edges via worldBands/bandsFor, AI-bands), and a PROFILED part (re-stored via worldProfiles/profilesFor with an exact set and `known`, AI-profiles); none for curves or carried profiles (carriesProfiles)
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
│   │                     leanFreeChecks.test.ts pins lean-free results byte for byte; dovetails (§5.3, inv 62): realBodied also for a built
│   │                     dovetail, contactRegions' last step dovetailContacts (the wood behind each baseline plus each tail's or pin's
│   │                     INSCRIBED box at its narrowest span; half-blind: one LAP-slab box per built pins dovetail with a lap); designCheck.dovetails.test.ts
│   │                     (the drawer and the carcass top; the half-blind drawer and carcass)
│   ├── featureKeys.ts    THE feature keys (feature callouts spec §3): partFeatures (identity, owned segment tags, key line —
│   │                     a short bench line, no positions; hole sizes through holeSizeText/holePitchText, the bench line's own home; the
│   │                     four-corner collapse through curveLineEntries —, fault suffix, true axis/normal), featureTag, FAULT_SUFFIX; b2: every stopped
│   │                     run, swept or straight, one side or two, keys `<name><fillet>, stopped` (Q22); leanNote / leanNotes
│   │                     (the Plans sheet's lean note from WORLD slopes, once per keyed part; inv 47, 57); a compound miter keys
│   │                     `Compound miter <a>° × <b>°` (inv 59), and overruns (exported) reads deepestCorner
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
│                         in two Shapes —, stoolSeat, stoolDocument, stoolWithCut; square-set legs, inv 59: squareStoolLegs /
│                         squareStoolDocument — the same stool square-set, compound ends, legs 17.125 in — and clearedSquareStoolDocument,
│                         after Clear lean, the compound cuts kept);
│                         holesSquareCases.ts (TEST-ONLY angled holes: SQUARE_CASES, the square rows whose geometry
│                         holesSquare.snapshot.json holds — captured from the code BEFORE the tilt, so square holes stay byte for byte)
├── store/
│   ├── store.ts          state, edit(), undo/redo/restore, selectionPatch, held points, setKerf (refuses a kerf outside [0, 1):
│   │                     the loader DEFAULTS one there, so storing it would be silently replaced, fu 98),
│   │                     hiddenIds, copyInRow, group/link/unique actions (invs 4, 24, 34, 42–46); mirrorLinkedPart (the
│   │                     Mirrored checkbox: flag + turn inverseTurn(2a + r), world X, inv 46); linkBoards' part-level flags;
│   │                     setLean (one write per Shape; keepSign / rakeSign / splaySign; `square` — the Set, a first lean square-set,
│   │                     inv 59 —; refusals LEAN_NOT_UPRIGHT, LEAN_PAST_BOUND, LEAN_TURNS_HOLES — the seam re-choice on a holed part,
│   │                     a TURNED lean only —, LEAN_SET_TURNS_HOLES — a Set change on a holed part when leanTwist ≠ 0) and levelEnds (inv 57; writes
│   │                     the plan's holes with length and angle cuts); HOLE_TILT_PAST_BOUND from addHoleRows/updateHoleRow; patchBoard's pivot-keeping
│   │                     resize; moveGroupTo rounds the delta when a part leans; round tenons (inv 58): addTenon / updateTenon /
│   │                     removeTenon (world part, through mapWorld; refused with tenonFaultText or a T8b sentence before edit(); the
│   │                     length never changed; store.roundTenons.test.ts) and boreLegSockets' `tenonLegs` (the seat's rows and every
│   │                     leg patch in ONE edit); stretchers (inv 60): addStretcher (stretcherPlan, then ONE edit: insertItems into
│   │                     the legs' container and mapWorld, a reused leg's list not written; the rung selected) and fitStretcher
│   │                     (STRETCHER_NOT_A_STRETCHER first, refitPlan, ONE mapWorld edit; the no-change check names `length`,
│   │                     `position`, `tenons` and throws on any other key, so a fitted rung pushes no entry); store.stretchers.test.ts;
│   │                     copyBoard re-mints tenon ids; box joints (inv 61): boxJointCorners (guards, boxJointPlan, ONE edit(applyBoxJoints), judgeHeld on the written
│                     document; store.boxJoints.test.ts); dovetails (inv 62): dovetailCorners (as boxJointCorners: dovetailPlan, ONE
│                     edit(applyDovetails), judgeHeld; `joint = 'keep'`, `lap = null` positional after swap, half-blind), removeDovetail (that end only, through mapWorld; the last leaves no key), copyBoard
│                     re-mints dovetail ids; spec §3.6's refusals before edit(): addAngleCuts / addCurves / addProfiles / addTenon / setBands
│                     (adding) / setLean (a lean) on a dovetailed part (dovetailRemoveFirst), addCut / updateCut (cutZoneRefusal over
│                     dovetailCutRefusal), addHoleRows / updateHoleRow / addStretcher / boreLegSockets (holesZoneRefusal, holeTouchesBox;
│                     a tenon fitted to a dovetailed leg refused too) — addCut, updateCut, addAngleCuts, addCurves, addProfiles and setBands
│                     now return `string | null` (Spec difference 2; callers that ignore it compile unchanged); store.dovetailCorners.test.ts,
│                     store.dovetails.test.ts; stretch (inv 64): stretchItems(axis, size, line) (refused at entry exploded, gesturing or
│                     nothing selected; stretchPlan, then ONE edit, judgeHeld, the guide cleared; store.stretch.test.ts) and stretchGuide /
│                     setStretchGuide (view state, ONE writer; cleared by a stretch, by selectionPatch when the selection CHANGES —
│                     an undo or redo included, Ruling 5 —, by setExplode above 0 and by replaceDocument)
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
│                     shared by Generate and Refine, hole, band and profile design faults included, runRefine — the result's own band types, plain and joined —, runJoinery; dovetails, inv 62: `RefineOutcome.leaning.why` (each kept name's reasons, `keptWhy`; copy review 2026-10-27, replacing the `boxJoints`/`dovetails` flags), the (c) sentence by kind (joinChangedText), `guardedKept` through cornerJointed),
│                     joints/{pocket,sites,recipes,choose,unjoin,repair,tapers,featureZones,fingerClaim}.ts (fingerClaim.ts: claimFingerSets / restoreFingerSets, the finger sets taken off before readJoints and put back after, and `claimThenDecide`, the ONE claim-then-decide step (`joined` judged on the CLAIMED flat) shared by Refine's gate and Repair, inv 61; recipes.ts skips or refuses a site that would resize, trim or move a box-jointed or dovetailed part (`cornerJointed`; `leftAlone` words it by kind), and — dovetails, inv 62 — a pocket, rabbet or half-lap notch reaching a dovetailed end's zone (`intoDovetails`: a PROBE pocket judged by the store's `dovetailCutRefusal`, a through groove exempt; the tenon, dado and lap boxes read BEFORE the grow, `tenonBoxes` / `dadoBoxes` / `lapNotches`); fingerClaim.ts' `changedBoxJointed` (the (c) guard) compares a kept part's dovetails too; repair.ts' `changedDovetailed` refuses a repair that would change a dovetailed part; pocket.ts: `pocketFor` stores its own numbers on the grid, `onGrid`, because a box arrives through world differences and reflections and the cut list compares stored cuts exactly (an optional `id` for a probe that mints none); featureZones.ts: `featureAllowed` + `RuledOut`, per-site ruling-out of joint kinds by watched trials (inv 41; rabbet and half-lap units; a stopped dado per stop end, `endHits`, narrowing `stopEnds` to the ends that clear — "Offer clear ends", chunk 3; bands judged in the original frame, P9–P11, word `edge band`); recipes' `JoinWatch` (observer of cuts and resizes during a trial) and `rebaseHoles` (from `document/holeRebase.ts`) / `rebaseCurves` / `rebaseProfiles` (re-anchored on resize, undone by `resizeAt`; `sameCurves` / `sameProfiles` in the gate; featureZones judges curves and profiles in the original frame, P5, and exempts a curve or straight profile that only meets a growing end when its waste on an `END_FACE` (1e-6) slab stays out of the tenon section, `meetsOnly`, fu 415; `rebaseCurves` re-stores an arc at the half-circle bound at its new chord's bound, C1; tests: holesOracle / curvesOracle / bandsOracle (the backstops), holesRebase / curvesRebase, featureZones(.curves, .bands), joinWatch); sites.ts `rangesOf`' inset clearance (`bandClearance`, chunk 3 F2: a stop end beside a receiver band raises the smallest inset to clear its strip); `document/ruledOutText.ts` (`FeatureWord`, `profileWord` (`<kind> profile`), `ruledOutLine`: the run-summary notes, one line per ruled-out site, shown in the run's outcome notes; spec §3.5); holes.ts `holeRegion`; tapers.ts: taperConflicts, angleConflicts + clearsTenon, jointFaults (model-facing `angle-joint`, for evaluateDesign), joineryRefusal(entry, …) — the ONE joinery refusal decider, `leaningRefusal` first (JoineryEntry 'joinery' | 'repair' | 'refine', one sentence each; Repair and a joined Refine call it directly, inv 41, 57), then `tenonRefusal` (round tenons §9: a part with any stored tenon, one sentence each; Repair and a joined Refine call it too, after the lean), then `compoundRefusal` (square-set legs §4, inv 59: a part with a compound end cut, `hasCompoundCut`, one sentence each; Repair and a joined Refine call it too, after the tenon); inv 41; recipes' `refaceFromEnd` re-stores an end cut from another face, fu 205, and `rebaseAngleCuts` keeps angle cuts on their wood, fu 307); unjoin + gateUnjoin
│                     read joints back, proved by an exact (1e-9in) re-join (readJoints = the lenient
│                     body); runJoinery's `fixed` keeps recorded joints passing validChoice, `alsoPresent`
│                     = original's problems; repair.ts = fu 240's prune-and-prove (a stray must be empty
│                     and its twin the same stored part; evidence rule); joints/fixtures/ = damaged docs made by the buggy 4a340f7
├── useGenerations.ts, useJoinery.ts, useRefine.ts, useRepair.ts   write only via createProject(…, {activate:false}) (inv 36)
├── viewport/         NO unit tests by design. Viewport (its StretchGuide: the stretch line's translucent plane, inv 64 — no raycast, no depth
│                     write, no clipping plane), BoardMesh (inv 21), MoveTool +
│                     moveCandidates, TapeTool, Gizmo (invs 3, 10, 42; dragTarget rounds a leaning part's DELTA, the handle at partBounds' centre, inv 57) + gizmoPatch.ts (the flip fix and size ceiling, tested), GuideMarkers,
│                     SnapMarker, snapPick (screen-space nearest, on purpose), grain*.ts,
│                     viewCamera.ts (pure, TESTED: `orthoHeight` / `orthoZoomFor`, an ortho zoom stored as a visible HEIGHT so a window resize keeps the extent;
│                     `pendingPoseReady`, the condition a saved-view pose waits on), framing.ts (pure, TESTED: STANDARD_VIEWS = the Plans sheet's views, viewDirection, subsetBounds
│                     with explode offsets, zoom/distance); Viewport's `ViewportHandle` (showView, capture — the clean
│                     frame hides Gizmo/MoveTool/TapeTool by a `hidden` prop, NEVER by unmounting them)
│                     (invs 12, 14, 15, 17, 35), pointer.ts, gridDensity, screenScale, extent;
│                     grainTiling.ts' hole path (inv 50): bodyMesh (holed faces; seam faces subtracted only in holed
│                     bodies), faceTriangles (rings as holes, clip-split fallback), holeMesh (one hole's wall + bottom;
│                     clean = unclipped), holesMesh (every hole of a part, ONE geometry); holesPerf.test.ts (the guard);
│                     a tilted bore: elliptical rings on the face planes, ringDisc (its conservative disc for the clearance
│                     tests, fu 451), the far ring at `reach` or the bottom disc square to the bit (holeBottom); watertight
│                     xray.ts (pure, TESTED: fadedFor — THE decision of a part's faded look: outside the open assembly (gated on
│                     `clean`) OR X-ray on and not covered by a non-empty selection (not gated on `clean`); x-ray spec §3)
│                     sectionPlane.ts (THE shared clipping plane, inv 51); BoardMesh draws its part's cap (a leaning part: its group gets the lean as ONE derived transform, the `leaned` memo, and its cap is drawn as a sibling at identity, inv 57); sectionPerf.test.ts
│                     grainTiling's drawsAsBox (THE BoxGeometry-or-bodyMesh routing: a box no hole reaches,
│                     on a part WITHOUT curves), bodyMesh's radial normals on chord faces and curvedPart (seams dropped, welded,
│                     conformed); conform.ts (insertOnEdges, centroidFan, welder, CONFORM_EPS 1e-7); capOutline.ts (CAP_DARKEN, EDGE_DARKEN, capOutlineColor: a cap's outline legible on
│                     a dark cap; fu 347); capFill.ts (THE cap fan,
│                     moved out of BoardMesh; conformed for a curved part); curvesPerf.test.ts (the guard),
│                     curvesWatertight.test.ts (every directed edge matched), bodyMeshIdentity.test.ts (holed, uncurved: master's bytes)
│                     bandFaces.ts (edge banding chunk 2): bandLooks, bandViewSignature (BoardMesh's memo key), bandedMesh (THE band paint:
│                     a post-pass moving on-side triangles into groups 6+, UVs along the stretch); bandFaces.test.ts
│                     c2: grainTiling's `partMesh` (a shaped part's ONE geometry, six material groups; no memo on the bodies, A3: they are shared across poses and ids), twinSkip.test.ts
│                     b1: bodyMesh shades a swept profile's faces by `sweptNormals` (sweptNormals.test.ts; per face, so a ~0.005 rad step at a
│                     tangent point); `runoutFor` falls back to `runoutOf` for every view-curve id; b2: a `stop` face takes its cutter from the
│                     stop frames only (`stopRunoutNormals`), any other run-out face from `sweptRunouts` only; a vertex ON a stop plane takes the
│                     band's normal (`stopJunctions`); stopNormals.test.ts
├── panels/           DimensionField/NameField (invs 5, 9; optional `label` (aria-label, default `Part name`) and `focusOnMount` (focus and select once on mount) for the Views rows), Properties (the Mirrored checkbox on a linked part), CopyInRow,
│                     PartsList (a mirrored part's ⇋ badge, `role="img"` "Mirrored"),
│                     Toolbar, TapeReadout (invs 27, 28), GuidesList, ProjectMenu (its per-file rule below, in full: a row click closes the
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
│                     `title`, and `items` may be a function, called on each render while open; ProjectMenu's own copy keeps the fu 250
│                     guard — a null-`relatedTarget` focusout ignored while a pointer is down inside —, and its caret, Duplicate and arm
│                     buttons focus themselves on click),
│                     Banding (the Banding section, the additions' pattern: while no selected part is banded only `+ Add banding ▾`; once
│                     any is, a select per side, `Band ▾` — each type's all edges / long edges / ends, Remove all bands —, Corners only where
│                     `bandsMeetAtCorner`; both menus end with `New solid edging…` (`onNewBandType`: App opens Materials & prices with
│                     `newBand`, a new Solid row's name focused — read off the KEPT state, StrictMode runs initializers twice); options judged on focus, a refused one greyed with its reason; Mixed
│                     writes nothing untouched; one `setBands`, one undo entry) on bandingRefusal.ts (bandEditRefusal: an ADDED band
│                     fault on any selected part; bandsShownCorner),
│                     ViewportControls (tools/view over the canvas), ActionBar (three actions, More ▾,
│                     trash), GuidesFooter (opens itself when the guide count goes up), ViewsFooter / ViewsList (saved views spec §6: `Views · N`, Save view, one row per view with go-to, a `NameField` rename, Update, ×; NOT inside EditLock, inv 47 carve-out; Save view focuses the new row's name once), AlignSection (the multi-selection panel's Align: nine buttons, Space evenly with 3+, the anchor named), StretchSection (inv 64: Overall size in the assembly and multi-selection panels, inside EditLock: three extent fields, typing arms one axis (nothing on blur), Stretch at from the min face with Middle, the stretchPlan preview or its refusal as a field-error, Stretch / Cancel; sets the stretch guide), LabelsSheet (part labels: true-size
│                     sticker pages, Stock, Start at; opened from the cut list in its place), PlansSheet / PlanFigure /
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
│                     `null` value); Lean (the Lean section, upright parts only: Rake/Splay magnitude fields + direction selects, the Set select on a
│                     leaning part — `Square to the sides` / `Turned to the lean (one-cut ends)`, `mixed` when they differ, inv 59 —,
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
│                     the store's addTenon / updateTenon / removeTenon); Stretcher (stretchers §4, inv 60): StretcherSection (in the
│                     multi-selection panel for exactly two upright parts, inside its EditLock: Height — defaultHeight memoised on
│                     `pairSignature`, ruling T5c —, Rung size, Tenon diameter, `Add stretcher`, the store's refusal as the alert)
│                     and StretcherReadout (under Round tenons: the readout or the stale line and `Fit the stretcher again`, from
│                     stretcherOf in a memo; the last Add's link notes, held by Properties, ruling T5a); Stretcher.test.tsx;
│                     BoxJoints (box joints §4, inv 61): BoxJointsSection (in the multi-selection panel for two or more parts, inside its EditLock:
│                     Finger width, Swap fingers, `Box joint the corners`, the notes held in section state); PartDiagram's fingerNotes;
│                     Dovetails (dovetails §4, inv 62): DovetailsSection (in the multi-selection panel for two or more parts, after Box joints,
│                     inside its EditLock: Slope — a DimensionField with the `1 :` prefix, a plain decimal parse, its range the planner's
│                     refusal —, Tails — TailsField, blank is Auto, inv 5's draft rules —, Swap tails and pins, the Joint select (`As
│                     they are` / `Through` / `Half-blind`, default keep) and LapField (half-blind: blank is Auto, a length in the
│                     document's units, more than 0, disabled for Through), `Dovetail the corners`
│                     disabled only while a field fails to parse (the Lap field only unless Through); the store's refusal as the alert, the planner's notes held in section
│                     state) and DovetailsPart (the single-part section after Round tenons, only on a dovetailed part: each dovetail's
│                     cut-list line, a note per fault, Remove); DovetailBench (the bench pair on the cut list sheet, spec §5.2: figure A the
│                     tail board's face, figure B the pin board's end grain, side by side, each FIG_SHARE of the row with a viewBox FIG_W
│                     wide, so a label renders at PartDiagram's size; one scale; the FULL chain only when every label sits on its own span,
│                     on one row or two tiers, else SINGLE-VALUE mode — each distinct value once at its first span, ticks at every bound,
│                     the overall H on both figures; measured with labelWidth/packRow, never re-derived; the pair never wraps; a
│                     half-blind figure B draws a `.cutlist-bench-lap` band over [0, lap], its ticks run to the lap plane and its `lap`
│                     label sits on the outside face's row);
│                     CutList renders a row's `benches` after its diagrams, under the same condition (a row without them renders as
│                     before); PartDiagram exports VIEW_W (the bench sizes its figures from it); DimensionField's optional `prefix`
│                     (text before the input, `.input-prefixed`; absent, the markup is exactly as before); the void store actions'
│                     refusals (Spec difference 2) shown as each section's alert, belonging to the part AS IT WAS (RoundTenons' TenonEnd
│                     pattern: any change to the part retires it) — AngleCuts' Add, Curves' Add, Profiles' Add, Banding's selects and
│                     menu, Properties' `+ Add cut` (AddCut) and a cut row's edit (its fields remounted from the stored cut); RefineDialog's
│                     kept line `Kept exactly as is: <name> (<reasons>), …` through keptLine (each name with its own `why`; copy review 2026-10-27);
│                     CountField (DimensionField, whole numbers; also the hardware counts, `Enter a whole number, 1 to 999`);
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
├── styles.css        surface ROLES over --grey-*/--walnut-*; palette.test.ts pins contrast (4.5:1); `.input-prefixed` (a prefixed field) and `.cutlist-bench*`
│                     (the dovetail bench pair: no font-size on its text, inv 19; blackened and kept together in print;
│                     `.cutlist-bench-lap`, half-blind's lap plane: a dashed line as the baseline, the lap unshaded wood — fu 520)
└── App.tsx           layout, autosave/restore, the ONE keydown effect (inv 27), `pending`
                      (inv 29), switchToken (inv 32), `.app-shell` inert behind any modal; `FEATURE_CHECK_FAILED` (the joinery
                      dialog REFUSED when checking features against joints throws, fu 244, P8)
```

## Per-file rules not covered by an invariant

Moved from `CLAUDE.md` on 2026-10-26, verbatim except that its pointers to this file now read "the tree" (the
annotated tree above); `CLAUDE.md` lists the files. Each is a rule (the invariants are in `docs/invariants.md`).

- **`labels.ts` / `LabelsSheet.tsx`** (part labels spec §6): `labels.ts` is the ONE home of label strings and sticker-sheet
  geometry. A label's number is `CutListRow.number`, never recounted; its size is ONE `formatSize` over the row's cut length and
  width and the group's thickness (never `row.dims` plus a thickness: a metric `row.dims` already carries ` mm`). The sheet formats
  nothing; each paper is a named `@page` at margin 0, and the cells carry the stock's own geometry in its own unit.
- **`snapPoints.ts`**: local→world is `position[axis] + toWorldOffset(board, axis,
  local[axisFrame(board)[axis].dim])`, then `leanMap(board).apply` for a leaning part (`fromWorld` inverts it — exactly only for an unleaned part). `pointToLocalXYZ` and `solidWorldBox` are
  CENTRE-relative and both look like they do this — using either puts every point off by
  half the board, plausibly. Pin with a rotated, non-flat pose. `towardFor` is the tape's
  ONE direction source (preview and commit); a locked axis wins over a hover, never falls
  back to it.
- **`cutlist.ts` / `diagram.ts`**: a group's key is its rows' key prefix (`groupFields`; fu 54). Format from `cutShape`, never from stored
  `across`/`offset`/`width`/stops (fu 192). The cut list accumulates EXACT stock, never
  qty × rounded dimensions, and ignores cuts (stock, not remainder). `storedAsShape`
  returns an already-aligned cut as the same object.
- **`bodies.ts`**: read bodies and edges through `partGeometry` wherever it runs per frame or per part (snap
  points, drawings, BoardMesh). Its results are SHARED between parts with one `geometryKey`, deep-frozen:
  never mutate them. The key is board-local (dimensions, cut geometry, angle cuts, hole rows) — no pose — and carries each
  angle cut's and hole row's ID (why: the tree).
- **`angleCuts.ts` field conversions**: the row's fields carry STORED values — a miter/bevel its slope ratio, a chamfer
  its legs, a taper its stations and depths — never re-derived through `atan`/`tan`, so an edit of side, end or face keeps
  a 45° cut at depth = run exactly. Degrees exist only in display and typed input, and reach a writer only through
  `miterRatio`. A reader returns null for a stored line its row cannot represent (an offset bevel line; a line that
  never reaches 0 inside the part) — the row then shows the bench line and Remove, never a control that would rewrite it.
- **`AngleCuts.tsx`**: every hook sits above every `kind` branch (a fixed crash class). Every refusal reads `Removes more
  than the <dimension> — reduce the <control> first.`, is decided before `updateAngleCut`, and leaves the select on the
  stored value. A menu preset whose default would be refused on this part is withheld, not added and then refused.
  A cut a later resize pushed past its part is KEPT and noted (`… at this size.`); an edit is refused only when it would
  overrun by MORE than the stored cut does (fu 296, the holes/curves precedent).
- **`nesting.ts`** takes `doc.boards`, NEVER `CutListRows`; too-big parts go in
  `unplaceable`, never dropped. The word `turned` rides on `dims` (inv 19).
- **`SheetLayout.tsx`** is the only caller of `fitLabel`'s `requireDetail`; the tier
  decision stays in `fitLabel`, not as a panel override. The sheet key list is NOT an
  `<ol>` (the number comes from `nextIndex`, not DOM position; fu 162). A part that cannot hold even its NUMBER
  (`holdsIndex`) is a callout (fu 96): its number in a row outside the drawing, the row only when used, so a drawing with no
  callouts keeps its viewBox (the layout: the tree). A long leader across another part is accepted (the user's ruling).
- **`plans.ts` keying**: a STORED part (container id + part id) is keyed by the first trio that keys it (`claimed`; fu 381(4),
  the user's ruling: no duplicate labels) — only assembly trios can share one.
- **`featureKeys.ts` / `planKeys.ts`** (feature callouts): a key line is built only in `partFeatures` (its sources: the tree), never in the panel. A tag sits only on a segment `drawView` tagged for its feature (inv 16); tagging never changes a segment, its order
  or the visible/hidden split (`drawingIdentity.test` hashes the drawing with tags stripped). Angle cuts are tagged by
  plane membership (`keptHalfSpace`'s plane is `n·x + d = 0`), so `bodyEdges` is untouched. A part's features are keyed by the innermost
  LISTED assembly's trio (`keyed`), so each feature once per sheet (view order, merging and pushing: the tree).
- **`pocket.ts`**: `pocketFor` stores each of its OWN numbers within EPS of a 1/64" or 0.1 mm grid point AS that point's float
  (`onGrid`, dyadic first; fu 216; why: the tree). A `storedAsShape` re-store after it is off-grid but deterministic (fu 382); never snap after it, and
  never round the row key instead.
- **`prompt.ts`**: a batch concept rides in the USER turn, never in `SYSTEM_PROMPT`, which
  must stay a fixed prefix. `Concept` lives in `prompt.ts` so it never imports
  `concepts.ts`. **`concepts.ts`**' parse is all-or-nothing (never mixes planned and
  built-in concepts).
- **`SettingsDialog.tsx`**: a new key is shape-checked and verified with one free
  `GET /v1/models`; 401/403 refuses, anything else saves with a note. **There is
  deliberately no prefix rule.**
- **`useGenerations.ts`**: auth or cancel during planning starts no run; a cancel landing
  as planning resolves is caught before the runs (its test asserts run CALLS).
  A failed run's cost comes from `spentOnFailure` (run.ts; Refine too): a `RunFailed`'s usage or the calls before a rethrown
  error, null when nothing was spent; every spent cost prints through `formatCost` (`< $0.01`, never `≈ $0.00`; fu 168).
- **`store.ts`**: `copyInRow` and `duplicateBoards` share `copyBoard` so they cannot drift.
  `undo`, `redo` and `deleteBoards` are refused while `gesturing` (fu 208/209: mid-drag they lost or merged the drag's entry).
  `setKerf` refuses a kerf outside [0, 1) (fu 98; why: the tree).
  `tapeAxis` is NOT a held point (an enum cannot go stale; do not give it clearing rules).
- **`MoveTool` / `moveCandidates`**: pre-grab candidates are the SELECTED parts' points,
  post-grab the UNSELECTED parts'; a selected part is never a target; guides are targets
  only, never grab sources. Its dep list is inv 15's failure mode.
- **`TapeTool.tsx`** subscribes to `tapeAxis`; locked with nothing typed draws NO line (a
  decision; fu 130 is the alternative). A click while locked re-anchors and keeps the lock.
- **`BoardMesh.tsx`**: its `stopPropagation` is load-bearing (a toggle reaching two solids
  is a no-op); `selectable` is required so Move's commit click cannot select its target.
- **`Viewport.tsx`**: the projection swap re-frames only once `controls.object === camera`,
  or it aims the new camera at the origin. A pending saved-view pose (`setCamera`) REPLACES that projection swap's re-frame
  (a swap a view restore caused must not re-frame over the saved pose); `up` is never written.
- **`DimensionField.tsx`**: min/max REFUSE out-of-range input, never clamp. A mixed field emptied after typing is untouched (fu 210). Enter commits
  and blurs (fu 212); a refused entry keeps focus. `onCommit` may return a refusal MESSAGE (a string): the field shows
  it as its OWN error (same element, role and `aria-invalid` as min/max), keeps focus and the typed text, and keeps it
  until its own next commit or an external resync — no sibling clears it (AngleCuts' Angle fields: fu 339). The optional
  `prefix` (dovetails: the Slope field's `1 :`) is text BEFORE the input, never part of the typed text; with no `prefix` the
  markup is exactly as before (the input is the same element, its handlers unchanged).
- **`ProjectMenu.tsx`**: deliberately not an ARIA menu. The arm/disarm swap renders a
  `<button>` at the same sibling index in both branches — giving either a `key` breaks
  focus. Rendered only when `libraryAvailable`. A duplicate error's cause is read off
  `storage.available` (the ADAPTER flag, never React's `available`; fu 159). A row click closes the menu at once; a failed open
  reopens it on that row with the message, focus on the caret (fu 35; `onOpen`: the tree). Escape focuses the
  caret before closing (fu 152).
- **`GuidesList.tsx`** has no selection model, deliberately.
- **`Popover.tsx`**: focuses the trigger BEFORE running an item (App records the opener);
  Escape is bound on its subtree with `stopPropagation`, never on window (inv 27).
  ProjectMenu keeps its own copy, with the same fu 250 guard (the tree).
- **`styles.css`**: rules read surface ROLES (`--surface`, `--control`, `--rule`, `--ink`…),
  never raw `--grey-*`/`--walnut-*`; grey chrome re-points the roles in one context selector.
- **`App.tsx` keys**: plain and Shift+H match by `e.key`; only Alt+H by `e.code === 'KeyH'`;
  Ctrl/Cmd+H is unbound. Escape's ladder: grabbed → tapeAxis → tapeAnchor → tool.

Deployment scaffolding: `Dockerfile`, `docker-compose.yml`, `nginx.conf`,
`security-headers.conf`.
