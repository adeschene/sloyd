# Sloyd — invariants, full text

> Split out of `CLAUDE.md` on 2026-10-20. This is the **full current text** of every invariant;
> `CLAUDE.md` carries each one condensed (with every PROHIBITION verbatim). Keep the two in step:
> when an invariant changes, change it here and its summary there. **Never renumber** — the
> numbers are cited from code comments, specs and `docs/follow-ups.md`. The text as it stood
> before the 2026-10-07 trim (with worked examples) is in `docs/history.md`.


Each cost real debugging. **Do not renumber them** — the numbers are cited from code
comments, specs and `docs/follow-ups.md`. These are condensed; the full text with its
worked examples is in `docs/history.md` ("Removed from CLAUDE.md, 2026-10-07").

1. **The document is the source of truth.** No component holds geometry state not derived
   from it; nothing writes a Three.js transform as a way of recording a change.
2. **`position` is the min corner.** `boardCenter` bridges to centre-origin meshes.
   `reorientedPosition` is the only home of the reorient pivot and takes the whole patch
   (post-patch extents). `grain` and `cuts` are absent from the reorient predicate, so cut
   edits have their own store actions. A future tool that moves *and* turns in one gesture
   must carry its own `position` in the same patch.
    `angleCuts` and `holes` are absent from the reorient predicate too (a slope or a bore moves nothing), and so are
    `curves` and `profiles`, and `bands` and `cornerRule` (a band moves nothing).
3. **The `dragging` ref guard in `Gizmo.tsx`**: never sync the document into the proxy
   mid-drag (jitter/drift).
4. **Gesture snapshots are lazy** — taken on the first `edit()` in a gesture, never in
   `beginGesture()`, or undo gets no-op entries.
5. **A field with a local draft (`DimensionField`, `NameField`) skips adopting external
   changes while focused, so blur must resync from the stored value and must not commit
   when untouched.** Stored values are exact; display rounds. A MIXED field (`value: null`)
   must write nothing on an untouched blur; its test asserts the error state too.
6. **`add_header` does not merge across nginx levels** — `security-headers.conf` is
   `include`d in every block.
7. **`autoSave` must never throw**; it reports via `storage.available`.
8. **Names are unique among SIBLINGS** (the parts and assemblies of one container),
   enforced at add, duplicate, the name commit, Group, Ungroup and `migrateDocument`. Any
   new call site adding a part passes its name through `uniqueName`. New assemblies are
   `Assembly N`. So paths, and `flatDocument`'s names, are unique. **The separator glyph `›` is
   reserved: `cleanName` turns it into `>` where a name is WRITTEN (`renameItem`, Generate), and
   PROHIBITION: never in `uniqueName`, `dedupeNames` or on load** — a flat document names parts
   "Front › Leg" by construction and runs through `migrateDocument` (fu 227).
9. **`NameField` commits once, on blur or Enter — never per keystroke**; an emptied name
   reverts; `onCommit` returns the *stored* name.
10. **The gizmo clamp writes `size` before `updateMatrixWorld`, never `handle.scale`
    after**; two-sided, with a floor (`GIZMO_MIN_CAP_INCHES`).
11. **Migration steps run on raw data, before `validateBoard`, in version order**, because
    the validator's fallbacks are legal-but-wrong values. Upgrade first, validate second
    (the exceptions, v10→v11 and v11→v12, are in Versioning).
12. **Grain textures are cached and never disposed; per-board variation lives in the `uv`
    attribute, never on the texture.** Offset is zeroed on a `fit` axis.
13. *Retired in v3* (`axisDimensions` is single-sourced; since v8 derived from `axisFrame`,
    inv 44). Number kept.
14. **`bandRadius` is `hypot(d, k·delta)`**; u is seamless by that, v by folding about the
    pith line. `grainTexture.ts`'s `woodCut` comment is the statement — agree with it.
15. **Anything memoising on what `boardUVs` reads keys on `boardUVSignature`, never a
    hand-written field list.** The signature is the same for every solid of a board, so
    don't cache per solid on it alone. A dep entry over a value nothing subscribes to is
    the same failure. It includes every hole row (BoardMesh's memo keys on it) and every curve (its
    id and `CURVE_FIELDS` values, as `geometryKey` does) — profiles included, through `geometryBoard` (as chunk 1's curves); a swept profile (b1) appends its own suffix to the signature,
    `geometryKey` and the cut list's, only when the view holds one. Bands are NOT in `boardUVSignature`: BoardMesh's geometry and
    edge memos add `bandViewSignature(board, bandTypes)` (`viewport/bandFaces.ts`: each unfaulted band's side, kind, thickness and
    solid material, plus the corner rule once a glue line exists; `''` with none), because a band type edit keeps the board object.
16. **Edge lines come from `boardEdges` (the cell grid's `pocketEdges`, or `bodyEdges` once a part has angle
    cuts), not from the solids.** General
    rule: a marker or line must sit on a feature that is actually drawn. A hole draws its rim on its entry face (and exit
    face when through) and, when blind, its bottom rim (a crease); its wall draws no facet lines. The exception: a hole's
    centre snap point sits in air (the mouth is air to `stockProbe`) — it is the centre of a drawn rim.
    A curve draws its outline on every plane square to its `through` and a line along `through` only at
    a SHARP outline vertex judged on the true arc — no facet lines, none at a tangent end or a bow's crown; a smooth
    point's line is suppressed per INTERVAL (where its wings are that curve's chord faces and the tangent-continuing face),
    never as a whole line, or a real crease where another feature meets the tangent point is erased. An arc's centre snap
    point may sit in air (the hole-centre exception, extended; a centre off the face is not offered); ends are `'corner'`,
    the crown `'edge-mid'`, the centre `'face-center'` (P5). The waste is air to `stockProbe` except a point ON an arc or
    on a straight side off the face boundary (P3: the middle of an arched edge is gone, an arc's end is kept).
    A stopped profile's run-out draws no facet lines: `bodyEdges`' `smoothPair` suppresses a stretch whose two wings are faces of
    ONE stopped profile, at least one a run-out face, on the same section edge or adjacent ones at a smooth section vertex
    (`profileEdge`, built and parsed only by `profileEdgeName`/`profileEdgeOf`); the stop's real creases stay. At each stop the
    profile's arc ends on the stop plane are `'corner'`s (P17); the spanned waste is air to `stockProbe` via `profileAirTester` (P3).
    A SWEPT profile (b1) draws no facet lines either way (`sweptSmoothPair`, `sweptEdges.ts`): none ACROSS the path between two
    chords of one arc at a smooth outline vertex (equal section runs), none ALONG it between two arc chords of its section, and no
    tangent line where a smooth section vertex meets the part's own broad or side face (a roundover's, as chunk 1 never draws); a
    cove's or bead's junction is sharp, a crease. A crease runs along the path at each SHARP section vertex. A B1a mitre draws a
    line only between DIFFERING sections (`profileValues` but id and run), never between equal ones, whatever the chord parity. A
    bead's quirk wall at the reach is its own tagged section face (`WALL_MARGIN`), never 52 facet lines. A swept profile's edges
    are BUILT from its section faces' tags (pinned equal to `bodyEdges` over the bodies on 25 fixtures). Arc ends and crowns lying
    in swept waste are not offered as snap points; swept waste is air to `stockProbe` (`sweptAirTester`, read on the BUILT path).
    A b2 STOP's run-out draws no facet lines either (its facets join each other, and its band at its OWN stop plane); its outline
    on the broad and side faces is drawn. **A run-out joins only faces of its own path end** — its own facets, or the band of that
    end's path chord (`sweep` 0 or n − 1), the end read off `BodyFace.stop` and the path, never the bare `runout` tag (a stop and a
    B1 station on one run can share one): where two passes of one run meet, whatever their end kinds, the crease is drawn. **The
    fast swept edge path skips edges but never faces, and decides a line between two section faces only where both cover the same
    stretch** (`coveredBothSides`); anything else, and every face an overlap piece cuts (`BodyFace.overlap`), is judged by
    `bodyEdges` with every face (a dropped face or a plane-only match drew phantom lines at T-junctions and stops). The fast path makes no candidate of a face the part's other bodies cover completely (`faceCover`); it stays a wing (chunk c2).
17. **UVs are parent-relative and `FIT` resolves against the board, not the solid**, so
    figure runs continuously across a cut.
18. **On the cut list, stock dimensions collapse at display precision; cuts match
    EXACTLY.** Round what is bought, never what is machined.
19. **`LABEL_SIZE` has one home (the `<svg>` attribute); CSS never sets a font-size on
    diagram text, and `--font-num` must stay monospace.** The measured string and the drawn
    string must be the same string: assemble it in the module that builds it
    (`nesting.ts`, `diagram.ts`), never in the component. A non-ASCII glyph must be
    measured in a browser before it is trusted. A hole row's diagram label is its bench line (`holeLine`) as an HTML
    note under the figure, as angle cuts' notes are — never a measured SVG label (holes spec §4.3, amended). A curve's notes
    are HTML notes too, built by `curveLineEntries` (one note per entry, four equal corners one note).
20. **`depthField.ts` is not `pocketCells`**: it assigns max depth per cell in 2D; it does
    not drop cells. An agreement test must assert the value the derivation computes, not
    just where it is non-zero.
21. **The empty-solids placeholder stays a mesh, not a wireframe** — a part you can see is
    a part you can click. Test by clicking the middle of a ghost face.
22. **`nesting.ts`'s fits-test carries an epsilon** because one side is computed (a running
    sum). Apply the tolerance that matches the arithmetic you actually have.
23. **The shelf-height guard is the SOLE enforcer of guillotine cuttability.** A test of a
    "cannot exceed its container" property must bound against a value the code under test
    does not produce.
24. **A held point (`grabbed`, `tapeAnchor`, `tapeHover`) holds a world position, so
    anything that moves the boards under it must drop it**, through `dropHeldIfGone`
    (guard-first shape). Three reasons to clear: the world moved (undo/redo when the
    restored doc is a DIFFERENT object, `replaceDocument`, delete/update); the feature
    underneath went (point-precise, `===`, called AFTER `edit()`); the user retargeted
    (`grabbed` only, via `selectionPatch`).
    - **PROHIBITION: no selection write may clear `tapeAnchor` or `tapeHover`.**
    - `clearGuides` clears both tape fields; that licence is not to be extended.
    - At `updateBoard`, `grabbed` keeps a board-precise clause and the tape fields are
      point-precise. Deleting the former or adding one for the latter breaks behaviour that
      only the "keeps" tests catch.
    - The enumeration lives only at `tapeHover`'s declaration in `store.ts`; never restate it.
25. **Exact moves are never rounded to the drag grid (`SNAP_INCHES`, or 1 mm in a metric project — `snapToGrid`)**: snap move, click-placed guide,
    ray-typed guide, axis-placed guide and copy in a row (copy k = original + k·step·sign,
    never from the previous copy). Round what a free drag produced, nothing else.
26. **`grabbed` is a `BoardSnapPoint`**, so a guide-owned grab cannot be constructed. Do
    not add a runtime owner-type guard to `commitSnapMove`; the self-snap guard's
    `target.owner.type === 'board'` check is real and stays. `tapeAnchor`/`tapeHover` are
    wide `SnapPoint`s on purpose.
27. **Every window-level shortcut lives in `App`'s ONE keydown effect; any new `window`
    listener takes the modal flag (`modalOpen`) explicitly**, because `inert` cannot reach
    a window listener. `Viewport` gets it as `shortcutsSuspended`. The modifier test is
    part of the condition, not an early return, or Ctrl+Z is swallowed. `TapeReadout`'s own
    X/Y/Z branch is forced, not redundant.
28. **`TapeReadout` stays unconditionally mounted** (it owns `tapeTyped`'s anchor-loss
    clear), and typed capture APPENDS. The displayed text and the next keystroke's effect
    must not disagree.
29. **`autoSave(id, doc)` takes the id as an argument, never adapter state.** The
    `activeId` dep entry is load-bearing (the edit-wins restore path); do not remove it.
    Every switch FLUSHES the pending write first. The pending record is `{ write, timer }`
    with `write` a thunk capturing the matched pair. **PROHIBITION: do not split it into
    refs, read `activeId` back in the flush, or put the id or doc back on the record.**
30. **`sloyd.autosave.v1` is never deleted and never written after adoption; adoption fires
    only when the index key is ABSENT** (raw `getItem`, before parsing). An unusable or
    newer index refuses and writes nothing (read-only, banner shown). A missing `activeId`
    or empty `projects` is not adoption.
31. **Write the project key, verify it reads back, THEN commit the index — in one
    primitive, `writeVerifiedProject`.** `autoSave` refuses an id with no index row. Every
    mutation reads through `readIndexForWrite` and refuses on an unusable index;
    `deleteProject` refuses before touching the project key.
32. **Every adopting handler bumps ONE `switchToken`; the last to start owns the
    outcome.** Never decline a second click. The token check sits on the same side as the
    persisted-id write (hence `createProject(…, { activate: false })` then
    `setActiveProject`). `onDeleteProject` is the documented exception; `deleteProject`'s
    index writes stay synchronous with its read.
33. **Duplicate ids are repaired on LOAD by `takeId`; the FIRST keeps its id**, the later
    is re-minted (never all of them), and `seen.add` lives inside `takeId`. Scopes: part and instance ids per
    container; definition and shape ids per document; cut ids per board (per shape for a
    shape), and so angle-cut, hole and curve ids; profile ids share the part's CURVE scope (curves validated first), so the
    geometry view never holds two curves with one id. Band type ids per document (one `seen` set; the built-in's id fixed);
    bands carry no id (keyed by side). `/` in an id is re-minted. A guide with no id is dropped. References
    (`Instance.definition`, `ShapedBoard.shape`) are resolved by DROPPING the duplicate or
    the dangling part, never by re-minting, so nothing is rewritten. A future field pointing
    at a board by id breaks the single-pass repair.
34. **`gesturing`/`gestureSnapshotTaken` are store state so `replaceDocument` can reset
    them — the only reset.** **PROHIBITION: they must not join `restore`'s clear list, and
    no component may read either.** A test of this asserts an undo entry, never a flag.
35. **`FACE_AXES` carries each UV axis's SIGN, applied BEFORE the swap**, in the table
    itself, read back off a real `BoxGeometry` (three of twelve axes run backwards). A UV
    test must check an interior number (`uv − position/tileInches` constant per board), not
    only extremes.
    A SLOPED face (angle cuts) takes the plan of the world axis its normal is nearest, a tie going to the cut's `face`
    (a miter reads as end grain, a taper as long grain); `bodyMesh` reads UVs off vertex world offsets through the same plans.
    A curve's chord face takes the plan of its nearest world axis too; around an arc the plan switches
    partway, and the grain seam there is ACCEPTED (the user's ruling, recorded with fu 336 for a texture/shader session).
36. **Generation never adopts a project**: `createProject(doc, { activate: false })` and
    nothing else. "Open when done" must call `openProject`.
37. **The generation history is append-only; `LlmMessage` is opaque so it stays that way.**
    Assistant turns go back verbatim (thinking and fallback blocks included); do not
    "clean" them.
38. **`overlap` and joinery's blockers/trims are measured between SOLIDS via `worldSolids`**, never
    `solidWorldBox`; `worldSolids` are pocket-cell BOXES, angle cuts ignored (the drawings occlude with
    `worldBodies` instead, inv 47). **A pair with a tapered part is measured on real bodies** (fu 302: the
    intersection of the two parts' world bodies via `clipConvex`, its extents reported as today's box overlap; only when
    their boxes overlap; `worldBodyFaces` is the checks' body crossing, pinned against `worldBox`), and
    **the tip check weighs a tapered part by its real bodies** (fu 303, `partMass`); an untapered pair's overlap and an
    untapered part's weight (a notched part included: its box) are byte-for-byte as before. **Held/hangs contacts, grounding's `connected` and the tip footprint read
    `contactSolids` when a part is tapered** (a tapered part counts only where it is still flat); a pair of
    untapered parts keeps its BOXES in `connected`, and an untapered part keeps its box as its footprint,
    byte-for-byte. Contact reads `contactSolids` for any ANGLED part (`isAngled`): a taper's flat wood as before, then every
    miter, bevel and chamfer splits it around its touched box (`touchedRegion`/`splitRegion`), so a sloped face is never a
    contact (the user's ruling: a miter does not hold). `faceContacts` stays on boxes. Joinery refuses any angle cut running
    into a joint (`joineryRefusal`); Refine accepts every kind in standard form (`worldTapers`, `worldAngles`) and refuses the rest (`'taper-form'`, `'angle-form'`). Do not raise `TOUCH` to make joints
    pass; do not drop the check. **Holes are ignored** by overlap, held/hangs, tip, contact and grounding: a hole never
    decides support.
39. **Support means HELD: every part off the floor is resting, between (≥ 50% coverage of
    both faces of X or Z) or lapped (a broad face; a top contact only under the stated
    one-level conditions), and the piece must not tip.** **PROHIBITION: do not drop (c),
    the coverage threshold, or either half of the top-face clause.** One fault, one report.
    `groundedSet` is the ONE grounding walk. Known limits: follow-up 176.
40. **Anything deciding "same cut" derives from `CUT_GEOMETRY_FIELDS` (`cuts.ts`), checked
    against `Cut` by `satisfies`.** Do not replace the table with a list in a function body
    or add an exclusion without a written reason. `cutsThatRemoveStock` decides which cuts
    are compared; the resulting row split on exact dimensions is correct — do not round.
    Angle cuts have their own table, `ANGLE_CUT_FIELDS` (`angleCuts.ts`), every field but `id` — `kind` INCLUDED — exact.
    Hole rows have `HOLE_FIELDS` (`holes.ts`), every field but `id`, exact — except a count-1 row's ignored `pitch`,
    which `holeRowValues` reads as 0 (fu 338, the user's ruling 2026-10-15): the cut list groups by them as a multiset, ids ignored (`holeSignature`); `sameShared` compares rows in order,
    ids included, as it does cuts and angle cuts.
    Curves have `CURVE_FIELDS` (`curves.ts`, `satisfies`), every field but `id`, exact, the segment list
    compared field by field in order: the cut list groups by them as a multiset, ids ignored; `sameShared` in order, ids included.
    Profiles have `PROFILE_FIELDS` (`profiles.ts`, `satisfies`), every field but `id`, exact, `run` structurally; the cut list groups
    them through the geometry view (as curves); `sameShared` in order, ids included.
    Bands have `BAND_FIELDS` (`bandModel.ts`, `satisfies`: `side`, `type`), exact; the cut list keys by `bandSignature` (the corner
    rule appended ONLY where `bandsMeetAtCorner` holds, the one case its words depend on it; final review 1); `sameShared` in canonical order.
41. **Joinery has one converter (`pocketFor`), never adopts, and is blamed only for what it
    caused.** `pocketFor` is tested against the box in every pose, stores via
    `storedAsShape`. Problems compare by `kind` + `parts`, never message text. Every
    refusal is decided before ANY mutation, and every `resize` is pre-checked by
    `cutIntoEnd`. Joinery accepts tapers and refuses, through the ONE decider `joineryRefusal` (`joints/tapers.ts`), any
    site whose patch lies on tapered wood (`taperConflicts`; `start` itself allowed, compared with a 1e-9 float tolerance,
    inv 22) — and, for a miter, bevel or chamfer, any site whose patch its touched box overlaps by more than TOUCH
    (`angleConflicts`), except a cut on the ENTERING part of an end-into-face site that runs straight through the joined end
    and clears the tenon's section (`clearsTenon`), and a MITER on the receiving part of a face-against-edge (rabbet) site (the
    rabbet runs out through the mitered end); on that growing part a cut measured along or into the growth that removes
    wood at the joined end refuses however small (final review I2: the rebase keeps its line fixed while the part grows). One sentence per part (`jointRefusal`). `resize` re-anchors angle cuts
    measured from the moving end (`rebaseAngleCuts`, fu 307), and `readJoints`' `resizeAt` undoes it exactly (the gate's
    round trip). Sites stay on box contacts on purpose. **Joinery on a holed project rules joint kinds out per site before the call** (`featureAllowed`, `joints/featureZones.ts`, spec §3): one trial `applyJoints` per (site, kind), watched through `JoinWatch`, narrows a site's `allowed` where the kind's zone (the mortise or tenon, a dado or its stop, a lap notch, a rabbet pocket or its trim) meets a hole (`holeRegion`); a rabbet unit and a part's half-lap set are trialled TOGETHER and ruled out at every member (their recipes only run as a set); a stopped dado is ruled out whole when any stop end conflicts; a skipped trial rules nothing out; a hole takes no run-through exception at a trimmed end. The sites a feature narrowed to butt only are withheld from the call (a site `allowedFor` already makes butt-only is sent as before), and the dialog says why (`ruledOutText`, one line per site). `defaultJoint` respects `allowed`. `resize` re-anchors holes measured from the moving end (`rebaseHoles`), and `readJoints`' `resizeAt` undoes it exactly; `sameJoined` compares a part's holes in stored order within `GATE_TOLERANCE` (a hole number goes out as `x + L` and back as `(x + L) - L`, which need not be bitwise `x`; fu 413 for `sameAngleCut`'s exact comparison). The gate's moved-hole check is pinned through `sameJoined`, because a hole moved after joining round-trips through `gateUnjoin` unchanged. The unjoin gate (`sameJoined`) compares a part's cuts as a MULTISET (`sameCutSet`; order is not geometry, still exact at 1e-9; angle cuts stay in order). A joined Refine is refused up front (`plainForRefine`, `'angle-joint'`) when the original's angle cut already runs into a joint; a result the model leaves conflicting comes back UNJOINED (`JointsSummary.notJoined`), never joined over an angle cut.
    **Joinery on a curved or profiled project (joinery-features chunk 2) rules kinds out the same way**, through the same `featureAllowed` trials, with the zone tests in `document/featureRegions.ts` (`shapedFeatures`, `featureMeetsBox`, `featureTouchesEnd`, `runsOutThrough`, `crossSectionOverlaps`) over `rectOverlapsWaste` / `wasteOnSegment` (curves.ts) and `sweptWasteMeetsBox` (sweep.ts). **The watch judges a curve or profile in the ORIGINAL frame** (P5): on `flat.boards[part]`, the part before the trial, never on a mid-trial board (`geometryBoard` and `sweptWaste` are memoised per object, so a view of a mutated board is stale); a cut box or trim slab is moved into that frame by subtracting the sum of the part's min-end growths so far. Holes keep judging the board as it stands. Tests are open (touching passes) for curves, straight profiles and a stopped profile's span widened by `runoutReach`; a swept profile keeps the conservative footprint (touching included). A growing kind (mortise-tenon, dado, stopped-dado) is ruled out when a feature touches the joined end with positive area (`wasteOnSegment` > 1e-9 across the grown dimension, its `through` extent reaching that end, or a swept box form meeting the face): a bowed rail therefore loses those kinds at its ends (fu 415). **The run-through exception is decided per growing face** (P7): a curve or straight profile with `through === 'length'` that runs out through the GROWING face (a plain curve always; a view curve with a `span` unless that end is a stop) is not a conflict when its waste in (width, thickness) does not overlap the tenon section (open); swept profiles take none; a run-through feature at a TRIMMED end never conflicts (it is shortened with the part). `resize` re-anchors curves and profiles measured from the moving end (`rebaseCurves`, `rebaseProfiles`), `readJoints`' `resizeAt` undoes them exactly, and `sameJoined` compares them structurally in stored order (`sameCurves`, `sameProfiles`, driven by `CURVE_FIELDS` / `PROFILE_KEYS`). `joineryRefusal` no longer calls `curvedRefusal`, which is Refine-only; Repair accepts curved and profiled projects (banded stays withheld). Words (`ruledOutText`): `curve` and `<kind> profile`, the verb `are` after `holes` and `is` otherwise; the failure dialog is `FEATURE_CHECK_FAILED`.
42. **A group move rounds the GROUP's min corner once and adds one delta
    (`moveGroupTo` → `translateBoards`); one selected part keeps the separate single-part
    path.** Do not unify them; do not round inside `translateBoards`. `selectionPatch` is
    the ONE writer of a user's selection change. A selection change mid-drag ends the
    gizmo's gesture and commits nothing.
43. **Hidden-ness is view state with one gate, and a hide moves nothing.** The four user
    actions go through `applyHidden` (one entry per run, the SAME `doc`, no autosave); others only
    reconcile. `selectionPatch` drops hidden ids — do not move that to callers. A hide is
    refused while `gesturing`. **PROHIBITION: no hide or show may clear `tapeAnchor` or
    `tapeHover`.** Never return `visibleBoards`' array (or anything built from it) from a selector — a fresh array every store write
    re-renders every frame; filter in a memo or handler. A selector may reduce it to a PRIMITIVE (the Section toggle's
    "any part visible", fu 351).
    Hidden parts are still in the cut list, joinery, checks, export and autosave.
    Consecutive hide/show toggles share ONE undo entry (the run is the top of `past`, by identity;
    any edit, gesture snapshot, undo or redo ends it; a run back at its start leaves no entry).
44. **`axisFrame` is the ONE turn table; every part↔world crossing goes through its helpers**
    (`toWorldOffset`, `fromWorldOffset`, `spanToWorldOffset`, `spanFromWorldOffset`,
    `endFacing`). **Never `board[dim] - u` at a call site.** Nothing branches on
    `rotation`'s value except `axisFrame`, the migrations, `generated.ts`'s `orient` and
    Properties' Turn select. The one legitimate hand
    reflection is `mirrorCutAlong` (clip first, one sum, no snap); do not tidy it onto the
    helpers. Flat and upright keep the pre-v8 mapping at turn 0; on-edge reverses thickness
    (fu 215, v12), so every posture shares ONE hand and a posture change no longer mirrors
    cuts. Equivariance tests use `chiralPart`, never a symmetric fixture; mutate any new one.
    In `boardUVs` the reflection is per geometry axis, before inv 35's sign and swap. Generate's
    converter (`orient`) encodes at 0° or 90°; role linking may store any quarter turn that leaves the world part unchanged
    (`turnCandidates`, fu 301; every kind re-stored through `taperWorld`/`angleWorld` with the part's own slopes). The composition is the second caller of `mirrorCutAlong` (`mirrorCut`,
    moved verbatim to `mirrorCut.ts`): a mirrored frame reflects a part (`mirrorPart`: turn
    negated, cuts along the posture's turn-0 X dimension, min corner reflected).
    An angle cut reflects by a FLAG FLIP (`mirrorAngleCut`: `from` if `face` is the mirrored dimension, `alongFrom` if
    `along` is) — never arithmetic on stations; `lowerAngleCuts` is its exact inverse and is written back only when the user
    edited it or a d0-moving posture change re-reflected it (`changedKeys`), never as a shared world array.
    A hole row reflects by flag flips too (`mirrorHoleRow`: `from`, `alongFrom` or `acrossFrom`, whichever of face, along
    and across is the mirrored dimension); `lowerHoles` is its exact inverse, reusing an untouched stored array.
    A curve reflects by flag flips too (`mirrorCurveCut`: `uFrom` when u is the mirrored dimension,
    `vFrom` when v is, nothing when `through` is) — never arithmetic on coordinates, and `side` never flips (it is defined on
    STORED numbers); `lowerCurves` is its exact inverse, reusing an untouched stored array. Pinned with `chiralCurved`.
    A profile reflects by flag flips too (`mirrorProfile`: `face` through the thickness, a side's `from` along its `across`; an End to
    end run keeps min→max; a station run's ends swap on EVERY mirror, since a reflection reverses travel round the face);
    `lowerProfiles` is its exact inverse, reusing an untouched stored array. A two-side run (b2) swaps Start and Stop on every
    mirror too, each end's flags flipped by its own side (Q20; pinned with `chiralTwoSide`, and 3600 runs × 3 mirrors in review).
    A band reflects by a flag flip too (`mirrorBands`: `side.from` when `side.across` is the mirrored dimension; `cornerRule`
    never flips); `lowerBands` is its exact inverse, reusing an untouched stored array.
45. **A link is a SHAPE its users point to; shared fields are stored once.** `LINK_FIELDS`
    is the ONE shared/own table (classify an optional own field with care, fu 231).
    `resolveBoard` is the ONE place a shape is read into a part. `linksToShapes` is the ONE
    label→shape builder, with two callers (the v10→v11 step and generation's `linkByRole`);
    both judge equality by `sameShared` only. `linkByRole` aligns a member's angle-cut ids to the representative's (only when
    `sameAngleCut` matches; never loosen `sameShared`) and may re-turn a member through `turnCandidates` first. Shared-field edits are written to the Shape (`applyWorldEdits`); the only propagation left is `shapeMates`
    re-pivoting posture. `linkPlan` is the ONE Link decider. A one-user shape dissolves
    (users counted as STORED parts). Joinery keeps sharing where cuts are identical by
    geometry. **`Board.link`, `repairLinks`, `dissolveSingletons` and `mates` propagation
    must not come back.** `curves` and `profiles` are SHARED in `LINK_FIELDS` (arrays, so excluded from `_sharedPrimitives`' primitive check as cuts, angle cuts and holes are), and so are `bands` (an array)
    and `cornerRule` (a REQUIRED primitive — an optional shared field fails `_sharedPrimitives`' tsc check, so `'long'` is stored, P1).
46. **The tree has ONE composition (`placeBoard`/`placeInstance`), ONE walk
    (`worldParts`), and every edit is written back through `treeEdit.ts`**, changed fields
    only, a moved position lowered as a delta. Path names come only from `flatDocument`.
    - **Two write-back rules: a Properties edit keeps the stored local position; joinery
      passes `keepWorld`.** Do not unify; a new caller picks one.
    - Group moves nothing (identity frame); Ungroup is exact for direct child parts only.
    - Joinery runs on `flatDocument`, maps back by index; anything reading sites/joints uses
      the flat document.
    - `regroupShapes` groups a shape's users by geometry (`groupSignature`): cut ORDER is ignored (joinery appends mortises in site order, a turned user's list differs); the Shape keeps its first member's order and ids. `splitAssemblies` compares placements the same way (fu 316); the definition keeps the first placement's record.
    - A selection is one level (`isCovered` is the ancestor test).
    - Write-back keys on the STORAGE target (`storageKey`); disagreeing edits throw, so the
      store sends one edit per target (`oneEditPerTarget`). An edit in a definition moves
      every copy, so held points are re-judged (`judgeHeld`) and hidden ids/held points are
      re-keyed under every placement (`rekeyEverywhere`); a hidden assembly that Ungroup dissolves
      lifts to its children under every placement (`Lift`, fu 229) — a re-key, not a fifth hide writer.
    - Make Unique copies one level and keeps ids. A twin placement of a selected part is
      never a Move target. `writeBackFlat` splits definitions shallowest-first by deepest
      placement.
    - **A mirrored instance (schema 13) is a step inside the ONE composition**
      (`placeBoard`/`placeInstance` reflect first); write-back is its exact inverse (`lower`:
      positions as deltas, turn negated, `lowerCuts` reuses an untouched stored cut object).
      A Properties resize keeps the stored cuts; with `keepWorld` (joinery) cuts are
      re-mirrored at the new size. `setMirrored`/`mirroredCopy`/`replaceKeepingBox` (with
      `placedBox`) change handedness while preserving the placed box; Ungroup lifts a shaped
      part through a mirror as plain. World→local vectors go through
      `toLocal(containerLinear(…))`, never a hand-written turn. Refine refuses a mirrored
      assembly. **Across a mirror:** `linkPlan` refuses a picked part on the other side, or a
      member whose STORED part has no occurrence on the source's side (`mirroredAt`; a live
      mirrored copy of a same-side part is fine); `postureRefusal` refuses a d0-moving posture
      change (flat/on-edge ↔ upright) when a user of the Shape has no occurrence on the edited
      part's side. Both decided before any mutation, one decider shared by store and panel.
      Link builds the Shape once from the source's STORED fields, never the world part, and
      writes members' OWN fields only (each lowered alone); a shared posture write goes
      through `sameSideFirst` before `oneEditPerTarget`, so a Shape is never lowered through
      two parities in one edit.
47. **Exploded is read-only.** `explode > 0` means the model cannot change: `edit()`, `undo` and `redo` are the
    gate; any action with side effects outside `edit()` also refuses at entry (`readOnly()`: re-key, Group,
    Ungroup, guide and board deletes, `addBoard`); `setTool` refuses all but Select; `renameItem` returns the
    stored name. `setExplode` is the one writer, and leaving 0 goes only through `setTool('select')`. The
    UI lock is a `<fieldset class="edit-lock" disabled>` with `display: contents` (layout-transparent), placed by `EditLock`
    around EDITING regions only (fu 262): the ActionBar sits outside it and disables its own non-`view` actions (Hide others,
    Select copies stay live), as do Select linked and the guides footer's disclosure. The explode
    offset is a render-time translation, never written back (inv 1). `drawView` TAGS each segment with the feature it is
    drawn for (`Seg2.feature`, absent otherwise); the tag changes nothing else. A band (edge banding chunk 2) tags its glue lines
    and every untagged outline edge lying on its side's plane `<part>:band:<band type id>` (a corner edge on two planes: the first
    side in `BAND_SIDES` order; a curve or angle tag always wins); drawn only when `drawView` gets `opts.bandTypes`, and PlanFigure's
    trio cache is keyed on band types THEN parts. Drawings take lines from `boardEdges` and hole
    lines from `holeDrawingSegments` (one list, one hidden-line pass), and occluders from `worldBodies` (each body CLOSED: a box, or its faces as half-spaces): a ray along a seam between
    solids is inside. The exploded set is
    lifted so its lowest part never goes below the assembled lowest point. Occluders are the HOLE-FREE bodies: you
    cannot see through a hole (a rule, not an accident; a through-bore's far rim seen down its axis is hidden, pinned).
    **A curved part's drawing edges come through `curveDrawEdges`** (inv 53): each model chord drawn as a
    fine path on the true arc, but **visibility is judged on the MODEL chord** (the path only changes what is drawn; the
    visible/hidden split is chunk 1's), and a view whose direction lies in the outline's plane (**edge-on**) keeps the model
    chords unrefined (a 96-chord arc folds back over itself). A chord split by another feature keeps its split end on the
    chord (Q4). **Curved surfaces' silhouettes come from `silhouetteLines`** (a line along `through` at each smooth model
    vertex whose faces turn opposite ways to the view, clipped to the part's bodies — fu 375: never through another cut's air), each probed from **4×`DRAW_EPS` along the outward normals of the
    viewer-facing adjacent faces** — never lifted toward the viewer (a fixed lift failed gentle bows) and never probed from the
    vertex itself (DRAW_EPS grazing reads it hidden). Facing is ONE test (`EDGE_ON` 1e-9, `facing()`) for the product test and the
    lift alike (fu 386: an odd-chord arc's 45° chord read facing by one and edge-on by the other). **Every model edge of a curved part
    carries a probe lift** (`curveEdgeLifts`): ALONG the view by `min(1e-3, PROBE / n·toward)` of its most viewer-facing face, so an
    edge on a shallow face (n·toward ≲ 0.25) is not hidden by its own DRAW_EPS-grown body, while grazing OTHER wood still hides; the
    drawn line never moves. A lift along the face normals (silhouettes' rule) stepped an end line off its grazing plane — not here.
    **A stopped profile** (profile runs a2): its band's silhouettes are clipped to its span; its run-outs' contours come from
    `runoutSilhouettes` (facet chains, the same fu 386 facing rule — skipped only when the product is > 0, edge-on counts), and
    `curveEdgeLifts` covers run-out edges too. Run-out lines are the MODEL's chords (P19; fine paths are fu 392(1)).
    **A swept profile** (b1, B8): a crease along a PATH arc is drawn as a fine path at `DRAWING_CURVE_TOLERANCE` (a crease is held
    by a section face, on an arc chord, along it); the profile's arcs across the sweep, its silhouettes along a path arc and its
    run-outs stay MODEL chords (P19 extended; a silhouette may read coarser than the crease beside it on a real print). Its
    surfaces' silhouettes are facet chains (fu 386's facing rule). On a part with a swept profile each edge is lifted by the most
    viewer-facing face of its OWN body (a thin wedge body's faces sit at n·toward 0.04–0.05; the part-wide rule hid two cove
    creases in Iso). On an edge both tag, the swept profile's tag wins over the corner curve's (the corner keeps an anchor
    elsewhere). Non-swept drawings are byte-for-byte unchanged (`drawingIdentity`, now with a curved + a2 + straight scene).
    **A b2 stop** on paper: its run-out lines are MODEL chords and its contours facet chains, as a2's; every run-out model edge
    carries its profile's `curve` tag (the feature key); the part diagram's inner offset line ends on each stop's plane, with no
    run-out arc and no end-view hatch (Q24).

48. **`boardBodies` is the ONE place angle cuts become geometry; `pocketCells` is stock minus RECTANGULAR cuts only.**
    Anything that draws, edges, occludes or probes stock reads bodies (through the `partGeometry` cache); anything that
    describes or joins rectangular cuts (`cutShape`, joinery, the cut list's pocket lines) stays on `pocketCells`. A body no
    angle cut clips keeps the box path byte-for-byte (`body.box`). Joinery and Repair stay box-based and accept
    every kind, refusing only an angle cut running into a joint (inv 41). Generate and Refine read and write every kind in
    WORLD words — `tapers` (`taperWorld.ts`, through `taperCut`) and `miters`/`bevels`/`chamfers` (`angleWorld.ts`, through
    `miterCut`/`bevelCut`/`chamferCut`) — recognised STRUCTURALLY (`isStandardTaper`, `worldAngles`); Refine refuses, before
    any call, a cut it cannot describe or the converter would reject on the re-encoded part (`'taper-form'`, `'angle-form'`),
    and keeps untouched angles exactly through the exact-angle map (`angleRatiosOf`). **The design schema defines the part
    and the direction ONCE in `$defs`** — the API refuses a schema whose compiled grammar grows too large (measured
    2026-10-14: the inline form with the three angle arrays was refused). `contactSolids` is the second, narrower reader of
    angle cuts: box-valued, never over-claiming wood.
    `boardBodies` is the ONE place curves become bodies too, and bodies stay CONVEX: each curve's waste
    is CLIPPED by its chords' half-planes when the kept wood is convex (`curvePlan`: every arc bows into the waste, every
    straight side lies on the face boundary, AND the arcs form ONE run with the wood convex at every off-boundary vertex and
    arc–arc join — the
    strengthened P6; without that guard two arcs meeting in a reflex wood corner lost real wood), else SPLIT along the
    waste's ear-clipped convex pieces, merged across diagonals while convex (`convexPieces`, fu 368); a body that shares no volume with a piece stays whole
    (`subtractPieces`, `DISJOINT_VOLUME` — a plane test alone missed 18 of 274 empty pairs), and a split waste's diagonals are peeled
    LAST (`splitPieces`: a diagonal's extension otherwise cuts wood the waste never reaches). Both give the
    same wood (volume and containment, pinned). A chord face carries `curve: <id>`. A body no curve touches is unchanged.
    A STOPPED profile's waste is its band between the stops plus, beyond each stop, `runoutPieces` (`runout.ts`, THE run-out
    geometry: the section revolved about the bit's axis `BEARING` 1/4" outside the edge, in INSCRIBED sectors so the run-out meets
    the band at the station with no step), subtracted as convex pieces; faces carry `runout: 'lo'|'hi'` and `profileEdge`.
    **A SWEPT profile's kept wood is BUILT, never its waste subtracted** (`sweep.ts`, b1, Q3; subtracting cost 2–9× the budget): the
    path's truncated straight skeleton to the reach (a swallowed chord collapses, its neighbours rejoin) × the kept section's convex
    pieces as bands, plus the rest of the outline in convex pieces, full thickness; together they tile outline × thickness. The FIRST
    swept profile starts from the part's CURVE-FREE cells (cuts and angle cuts applied) and the through-thickness curves are NOT
    applied again (the outline carries them; starting after them made an arch's 16 slices 160 bodies); a cell no piece reaches is
    DROPPED, a body inside one piece keeps its object. Each further swept profile intersects the bodies it meets, then every other
    curve as today, then a B1 station's run-out (`sweptRunouts`, a2's `runoutPieces`). A wall at the reach (a bead's quirk) is held
    inside the band by `WALL_MARGIN` 1/64" (its own tagged face, not a rest slab). A faulted swept profile builds nothing
    (`builtSwept`) and is neither air nor a hole fault. Tags: a vertical plane on an outline chord carries `curve: <id>`; a section
    face `profileEdge` and `sweep: <segment>`.
    **A b2 stop's run-out is built in its station's MODEL-chord frame** (`stopRunoutPieces`: a2's inscribed sectors about
    `stopAxis`, `BEARING` outside along −N, Q12 — the band is built on chords, so the true arc's tangent would step at the station),
    subtracted after B1's run-outs. A stop NEVER clips the band (the skeleton's stop ray ends it in the stop plane), and a B1 station
    clips only its own END of it (from that end to the first face wholly kept): a whole-band clip deleted a wrapping run's own
    band where it re-entered the half-plane (deployed b1 byte-identical on 450 End to end parts). Where an open run's two ends come
    within reach round one corner, the overlap takes BOTH chords' kept sections — the router cuts both passes, so the wood is their
    INTERSECTION (`SweptPlan.bands`, `restMore`; not a fault).

49. **A custom material's KIND is in its id** (`m-s-…` solid, `m-v-…` veneered sheet, `m-p-…` plain sheet), so
    `isSheetGood`, `grainFamily`, `hasGrain` and shop validation read it off the id with no catalog; a stored `kind` that
    disagrees with its id drops the entry, and nothing may change a stored material's kind (only an UNSAVED new dialog row
    has a kind select). Label, colour and sheet size come only from a `MaterialCatalog` (`catalogOf(doc)`) — no global
    registry: a background Refine or joinery run reads its own document's. **A document carries exactly the custom
    materials its parts, shapes and band types use** (a solid band type's material is kept, inv 54): `pruneMaterials` runs at the end of the load and inside `edit()` (same object
    when nothing goes, inv 4); a part change that adopts a library material does it in the SAME edit
    (`updateBoards(…, adopt)`, `applyMaterials`). Every path that makes a project from another carries them; Refine's
    converter gets them BEFORE `migrateDocument` (`designToDocument(…, { materials })`), or they become pine. Generate's
    schema stays byte-identical (built-in catalog, fixture-pinned); Refine's adds the project's ids (fu 322: a per-project
    grammar, compiled live 2026-10-14). The library and prices are browser state: undo reverts a project's copy only.
    **Nominal names** (chunk 2) show only for a material whose catalog entry is `nominal` (pine; a custom solid with the
    switch), only on an EXACT section match (in a METRIC project: both sides read the same whole mm, fu 354 — a 38 × 89 mm part is a
    2×4; Buying and sheet nesting likewise fit a metric part when it READS no more than the stock at whole mm — `fitsStock`, one
    rounding with the fields (`mmTicks`); shelves stay exact, inv 23), and on a cut-list row only when EVERY board on it is that section; drawings
    keep actual dimensions. The switch never touches a stored material's prices.

50. **`holes.ts` is the ONE place holes become geometry (`holeInstances`, through `boardHoles` and `partGeometry`'s
    frozen `holes`); `boardBodies` stays hole-free and convex**, so every `Body` reader (`clip`, `clipConvex`, `bodyEdges`,
    occluders, contact) keeps its convexity assumption. **`holeFaults` is the ONE strict-rule decider** (`breaks-out`,
    `off-flat` — zero skin at a cut's floor counts —, `meets-hole`, `too-deep`; exact closed forms, tangent passes): an add
    is refused on any fault, an edit only when it ADDS a (hole, kind) fault the stored row lacks (so a row a resize faulted
    can be edited back), decided before any mutation; a fault a later edit causes is KEPT, noted, drawn approximately,
    never clamped or trimmed. Fault words have one home (`holeFaultText`; `distinctFaults` counts too-deep once). Refine
    refuses a holed project at entry (`holedRefusal`); joinery rules out only the joint kinds whose zone a hole enters (inv 41); Repair accepts holed projects; `turnCandidates` returns none for a holed part.
    A part with no holes keeps its geometry byte-for-byte (the `BoxGeometry` path included; a part with no
    holes AND no curves (profiles count, through `geometryBoard`) — `drawsAsBox` is the ONE routing decision, `bodyMeshIdentity.test.ts` pins holed uncurved parts to
    master's bytes). `holeFaults`' `breaks-out` includes a hole meeting a curve's waste (`intoCurve`;
    touching is meeting; `holeInStock` counts it), keyed apart from an edge's (`faultKey` `:edge` / `:curve:<id>`, and
    `distinctFaults` on the SAME key, or a hole past an edge and in a curve could never be edited back). **A curved part's
    mesh is WATERTIGHT**: every body through `bodyMesh`, vertices welded (`CONFORM_EPS`), every part vertex strictly inside
    a face's edge inserted (the candidate's own object, never a projection), faces fanned from their CENTROID (a vertex-0
    fan's zero-area triangles are dropped and reopen the crack); a split curve's T-junctions otherwise show as pinholes in
    the shadow and on the cap. `curvesWatertight.test.ts` pins it (exact Float32 keys, every directed edge matched, the
    holes' mesh included) — stopped profiles' run-outs too (bead, thumbnail each facing, a bore beside a run-out), shaded smooth by
    `runoutNormals`, memoised on `partGeometry`'s FROZEN bodies (rebuilt per `bodyMesh` call, it failed the perf guard in a full run;
    `runoutMemo.test.ts` pins mesh and edge hashes), with a stopped ogee in `curvesPerf`. A SWEPT profile's mesh is watertight too
    (every b1 case, a hinge cup and two loops on one part included; its cap has no interior crack), shaded by `sweptNormals` — the
    true swept surface's, memoised per (view, profile), per face (a ~0.005 rad step at a tangent point, accepted); a B1 run-out cap
    takes the cutter's. Its rebuild guards (`curvesPerf`, MINIMUM of 9): the apron, notch and 1/2" roundover loop at 40 ms;
    the 2" roundover loop, thumbnail loop and B1 front back at 40 after chunk c1; after chunk c2 the bead loop 51, cove 48, ogee 61, two-side cove 48 and
    two loops 51 ms (never raised) — the worst of four minimums (alone twice, full twice) + 25%, lowered only, fu 393/394. **A shaped part is ONE geometry (`partMesh`),
    never memoised on the bodies (they are shared across poses and ids). An exact twin seam draws nothing without `minusCover` (`faceCover`), judged by area, grain and normals against the reference route (`twinSkip.test.ts`).** b2's
    STOPS are watertight too (every b2 fixture, the station runs, the 36 `cornerGap` rows and the 14 overlap cases, a bore beside a
    run-out; caps uncracked), shaded by `stopRunoutNormals` (the revolved normal, memoised on the frozen bodies as a2's), except a
    vertex ON the stop plane, which takes the band's normal (`sweptNormals`: the junction override, so band and run-out agree at
    1e-6); stop rows at 40 (chunk c1; the notch 60 before), the two-side cove 48 (chunk c2), `wrapFour` 40 ms (chunk c1, fu 394). **`sweptIdentity.test.ts` pins swept parts' bodies, edges, smooth joins, meshes, holes and caps byte for byte (54 fixtures, two lengths): a speed change keeps it green.** **A curved part's holed plane is drawn as ONE region** (fu 369: a split curve cuts the broad face
    into strips, so a mouth straddles them): every plane a CLEAN hole opens into is the union of its faces (`unionLoops`,
    chained), triangulated with the rings as holes — the wall's own ring vertices — and each triangle conformed; a plane a
    faulted hole reaches, or whose rings overlap, keeps the per-face `faceTriangles` path (residue, drawn approximately). **Rebuild performance —
    a resize drag rebuilds a holed part every frame; these break silently:** per-hole prisms and rings are memoised by
    the deep-frozen `Hole`'s IDENTITY (a WeakMap; an unfrozen hole computes fresh — never memoise one that can change);
    seam faces (what a coplanar, opposite-facing face of another body covers) are subtracted ONLY in holed bodies (and in EVERY body of a curved part, box cells included); a
    CLEAN hole's (`holeInStock`: no breaks-out, off-flat or too-deep) wall and bottom are emitted UNCLIPPED, a faulted
    hole's clipped to the bodies; all of a part's holes are ONE geometry, one mesh (`holesMesh`), never a mesh per hole.
    `viewport/holesPerf.test.ts` guards it (≤40 ms per healthy case, ≤100 ms faulted, the MINIMUM of 9 runs — load only
    inflates a run; still wall-clock, fu 340). **On the Plans sheet** a rim is a `DRAWING_HOLE_SEGMENTS` (96)-gon (the viewport keeps
    `HOLE_SEGMENTS`, 48), except a rim whose plane is EDGE-ON to the view, which is ONE segment across its diameter — 96
    chords folded onto one line restart the dash and draw a hidden rim solid (chunk 2 R2). For a part with no holes `drawView` and
    `buildDiagrams` are byte-for-byte unchanged; its SVG path differs only by chaining (chunk 2 R2: within one part) — do not undo the chaining to
    "restore" it.

51. **The section cut is view state with ONE writer (`setSection`), never in the document, undo or autosave; reset only
    where `explode` is (initial state, `replaceDocument`).** One shared `THREE.Plane` (`viewport/sectionPlane.ts`) clips
    every part material (`clipShadows` too) and edge line on the GPU, so a slider move changes one uniform and rebuilds no
    part geometry. **Caps come only from `sectionCaps` (`document/section.ts`)**: board-local — a placed part's cut is one
    of its own axis planes (quarter turns, mirroring resolved by the composition; inv 44) — each convex body clipped by
    `clipConvex`, a body face lying ON the plane and facing the removed side capped too (a holed body's mesh drops seam
    faces; spec §3.1 as amended), every piece normalised to ONE winding before `minusPrism` (pocketCells merges cells, so
    clip caps and face caps mix; `unionOutline`'s cancellation needs one winding), bores subtracted, the outline the boundary
    of the union (built as the unbored pieces' union plus each ring when every bore the plane meets is cut across its axis,
    inside one piece, clear of the others — fu 348; else the union of the bored pieces). World cap pieces wind clockwise as the viewer sees them (board frames are improper): the cap fan rewinds
    each by its Newell normal before fanning, or a DoubleSide cap is lit from behind (in `viewport/capFill.ts`, which for a curved part also inserts the other pieces' vertices on each piece's
    edges and fans from the centroid — no specks; a part without curves fans byte-for-byte as before). The cap material takes no clipping plane and
    is keyed on `faded`. **Picking and snapping read only `keptBySection`** (a raycast wrapper on part meshes; Move/Tape
    candidates), guide points exempt — guides are drawn unclipped. The per-part local-cap cache is hit only on the same
    `geometryKey` and the exact local plane coordinate; never hand out its arrays.
    **On the Plans sheet** (fu 256) the store's section is read as the sheet renders (never saved): the section drawing comes only
    from `drawView`'s `section` option — ONE hidden-line pass, every line clipped by `keptBySection`'s test, every occluder
    intersected with the kept half-space (a box stays a box, a planes body gains the plane), a part with no kept wood drawing
    nothing (even a face ON the plane) — and its caps only from `sectionCaps`, always of the ASSEMBLED piece (no explode
    offsets). A sheet with no section is byte-for-byte unchanged (`drawingIdentity.test`; no `caps` key).

52. **A length becomes text — and text becomes a length — only through `units/length.ts`, with the DOCUMENT's own `Units`**
    (`formatLength`/`parseLength` take `Units`; there is no module- or browser-level unit setting, so a background run or a
    sheet formats with its own document). Stored values are inches always; a units switch (`setUnitsDisplay`, one edit,
    locked while exploded) moves no number. Imperial output is byte-for-byte what it was, but for one ruled change: Buying's plane note is omitted when stock and
    part READ the same, in either system (fu 359). Metric: whole mm (half away from
    zero after the fraction path's nudge), a bare typed number is mm (marks, fractions and feet stay inches — so switching
    units reinterprets a pending typed tape entry, preview and commit alike), hole diameter and pitch to 0.1 mm through
    `holeLengthText` (one home for the bench line and the fields, inv 19), stock collapsing at whole mm (inv 18), free drags
    on whole mm via `snapToGrid` (`Math.round(v * 25.4) / 25.4`, the SAME float a typed value stores). Field bounds are
    compared with a 1e-9 tolerance (inv 22): a metric max like `posDim − offset` is not exact. Imperial on purpose: the
    Materials dialog's sheet and stock sizes (trade units), Generate's limits, model-facing text (a design fault's `message`; the dialogs show its `shown` copy, mm to 0.1 — taper
    advice floored to whole mm — except `too-large`, which reads in the inches its limit was typed in; fu 355), `stockLengthText`
    (`8′`). Drawings (Plans sheet, part diagrams, nesting labels) read BARE mm via `formatLengthBare`, with one
    `Dimensions in mm` note in the sheet header, repeated in every printed page's top margin by the named page `metric-sheet`
    (`.sheet-metric`; an `@page` margin box, Chromium 131+ — a header group was measured not to repeat; fu 357); Buying reads parts in the project's units and trade sizes imperial with
    mm in brackets (`tradeLength`/`tradeSize`/`mmBracket`, one home); the grid ladder is 10 mm / 100 mm / 1 m.

53. **`curves.ts` is the ONE place curves become outlines; `curveFaults` is the ONE fault decider.** A
    `CurveCut` is a closed WASTE outline (`start`, then `line`/`arc` segments, the last ending EXACTLY at `start`, P1) in a
    face's stored (u, v) from named ends, cut clean through `through`; an arc is a MINOR arc fixed by `rise` OR `radius`
    (whichever was typed; the other derived, never written back), bowing toward `side` of its chord in STORED numbers. No
    stored kind: Arch/Notch/Bow/Corner are derived structurally (`deriveCurveKind`); a curve no row can represent renders,
    prints, and shows its line and Remove. Faults: `runs-off` (leaves the face rectangle; a too-deep curve reads this) and
    `cuts-through` (the kept face falls apart or empties), exact against the true arcs. Authoring refuses a fault an edit
    ADDS (or a hole it puts into the waste), decided before any mutation; a fault a later resize causes is KEPT and noted
    (`… at this size.`, `— check: …`), never clamped. **Every edit, typed or selected, is refused when an arc would pass a
    half circle** (`pastHalfCircle`, the loader's own exact rule), because the loader DROPS such an arc — silent loss. A
    Bow is stored at its edge's length when written and refit by every edit; a resize never stretches it (P2). **A curved
    part's edges are BUILT** (`curvedEdges`: `unionOutline` on the planes square to `through`, then `bodyEdges` on the rest
    with smooth lines dropped per interval), never `bodyEdges` over its slices (25 ms at 18 chords, 135 at 48). **An unknown
    segment `type` refuses the whole document** with the newer-version message (a spline needs no schema bump). Refine
    refuses a curved or profiled project at entry (`curvedRefusal`, after holes'); joinery rules out only the joint kinds whose zone one enters; Repair accepts them (inv 41); `turnCandidates` none; the design
    checks never see a curve. `viewport/curvesPerf.test.ts` guards the rebuild (≤40 ms per preset and a two-axis part,
    a hand-edited non-convex waste too since fu 368, the four-edge cove, bead and ogee tops since edge profiles (the ogee top back to 40 in chunk c1); MINIMUM of 9, wall-clock).
    **Edge profiles are stored as `ProfileCut`s** (`Board.profiles`, schema 18; profile runs a1): every geometry, word and fault
    reader (bodies, edges, drawings, silhouettes, snap points, stockProbe, diagrams, bench lines, keys, hole faults, the cut list,
    the mesh and UV signature) reads the part through `geometryBoard`, which presents each profile as the exact `CurveCut` chunk 1
    stored (`profileAsCurve`), so a profiles-only part is byte for byte chunk 1 (`profilesView.test.ts`). A NEW reader takes the view
    too. `profileFields` survives to recognise and migrate a profile curve on load. **A stopped profile is a SPANNED view curve**
    (P18: `span` view-only, read through `spanOf`; no span, chunk 1's bytes). Stations are stored per end from a named end of the run
    dimension, in `canonicalRun` order (P11), converted only by `endPos`; `profileFaults` (stop-off, overlap) is the ONE profile
    fault decider — authoring refuses an ADDED one (a Start past its Stop too), a fault a resize causes is KEPT and noted (`… at this
    size.`; an overlap's note never says so). A stopped profile never joins the four-edge collapse. A hole is judged against the
    band extended by `runoutReach` (P14).
    **A SWEPT profile lives in the view** (b1, Q1, Q2): `geometryBoard`'s `profiles` holds exactly the swept ones (a loop, or an
    End to end whose stretch is not its side's one straight segment, `isSwept`, judged on the STORED part), straight ones stay
    view curves byte for byte; every routing gate reads `shapedPart`. `profilePath.ts` is the ONE path home. **Path faults** (swept
    only; a straight profile keeps chunk 1's): `runs-off` (reach over half the face's smaller dimension, depth over the thickness,
    no path), `too-tight` (a convex path arc under the reach, R10; a concave one under `BEARING`, B5; an end chord the offset
    swallows); `overlap` on the path's `cover` (two End to end runs meeting in a B1a mitre only touch). A STATION run that FALLS
    BACK claims only its side's STRAIGHT chords (I2: a2's prism follows no curve; since b2 only a fallen-back one). **B1's ε (2·reach·tan(φ/2) past the tangent point) is
    construction only (`builtPath`)**: every fault, decision and the P14 hole reach reads the tangent point (`profilePath`); ε is
    taken only along a straight next side longer than 2ε. **The straight fallback** (the user's ruling, final review I1): an End
    to end (never a loop) whose swept faults are non-empty while its straight faults (chunk 1's `curveFaults`, a2's profile
    faults) are empty is built, drawn, worded and keyed EXACTLY as a2 built it (hashed against 65947fd) — ONE decision, in
    `geometryBoard`, read back by `runsStraight`; authoring still judges it swept (an ADDED swept fault refuses), so only a saved
    one or a resize falls back. b2 extends it to a one-side STATION run (Q10), which also falls back when following would ADD a
    fault to another profile (`harmFaults`, against b1's all-straight baseline), its note by cause (`fallbackCause`); **the decision
    order:** stops' fallbacks are decided FIRST (`stopFallsBack`, phase 1: every other profile by its shape, paths by stored
    presence; order-independent, no cycle), then every other judgement (phase 2) reads a fallen-back stop as straight, and B1a never
    mitres against it. A two-side run never falls back. **Curves refuses an edit that ADDS a profile fault**, naming the profile
    (`curveEditRefusal`), per profile, not pooled; the Profiles row refuses an edit that ADDS a fault to ANY profile on the part.
    **Stops on a turned path and two-side runs** (b2): a station is the outline point at its run-dimension coordinate on its side's
    stretch (`stationPoint`, on the MODEL chords); its run-out is built in that chord's frame (inv 48). A two-side run goes CCW from
    Start to Stop, kept as stored (never re-ordered), passing at most two whole sides between. It has no path, and is `stop-off`
    (decided before `runs-off`; refused on authoring, kept, faulted and built as nothing on load), when its walk would re-enter
    Start's side (or Stop's), its ends are one point, a `through` end is not where travel enters Start's side or leaves Stop's
    (Q17), or its stations are **CROSSED**: Stop's side stretch holds the first chord of Start's AND the walk from Start to Stop never
    leaves the corner arc the two sides share — a hop of a fraction of an inch the words would call two whole sides. A long-way run
    with ONE station on that shared arc is `stop-off` too (the re-entry rule counts the arc in both stretches; M1, for the user). Q13's end-chord zone (a stop snapped to the next
    convex vertex, `judgedPath`) and B1's ε are construction only: every fault, the cover and the overlap read the typed station. A swept profile opens its face's thickness view in the part diagrams and draws its inner offset
    line there (Q8). A path bug throws in every reader through `geometryBoard` (the fallback asks for the path).
    **On paper:** `DRAWING_CURVE_TOLERANCE` 0.001" and `DRAWING_CURVE_SEGMENTS_MAX` 96 (`curveDrawing.ts`;
    inv 47 for edges and silhouettes). **Part diagrams:** the waste is hatched in the through-face view (clipped to the part); a
    curve opens its through face's MIN view only when neither side exists, decided after holes' entry views; a sharp-vertex
    line is drawn only in the view of a face the vertex lies on, never along the outline's own edges; notes are
    `curveLineEntries` (`{ ids, text }`; a view lists the entries any of whose ids it draws, a curve run wholly off its face
    still in the view it opened); a part with no curves keeps its diagrams byte-for-byte.

54. **`banding.ts` is the ONE place band numbers are computed** (core size, strips, tape runs, faults; edge banding spec §3).
    The cut list, nesting, Buying, Properties' and the Materials dialog's refusals, and Curves' band refusal all read it;
    nothing else derives a band number. It imports `document` modules only (no `units`: `cutlist.ts` and `purchase.ts` format,
    inv 52), and its results are memoised per (part object, band types array object) and deep-frozen: never mutate them.
    **The model is the FINISHED size; the cut list prints the CORE** (the finished part minus its unfaulted bands'
    thicknesses; the corner rule never changes the core) — drawings, snaps, checks, section caps and every geometry reader
    stay on the finished part, and the bodies are untouched (splitting them is fu 397). Nesting lays out cores (`cutStock`,
    whose core copies carry `bands: []` so nothing subtracts twice). **A faulted band adds nothing** — no core reduction, no
    strip, no tape — and prints its band line with `— check: <words>` (`bandFaultText`, the one home); `too-thick` faults only
    the bands WITH thickness; a part with no `faceOutline` faults every band `no-side` (fu 396). Authoring refuses an ADDED
    (side, kind) fault, decided before any mutation (the Banding selects and `Band ▾`, the Materials dialog judged against the
    STORED band types, Curves naming the band — a preset that would add one is withheld); a fault a later edit causes is
    KEPT. **Bands are flag-flipped through mirrors** (`mirrorBands`/`lowerBands`, inv 44) and shared through links (inv 45).
    **Joinery, Refine and Repair refuse a banded project at entry** (`bandedRefusal`; holes, curves and profiles no longer refuse joinery or Repair, so banded is the only joinery refusal of the three, chunk 2). A strip row
    is numbered in the ONE series but carries no `boardIds` (its ids in `stripIds`): every reader of a row's parts must
    handle an empty list, and `planBalloons` SKIPS it (never a hidden part). A band-free document's cut list and Buying are
    byte for byte as before (`bandFreeIdentity.test.ts`, FIXED ids: `nesting.ts` breaks ties by id string).
    **On screen and on paper (chunk 2):** `glueLines` (`banding.ts`) is the ONE glue-line geometry (unfaulted SOLID bands only, both
    broad faces; a strip that runs through draws full length, one that gives way or any under Mitred core corner to core corner, a
    mitre line once — on the long strip when it is solid). The viewport paints a band by MOVING triangles that lie on the side's
    outline stretch into material groups 6+ (`bandedMesh`, float32 tolerance `8·2⁻²³·max(extents)`) — never by recolouring a
    material slot (a slot holds dado walls, hole facets and seams) — and leaves `bodyMesh`/`partMesh`/`boardBodies` untouched; a
    banded part's bodies all draw through `bodyMesh` (pinned equal to BoxGeometry's UVs). A faulted band paints, draws and marks
    nothing but is still keyed (` — check the cut list`) and noted. Band types reach `drawView`, `partFeatures` and
    `buildDiagrams` as an OPTIONAL argument; with none, every output is byte for byte as before. A banded part's diagram is drawn at
    the FINISHED size (fu 395(1)) with `bands` marks and `bandNotes` (the band line, then `coreNote`) on its first thickness view.

55. **`hardware.ts` is the ONE place hardware is counted** (hardware spec §3). A part's entry counts once per PLACEMENT (`holdersOf`'s own walk
    with `placementsOf`; its agreement with `worldParts` is pinned by the oracle test), an assembly's once per placement of its definition (`placementsOf`: a nested assembly counts once
    per placement of every ancestor), the project's once. **Hidden parts count** (inv 43: hidden-ness is view state) and `explode`
    changes nothing. Every reader — the cut list's Hardware section, Buying's Hardware block, Properties' copy note, the dialog's
    `Used by` — reads `hardwareTotals`/`hardwareUsedBy`; nothing else counts. **Hardware never groups the cut list** (the row
    describes what is cut, inv 18), never touches geometry, bodies, edges, drawings or meshes (a document with no hardware types and
    no entries gives today's cut list, Buying, drawings and meshes byte for byte, `hardwareFreeIdentity.test.ts`), and never enters
    `boardUVSignature` (inv 15). `hardware` is a SHARED field in `LINK_FIELDS` (inv 45): stored once on the Shape, so two parts
    that differ only in hardware do not link, and `linkPlan`/`linkByRole` judge by `sameShared` alone. It has no mirror pair (no side,
    no position) and is absent from the reorient predicate (inv 2). Entries are at most one per type per holder in canonical order
    (ascending `type` id) and carry no id; counts are whole, 1..`HARDWARE_COUNT_MAX` (999) and fields REFUSE out-of-range input,
    never clamp. **Every `Definition` copy carries `hardware`**: `copyDefinition` (joinery's split of a shared definition),
    `makeUniqueItem`, `repairTree` (runs on every load; losing the field strips assembly hardware after validation),
    `ungroupItem`; `generated.ts` and Group write `[]`. **Ungroup merges the dissolved assembly's hardware into its parent by adding
    counts per type, so every total is unchanged (inv 46), and is REFUSED when a merged count would exceed 999** (P1: the loader
    would drop it; the refusal is silent in the UI, fu 410). **Reads of a holder's list go through `holderHardware`, which returns the
    STORED array for every target, never `resolveBoard`'s copy**: a selector that returns a fresh array per call crashes React
    (`getSnapshot` must be cached; found live on a shaped part, `c9d5c08`) — return the stored array or a frozen empty one. **Hardware
    types** are per document (`hardwareTypes`, ids in the document id scope, inv 33), have no built-in, are KEPT when unused, are
    deleted only while no placed holder uses them (`Used by N`), and carry free-text names that are never parsed (no `units` edge,
    inv 52). Prices are dollars per pack in the document; Buying rounds packs up and leaves unpriced types out of the total.
    **Joinery and Repair accept hardware projects** (the write-back keeps `hardware` through changed-fields-only edits, inv 46);
    **Refine refuses hardware on parts and assemblies** (`hardwareRefusal`, which takes the STORED document, P2: `flatDocument`
    empties `definitions`) and carries types and the project's hardware into the refined project before `migrateDocument`. Generate
    never writes hardware (`DESIGN_SCHEMA` byte-identical, fu 322). Load order: materials, band types, hardware types, parts/shapes/
    definitions, the project's `hardware`, `pruneMaterials`.
