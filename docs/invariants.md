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
    `lean` is absent too: a lean moves no min corner (`position` is the PRE-lean box's, inv 57), and it has its own store actions
    (`setLean`, `levelEnds`). On a LEANING part a resize or turn keeps the PIVOT instead of the corner (`pivotKeptPosition`, inv 57).
    `tenons` is absent too (round tenons, schema 24, inv 58): a tenon moves no min corner and never changes the part's length, so it
    has its own store actions (`addTenon`, `updateTenon`, `removeTenon`). Bore leg sockets' Tenon the legs grows or shortens a leg on
    purpose, and its plan carries the leg's `length` AND `position` in one patch (Level the ends' shape, `levelPlan`).
    `dovetails` is absent too (dovetails, schema 26, inv 62): a dovetail moves no min corner, and it has its own store actions
    (`dovetailCorners`, `removeDovetail`). Dovetail the corners runs parts out on purpose, and writes each part's full after-state,
    size AND position, through `writeBackParts` with `keepWorld` (inv 61's write-back).
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
    cuts, or `curvedEdges` for a curved part; `edgesOf` is the three-way choice), not from the solids.** General
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
    A ROUND TENON (inv 58) draws its shoulder ring, its tip's outline and, in drawings, its silhouettes — never a seam or facet
    line on its round side (its two view curves meet only at smooth outline vertices, inv 48). Its shoulder ring's centre is a snap
    point though it sits in the tenon's WOOD (not put to `touchesStock`): the hole-centre exception, for the centre of a drawn ring.
    A DOVETAIL (inv 62) draws its sockets' straight outlines (every vertex sharp, so each is a real edge, no facet line); its snap
    points are only its corners at the OUTSIDE plane (`dovetailCorners`: a tail's end corners, a pin's narrow corners), each on
    wood; the sockets are air to `stockProbe`, so no lattice point is offered in one. No exception to "on a drawn feature".
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
    - **A lean edit moves the world under a held point** (splayed legs, inv 57): `setLean` and `levelEnds` end in `judgeHeld()`, the
      same point-precise path a resize takes (`updateBoards`), because a leaning part's snap points are its lean-mapped lattice. No
      board-precise tape clause was added for it.
25. **Exact moves are never rounded to the drag grid (`SNAP_INCHES`, or 1 mm in a metric project — `snapToGrid`)**: snap move, click-placed guide,
    ray-typed guide, axis-placed guide and copy in a row (copy k = original + k·step·sign,
    never from the previous copy). Round what a free drag produced, nothing else.
    **A free drag of a LEANING part rounds the drag DELTA, never a corner** (`dragTarget`, Gizmo.tsx; splayed legs §6.2, inv 57): its
    pre-lean corner is off-grid after Level the ends, and its real-bounds corner would move the seat joint. A snap onto a leaning
    part's point moves the moving part by an exact world delta, unrounded, as before.
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
    shape), and so angle-cut, hole, curve, round-tenon (schema 24, inv 58) and dovetail ids (schema 26, inv 62); profile ids share the part's CURVE scope (curves validated first), so the
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
    **A LEANING part (splayed legs §7, inv 57) is measured on its real, leaned bodies:** a pair with a leaning part always takes the
    real-bodies overlap path (`worldBodyFaces`, now in `leanContacts.ts` with the lean composed; gated on the leaning part's REAL
    bounds, never its pre-lean solids, and never falling back to boxes), even with no angle cut; `partMass` weighs leaned bodies (the
    box path only for `!isAngled && !leans`). Its boxes for too-small, too-large and the nearest-part distance are `partBounds`;
    `faceContacts` (joinery's sites) keeps the pre-lean boxes, since joinery refuses a leaning document. Its contacts are only its
    LEVEL faces (`levelFaces`: leaned body faces whose world normal is ±Y within `LEVEL_EPS` = 1e-9, which admits float error only —
    a 0.5° slope is not a contact, mutation-tested), matched against another part's level face within `TOUCH` in y with real plan
    overlap (`overlapArea` > `REST_AREA` = 1e-9 sq in, against the ~1e-15 slivers of an edge-only meeting); its pre-lean boxes make no
    contact (`touching` is `[]`). Every walk is gated on `leaning`, computed once: a lean-free document takes today's expressions,
    and its check results are pinned byte for byte (`leanFreeChecks.test.ts`, a sha of every violation over eight fixtures).
    **A seated ROUND TENON is THE ONE EXCEPTION to "holes are ignored"** (round tenons spec §5, inv 58; `tenonJoints.ts`): a part's
    bodies stay hole-free (inv 50), so a bore still never decides an overlap, a contact, the footprint or the weight — except that a
    single bore a seated tenon fills (`seatedIn`) makes that tenon a JOINT. Nothing else about a hole reaches the checks. A joint's
    tenon is not measured against its socket's part: that pair's bodies are cut at the tenon's shoulder (`withoutTenon`, the
    shoulder's kept half-space), so a shoulder pushed into the seat is still an overlap and every other pair is measured as before.
    A tenon that is NOT seated but runs where a single bore of the other part is (`tenonMeetsBore`: a bore on its axis it enters by
    more than `TOUCH`, or one of its diameter on another line within the two radii) gets the overlap's hint ` — its round tenon
    doesn't match the socket there` (`TENON_HINT`), the tenoned part named first. **A part with a BUILT tenon is measured on its real
    bodies** (`realBodied` = `isAngled(b) || builtTenons(b).length > 0`, read wherever `isAngled` chose real bodies: the overlap path,
    `contactSolids`, `partMass`); a part whose tenons are all faulted builds none and checks exactly as its tenon-free twin (ruling
    T7h). **A built tenon's wood, its tip disc included, is never a contact** (ruling T7f): not a rest, not the floor, not grounding's
    `connected`, not the tip footprint. An unleaned part reads `contactRegions` trimmed to its shoulders (as a taper's stations), and
    its floor test is that trimmed wood (`stands`, replacing the box's `min[1] <= TOUCH` wherever a floor test is made, only for a
    part with a built tenon); a leaning part reads `checkedLevelFaces` (its leaned bodies cut at every shoulder, then `levelFaces`'
    rule). `levelFaces` itself keeps the tips (Bore leg sockets finds legs by them). So a part standing only on a foot tenon's tip is
    not on the floor. One scan (`anyTenon`): a document with no built tenon takes every path above unchanged.
    **A part with a BUILT DOVETAIL is measured on its real bodies too** (dovetails spec §5.3, the user's ruling 2026-10-27, inv 62):
    `realBodied` = `isAngled(b) || builtTenons(b).length > 0 || builtDovetails(b).length > 0`, so a dovetailed corner's two
    interpenetrating boxes never read as overlap (its bodies partition the corner). Its contacts (`contactRegions`' last step,
    `dovetailContacts`) are the wood behind each baseline plus, per tail or pin and half pin, the box INSCRIBED at its narrowest J
    span (a tail's baseline span, a pin's outside-face span) over the dovetail's depth — never over-claiming wood: the angled cheeks
    are never a contact, the two parts' inscribed boxes only touch, and a tail's flat underside rests on the pin part's wood behind
    its baseline. Its floor test stays the box's (`stands` is a tenon rule). A part whose dovetails are all faulted builds none and
    checks exactly as its dovetail-free twin; a dovetail-free document's results are unchanged. No new kind of support (inv 39).
    **Half-blind (schema 27, inv 62):** a half-blind pin part's pin boxes are the through ones (each pin's narrowest J span — at the
    lap plane, the same bounds as the outside plane — over the whole thickness: the part in front of the lap plane is lap wood, so
    nothing is over-claimed), and it gains ONE contact box for the lap slab (the whole J span, the run `depth`, the
    thickness from the outside face to the lap plane), where the tails' end faces rest; no tested verdict depends on that box
    (removing it fails only its own presence test; kept as the spec asks, it never over-claims). A half-blind drawer on the floor and a carcass with a
    half-blind top check clean.
39. **Support means HELD: every part off the floor is resting, between (≥ 50% coverage of
    both faces of X or Z) or lapped (a broad face; a top contact only under the stated
    one-level conditions), and the piece must not tip.** **PROHIBITION: do not drop (c),
    the coverage threshold, or either half of the top-face clause.** One fault, one report.
    `groundedSet` is the ONE grounding walk. Known limits: follow-up 176.
    **A leaning part takes part in support only by RESTING (splayed legs §7.2, inv 57)** — or, since round tenons, by a seated
    tenon's joint (clause (d) below): through its level faces it touches the floor
    (`floor[i]`: a level down face at |y| ≤ TOUCH; the hangs skip and the tip floor read it), rests on a part below and holds a part
    resting on it (`rests`, added as axis-1 contacts flagged `rest`); `groundedSet` stays the ONE walk (for a pair with a leaning part
    it joins on `rests` either way; a leaning part seeds it only from `floor`). In `isHeld` a leaning part passes by (a) only, and an
    unleaned part's (b) and (c) skip `rest` contacts, so **nothing is held "between" leaning parts or lapped onto a leaning part's
    side** in chunk 1 (aprons and stretchers between splayed legs report unsupported or hangs until chunk 3; fu 438). A leaning part
    resting on another leaning part follows the same level-face-on-level-face rule. A grounded leaning part off the floor reports the
    existing `hangs` sentence (fu 439). An unlevelled leg touches the floor at an edge or corner, so it is not grounded; its fault (and
    `shown`) adds `; it leans, and its foot is not level: Level the ends`. The tip footprint of a leaning part is its floor polygons
    THEMSELVES (`feet(i)`: one zero-size box per polygon vertex, so the hull is exactly the feet's; never their bounding boxes, which
    passed a three-leg stance that tips — final review I1, fu 444). For every UNLEANED pair clause (c), the coverage
    threshold and both halves of the top-face clause run untouched, so the PROHIBITION above stands as written.
    **(d) JOINED (round tenons spec §5.2, inv 58): a seated tenon holds a part, only toward the floor.** A seated tenon (`tenonJoints`)
    joins its part and its socket's part (`partners`, either way round), and either is held by the other — but only when that
    partner reaches the floor WITHOUT the part being judged (`groundedWithout(i).has(o)`, the top-face clause's own guard; ruling
    T7g), so two parts never hold each other up off the ground and a peg in a hanging shelf holds nothing. `without` is excluded as
    for every clause. (d) is a full alternative to (a)–(c), for ANY part, leaning or not, with no coverage threshold (that belongs to
    the contact clauses), and it is asked BEFORE the leaning rule in `isHeld`, so **a leaning part is held by a joint too** (its own
    tenon or one seated in it), not only by resting. `groundedSet` stays the ONE walk: its `joint` predicate connects a seated pair,
    asked before the leaning rule's `rests`, so a joint grounds a leaning part too; a leaning part still SEEDS the walk only from
    `floor` (an unlevelled one is still not grounded). It is ADDED: (a), (b), (c), the coverage threshold and both halves of the
    top-face clause run exactly as before. The top-face clause's floor test reads `stands[o]` for a part `o` with a built tenon (its
    shoulder-trimmed wood, ruling T7f) and `boxes[o].min[1] <= TOUCH` otherwise, unchanged. The tip check still judges the whole
    piece: a joint does not stop a piece tipping. A document with no built tenon passes `partners`, `joint` and `stands` as null and
    takes every walk as before. Known limits: first match wins (fu 461); a leaning leg standing only on a foot tenon gets the
    `Level the ends` hint, which would not help (fu 462).
40. **Anything deciding "same cut" derives from `CUT_GEOMETRY_FIELDS` (`cuts.ts`), checked
    against `Cut` by `satisfies`.** Do not replace the table with a list in a function body
    or add an exclusion without a written reason. `cutsThatRemoveStock` decides which cuts
    are compared; the resulting row split on exact dimensions is correct — do not round.
    Angle cuts have their own table, `ANGLE_CUT_FIELDS` (`angleCuts.ts`), every field but `id` — `kind` INCLUDED — exact.
    Hole rows have `HOLE_FIELDS` (`holes.ts`), every field but `id`, exact — except a count-1 row's ignored `pitch`,
    which `holeRowValues` reads as 0 (fu 338, the user's ruling 2026-10-15): the cut list groups by them as a multiset, ids ignored (`holeSignature`); `sameShared` compares rows in order,
    ids included, as it does cuts and angle cuts. `linkByRole` aligns a member's hole-row ids to the representative's (`alignedTo`), only when `sameHoleRow` matches row for row, and (AI-profiles) its profile ids, only when `sameProfile` matches in stored order; never loosen `sameShared`.
    Curves have `CURVE_FIELDS` (`curves.ts`, `satisfies`), every field but `id`, exact, the segment list
    compared field by field in order: the cut list groups by them as a multiset, ids ignored; `sameShared` in order, ids included.
    Profiles have `PROFILE_FIELDS` (`profiles.ts`, `satisfies`), every field but `id`, exact, `run` structurally; the cut list groups
    them through the geometry view (as curves); `sameShared` in order, ids included.
    Bands have `BAND_FIELDS` (`bandModel.ts`, `satisfies`: `side`, `type`), exact; the cut list keys by `bandSignature` (the corner
    rule appended ONLY where `bandsMeetAtCorner` holds, the one case its words depend on it; final review 1); `sameShared` in canonical order.
    Round tenons have `TENON_FIELDS` (`roundTenons.ts`, `satisfies`: `end`, `diameter`, `length`), exact (`tenonValues`, `-0` told
    apart from 0): `sameTenon`; the cut list keys by `tenonSignature` (exact, order-independent, ids ignored, over the STORED tenons,
    appended to `rowKey` only when the part has one); `sameShared` compares in order, ids included (Task 1 review I1); `alignedTo`
    adopts the representative's tenon ids only when `sameTenon` matches end for end (canonical order). `geometryKey` reads a built
    tenon through its view curves (`geometryBoard`, inv 48).
    Dovetails (schema 26, inv 62) have `DOVETAIL_FIELDS` (`dovetailModel.ts`, `satisfies`: every field but `id` — `dim`, `end`,
    `role`, `count`, `slope`, `pin`, `depth`, `outside`), exact (`dovetailValues`, `-0` told apart from 0, an absent `outside` never
    equal to a present one): `sameDovetail`; the cut list keys by `dovetailSignature` (exact, order-independent, ids ignored, over
    the STORED dovetails, appended to `rowKey` only when the part has one), exactly as tenons; `sameShared` compares in order, ids
    included; `alignedTo` adopts the representative's ids only when `sameDovetail` matches in canonical order. `geometryKey` reads a
    built dovetail through its view curves.
    A compound miter's `across` (square-set legs, schema 25, inv 59) is `ANGLE_CUT_FIELDS`' LAST entry: `angleCutValues` flattens it
    to `[rise, from]` as it does `points` (pushed raw, an object would compare by identity), and an absent one adds NOTHING, so a
    single-slope cut's values — the cut list's row key, `geometryKey`, the UV signature, `groupSignature` — are byte for byte as
    before; `sameAngleCut` tells cuts apart by `rise`, by `from` and by whether `across` is present. `sortAngleCuts` compares up to
    the shorter values list, then sorts the shorter first, so it stays antisymmetric once lists can differ in length.
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
    round trip). Sites stay on box contacts on purpose. **Joinery on a holed project rules joint kinds out per site before the call** (`featureAllowed`, `joints/featureZones.ts`, spec §3): one trial `applyJoints` per (site, kind), watched through `JoinWatch`, narrows a site's `allowed` where the kind's zone (the mortise or tenon, a dado or its stop, a lap notch, a rabbet pocket or its trim) meets a hole (`holeRegion`); a rabbet unit and a part's half-lap set are trialled TOGETHER and ruled out at every member (their recipes only run as a set); a stopped dado is trialled once per stop end, an end whose trial conflicts is DROPPED from the site's `stopEnds`, and the kind is ruled out only when no end clears (the user's ruling 2026-10-22, "Offer clear ends", chunk 3, reversing chunk 1's "ruled out whole"; for every feature, one decider; the site message, `parseChoices` and `validChoice` read the narrowed `stopEnds`; a narrowed end writes no summary line); a skipped trial rules nothing out; a hole takes no run-through exception at a trimmed end. The sites a feature narrowed to butt only are withheld from the call (a site `allowedFor` already makes butt-only is sent as before), and the dialog says why (`ruledOutText`, one line per site). `defaultJoint` respects `allowed`. `resize` re-anchors holes measured from the moving end (`rebaseHoles`), and `readJoints`' `resizeAt` undoes it exactly; `sameJoined` compares a part's holes in stored order within `GATE_TOLERANCE` (a hole number goes out as `x + L` and back as `(x + L) - L`, which need not be bitwise `x`; fu 413 for `sameAngleCut`'s exact comparison). The gate's moved-hole check is pinned through `sameJoined`, because a hole moved after joining round-trips through `gateUnjoin` unchanged. The unjoin gate (`sameJoined`) compares a part's cuts as a MULTISET (`sameCutSet`; order is not geometry, still exact at 1e-9; angle cuts stay in order). **Refine carries the features onto its plain parts BEFORE `runJoinery`, and `runJoinery` re-joins with these same feature zones and rebases** (refine-features spec §6; inv 56; the done view's `carried` list is computed plain-to-plain BEFORE joining, because joinery grows tenons and every joined part would read as resized). A joined Refine is refused up front (`plainForRefine`, `'angle-joint'`) when the original's angle cut already runs into a joint; a result the model leaves conflicting comes back UNJOINED (`JointsSummary.notJoined`), never joined over an angle cut.
    **Joinery on a curved or profiled project (joinery-features chunk 2) rules kinds out the same way**, through the same `featureAllowed` trials, with the zone tests in `document/featureRegions.ts` (`shapedFeatures`, `featureMeetsBox`, `featureTouchesEnd`, `runsOutThrough`, `crossSectionOverlaps`) over `rectOverlapsWaste` / `wasteOnSegment` (curves.ts) and `sweptWasteMeetsBox` (sweep.ts). **The watch judges a curve or profile in the ORIGINAL frame** (P5): on `flat.boards[part]`, the part before the trial, never on a mid-trial board (`geometryBoard` and `sweptWaste` are memoised per object, so a view of a mutated board is stale); a cut box or trim slab is moved into that frame by subtracting the sum of the part's min-end growths so far. Holes keep judging the board as it stands. Tests are open (touching passes) for curves, straight profiles and a stopped profile's span widened by `runoutReach`; a swept profile keeps the conservative footprint (touching included). A growing kind (mortise-tenon, dado, stopped-dado) is ruled out when a feature touches the joined end with positive area (`wasteOnSegment` > 1e-9 across the grown dimension, its `through` extent reaching that end, or a swept box form meeting the face): a curve or straight profile that only MEETS the growing end (not running through it) is exempt along the length when its waste on the end face (a 1e-6 slab, in the original frame) stays out of the tenon's section, open (fu 415, the user's ruling 2026-10-22: a default bow keeps its tenon; a deeper bow or a rounded corner past the shoulder does not; swept profiles keep the rule). **The run-through exception is decided per growing face** (P7): a curve or straight profile with `through === 'length'` that runs out through the GROWING face (a plain curve always; a view curve with a `span` unless that end is a stop) is not a conflict when its waste in (width, thickness) does not overlap the tenon section (open); swept profiles take none; a run-through feature at a TRIMMED end never conflicts (it is shortened with the part). `resize` re-anchors curves and profiles measured from the moving end (`rebaseCurves`, `rebaseProfiles`), `readJoints`' `resizeAt` undoes them within `GATE_TOLERANCE` (as for holes: `(x + L) - L` need not be bitwise `x`); **an arc stored exactly at the half-circle bound (`rise === chord / 2`, the Half-round notch, or `radius === chord / 2`, judged the loader's way) is re-stored at the bound of its NEW chord, and any other shifted arc the loader would now drop is clamped to that bound** (final review C1: a shifted chord can come back an ulp short, and the closing `migrateDocument` would drop the whole curve with no note); and `sameJoined` compares them structurally in stored order (`sameCurves`, `sameProfiles`, driven by `CURVE_FIELDS` / `PROFILE_KEYS`). `joineryRefusal` never refused a curve (`curvedRefusal` is deleted: Refine now carries curves, inv 56); Repair accepts curved and profiled projects, and Generate and Refine author profiles (inv 53; only those of a part with curves or a two-side run stay carried, inv 56). Words (`ruledOutText`): `curve` and `<kind> profile`, the verb `are` after `holes` and `is` otherwise; the failure dialog is `FEATURE_CHECK_FAILED`.
    **Joinery on a banded project (joinery-features chunk 3) rules kinds out the same way**, through the same `featureAllowed` trials; Repair accepts banded projects, and Generate and Refine author bands (inv 54; only a curved part's bands stay carried, inv 56). A band's region is its strip (`document/featureRegions.ts` `bandRegions`): the band TYPE's thickness in from its side × the side's full ORIGINAL run × the part's thickness, tape included — only a thickness-0 tape has no region — judged AS STORED (P10: `bandFaults` not read; a band whose type is missing is skipped), in the ORIGINAL frame like curves (P9: each watched box or slab moved by the running min-end shift, so a tenon's cheek and shoulder waste in new wood never meets a long-edge band). A pocket conflicts when its box meets a strip (open). **A growth** conflicts with a band ON the growing end (tape included); a band running along the length is exempt when the trial is a dado or stopped dado (the user's ruling: an edged shelf is housed whole), or it has no region, or its strip clears the tenon section's `[shoulder, w − shoulder]` in width (open); a growth through the thickness meets every band (defensive). **A trim** conflicts with a band on the trimmed end (tape included); a band running along the trimmed dimension is shortened with the part and never does; any other strip conflicts when it meets the slab. The feature word is `edge band`, verb `is`. **A stopped dado's smallest inset clears a receiver band** (the user's ruling 2026-10-22, "Fix now"; `sites.ts` `bandClearance` inside `rangesOf().inset`): at a stop end beside a strip on R's side facing it, the minimum is raised to the strip's far edge less E's stop-end face (the band's thickness when flush, `t − g` set back by `g`), snapped up to 1/16 with today's 1/4 as the floor; when that passes the maximum the range is today's and the trial rules the kind out. The trial, `validChoice` and the site message all read `rangesOf`, so they agree; a band-free receiver's range is byte for byte as before. Bands store no number, so there is no rebase and `resizeAt` is untouched; `sameJoined` compares `bands` (`sameBands`) and `cornerRule` exactly.
    **A leaning part is refused, never joined (splayed legs §8, inv 57):** `joineryRefusal(entry, doc, flat?, sites?)` takes the caller
    (`JoineryEntry`: `'joinery' | 'repair' | 'refine'`) as its FIRST, required argument and runs `leaningRefusal` first — the first
    leaning part in flat order, one verbatim sentence per caller (`Add joinery can't join a leaning part yet: <name>.`, `Repair can't
    join a leaning part yet: <name>.`, `Refine can't keep joints with a leaning part yet: <name>.`) — then the taper and angle rules.
    Repair and a joined Refine call `leaningRefusal` directly (still the one decider: `joineryRefusal`'s first step), each BEFORE a
    box-based step of its own: Repair refuses only when the document leans AND some part has cuts (a leaning document with no cuts
    is "nothing to repair", Ruling R1; the Joinery dialog always runs Repair), and `plainForRefine` decides it right after the
    "no cuts → plain" return and BEFORE `gateUnjoin` (reason `'lean-joint'`, counted as joined; the gate's box read-back would
    otherwise answer first). A joined Refine also refuses up front when any part has a TILTED hole row (angled holes Ruling T11a,
    inv 56: such a part is kept exactly, which a re-join cannot promise): `plainForRefine` decides it in the same place, BEFORE
    `gateUnjoin` (`Refine can't keep a part with angled holes in a joined project yet: <name>.`, reason `'lean-joint'`).
    **A part with a ROUND TENON is refused, never joined (round tenons spec §9, inv 58), by the decider's SECOND step:**
    `joineryRefusal` runs `leaningRefusal`, then `tenonRefusal(entry, flat)` — the first part in flat order carrying any stored
    tenon (`hasTenons`: a faulted one counts; a flat part is resolved, so a Shape's tenon counts for every user), one verbatim
    sentence per caller (`Add joinery can't join a part with a round tenon yet: <name>.`, `Repair can't join a part with a round
    tenon yet: <name>.`, `Refine can't keep joints with a part with a round tenon yet: <name>.`) — then the taper and angle rules.
    v1: the whole document is refused; a later chunk can rule kinds out per site instead (fu 460). Repair calls `leaningRefusal ??
    tenonRefusal` with the same "some part has cuts" gate; `plainForRefine` calls `tenonRefusal` after `leaningRefusal` and BEFORE
    the tilted-row check (ruling T10c, matching `joineryRefusal`'s order), reason `'lean-joint'`. Needed because `shapedFeatures`
    reads `profileView` (a tenon's waste is no shaped feature), so `featureAllowed` would not see a tenon.
    **A part with a COMPOUND end cut is refused, never joined (square-set legs spec §4, inv 59), by the decider's THIRD step:**
    `joineryRefusal` runs `leaningRefusal`, `tenonRefusal`, then `compoundRefusal(entry, flat)` — the first part in flat order
    for which `hasCompoundCut` holds (a flat part is resolved, so a Shape's cut counts for every user), one verbatim sentence per
    caller (`Add joinery can't join a part with a compound end cut yet: <name>.`, `Repair can't join a part with a compound end cut
    yet: <name>.`, `Refine can't keep joints with a part with a compound end cut yet: <name>.`) — then the taper and angle rules.
    Repair calls `leaningRefusal ?? tenonRefusal ?? compoundRefusal` under the same "some part has cuts" gate; `plainForRefine` calls
    it right after `tenonRefusal` and BEFORE the tilted-row check and `gateUnjoin`, reason `'lean-joint'`. Only Level the ends makes a
    compound cut, on a leaning part the first step already refuses, so this step fires only after Clear lean. It is why
    `rebaseAngleCuts` (field by field) and the box-based read-back never see one: every production entry to `applyJoints` and
    `readJoints` sits behind one of the three calls.
42. **A group move rounds the GROUP's min corner once and adds one delta
    (`moveGroupTo` → `translateBoards`); one selected part keeps the separate single-part
    path.** Do not unify them; do not round inside `translateBoards`. `selectionPatch` is
    the ONE writer of a user's selection change. A selection change mid-drag ends the
    gizmo's gesture and commits nothing.
    **A group with any LEANING part rounds the DELTA instead** (`delta = snap(minCorner − bounds.min)` over `partsBounds`; splayed
    legs §6.2, inv 57): its real min corner is not a grid point, and rounding it would lift a levelled foot off the floor. Still one
    delta through `translateBoards`, never rounded inside it; a lean-free group is unchanged byte for byte.
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
    **A row's tilt (schema 23) is FLAG-RELATIVE and flips with the flags** (`tiltAlong` toward the far end from `alongFrom`,
    `tiltAcross` toward the far side from `acrossFrom`; `holeTilt.ts`): `mirrorHoleRow` spreads the row, so the slopes ride
    every flip unchanged and the bit reflects with no arithmetic (a `from` flip reverses the axial component, an `alongFrom` or
    `acrossFrom` flip the lateral one). Never negate or re-derive a stored slope across a mirror.
    A curve reflects by flag flips too (`mirrorCurveCut`: `uFrom` when u is the mirrored dimension,
    `vFrom` when v is, nothing when `through` is) — never arithmetic on coordinates, and `side` never flips (it is defined on
    STORED numbers); `lowerCurves` is its exact inverse, reusing an untouched stored array. Pinned with `chiralCurved`.
    A profile reflects by flag flips too (`mirrorProfile`: `face` through the thickness, a side's `from` along its `across`; an End to
    end run keeps min→max; a station run's ends swap on EVERY mirror, since a reflection reverses travel round the face);
    `lowerProfiles` is its exact inverse, reusing an untouched stored array. A two-side run (b2) swaps Start and Stop on every
    mirror too, each end's flags flipped by its own side (Q20; pinned with `chiralTwoSide`, and 3600 runs × 3 mirrors in review).
    A band reflects by a flag flip too (`mirrorBands`: `side.from` when `side.across` is the mirrored dimension; `cornerRule`
    never flips); `lowerBands` is its exact inverse, reusing an untouched stored array.
    **A part-level mirror (mirrored links, schema 21, fu 432) reflects by the SAME flag flips along `mirrorDim`:**
    `mirrorFeatures` (frames.ts; `mirrorPart`'s feature half — cuts, angle cuts, hole rows, curves, profiles, bands; sizes,
    posture, turn, position, material, grain, `cornerRule` and hardware untouched) is what `resolveBoard` applies to a mirrored
    user, and `lowerOwnMirror` (treeEdit.ts: `lowerCuts`, `lowerAngleCuts`, `lowerHoles`, `lowerCurves`, `lowerProfiles`,
    `lowerBands` against the Shape's OWN arrays, `withShapeFeatures`) is its exact inverse, so an untouched feature comes back
    as the Shape's own object. Rectangular cuts are the one exception to bit-exactness: they reflect through `mirrorCut`, which
    is size-based and not bit-exact twice on a non-dyadic size — which is why `mirrorCandidates` offers no mirror unless the
    part's cuts survive two mirrors exactly, and why joinery's regroup judges membership by exact resolution (inv 46).
    `mirrorInPlace` (`mirrorFeatures` + the turn negated: M_x R(r) = R(−r) M_d0, box unchanged) is the checkbox's operation
    for a part at chain turn 0, kept for tests; the store's `mirrorLinkedPart` writes the general world-X form itself (inv 46).
    **A lean reflects by `leanFlip` too** (splayed legs §3.4, inv 57: the turn-0 X slope negated, the facing dimension kept — the
    same flip whatever the part's turn, because `mirrorPart` reflects along `mirrorDim` and negates the turn): `mirrorFeatures`
    applies it, `lowerLean` is its exact inverse (a value-equal result maps back to the stored object). It conjugates the whole leaned
    rotation (`S · m · S`); never re-derive a twist from flipped slopes. A quarter turn needs nothing: the lean is stored at turn 0 and
    `worldSlopes` turns it (`rotateVec(b.rotation, …)`, `setLean` back through `inverseTurn`). Pinned with an asymmetric lean (both
    slopes non-zero and unequal), rake = splay and the seam leans. `leanFlip` keeps `square` (square-set legs, schema 25, inv 59;
    by conditional spread, so a turned lean gains no key); a square-set map is `T` alone, already mirror-equivariant (`S · T · S`
    is the flipped lean's tilt), so it conjugates with no seam case.
    **A compound miter reflects by a FLAG FLIP too** (square-set legs spec §3.1, inv 59): `mirrorAngleCut` flips `from` along
    `face`, `alongFrom` along `along`, and — the only change along the THROUGH dimension — `across.from` (a single-slope cut runs
    straight through it and is unchanged); a fresh `across` object every time, an involution. `lowerAngleCuts` needed no change (it
    round-trips through `mirrorAngleCut` and `sameAngleCut`, both of which read `across`). Pinned with mixed-flag fixtures (an
    `across.from` differing from both `from` and `alongFrom`) and a levelled square stool mirrored without a re-level.
    **A round tenon reflects by a FLAG FLIP too** (round tenons spec §3.1, inv 58: `mirrorTenons`): a mirror along the LENGTH swaps
    each tenon's `end` and re-sorts (`min` first); across the width or thickness nothing moves and the SAME array comes back. It is its
    own inverse; `lowerTenons` lowers through one mirror (an untouched tenon maps back to the stored object, an untouched list to the
    stored array; a draft with none adds no key). `mirrorFeatures` applies it (a part's own mirror and a mirrored instance's step);
    `lower` and `lowerOwnMirror` lower it. Pinned with a chiral leg (a tenon on one end only) inside a mirrored instance: the legs are
    still seated in the world.
    **A dovetail reflects by a FLAG FLIP too** (dovetails spec §3.4, inv 62: `mirrorDovetails`): along its own `dim` its `end` swaps,
    along the thickness a pins entry's `outside` swaps, along J nothing (the layout is a palindrome); when no entry moves the SAME
    array comes back, else it is re-sorted into canonical order. Its own inverse; `lowerDovetails` lowers through one mirror (an
    untouched entry maps back to the stored object, an untouched list to the stored array; a draft with none adds no key).
    `mirrorFeatures`, `lower` and `lowerOwnMirror` apply it as they do tenons.
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
    **A link may be used MIRRORED (schema 21, fu 432).** `mirrored` is an OWN field (`LINK_FIELDS.mirrored = 'own'`) of a SHAPED
    stored part only, stored only as `true`: the loader drops it from a plain part and any other value; `plainOf` and Ungroup's
    plain path strip it; `withoutFlag` gives a shaped record without it. `resolveBoard` applies it (`mirrorFeatures`, inv 44) and
    keeps `mirrored: true` on the resolved part so a writer lowers through it; everything downstream reads an ordinary Board.
    Unlink and every dissolve store the RESOLVED board, so a mirrored user becomes a plain part in its own hand, nothing moved.
    `linkByRole` tries, per representative, the part itself, then its turn candidates, then its MIRROR candidates
    (`mirrorCandidates`: the part and each turn candidate with `mirrorFeatures` applied, turn KEPT, flagged — so the candidate
    resolves to the part's own world; none when its rectangular cuts do not survive two mirrors exactly), each put in the
    representative's list order first (`inOrderOf`, only on an exact one-to-one match) and judged by `alignedTo`. Unmirrored
    always first, so a symmetric part is never stored mirrored. `linksToShapes` keeps the flag on the shaped record it writes;
    a mirror candidate left in no SHARED Shape is restored to the ORIGINAL part, so no plain part carries reflected features or
    the flag. `sameShared` is unchanged — the candidate is already in the representative's hand. `linkPlan` treats a user of
    the source's own Shape with the OTHER flag as unchanged (`mirrorMate`: its mirror image by design). Link writes the Shape
    from the source's EXISTING Shape fields when the source is shaped (exact, never re-lowered), else its plain fields; a member
    already on the source's Shape keeps its flag, every other member (plain, or another Shape's user) takes the SOURCE's flag
    (a mirrored pair joining another Shape by Link loses its mirror relation; fu 435).
    **`lean` is SHARED** (splayed legs §3.1, inv 57; an optional object, so excluded from `_sharedPrimitives`' primitive check): four
    linked legs share one lean, which each user's own turn and mirror flag turn outward. `sameShared` compares it by value (`x`, `z`,
    `face` exact, and `square` since schema 25, inv 59, as `lowerLean` does; `groupSignature` appends `,square` only when present, so
    `writeBackFlat` splits a Shape whose users differ only in `square`; absent equals only absent); `sharedOf` and `sharedPatch` copy it (a removal stays `{ lean: undefined }`, key
    present — inv 46's removal convention); `resolveBoard` gives each user a FRESH `{ ...lean }`, flipped for a mirrored user;
    `groupSignature` carries its value form. A shape-mate's patch never carries `lean` (mates exist only to re-pivot posture; each
    would lower the target's world lean through its own flip and the edits would disagree). `setLean` and `levelEnds` write a Shape's
    lean, length and angle cuts ONCE, through the first selected (or the clicked) user.
    **`tenons` is SHARED** (round tenons spec §3.1, inv 58; an optional list, so excluded from `_sharedPrimitives`' primitive check):
    four linked legs share one tenon list, stored once on the Shape, a FRESH copy per user (`copyTenon`). Never stored empty:
    `sharedOf` copies it only when present; `sharedPatch` reads a present `[]` or `undefined` as a REMOVAL (the write-back stores it as
    a deleted key, `storedValue`'s `ABSENT`, never `tenons: []` or `tenons: undefined`); `sameShared` compares in order, ids included,
    every field exact (`sameTenon`); `resolveBoard` copies it; `groupSignature` carries its sorted `tenonValues`. `turnCandidates`
    never turns a tenoned part (through `keepsExactly`, inv 56): its tenons name ends of the STORED length, so a turn that reverses the
    length in the world would carry each to the other world end. Bore leg sockets' Tenon the legs writes a Shape's tenons, length,
    angle cuts and holes ONCE, through the group's first leg, and each other storage target only its own position (`fitLegs`).
    **`dovetails` is SHARED** (dovetails spec §3.4, inv 62; an optional list, excluded from `_sharedPrimitives` as `tenons` is), with
    every rule above for `tenons` word for word: `copyDovetail`, never stored empty, a present `[]` or `undefined` a REMOVAL,
    `sameShared` in order with ids (`sameDovetail`), `resolveBoard` copies it, `groupSignature` carries its sorted `dovetailValues`.
    `turnCandidates` never turns a dovetailed part (through `keepsExactly`, inv 56): its dovetails name ends of the STORED dimensions.
    Dovetail the corners writes linked users through `writeBackParts` (inv 61); its link post-condition refuses a split Shape.
46. **The tree has ONE composition (`placeBoard`/`placeInstance`), ONE walk
    (`worldParts`), and every edit is written back through `treeEdit.ts`**, changed fields
    only, a moved position lowered as a delta. Path names come only from `flatDocument`.
    - **Two write-back rules: a Properties edit keeps the stored local position; joinery
      passes `keepWorld`.** Do not unify; a new caller picks one.
    - Group moves nothing (identity frame); Ungroup is exact for direct child parts only.
    - Joinery runs on `flatDocument`, maps back by index; anything reading sites/joints uses
      the flat document.
    - `regroupShapes` groups a shape's users by geometry (`groupSignature`): cut ORDER is ignored (joinery appends mortises in site order, a turned user's list differs). A user joins a group only when the group's Shape, resolved through the user's OWN mirror flag, reproduces its shared fields EXACTLY (mirrored links, fu 432) — never a hash of lowered fields, which `mirrorCut`'s ulp would split; among unflagged users this is the old exact comparison. A group's Shape is its founder's fields (first in document order) when the founder is unflagged; a flagged founder takes the fields (and so the cut ids) of the first later UNflagged user it resolves against, else its own fields lowered through its flag (`lowerOwnMirror` against the ORIGINAL Shape). A user keeps its flag (read by storage key off the markers BEFORE joinery's results are written, `flaggedKeys`); a group of one is stored with its own fields and no flag. Residue (fu 435): a group whose users are ALL mirrored splits when joinery adds a new metric cut. `splitAssemblies` compares placements the same way (fu 316); the definition keeps the first placement's record.
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
    - **The side of a mirror is the container chain's parity XOR the part's own `mirrored` flag** (`sideAt`, tree.ts; mirrored
      links, fu 432). It decides how a shared edit is lowered: `postureRefusal`, `sameSideFirst` and the store's `sideOfShape`
      (and Link's `sameSideFirst` side: the source's `sideAt`). A mirrored user inside a mirrored assembly is on the unmirrored
      side (two mirrors cancel). `linkPlan`'s `LINK_ACROSS_MIRROR` refusal stays on ASSEMBLY parity (`mirroredAt`): a part's
      own flag never refuses a Link. `lowerEdit` lowers a mirrored user's features once more through its own flag
      (`lowerOwnMirror`, inv 44), comparing against the Shape's own arrays, never the resolved (mirrored) ones.
    - **The Mirrored checkbox** (Properties, a SHAPED part only; `mirrorLinkedPart`) reflects the part left to right across
      WORLD X in place: the flag flipped and the stored turn set to `inverseTurn(2a + r)`, `a` the container chain's turn
      (M_x R(2a + r) = R(−(2a + r)) M_d0; the same for a mirrored chain); position kept, so the box is unchanged. Written to the
      stored record, never through `updateBoard` (the flag is own). One undo entry; refused while exploded (inv 47). A stored
      part shared by placements at different chain turns reflects across world X for the SELECTED occurrence only.
    - **A lean is lowered exactly through every turn and mirror on the path** (splayed legs §3.4, inv 57): `lowerLean` applies
      `leanFlip` once per mirror (each mirrored instance, plus the part's own flag in `lowerOwnMirror`); `withShapeFeatures` carries
      `shape.lean`. **Removing a lean:** a patch whose `lean` key is present with value `undefined` deletes the stored key everywhere
      (`storedValue` reads it ABSENT, the Shape path included); scoped to `lean`, and to `tenons` and `dovetails` (`storedValue`, inv 45, 62) — any other key set to `undefined` is still a write.
      A leaning part's resize lowers a position delta alongside the size (`pivotKeptPosition`, inv 57): a third case beside the two
      write-back rules, per user for a shared size. Level the ends writes the shared length and cuts once and each storage target's
      own position (`oneEditPerTarget`).
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
    drawn line never moves. A lift along the face normals (silhouettes' rule) stepped an end line off its grazing plane — not here. **So does every edge of a LEANING part** (`ownWoodLift`, the same
    along-view rule, from the faces whose plane holds the edge, normals turned by the lean; splayed legs §6.2): a lean makes every face
    oblique to every view. (Without it a 14.3° leg drew 5.6" of 15" in Plan; OTHER wood still hides it, pinned.) `leanLifts`
    (drawing.ts) finds the faces by board-local plane membership; on a curved leaning part it is only the fallback where
    `curveEdgeLifts` returns none. `silhouetteLines` and `curveEdgeLifts` take the WORLD `view.toward`: since `toWorld` composes the
    lean, every direction they compare against it is already leaned (the spec's `inverseDir` mapping would lean twice; it is the
    pinned mutation).
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
    **A leaning part on paper** (splayed legs §6.2, inv 57): `worldBodies` never takes the box path for it (R3) and turns its plane
    normals by the lean; `boardBox` reads `partBounds` (the drawing bounds, `sMax`, the section skip); dimension chains read real
    extents. A keyed leaning part gets ONE HTML note under the figure per sheet (inv 19; `leanNote` / `leanNotes`, featureKeys.ts,
    following `keyed`), from WORLD slopes at 0.1°: `<name>: rake 8.0° toward the front, splay 12.0° toward the right — resultant
    14.3° on a 33.5° sightline`; a component that READS `0.0°` after rounding prints `rake 0.0°` with no direction words (a turned
    stored 0 comes back −0). Lean-free drawings are byte for byte unchanged (`drawingIdentity`). The Lean section sits inside
    `EditLock`; `setLean` and `levelEnds` return null and change nothing while exploded or gesturing (no copy).

48. **`boardBodies` is the ONE place angle cuts become geometry (and curves, profiles, round tenons and dovetails, below); `pocketCells` is stock minus RECTANGULAR cuts only.**
    Anything that draws, edges, occludes or probes stock reads bodies (through the `partGeometry` cache); anything that
    describes or joins rectangular cuts (`cutShape`, joinery, the cut list's pocket lines) stays on `pocketCells`. A body no
    angle cut clips keeps the box path byte-for-byte (`body.box`). Joinery and Repair stay box-based and accept
    every kind, refusing only an angle cut running into a joint (inv 41). Generate and Refine read and write every kind in
    WORLD words — `tapers` (`taperWorld.ts`, through `taperCut`) and `miters`/`bevels`/`chamfers` (`angleWorld.ts`, through
    `miterCut`/`bevelCut`/`chamferCut`) — recognised STRUCTURALLY (`isStandardTaper`, `worldAngles`); Refine refuses, before
    any call, a cut it cannot describe or the converter would reject on the re-encoded part (`'taper-form'`, `'angle-form'`),
    and keeps untouched angles exactly through the exact-angle map (`angleRatiosOf`). **The design schema defines the part,
    the direction and `vec3` ONCE in `$defs`; the four angle kinds share ONE item shape (`angles`). A new design-form feature
    joins an existing item shape where it can — each new SHAPE costs grammar (fu 322).** (`vec3` since AI-bands: the inline form
    with the `bands` item was refused; the hole, band and profile items added no other `$def`.) The API refuses a schema whose
    compiled grammar grows too large (measured 2026-10-14: the inline form with the three angle arrays was refused; 2026-10-23:
    the cost is the number of distinct object SHAPES, not characters — the four angle arrays plus `profiles` were refused at
    3,452 chars, one merged `angles` array plus `profiles` compiled at 2,805, AI-profiles spec R1). **The wire form is not the
    internal form** (AI-profiles spec R2, R6.4): the model reads and writes `angles` (`WorldAngle`: `kind`, `dirs`, `toward`,
    `values`); `parseDesign` splits it by kind, in array order, into the TS-only `tapers` / `miters` / `bevels` / `chamfers` every
    converter, the exact-angle map, `diffDesigns` and `turnCandidates` read, and `toWireDesign` (generated.ts, the ONE
    serialiser, for `refineMessage` and the estimate) merges them back — tapers, miters, bevels, chamfers, each in its own order,
    a chamfer's ignored `toward` written as `dirs[0]` — so an echo round-trips. A wrong count of `dirs` or `values` for its kind is
    recorded at parse in the TS-only `angleFaults` and rejects the PART in `convertPart` (reason `'taper'` when any taper entry
    faulted, else `'angle'`; e.g. `has a miter with 2 directions; a miter takes 1`) — a chamfer without two faces, once a
    whole-response refusal, now rejects only its part. `contactSolids` is the second, narrower reader of
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
    **A ROUND TENON's waste is built through the same path** (round tenons spec §7, inv 58), so `boardBodies` stays the ONE place and
    bodies stay convex: `geometryBoard` appends each BUILT tenon's two VIEW curves (`tenonViewCurves`: the section minus the tenon's
    disc, as two overlapping outlines each missing one quadrant, every arc minor, so the round side is one inscribed polygon whose
    every vertex is some outline's SMOOTH vertex — no seam line, inv 16; ids `tenon/<id>/a|b`, which no loaded id can equal, since
    `takeId` re-mints a `/`) after everything else, with a SQUARE span (`CurveSpan.square`, `squareSpan`): a plain wall at the
    shoulder, no run-out, the end side open so the end's miter (applied first) clips the tip. Every reader of a span that would apply
    a profile's run-out (`stoppedPieces`, `curvedEdges`' stopped map, `stockProbe`, `intoCurve`, `throughExtent`) asks `squareSpan`
    first. VIEW-ONLY: never stored or validated; a faulted tenon builds nothing (`builtTenons`, memoised per board object, frozen).
    `shapedFeatures` reads `profileView`, never `geometryBoard`, so a tenon is never a feature of itself. A tenon's view curves are
    not curves to the user: the cut list's curve signature, bench lines, feature keys, drawing tags, the diagram's curve layers and
    snap points all skip `squareSpan` curves; the tenon draws and keys itself (inv 58).
    **A DOVETAIL's waste is built through the same path** (dovetails spec §3.5, Spec difference 1, inv 62): `geometryBoard` appends
    each BUILT dovetail's square-span VIEW curves (`dovetailViewCurves`: one straight-sided outline per socket, a tails part's
    through the thickness, a pins part's through its run dimension with one square stop at the baseline; ids
    `dovetail/<id>/<k>`) AFTER the round tenons' — the JOINT views (`jointViews`; `profileView` returns the view without them, so
    judging a joint never reads its own waste). The rules above for a tenon's view curves hold for a dovetail's word for word
    (VIEW-ONLY, `squareSpan` first, never a curve to the user, `builtDovetails` memoised and frozen); a dovetail draws its own
    edges (straight outlines: every vertex sharp, so the edges are drawn and no segment is curve-tagged) and offers its own snap
    corners (`dovetailCorners`, inv 16). A dovetail-free part's geometry view is unchanged.
    **A COMPOUND miter is one plane through the same path** (square-set legs spec §4, inv 59): `keptHalfSpace` adds the across term
    (`n[through] = −rise · sign(across.from)`, the offset less `rise · (ct − T/2)`, normalised by `hypot(1, k, rise)`; the
    single-slope path is textually unchanged), so bodies stay convex and every plane reader — bodies, `stockProbe`, snapping's
    `onSlope`, hole faults, drawing tags, the diagram's polygons — follows. `depthAt` stays the single-slope line on the centre;
    `depthAtCross` is the full depth and `deepestCorner` (all four section corners, either sign of a code-built `rise`) the
    greatest, read by `angleCutRemovesNothing`, `overruns` and `deepestDepth`, so a compound cut biting at one across corner only
    removes stock and is listed; `touchedRegion` reads its deepest cross line (the points shifted by |rise|·T/2, the through
    dimension still full). A single-slope cut takes every old expression unchanged (`compoundCut.test.ts` pins 12 such cases
    against literals captured before any reader changed). Generate and Refine have no word for it: `worldAngles` returns null
    for a part with any `across` cut and `angleRatiosOf` skips one (ruling T6b), and such a part is kept exactly (inv 56).

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
    `off-flat` — zero skin at a cut's floor counts —, `meets-hole`, `too-deep`, and since schema 23 `too-shallow`; exact closed
    forms, tangent passes): an add
    is refused on any fault, an edit only when it ADDS a (hole, kind) fault the stored row lacks (so a row a resize faulted
    can be edited back), decided before any mutation; a fault a later edit causes is KEPT, noted, drawn approximately,
    never clamped or trimmed. Fault words have one home (`holeFaultText`; `distinctFaults` counts too-deep and too-shallow once, `faultKey` keys both per
    row). **Generate
    and Refine AUTHOR holes through `holeWorld.ts`, the ONE converter** (AI-holes, spec 2026-10-23): the design carries a `holes` array in WORLD words (`WorldHoleRow`: `face`, `diameter`, `depth`, `through`, `offset` (a vec3 from the part's `at`, the first centre, on the face plane), `toward`, `count`, `pitch`), and `holeRowsFor` turns them into stored `HoleRow`s. Its shape faults (the loader's own drop rules plus the 1/32 plane rule) reject the part with reason `'hole'`; a STRICT fault (`holeFaults`) from the model is KEPT and flagged (`holeDesignFaults`, in its own module, `'hole-fault'` violations; the message names the row's first centre, `problemKey` includes that message, and `collapseViolations` groups hole-faults by message minus the part-name prefix), never rejected and never clamped. Values snap to the nearer of 1/64 in and whole mm (`holeSnap`), applied to the STORED numbers (final review I1): the row's end and side are chosen from the model's raw numbers (a reversal in raw numbers), then the station (from the measured end), inset (from the measured side), depth, pitch and diameter are put on the grid — never the world offsets, or a row 37 mm from a part's far side stores an off-grid inset and metric mirrored sides never link. A value in the exact set is kept, and so is a distance whose world-offset source is in it, except that a COMPUTED distance within 1e-9 of its grid value takes the grid value (float drift such as `D − (D − 37 mm)`). Every stored number is then checked finite and within `MAX_MAGNITUDE` (geometry.ts; final review I2): a huge finite input would otherwise snap to Infinity and the loader would drop the row unseen; a failure rejects the part, reason `'hole'`. A canonical row is stored `alongFrom: 'min'` (or `'max'` when a loader-legal row cannot be expressed from min) and the across side is the nearer one, falling back to the far side, so every loader-kept row round-trips. **Untouched rows come back EXACTLY**: Refine reads each part's rows with `worldHoles`, and `PartCarry.originalHoles` (in the carried frame) feeds the exact-row swap, which restores the original stored row when `sameHoles` (centres compared as a SET) says the model changed nothing — only in a kept frame (inv 56). When EVERY returned row is restored and the counts agree, the ORIGINAL stored order is kept (final review M3: Plans letters and the Holes panel follow `b.holes`' order); otherwise the rows are sorted canonically. Refine no longer carries holes as an opaque feature (inv 56); joinery rules out only the joint kinds whose zone a hole enters (inv 41); Repair accepts holed projects; `turnCandidates` re-stores a holed part per turn (inv 56).
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
    faulted hole reaches, or whose rings overlap, keeps the per-face `faceTriangles` path (residue, drawn approximately). A
    tilted bore's ring is judged on a conservative disc (`ringDisc`: the ellipse's centre on the plane, radius `r·|bit|`), so a
    clean tilted bore near a loop edge can take the per-face path too (accepted; an exact ellipse test is fu 451). **Rebuild performance —
    a resize drag rebuilds a holed part every frame; these break silently:** per-hole prisms and rings are memoised by
    the deep-frozen `Hole`'s IDENTITY (a WeakMap; an unfrozen hole computes fresh — never memoise one that can change);
    seam faces (what a coplanar, opposite-facing face of another body covers) are subtracted ONLY in holed bodies (and in EVERY body of a curved part, box cells included); a
    CLEAN hole's (`holeInStock`: no breaks-out — a curve's waste included —, off-flat, too-deep or too-shallow) wall and bottom are emitted UNCLIPPED, a faulted
    hole's clipped to the bodies; all of a part's holes are ONE geometry, one mesh (`holesMesh`), never a mesh per hole.
    `viewport/holesPerf.test.ts` guards it (≤40 ms per healthy case, ≤100 ms faulted, the MINIMUM of 9 runs — load only
    inflates a run; still wall-clock, fu 340). **On the Plans sheet** a rim is a `DRAWING_HOLE_SEGMENTS` (96)-gon (the viewport keeps
    `HOLE_SEGMENTS`, 48), except a rim whose plane is EDGE-ON to the view, which is ONE segment across its diameter — 96
    chords folded onto one line restart the dash and draw a hidden rim solid (chunk 2 R2). For a part with no holes `drawView` and
    `buildDiagrams` are byte-for-byte unchanged; its SVG path differs only by chaining (chunk 2 R2: within one part) — do not undo the chaining to
    "restore" it.
    **A row may TILT (angled holes, schema 23; spec `2026-10-24-sloyd-angled-holes-design.md` and its *Amended (build)* block).**
    `HoleRow.tiltAlong` / `tiltAcross` are the bit's travel per inch of axial travel (along the face's normal), relative to the
    row's own flags (positive toward the far end from `alongFrom`, the far side from `acrossFrom`), stored only when non-zero,
    inside ONE bound (`withinTiltBound`: each |slope| ≤ 1 and the resultant ≤ 1, 45°, with lean.ts' `withinBound` allowance — `≤ 1 + 1e-9` on each
    and on the resultant, one rule for both bounds, so a 45° leg's socket survives a reload (final review F1); the loader drops a row past it and
    the store refuses with `HOLE_TILT_PAST_BOUND`). **`holeTilt.ts` is the ONE home of tilt math** (`bitVector`, `isTilted`,
    `tiltDegrees`, `tiltResultantDeg`, `tiltSightlineDeg`, `withinTiltBound`, `retilt`, `acrossOf`): degrees exist only in display
    and typed input; its two degree conversions restate `lean.ts`' (an import would cycle) and a test pins them equal. A `Hole`
    carries `bit` (`bitVector`, unnormalised: its face-axis component exactly ±1, so a square hole's is the face axis) and `reach`
    (the AXIAL length); a blind tilted row's `depth` is measured ALONG THE BIT. `retilt` is the edit rule: a changed `face` is a
    new bore (no tilt); a `from` flip on the same face reverses the bit, so both lateral slopes are negated (the bore keeps its
    angle through the wood; a zero stays absent, never -0; final review F2); any other flag or `along` change keeps the bit's
    board-local direction; a typed tilt is written directly. `HOLE_FIELDS`' values (`holeRowValues`) append each PRESENT tilt key's NAME then its value, so a square row's
    values are unchanged and a square row never equals a tilted one. **Every square row takes the code paths it always did**
    (`tiltedHole` gates each tilted branch; `holesSquare.snapshot.json`, captured before the change, pins square geometry).
    **A tilted row's faults are EXACT or CONSERVATIVE — they may over-report, never under-report**: the clean, UNCLIPPED mesh
    path trusts `holeInStock`, so an under-report draws a wall through air. The mouth and exit `off-flat` test reads the ring's
    true reach (`n·c − r·|n − dir(n·m)e_a|`), and `meets-hole`'s pair capsule (`capsuleOf`) runs `r·tanθ` past a face-flat end (the mouth's uphill tip).
    **`too-shallow`**: a blind tilted bore whose bottom disc reaches back to the entry face (`depth ≤ r·tanθ + HOLE_EPS`, depth
    along the bit; touching is the fault) — refused when an add or edit ADDS it, KEPT and noted when a later edit causes it, as
    every fault. A tilted ring lies on the face-parallel plane (an ellipse); its mesh is WATERTIGHT (`curvesWatertight.test.ts`
    holds tilted cases), and `holesPerf.test.ts` guards a seat of four tilted sockets under the same budgets. Drawings, part diagrams (a tilted mouth's ellipse a `<path>` of `TILT_ELLIPSE_POINTS`
    points in user units, its band slanted; a square hole's `<ellipse>` byte for byte as before), snap points (the exit centre `reach` along the bit), callouts
    and the bench line (`holeText.ts`: the angle off square and its sightline from the `along` dimension, or the end or side a
    one-plane tilt leans toward; a blind one ends `, depth measured along the bit`) all read the bit.
    **Bore leg sockets** (`legSockets.ts`, the ONE decider, pure; the store's `boreLegSockets(seatId, diameter)`): on an UNLEANED
    part with leaning parts standing under it (`legsUnder`: a leg's level top within `TOUCH` of the seat's down face, overlap
    above `REST_AREA`), one count-1 THROUGH row per leg on the leg's leaned axis, entering from the top (`socketRow`); every
    copy of the seat plans its own legs and the copies must agree (lowered stored rows as a multiset, flag-free, 1e-9; else
    `socketsDisagree`); a diameter at or above a leg's smaller section refuses (`socketTooWide`); a faulted socket is left out
    and named (`socketFaulted`; one past `withinTiltBound`, which the loader would drop, `socketTooSteep`, final review F1), the
    rest bored, refused only when none can be;
    a TILTED count-1 THROUGH row entering from the seat's top (`isSocketOf`'s entry: only a row `socketRow` could have written;
    final review M4) whose axis line passes through a leg top in the `TOUCH` band is that leg's stale socket
    (`staleSocketOf`, noted `socketStale` and replaced on the next press; a square row is never one); a matched leg is left alone.
    **Round tenons (schema 24, inv 58) extend Bore leg sockets.** `partAxis(b)` (`legSockets.ts`) is ANY part's world axis — the
    length's centre line through its placement and lean, `min` → `max`; a leaning part's is exactly the numbers `legAxis` always used,
    so socket rows are unchanged — and `legAxis` is `partAxis` pointing up, for a leaning part only. **`boreAlongAxis(holder, row,
    axis)` is the ONE coaxial test** (the bore's mouth centre on the line and its bit parallel to it, either way, both to 1e-9;
    through or blind, any face): `isSocketOf` adds its own narrower rule on it (a count-1 through bore from the seat's top) and the
    tenon joint's `seatedIn` adds its own (inv 58), so the two cannot drift. `boreEnds` is exported for the joint. **A tenoned leg
    also stands under the seat** (spec §6.3 as amended by ruling T9a): `legsUnder(world, seat, units)` finds a leaning part whose
    levelled top rests on a down face as before, OR whose top (`max`) end carries a tenon whose CENTRE SEGMENT — shoulder centre to tip
    centre, in the world — meets the seat's stock over one of its down-facing level faces (between that face and an up face above it,
    inclusive to `TOUCH`) with its axis meeting that down face's plane inside its outline (`tenonInSeat`), AND whose top is levelled
    (`isLevelled(w, units)`, in `legsUnder` only). **`tenonInSeat` is the ONE predicate `legsUnder` and `staleSocketOf` share**
    (`staleSocketOf`'s callers have already found the leg, so it adds no `isLevelled`; without the shared predicate a lowered seat's
    re-fit bored a second socket beside each old one and refused). A seat RAISED clear of the tips is not found, as an untenoned
    leg's is not. Being found grants no support (support is the joint's, inv 39 (d)). A units switch can make `isLevelled` false, so
    tenoned legs are not found until re-levelled (ruling T9d, fu 463). **Tenon the legs** (`socketPlan(doc, seatId, diameter,
    tenonLegs)`, the store's `boreLegSockets(seatId, diameter, tenonLegs?)`, the Holes panel's checkbox `Tenon the legs (replaces
    their top tenons)`, on by default): every leg that HAS its socket after the plan (bored now, or already bored) gets its TOP tenon
    fitted in the same `mapWorld` edit and undo entry (`fitTop` / `legTenonPlan`): the top through `levelPlan(leg, units, { topAt:
    the seat's top face })` (it SETS, not adds: the length change, either way, rounds UP to the drag grid, the tip plane exact, holes
    kept by `levelEndHoles`); the shoulder where the leg's highest section corner just clears the seat's underside; the tenon's
    diameter the socket ROW's, its length from the shoulder to the tip's centre rounded UP to `tenonStep` (1/64", 0.1 mm) with Level
    the ends' `roundUp`, so the shoulder only drops; the `max` tenon replaced (its id kept) or added, the `min` tenon never touched.
    Every copy and every storage group (a Shape's users, or one stored part's placements) is judged against its OWN seat; a member
    under no seat, or one storing a different fit (1e-9, ids ignored), refuses the whole action with `socketsDisagree` naming the
    copies; Level the ends' refusal for any leg refuses the whole action; a fit that faults (`tenonFaults`) is named in `note`
    (`<leg>'s tenon: <fault>`) and not written, its socket still bored; a fit that changes nothing writes nothing (inv 4). The write
    is Level the ends' shape: the shared fields once through the group's first leg, each other storage target its own position.
    Off, no leg is touched. The seat's Holes section adds the tenon twin of the stale note for a found leg whose top tenon is seated
    in none of the seat's bores (`staleTenonOf`, `tenonStale`: `<leg>'s tenon no longer fits its socket — Bore leg sockets again.`).
    **ONE bore core** (stretchers, inv 60): `boreRow(holder, face, from, mouth, dir, diameter, depth)` is the ONLY arithmetic that
    turns a world mouth and a world bit direction into a single-hole row (`fromWorld` of `mouth` and `mouth + dir`, scaled so the
    axial component is ±1, the lateral components stored as flag-relative slopes, a zero slope omitted; `along` by `othersOf`,
    the nearer end and side); the tilt bound is the caller's, which names the part. `socketRow` (a seat's THROUGH socket) and
    `rungSocketRow` (a rung's BLIND socket in a leg: the long face `rungEntryOf` picks — the leaned outward normal nearest the
    direction toward the other leg —, its mouth where the rung's axis crosses it, `faceCrossing`, the depth to the tip rounded
    UP to `tenonStep`) both call it, so they cannot drift; Bore leg sockets' rows are unchanged (a pinned literal test).
    `faceCrossing` is the ONE line-meets-a-face test (`rungSocketRow` and stretchers' entry-face pre-check). `rungSocketRow`
    THROWS for a line that misses the face or a tip short of the mouth: its caller refuses first (ruling T1a).

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
    **A leaning part's caps** (splayed legs §6.2, inv 57) take `sectionCaps`' leaning path under BoardMesh's own gate (`leans` and a
    map): the world plane is carried into board-local terms through `inverseDir` and the part's axis frame, each body clipped by
    `clipConvex`, the cut faces outlined in the PIVOT frame (q = m·(pre-lean world − pivot), where the plane is axis-aligned again),
    and the result returned in leaned WORLD coordinates, explode offset included, always in new arrays — so BoardMesh draws a leaning
    part's cap as a SIBLING of its leaned group, at identity, never inside it. A face ON the plane facing the removed side is capped
    (a levelled foot under Top at 0). The cache slot adds the lean's `x`, `z`, `face` (exact), rotation, posture and the plane
    coordinate; BoardMesh's cap memo depends on `board.lean`. **A leaning part's bores are subtracted** (angled holes §6.2, lifting
    fu 437's residue): each cut face, still board-local, loses every bore's prism (`minusPrism`) BEFORE it is carried into the pivot
    frame; `localCapPieces` is null for it; points carry ~1e-15 off the plane.
    **A tilted bore** (angled holes §6.2) never takes fu 348's rings fast outline: when the plane meets its box (`holeRegion`) the
    outline is the union of the bored pieces (a slice of a tilted bore is an ellipse, or meets a slanted wall, a tilted bottom
    or a mouth off the plane); its prism is subtracted wherever the plane is within its box, which a steep bore's far mouth can
    carry past a square bore's `radius + depth` reach.

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
    half circle** (`pastHalfCircle`, exact), because the loader DROPS such an arc — silent loss. The loader alone holds an
    arc within 4 ulps of its coordinates past the bound TO the bound (a metric Half-round notch stored before 2026-10-22, whose
    rise was span / 2 against a chord of (start + span) − start), and `archCurve` stores a notch's rise as half its STORED chord. A
    Bow is stored at its edge's length when written and refit by every edit; a resize never stretches it (P2). **A curved
    part's edges are BUILT** (`curvedEdges`: `unionOutline` on the planes square to `through`, then `bodyEdges` on the rest
    with smooth lines dropped per interval), never `bodyEdges` over its slices (25 ms at 18 chords, 135 at 48). **An unknown
    segment `type` refuses the whole document** with the newer-version message (a spline needs no schema bump). Refine
    carries curves the same way (inv 56; profiles are AUTHORED, below, except on a curved part or one with a two-side run); joinery rules out only the joint kinds whose zone one enters; Repair accepts them (inv 41); `turnCandidates` never turns a curved part; the design
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
    **Generate and Refine AUTHOR profiles in WORLD words through `profileWorld.ts`, the ONE converter** (AI-profiles, spec
    2026-10-23, fu 430 chunk 2): each part of the design carries a `profiles` array (`WorldProfile`: `edge`, the two faces
    meeting at the routed edge — exactly one broad face, the stored `face`, and one side —; `kind`, `size`, `fillet` (a bead's
    quirk, above 0), `depth` (a thumbnail's), `facing`, `allRound` (a loop) and `start`/`end`, world offsets from the part's `at`
    along the edge). `profilesFor` stores them canonically (`canonicalRun`; `sortProfiles` in PROFILE_FIELDS order), directions
    through `dirToLocal`/`localToDir` and stations through `fromWorldOffset`/`endFacing` (inv 44): an end EXACTLY 0 or EXACTLY the
    extent is THROUGH; within 1/32in of either is THROUGH only for a value not in the exact set (R6.2); anything else is a station
    measured from the NEARER end (ties `min`; a station past one end is measured from the other, so no position is a shape
    fault), on the hole grid (`holeSnap`) unless exact; `known` (the part's stored distances) keeps a turn's exact stations exact.
    A SHAPE fault — exactly the loader's drop rules plus the design form's edge rules (no broad face, the text naming the part's
    broad faces, R6.5; two broad faces; not two faces) — rejects the part, reason `'profile'`; a zero-length or reversed station
    run is not one (it stores, and is the strict `stop-off`). A STRICT fault is KEPT and flagged (`profileDesignFaults`,
    `'profile-fault'`, one per part, edge, kind and fault, a stopped run's span in `message` and `shown`; `problemKey` and
    `collapseViolations` key it by message, as hole- and band-faults), never rejected or clamped; `profileFaultKinds` is the ONE
    helper (`profileFaults`' kinds plus, for a straight run, `curveFaults`' `runs-off`/`cuts-through` — the panel's oversized-bit
    refusal, R6.1), read by `profileDesignFaults` and `carryText.faultKeys`. **Untouched entries return EXACTLY through the
    exact-entry map** (`restoreProfiles`, from `PartCarry.originalProfiles`, only in a kept frame, inv 56): a returned profile
    whose world form on the NEW part equals an original's (`sameWorldProfile`, stations within 1e-9; never `sameProfile` on the
    stored fields, whose station `from` the design form does not carry) is restored as stored, id and ends; so is one equal to an
    original's world form on the ORIGINAL part (the model echoed the old numbers onto a resized part; chunk 2 Ruling 10,
    spec §3.4 "a full-length run stays full-length"): its THROUGH ends follow the new extent and a stop keeps the end it is
    measured from (the accepted cost, Ruling 16: a stop the model meant to keep at the same world place on a resized part moves
    with its end, and the change list shows only the size). Every entry restored, the ORIGINAL order is kept. **Except a part
    with curves or any two-side run (`carriesProfiles`, `featureCarry.ts`, the ONE predicate): its profiles stay CARRIED** (inv
    56; `documentToDesign` shows it `profiles: []`, `profileDesignFaults` skips it, and any the model returns are ignored
    silently, R6.3). `turnCandidates` re-stores an authored part's profiles per turn (`worldProfiles` then `profilesFor` with an
    exact set and `known`; ids by index, then `alignedTo` adopts the representative's, inv 40). The done view's change list
    words profile changes (`diffDesigns` `'profiles'` lines: added, removed, or `now …` for size, fillet, depth, facing and run;
    a stop that stays stopped judged by its STORED ends, Ruling 14); the kind words have ONE home, `PROFILE_KIND_WORD`
    (`profiles.ts`; `PROFILE_KIND_LABEL` derives the panel's), Roman ogee keeping its capital.
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
    **Generate and Refine AUTHOR bands in WORLD words through `bandWorld.ts`, the ONE converter** (AI-bands, spec 2026-10-23, chunk 1): each part of the design carries a `bands` array (`WorldBand`: `edge`, a world direction, and `edging`, one of `edgingKeys(catalog, bandTypes)` — `veneer` (the built-in Iron-on), the project's other band types by id, then `solid <id>` for every solid material in the catalog — a closed enum in the schema, checked again by `parseDesign`). **`mintBandTypes` is ONE design-wide pass**, run in `designToDocument` before any part converts, against the catalog `parseDesign` judged the keys by (built-ins plus the project's customs): `veneer` is the built-in, a type id is itself, `solid <m>` reuses the project's first solid type of material `m` at 1/4in, else mints ONE `<Label> edging` (unique by `freeName`) however many keys name it; a Refine echo names type ids and mints nothing. **The type list is threaded through every path**: `designToDocument` always sets `bandTypes` (the minted list); plain Refine keeps `out.doc.bandTypes` and joined Refine `jo.result.doc.bandTypes`, never the original's (the load gate would drop every band naming a minted type). `bandsFor` stores the bands canonically, directions through `dirToLocal`/`localToDir` (inv 44); a SHAPE fault (an edge on the thickness axis — a broad face —, two edgings on one edge) rejects the part, reason `'band'`; a band FAULT (`bandFaults`) from the model is KEPT and flagged (`bandDesignFaults`, `'band-fault'` violations: the edge in world words in `message`, as the bench names it in `shown`; `problemKey` includes the message and `collapseViolations` groups band-faults by message minus the part-name prefix, as for holes), never rejected. Refine reads a part's bands with `worldBands`; an untouched band comes back exactly because canonical bands of the same sides and types ARE the stored ones (no exact-band map). **Except on a part with curves: its bands stay CARRIED** by flat name in the original frame (inv 56; `documentToDesign` shows it `bands: []`, and any the model returns are ignored and mint nothing), and **a curved part's carried bands are judged only by `carriedSummary`, never fed to the model** (`bandDesignFaults` skips it; final review I1). **`cornerRule` is CARRIED on every banded part** (it is not in the design). The done view's change list words band changes (`diffDesigns` `'bands'` lines, type names from the AFTER document). **joinery rules out only the joint kinds a
    band is in the way of (inv 41); Repair accepts them** (joinery-features chunk 3). **A strip, a tape run and a glue line
    count only the VISIBLE run** (`visibleRun(part, side, t)`, P12 as amended, the one decision, from the part's stored
    rectangular cuts with no knowledge of joints): a qualifying cut covers the part's whole thickness, touches the side and
    reaches THROUGH the band (`t` the band type's thickness, tape included; a thickness-0 tape: any positive depth), reaches
    an end of the run and has extent > 1e-9 along the run and across it; the run ends where such cuts end. A shortened end
    starts at `givesWay ? max(lo, tn) : lo` (`tn` the neighbour's thickness: a cut shallower along the run than the
    neighbour still gives way to it) and has no mitre and no mitre glue line; a run
    with nothing left after give-way makes no strip, tape run or glue line, and a mitre line whose core corner lies inside
    a removed stretch is not drawn (F1). Tape: a LINE chord is clipped against the qualifying rectangles, an ARC chord counts
    whole (an over-buy, fu 418). The core, faults and corner words are unchanged (a band with no visible run still reduces
    the core). So a tenoned edged rail buys its plain length, and a HAND notch at a banded end shortens its strip too (a
    change for existing documents, §4.4; no existing test's number moved). Under Mitred a corner is mitred only where a mitre can be cut: a corner where either band is shortened, or where a
    strip's mitred inner edge would be ≤ EPS, is joined as under Long there (`endModesOf`, fu 419). A strip row
    is numbered in the ONE series but carries no `boardIds` (its ids in `stripIds`): every reader of a row's parts must
    handle an empty list, and `planBalloons` SKIPS it (never a hidden part). A band-free document's cut list and Buying are
    byte for byte as before (`bandFreeIdentity.test.ts`, FIXED ids: `nesting.ts` breaks ties by id string).
    **On screen and on paper (chunk 2):** `glueLines` (`banding.ts`) is the ONE glue-line geometry (unfaulted SOLID bands only, both
    broad faces; a strip that runs through draws full length, one that gives way or any under Mitred core corner to core corner, a
    mitre line once — on the long strip when it is solid; since joinery-features chunk 3 every line follows the visible run, P14). The viewport paints a band by MOVING triangles that lie on the side's
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
    **Refine carries hardware on parts and assemblies** (by flat name; a PART's hardware is read from the RESOLVED flat part, so a shaped
    part's Shape hardware travels with it; only an ASSEMBLY's hardware reads the STORED document's definitions, P2: `flatDocument`
    empties `definitions`; inv 56) and carries types and the project's hardware into the refined project before `migrateDocument`. Generate
    never writes hardware (`DESIGN_SCHEMA` byte-identical, fu 322). Load order: materials, band types, hardware types, parts/shapes/
    definitions, the project's `hardware`, `pruneMaterials`.

56. **A part Refine carries curves or carried profiles (a run on two sides, `carriesProfiles`) onto keeps the original's posture and rotation (`frameFor`); a part whose only frame features are holes, bands and/or authored profiles keeps it only while every world extent keeps its rank against the original's (ties allowed both ways) and its thickness's world axis is still a smallest extent (unless the original's thickness was not its smallest). Never `orient` either otherwise.**
    The carry (`featureCarry.ts` `carryFromOriginal`, by FLAT NAME, onto the returned part in the ORIGINAL part's frame; refine-features spec
    §3) lands BEFORE `migrateDocument` (band types and hardware types through `designToDocument`'s `bandTypes` / `hardwareTypes` opts) and
    BEFORE `linkByRole`. `generated.ts` carries the facts as TS-only `PartCarry` / `AssemblyCarry` (never in `DESIGN_SCHEMA`, fu 322), and
    `convertPart` takes the frame from ONE decision, `keptFrame` (final review C1): the original's frame (`carry.frame`, set by `hasFrameFeatures`, which counts holes, curves, profiles and bands, never hardware) for a part with carried curves or carried profiles (`carry.profiles` is non-empty only when `carriesProfiles`: curves or a run on two sides), always; for a part whose ONLY frame features are holes, bands and/or authored profiles (all authored in world words, invs 50, 54, 53), only while EVERY world extent keeps its rank against the original's (`carry.frame.extents`): no pair of world axes strictly ordered one way in the original and strictly the other way in the result; a tie on either side may stay or swap (residual R1, superseding C1's thickness-only test) — AND (the tie clause, re-review) the world axis carrying `thickness` is still a smallest extent of the result (ties ok), unless the original's thickness was not a smallest extent of the original (an oddly encoded original, e.g. flat 20 x 1 x 3, stays as it was on an echo, fu 428 (9)). Without the tie clause an original tied at its smallest extent passes the rank rule whatever comes back: a 4 x 4 x 4 block returned 0.75 x 20 x 4 was kept as L 0.75, W 20, T 4 (4" stock), a 1.5 x 30 x 1.5 leg returned 1.25 x 30 x 1.5 kept width 1.25, thickness 1.5. Otherwise the model turned it: `orient` encodes it, the exact-row and exact-entry swaps are skipped (`restoreHoles` and `restoreProfiles` get no originals: their stored fields mean nothing in another frame), and its holes, bands and profiles convert from the model's world words in the new frame (a band names a world edge, so it lands on the same edge in either frame). (Without this, an upright 0.75 x 30 x 11.25 side returned lying flat was stored with thickness 11.25 and bought as 11-1/4" stock, silently; and a flat 30 x 12 shelf turned in plan was stored length 12, width 30, its grain across. A holes-only part resized so two extents swap rank — a tapered side widened past its length — is indistinguishable from a turn and is oriented like its plain twin, its taper's `along` fault fed back to the model: refine-features §3.2's "taper kept" guarantee covers only parts with curves or carried profiles.) Holes are no longer a carried feature (AI-holes): the model writes them as world rows (inv 50), and so are a plain part's bands (AI-bands: authored in world words, inv 54) and the profiles of a part with no curves and no run on two sides (AI-profiles, inv 53), so `carriedKinds` (curves, the profiles of a part `carriesProfiles` names, a CURVED part's bands, hardware; `carriedView` gives a part's counts as it sees them) alone drives `featuredNote` (its wording unchanged: an authored part simply drops out), `featureTurned` and `carriedSummary`, and the done view's diff lists hole, band and profile changes (`diffDesigns` `'holes'`, `'bands'` and `'profiles'` lines; `KEEP_LINE` names holes, edging and edge profiles). The carry gate stays on `featuredKinds` (every band and profile included), so `carryOf` copies `cornerRule` for every banded part but `bands` only for a curved one, and `originalProfiles` (the exact-entry map) for every profiled part but `profiles` only when `carriesProfiles`; `faultKeys` counts band faults only on a curved part and profile faults only when `carriesProfiles` (unreachable for an authored part through `carriedSummary`, which reaches only carried ones; kept, AI-profiles chunk 2 Ruling 9). `turnCandidates` (`roleLinks.ts`) never turns a part with rectangular cuts, curves or carried profiles (`carriesProfiles`); a part with AUTHORED profiles is re-stored per turn through world forms (`worldProfiles` then `profilesFor` with an exact set and the part's own stored distances, `known`: a turn must not move a stop; ids by index, then `alignedTo` adopts the representative's), a BANDED part is re-stored per turn on the same world edges (`worldBands` then `bandsFor`; bands carry no ids), and a HOLED part is re-stored per turn through world forms (`worldHoles` then `holeRowsFor` with an EXACT set: the part's own numbers, never snapped, because a turn must not move a hole), and `alignedTo` aligns hole-row ids to the representative's. A resize keeps each feature at its STORED station, measured
    from the end or side it names; a fault the resize causes is KEPT, noted and never clamped, and only a fault the original did not already
    have is named. A featured part returned turned onto another face is a design fault fed to the repair loop (`'feature-turned'`, through
    `EvaluateOpts.extraFaults`, `featureTurned`; a quarter turn in plan of a part with curves or carried profiles is NOT caught, fu 425 — a part whose only frame features are holes, bands and/or authored profiles is not judged there: turned in plan or onto another face, it is caught by `keptFrame`'s rank rule and re-oriented). The done view lists every featured part not
    kept and every featured part to check (`carriedSummary`, `RefineOutcome.carried` `{ notKept, check }`, rendered in full in `RefineDialog`),
    computed plain-to-plain BEFORE `runJoinery`. The model is told which parts carry what in a USER-turn note (`featuredNote`, `refineMessage`'s
    `original` param), never in `SYSTEM_PROMPT`. `refineDesign.ts`' pre-checks judge a featured part in its own frame (`inOwnFrame`).
    **PROHIBITION: do not `orient` a part with carried curves or carried profiles (a run on two sides, `carriesProfiles`), nor a part whose only frame features are holes, bands and/or authored profiles whose returned box keeps every world extent's rank against the original's (ties allowed both ways) AND still has a smallest extent on the original's thickness axis unless that thickness was not the original's smallest (the ONE decision is `keptFrame` in `convertPart`), and do not move the carry after `migrateDocument` or `linkByRole`.** The four Refine-only refusal modules and the `'holes' | 'curves' | 'bands' | 'hardware'` `RefusalReason`s are deleted;
    nothing may bring them back.
    **A LEANING part, or one with a TILTED hole row, is KEPT exactly as stored** (splayed legs §8, inv 57; angled holes §9 — the
    design form cannot describe a tilt, and re-storing a row in world words would drill it square): `keepsExactly(b)` (`leans(b)`
    or any `isTilted` row) is the ONE predicate and `keptParts(doc)` (`leanKeep.ts`) the ONE decision — every ROOT stored part
    whose resolved form `keepsExactly`, the Shapes those records reference, and their flat names; `turnCandidates` never turns
    such a part (it asks `keepsExactly` too). Kept parts are left
    out of `boxes()` and every taper/angle pre-check in `documentToDesign`; the model is told about them in the USER turn
    (`keptNote`: each one's real bounds through `partBounds`, and not to return those names), never in `SYSTEM_PROMPT` or
    `DESIGN_SCHEMA`. `designToDocument`'s `kept` opt drops a loose model part whose `clean(name)` is a kept flat name BEFORE
    conversion (returned as `replaced`, shown `Replaced by the kept part of the same name: <names>`), and puts the kept stored records
    in FIRST, verbatim, with their Shapes, BEFORE `migrateDocument` and `linkByRole` (the carry's slot, so the PROHIBITION above
    stands): first-wins (invs 8, 33) keeps their ids and names, and with no role `linkByRole` never judges them. **No floor shift is
    applied while any part is kept** (spec §8(b)'s second option): the result moves to the kept parts, never the reverse; a model
    part left below the floor stays there and the design checks report it. A kept part inside an assembly refuses Refine up
    front (`'lean-assembly'`, `leaningInAssembly`: `Refine can't keep a leaning part, a part with angled holes or a part with a round
    tenon inside an assembly yet — Ungroup it first: <name>.`, widened by ruling T10a; Refine rebuilds every definition, fu 441; a box-jointed part is the exception: its WHOLE assembly is kept instead, see the box-joint paragraph below), and a joined Refine refuses (`'lean-joint'`; box joints are claimed first and refuse nothing, see the same paragraph): a
    leaning part by `leaningRefusal` (inv 41), and — ruling T11a, because `runJoinery` re-joins the whole refined document, kept
    boards included — any part with a tilted row, BEFORE the gate (`Refine can't keep a part with angled holes in a joined project
    yet: <name>.`); joinery and Repair are unchanged by tilts. The model's note (`keptNote`) says why each is kept (it leans, has
    angled holes, has round tenons, has box joints, or a list of them: `whyKept`). The done view says `Kept exactly as is: <name> (<reasons>), …` — each kept name with only its own reasons (`keptWhy`: `leaning`, `angled holes`, `round tenon`, `compound end cut`, `box joints`, `dovetails`; a placement its assembly's kind), the copy review's wording (2026-10-27; it replaced `Kept as is (leans, angled holes or round tenons): <names>` and its box-joint and dovetail variants). Kept parts count toward the result's part caps (fu 442).
    **A part with a ROUND TENON is KEPT exactly too** (round tenons spec §9, inv 58): `keepsExactly(b)` is `leans(b)`, any `isTilted`
    row, or `hasTenons(b)` — read off the STORED list, so a faulted tenon is kept verbatim too; the design form has no word for a
    tenon (the design schema is unchanged, fu 322), so none reaches the model and none comes back squared. `turnCandidates` never
    turns one (through `keepsExactly`; one place decides it, Task 10 review). A joined Refine refuses one (`tenonRefusal`, inv 41,
    `Refine can't keep joints with a part with a round tenon yet: <name>.`), after the lean and BEFORE the tilted-row check (ruling
    T10c). `keptNote`'s header names round tenons only when one is kept (`These parts lean, have angled holes or have round tenons,
    …`; otherwise the old header), so a tenon-free prompt is byte for byte as before (ruling T10b).
    **A part with a COMPOUND end cut is KEPT exactly too** (square-set legs spec §4, inv 59): `keepsExactly(b)` also holds when
    `hasCompoundCut(b)`, so no world-word converter (`worldAngles`, `angleCutsFor`) ever reads one as a single-slope miter, and
    the knock-ons are a leaning part's: `turnCandidates` never turns one, and inside an assembly it refuses Refine (the existing
    `leaningInAssembly` sentence, unchanged). A compound cut exists only on a leg that leans or did (Clear lean keeps it), so the
    kept list, the done view and the assembly sentence keep their wording; `whyKept` names `has a compound end cut` only for a part
    kept for nothing else (a cleared leg), so a leaning leg's line is byte for byte as before; `keptNote`'s header is unchanged
    (fu 473). A joined Refine refuses one (`compoundRefusal`, inv 41, after the tenon and BEFORE the tilted-row check).

    **A part with a BOX JOINT is KEPT exactly too, and a box-jointed ASSEMBLY is kept WHOLE rather than refused** (box joints spec §7 and
    its Amended block, inv 61): `keepsExactly(b)` also holds when `fingerSets(b)` is non-empty (a private `keptForMoreThanFingers` is
    the other four kinds). A box-jointed root part is kept as a root part is; a definition with any such part is kept with every
    part in it, and every root placement of it, exactly as stored, put back FIRST (`designToDocument`, before the load gate; `names`
    stays root-only, `placements` holds the kept placements' names), and a loose part or a placement reusing a kept name is dropped
    and listed as replaced (a loose part's name compared TRIMMED against placement names, because the gate trims). A part kept ONLY for
    box joints inside an assembly does not hit `lean-assembly` (`leaningInAssembly` reads `keptForMoreThanFingers`); the other four
    kinds inside an assembly keep their refusal word for word (fu 492). A kept assembly's part linked outside the kept set refuses
    (`keptAssemblyLinkRefusal`, reason `lean-assembly`). The note names it (`whyKept`: `has box joints`; one line per kept placement,
    `"<placement>" is an assembly with box joints and is kept as is: <bounds>.`; the header gains `have box joints` only when one
    is kept) and the done view names the placement `(box joints)` (`RefineOutcome.leaning.why`, `keptWhy`; the copy review 2026-10-27).
    No floor shift is applied while a kept placement exists. A JOINED Refine does not refuse (unlike the tilted row): inv 61.

    **A part with a DOVETAIL is KEPT exactly too, and a dovetailed ASSEMBLY is kept WHOLE, exactly as a box-jointed one** (dovetails
    spec §7, inv 62): `keepsExactly(b)` = `keptForMoreThanFingers(b) || cornerJointed(b)`, and `cornerJointed(b)` (a recognised finger
    set OR a stored dovetail, faulted or not) is THE predicate every keep and leave-alone site reads (`keptParts`' kept definitions,
    joinery's size-and-place rule, the re-join guard's `guardedKept`). Everything in the box-joint paragraph above holds for it; the
    words name the kind: `whyKept` appends `has dovetails`; a kept placement's line says `an assembly with dovetails` (both kinds named,
    `box joints and dovetails`, when its definition holds both: `definitionKind` / `assemblyKind`); `keptNote`'s header gains `have
    dovetails` only when one is kept; `keptAssemblyLinkRefusal` words its sentence by the holding definition's kind; the done view's
    kept line names each kept part's own reasons, `dovetails` among them (`RefineOutcome.leaning.why`, `keptWhy`; the copy review,
    2026-10-27, replaced the fixed list and its `dovetails` flag). A dovetail-free document's notes are byte for byte as before.

57. **A lean is placement, and `lean.ts` is its ONE home** (splayed legs chunk 1, schema 22; spec
    `2026-10-24-sloyd-splayed-legs-design.md` §3–§8 and its *Amended (build)* block). `Board.lean` (`{ x, z, face, square? }`, a SHARED
    field, `LINK_FIELDS.lean = 'shared'`, so a Shape carries it too) stores two SLOPES — the foot's travel per inch of drop along X
    and Z, in the part's frame at rotation 0, before any mirror — and the facing dimension (`width` | `thickness`), chosen when a
    lean is first set (`chooseFace`: the smaller twist, width on a tie within 1e-9) and kept by later edits; `square: true`
    (schema 25, inv 59) marks a SQUARE-SET lean, whose map ignores `face`. Degrees exist only in
    display and typed input (`slopeOf` / `degreesOf`; the `angleCuts.ts` field-conversion rule: a typed rake replaces only its own
    slope, so editing one never drifts the other). The resultant is `atan(hypot(x, z))` and the sightline `atan2(|wz|, |wx|)` on WORLD
    slopes (`worldSlopes`; rake 8°, splay 12° gives 14.2957° and 33.4724°, NOT `atan(8/12)`). Nothing else computes a lean: `leanMap`
    (the rotation `m = T · Ry(τ)` about the PIVOT — `m = T` for a square-set lean, inv 59 — the centre of the pre-lean box's top face; `apply` / `applyDir` / `inverse` /
    `inverseDir` on WORLD points of the pre-lean placement; null for no lean), `leans` (the cheap predicate), `withinBound`,
    `chooseFace`, `seamFree`, `leanFlip` and `pivotKeptPosition` all live there.
    - **Stored only when non-zero, only on an UPRIGHT part, always seam-free.** The loader drops a lean on any other posture, a
      non-finite slope, a bound past `|x|, |z| ≤ 1` and `hypot ≤ 1` (1e-9), a bad `face` and a zero lean, and stores `seamFree(lean)`;
      it refuses nothing on content. **A zero lean is no lean**: `leanMap` returns null at `x === 0 && z === 0` (σ = atan2(0, 0)
      would spin the part 90°), so it takes the lean-free path. **A lean-free document is byte for byte as before** — every lean
      branch is gated on `leans` / `leanMap`, and every identity and perf test passes untouched.
    - **The seam is removed, not tolerated** (`seamFree`): a lean whose stored face would twist by exactly ±90° — `face 'width'` with
      `x === 0`, or `face 'thickness'` with `z === 0`, in the stored turn-0 frame — faces the OTHER dimension (twist 0), because a
      mirror maps a ±90° twist to itself while S · Ry(90°) · S = Ry(−90°). An exact equality on stored slopes, no tolerance; the
      stored face is re-chosen there, so a rake- or splay-only lean's features turn 90° about the leg's axis (the same box) when an
      edit lands exactly on it. `leanMap`, `setLean`, the loader and Level the ends all read the seam-free face. A sightline that
      crosses the seam through a sign change still spins the leg 180° about its own axis (spec §3.3: its ends are stale by then; fu 440).
    - **`position` keeps its meaning (inv 2): the min corner of the PRE-lean box.** The lean is applied after the placement, about the
      pivot; the composition (`placeBoard`, `placeInstance`, `cornerShift`) is unchanged, and a part from `worldParts` carries its lean
      in its own turn-0 frame, already mirror-flipped, so `leanMap(worldPart)` is its world map. Properties shows `Position is the part
      before its lean; it leans about the centre of its top.`
    - **Mirrors reflect a lean by `leanFlip` only** (the turn-0 X slope negated, the face kept; `0 - x` keeps +0; its own inverse):
      `mirrorFeatures` (a part's own mirror and a mirrored instance's step) applies it, `lowerLean` (treeEdit.ts) lowers through each
      mirror on the path, and a value-equal result maps back to the stored object. The whole map is CONJUGATED by the reflection
      (`leanMap(mirrored) = S · m · S`), never re-derived from flipped slopes (that is off by 180° whenever the face is on X).
      Equivariance tests use a lean with both slopes non-zero and unequal, plus rake = splay and the seam leans.
    - **R1 — every part→world crossing composes the lean:** `toWorld` (snapPoints.ts; `fromWorld` is its inverse — exact for an
      unleaned part, ~1e-15 of noise through a lean, so never feed it to an exact closed-span test where the pre-lean point is to
      hand), `worldBodyFaces` (leanContacts.ts), `worldBodies` (drawing.ts: vertices through `toWorld`, plane normals through
      `applyDir(placedDir(…))`), `sectionCaps`, and BoardMesh's `<group>` (one derived `leaned` memo, `T(t) · R(q)`; inv 1 — never
      written back). `cuts.ts` `solidWorldBox` / `pointToLocalXYZ` stay LEAN-FREE: they are group-relative, and the group carries the
      lean (composing there would lean twice). A leaning part's snap lattice is built and `stockProbe`-filtered in the pre-lean
      placement, where the closed spans are exact, then mapped.
    - **R2 — `partBounds` / `partsBounds` (worldBounds.ts) are the ONE real-bounds helper**: a leaning part's world box is the bound of
      its LEANED body vertices (a ghost part leans the box it draws, inv 21); lean-free they return `boardsBounds` itself. Every reader of
      world extent uses them: group move, Copy in a row, the section span and title, the Gizmo handle, framing, explode's centres and
      floor lift, dimension chains (`extentAlong`), the drawing's `boardBox`, the design checks' boxes, Refine's kept note. `boardsBounds`
      is the PRE-lean box. **A leaning part's pre-lean box (`position + boardExtents`, `boardsBounds`) is never presented as its
      extent.**
    - **R3 — the axis-aligned box fast paths are skipped for a leaning part:** drawing's `worldBodies` box path, the design checks'
      overlap path (always real bodies) and `partMass`'s box path.
    - **Edits.** `setLean(ids, world | null, opts?)` is one `edit()`, one undo entry; targets collapse to ONE per Shape (the first
      selected user: a Shape cannot hold one world lean on both sides of a mirror, and the others follow through it). A typed rake or
      splay replaces only its own WORLD slope, turned back by `inverseTurn` and lowered through each mirror; `keepSign` reads the
      numbers as magnitudes with each part's own world sign (a zero part takes +), and `rakeSign` / `splaySign` set a direction and
      keep each part's magnitude (the magnitude field and the direction select are SEPARATE controls). A zero result REMOVES the lean:
      a patch whose `lean` key is present with value `undefined` deletes the stored key everywhere (`sharedPatch`, the Shape,
      lowering). The refusals, decided for every target before `edit()`, in order: `Only an upright part can lean.`, `The lean can't pass 45° in
      all — reduce the rake or splay.`, and (angled holes §7) on a part WITH holes that already leans, a lean whose seam-free face
      differs from the stored one (`seamFree` re-choosing it would turn the holes a quarter turn about the length): `This lean would
      turn the part a quarter turn about its length, and its holes with it — keep both angles above 0, or remove the holes first.` A
      first lean on a holed part is not a re-choice and is allowed; Clear (`null`) is never refused. Since schema 25 (inv 59) a
      first lean is SQUARE-SET (`square: true`), a leaning part keeps its setting, the quarter-turn refusal above applies only when
      the old and new lean are both TURNED, and a Set change on a holed part is refused when it would turn the part
      (`Changing how this leg is set would turn it about its length and move its holes — remove the holes first.`). `setLean` and `levelEnds` return null and do nothing while `gesturing`
      or exploded (inv 47; no copy). A shape-mate's patch never carries `lean` (each mate would lower the target's world lean through
      its own flip and the write would disagree). A leaning part takes hole rows like any other (angled holes §7; the
      row is in the part's own frame), and a posture change on a leaning part is refused in `postureRefusal` (`Clear the lean first — only
      an upright part can lean.`), the one decider the store and the Posture field share.
    - **A resize keeps the pivot** (`pivotKeptPosition` in `patchBoard`, when the part leans and a dimension or the turn changes; an
      explicit `position` wins): a length change moves the foot end, a width or thickness change is symmetric about the pivot, and
      a turn lands where `reorientedPosition` would. Shape mates each keep their own pivot. It is a third case beside inv 46's two
      write-back rules (the position is lowered as a delta as usual).
    - **A drag of a leaning part rounds the DELTA, never a corner** (inv 25, 42): `dragTarget(start, raw, units, leaning)` (Gizmo.tsx)
      gives `start + snap(raw − start)`, and `moveGroupTo` with any moving part leaning gives `delta = snap(minCorner − bounds.min)`
      over `partsBounds`. The pre-lean corner is off-grid after Level the ends, so rounding it would lift a levelled foot off the floor.
      A lean-free drag is unchanged.
    - **Level the ends is ordinary angle cuts** (`levelEnds.ts`: `levelPlan`, `isLevelled`, `levelCutOf`; the store's `levelEnds(id)`).
      Both cuts are end miters (`kind 'miter'`, `face 'length'`) along `seamFree(lean).face` on a TURNED lean; on a SQUARE-SET
      lean each is ONE compound miter along the larger slope (ties within 1e-9: width), `across` the rest, none stored for a zero
      slope (inv 59); each end's length change is rounded UP to
      the drag grid, so the cut list prints a buyable blank and the stored lines are offset (`miterFields` null: the rows show the
      bench line and Remove only). The foot reaches the world floor (`y = 0`, whatever assembly the part is in). The TOP reference R is
      where an existing recognised top cut's plane meets the leaned axis (its centre station), else the pivot: a first levelling
      extends the top and moves the pivot up the axis; a re-level keeps the seat-joint height, so `levelPlan` is idempotent and a
      second press pushes no undo entry. ANY end miter, along width or thickness, is a recognised level cut and is replaced in place
      (ids kept; a seam-free face flip must never strand levelled ends); any other kind on an end refuses (`Remove the angle cut on the
      foot first.` / `… on the top first.`); a taper is not on an end and is kept. `R.y ≤ 1e-9` refuses (`The top of this part is at
      or below the floor.`). A shared leg (a Shape's users, or a definition's placements) is levelled in ONE edit: length and angle
      cuts written once through the clicked part, each storage target's own position from its own plan; users whose pivots differ
      in world Y by more than 1e-9 refuse (`These linked parts' tops are at different heights, so one length can't level them all:
      <names>.`). Re-levelling is never automatic: a lean edit or resize leaves the ends stale, and the Lean section notes `Ends were
      levelled for a different lean — Level the ends again`.
      **Level the ends keeps holes where they are in the wood** (angled holes §7): `levelPlan` writes the rows re-anchored by
      `levelEndHoles` (`holeRebase.ts`) with the length and angle cuts (written once, through the clicked part). A station or inset measured
      from a moving end shifts by that end's change; a row ENTERING an end moves its mouth out with the face — a blind one deepens
      (by `e·|bit|` when tilted), and a TILTED row, through or blind, also slides its station and inset by `−e` times its slopes
      (ruling T9a: otherwise its line moves in the wood). Faults the new ends cause are KEPT (inv 50). When a re-anchored row
      would be unstorable (`storableRow`: a negative station or inset, a blind depth ≤ 0 — the loader would drop it silently)
      Level REFUSES (`LEVEL_CUTS_HOLE`: `Levelling the ends would cut away a hole — move it or remove it first.`; ruling T9b).
    - **The design checks are extended, never weakened** (invs 38, 39; leanContacts.ts): a leaning part's contact faces are its leaned
      bodies' faces whose world normal is ±Y within `LEVEL_EPS` (1e-9: float error only — a 0.5° slope never counts); it touches the
      floor, rests on a part or holds a part only through them (`overlapArea` > `REST_AREA`, 1e-9 sq in). An unlevelled leg is not
      grounded and its fault adds `; it leans, and its foot is not level: Level the ends`.
    - **Joinery, Repair and Refine never mangle a leaning part:** joinery and a joined Refine refuse it, Repair refuses it when any
      part has cuts (inv 41), and a plain Refine keeps it exactly (inv 56).
    - **Cut list, nesting and Buying are unchanged:** a lean is placement, like position, so two legs with the same stock and cuts
      share a row whatever their leans; the level cuts print as their usual bench lines.
    - **A leaning part is held by a seated tenon's joint too** (round tenons, schema 24, invs 39 (d), 58), not only by resting: a
      joint holds it and connects it in `groundedSet` when its partner reaches the floor without it. It still SEEDS grounding only
      from a level foot on the floor, and its contacts are its level faces cut at every built tenon's shoulder
      (`checkedLevelFaces`), so a tip disc never rests or stands. A leaning leg standing only on a foot tenon is not on the floor,
      and its fault still carries the `Level the ends` hint (fu 462).
    - **Level the ends on a tenoned end levels the tip** (spec §6.3): the end's one miter IS the tenon's tip (inv 58), replaced like
      any end miter; the tenon is kept at the end, its length unchanged (measured from the end's centre), so its shoulder rides with
      the end; a fault this causes is KEPT and noted, never refused. `levelPlan(world, units, { topAt })` takes a given world height
      for the top's reference instead of R (Bore leg sockets' Tenon the legs: the seat's top face); absent, R as always, value for
      value. `roundUp` is exported as THE one rounding rule (Tenon the legs' fitted tenon length rounds with it, to `tenonStep`).
    - Drawings, section caps and the Plans note: invs 47 and 51. Holes on a leaning part, sockets and tilts: inv 50 (angled
      holes, schema 23). Round tenons: inv 58 (schema 24). Square-set leans and compound level cuts: inv 59 (schema 25). Follow-ups:
      436–446; angled holes 447–456; round tenons 457–469; square-set legs 470–474.

58. **A round tenon is a STORED feature of a part's end, and `roundTenons.ts` is its ONE home** (splayed legs chunk 2b, schema 24;
    spec `2026-10-25-sloyd-round-tenons-design.md` and its *Amended (build)* block). `Board.tenons?: RoundTenon[]`, `RoundTenon =
    { id, end: 'min' | 'max', diameter, length }` in inches, at most one per end, canonical order `min` then `max` (`withTenons`).
    The tenon is COAXIAL with the length and centred on the section; its SHOULDER is square to the axis (a plane of constant length
    coordinate, `shoulderAt`); `length` runs along the axis from the shoulder to the END'S CENTRE, where the axis meets the end face,
    square or mitered. The tenon is inside the part's length: adding, editing or removing a typed tenon never changes `length` (the
    shoulder moves), so the cut list's length is still the blank (inv 18).
    - **A tenon-free part is byte for byte as before**: it has NO `tenons` key — never `[]`, never `undefined` (`withTenons` drops the
      key on an empty list; the loader, `sharedOf`, `resolveBoard`, every copy site and the write-back's `storedValue` keep it so);
      `geometryBoard`, `geometryKey`, `rowKey`, `boardUVSignature`, `drawsAsBox` and every design-check result are identical, and
      `bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`, `sweptIdentity`, `bandFreeIdentity` and every existing test pass
      unchanged.
    - **Load** (v24, `docs/versioning.md`): `validateTenons` DROPS a malformed tenon (not an object, an `end` other than `min`/`max`, a
      non-finite or non-positive `diameter` or `length`, a second one for an end: the first wins) and KEEPS a well-formed faulted one;
      ids per board (per Shape for a Shape) by `takeId` (inv 33), a `/` re-minted. Copies (`copyBoard`, Duplicate, copy in a row)
      re-mint ids. A schema-23 build refuses a 24 file.
    - **Shared and mirrored**: `tenons` is SHARED (inv 45); mirrors flip by flags (`mirrorTenons`: along the length the ends swap;
      across, nothing; inv 44). `TENON_FIELDS` (inv 40) is "same tenon".
    - **`tenonFaults(b, t)` is the ONE fault decider** (spec §3.2), faults in this order, one `meets-feature` per feature kind:
      `too-wide` (diameter at or above the smaller of width and thickness, 1e-9); `too-long` (the shoulders would meet or cross, at the
      centre, with the other end's STORED tenon read from `b`); `cut-reaches-shoulder` (the end's miter reaches the shoulder anywhere
      across the full section: its deepest corner depth ≥ the centre depth + length); `meets-feature` (another feature's region meets
      the ZONE, the end slab from the shoulder to the end over the full section, `tenonZone`, with positive extent on every
      dimension): a rectangular cut (`clippedRegion`), an angle cut other than the end's own miter (`touchedRegion`), any other cut on
      that end (`endCutOf` 'other'), a hole row (`holeRegion`), a curve or a profile (through `shapedFeatures` over `profileView`, the
      ONE geometry view: true arcs, run-outs, swept profiles; `featureMeetsBox`), a band (a long-edge band always; an end-edge band
      only on the tenon's own end — its thickness is in the band type, which the part does not carry). **CONSERVATIVE**: boxes that
      may refuse a feature that just clears, never the reverse. **The end's own cut** (`endCutOf`, spec §3.3): a tenoned end is
      square, or carries exactly ONE end miter (`kind 'miter'`, `face 'length'`, on that end — what Level the ends writes), which is
      the tenon's TIP; anything else on that end is a `meets-feature` (angle cut) fault. Copy has ONE home, `tenonText.ts`
      (`tenonFaultText`, verbatim: `A round tenon must be narrower than the part's section.` / `The tenons would meet — shorten one.` /
      `The end's cut reaches the shoulder — lengthen the tenon.` / `The tenon would run into <a rectangular cut | an angle cut | a
      hole | a curve | a profile | a band> — move it or remove it first.`).
    - **The holes rule**: an ADD is refused on ANY fault; an EDIT only when it ADDS one (`addedTenonFaults`, by `kind|feature`), so a
      tenon a later resize faulted can be edited toward fitting; a fault a later edit causes (a resize, a lean, a new cut, a feature
      added in the zone) is KEPT, noted (the Round tenons row shows `tenonFaultText` and `(and N more)`), never clamped. **A
      faulted tenon builds NOTHING** (`builtTenons`, the ONE "which tenons build" list, memoised per board object and frozen): no
      geometry, edges, caps, snap points, diagram or joint — only the bench line, which prints every STORED tenon.
    - **Geometry is inv 48's path** (`geometryBoard` appends each built tenon's two square-span view curves; bodies stay convex; no
      seam or facet line on the round side, inv 16). The mesh is WATERTIGHT (`curvesWatertight.test.ts`: a square end, a mitered
      tip, a leaning part); `curvesPerf` holds tenon cases under the existing budgets (the minimum of 9). Edges: the shoulder ring, the
      tip's outline (a circle, or an ellipse on a miter), silhouettes in drawings. Section caps come from the bodies (a seated tenon
      fills the seat's subtracted bore, so a cut shows two solids). **Snap points**: the tip's centre and the shoulder ring's centre
      ('face-center', on the axis; the shoulder centre sits in wood, inv 16's ring-centre exception), and no sloped-face corners on a
      tenon's round surface (`onTenonSurface`). **Drawings**: lines from the part's edges; only the segments that are the tenon's
      alone (the sides, silhouettes, the shoulder ring) carry no feature tag; the mitered tip's outline lies in the miter's plane and
      KEEPS the miter's tag (ruling T6a). No Plans feature callout for a tenon (fu 457). **Part diagrams** (`DiagramTenon`: `end`,
      `diameter`, `shoulder`, and on a mitered end's side views `tip`, each side's station where its generator meets the miter plane,
      ruling T5d): the end view draws the tenon as a circle at the section's centre; every side view the shoulder line and the two
      sides; a tenoned part with no side view opens the thickness view. **The cut list**: the row's length is the blank, tenon
      included; one bench line per STORED tenon after the rectangular-cut lines and before the angle-cut lines (`tenonLine`, one home:
      `<d> round tenon, <t> long — at the length <min|max> end, shoulder <s> from the other end`, the diameter at hole precision
      `holeLengthText`, `<s>` measured to where the axis meets the far end's face; a faulted one ends ` — check: <first fault>` and
      `(and N more)`, ruling T6b); `rowKey` appends `tenonSignature` only when the part has one. The tenon's view curves are never
      shown as curves (no curve line, key, tag, diagram curve or curve snap).
    - **The joint** (`tenonJoints.ts`; spec §5, invs 38, 39): `seatedIn(a, t, b, row)` holds, in the WORLD (`worldParts` entries,
      so the parts may sit in different assemblies or under mirrors), when (1) `t` BUILDS; (2) `row` is a single bore (`count` 1) of
      another part; (3) its diameter equals the tenon's (1e-9: exact match, so a tenon 1/64" small is not seated); (4) it lies along
      `a`'s axis (`boreAlongAxis(b, row, partAxis(a))`, inv 50: through or blind, from any face); (5) the tenon ENTERS it — along the
      tenon's outward direction, the tenon (shoulder to the tip's furthest point) and the bore (mouth to far centre) share more than
      `TOUCH` (ruling T7a: otherwise a collinear bore further along the line would seat it); (6) in a BLIND bore no point of the tip
      passes the bottom's plane by more than `TOUCH` — the tip's FURTHEST point (`tipFarthest`: on a mitered tip the centre advanced
      by r·tan φ; on a COMPOUND tip, inv 59, the least depth over the disc, `max(0, centre − r·hypot(k, rise))` with `k` the along
      slope, never the least of ±r probes along each axis, which over-reports seating), never the centre alone; a through bore takes any tenon. `tenonJoints(doc)` lists every seated tenon in one pass,
      world order, each tenon against every other part's single bores in world and row order — **the FIRST match wins** (one joint per
      tenon; known limit fu 461). A tenon near a socket, in one of another size, or along another line is NOT a joint: its wood in the
      other part is an overlap, as today, with the mismatch hint (inv 38). **Support is never granted by proximity.**
    - **Edits** (store; the Properties section **Round tenons**, after Holes, `RoundTenons.tsx`): `addTenon(boardId, end, diameter,
      length)`, `updateTenon(boardId, tenonId, next)`, `removeTenon(boardId, tenonId)` on the WORLD part, written through `mapWorld`
      (a Shape's tenons once, a mirrored user's end lowered through its mirror; inv 46), one undo entry, held points re-judged
      (`judgeHeld`, inv 24). Every refusal is decided before `edit()`, as a sentence (ruling T8b: an action never reports success for
      doing nothing): the first fault's `tenonFaultText`; `This end already has a round tenon.` (`TENON_END_TAKEN`); `A round tenon
      can't change ends — remove it and add one at the other end.` (`TENON_END_FIXED`); `A round tenon's diameter and length must be
      more than zero.` (`TENON_SIZE_POSITIVE`, a size the loader would drop). Null and nothing done while exploded (inv 47) or
      gesturing, and for a stale id (the hole actions' convention); an unchanged edit pushes no entry (inv 4). The panel: one row per
      end (`Top`/`Bottom` on an upright part, `Length min end`/`Length max end` otherwise; ruling T8a); an end without one offers
      `Add round tenon` with the spec §4 default (`defaultTenon`: 1" or 25 mm, else the largest whole 1/8" or mm that is not
      `too-wide`; 1" or 25 mm long), WITHHELD with its fault shown when the store would refuse it (ruling T8c); an end with one shows
      Diameter (hole precision), Length, the readout `Shoulder <len> from the <other end word>` (`shoulderFromFarEnd`, the ONE home of
      that number) and, when seated, `Seated in <part>'s socket.` (`tenonJoints` over the flat document), the kept-fault note, Remove.
    - **Bore leg sockets tenons the legs** (inv 50: `partAxis`, `boreAlongAxis`, `tenonInSeat`, Tenon the legs, the stale tenon
      note). A fitted tenon's length rounds UP to `TENON_STEP` (`roundTenons.ts`: 1/64" imperial, 0.1 mm metric; `tenonStep(units)`
      reads only `units.display` through a TYPE-only `Units` import, so `roundTenons.ts` takes no `→ units` edge; `defaultTenon` takes
      a `metric` boolean for the same reason). `tenonText.ts` produces the strings and imports `units` (the edge rule).
    - **AI paths**: Generate is unchanged (the design schema is byte for byte the same, fu 322); Refine KEEPS a tenoned part exactly
      (`keepsExactly`, inv 56) and a joined Refine refuses one; joinery and Repair refuse a tenoned document (`tenonRefusal`, inv 41).
      No path squares an end: a tenon is never lost silently.
    - **A stretcher** (inv 60) is a part whose two tenons are seated in blind sockets in two upright legs: it is held by clause
      (d) through those joints (each leg reaches the floor without it) — no clause, hint or reader is added for it (between
      leaning legs nothing is held "between", fu 438, and that stands). A stale rung (a lean edit after the Add) is reported as any unseated tenon is: an overlap with the
      mismatch hint.

59. **A lean may be SQUARE-SET, and a square-set leg's level ends are COMPOUND miters** (splayed legs chunk 2c, schema 25; spec
    `2026-10-25-sloyd-square-set-legs-design.md` and its *Amended (build)* block). A square-set leg is tilted onto its slopes and
    never turned about its axis, so its faces stay within about 1° of the world axes (0.83° at rake 8°, splay 12°; a square leg
    leaning two ways cannot keep both exactly square), where a TURNED leg (chunk 1, inv 57) sits about 33.5° off them. Its foot
    and top are then a compound cut, sloping across both the width and the thickness. `lean.ts` stays the ONE home of the map
    (inv 57) and `angleCuts.ts` the ONE home of the compound depth.
    - **Stored forms.** `Lean.square?: true`, stored ONLY as `true` (absent is turned: every lean saved before schema 25); `face`
      keeps its meaning and is still stored (a square-set map ignores it; switching back to turned uses it). `AngleCut.across?:
      { rise, from }`, legal only on an END MITER (the RESOLVED kind `miter`, `face 'length'`): the depth also grows by `rise` per
      inch across `throughOf(c)`, measured from that dimension's CENTRE, increasing away from its `from` side. The full depth at
      station `s` (from `alongFrom`) and cross position `t` (from `across.from`, along the through dimension of size `T`) is
      `depthAtCross(c, b, s, t) = depthAt(c, s) + rise · (t − T/2)`; a cut with no `across` returns `depthAt(c, s)` itself, with no
      arithmetic added. **Anchored at the centre**, so the depth on the part's axis is the single-slope `depthAt` exactly and round
      tenons' `centreDepth` / `shoulderAt` stay exact (inv 58); a reader assuming a min-face anchor would be off by `rise · T/2`.
    - **Load** (v25, `docs/versioning.md`): `validateLean` keeps `square` only when it is `=== true` (any other value is dropped
      from the lean, which stays; `seamFree`'s spread carries it through a re-face). `validateAngleCuts` judges `across` on the
      RESOLVED kind (a missing kind on an end cut derives `miter` and keeps a good `across`) and DROPS THE CUT, the part kept, when
      `across` is not an object, sits on any other kind or face, has a `rise` that is not finite, ≤ 0 or above `1 + 1e-9` (the
      45° lean bound: a level cut's across slope never exceeds 1), or a `from` other than `min` / `max`; a good one is rebuilt field
      by field (stray keys dropped), an absent one stores no key. A schema-24 build refuses a 25 file. **A project saved before
      schema 25 is byte for byte as before**: no `square` or `across` key appears unless this round's paths write one, and every
      identity test (`bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`, `sweptIdentity`, `bandFreeIdentity`,
      `hardwareFreeIdentity`, `mirrorFreeIdentity`) passes unchanged.
    - **The map.** `leanMap` is `m = T` for a square-set lean (no `Ry(τ)`), `T · Ry(τ)` otherwise, the turned product unchanged
      byte for byte. `T` is mirror-equivariant alone, so mirror conjugation (inv 57) holds with no seam case. `leanTwist(b, l)` is
      the seam-free twist τ a TURNED lean `l` would apply (through `twistOf`, still the ONE twist computation; it never reads
      `l.square`); it is exactly `+0` for a rake-only or splay-only lean, where the two maps agree, and is compared exactly (ruling
      T3c). The leaning-cap key (`section.ts`) and BoardMesh's two memo dep lists carry `square`.
    - **The default and the Set** (`setLean`, store): a part that does not lean yet gets `square: true` (written only as `true`,
      never `false` or `undefined`); a leaning part keeps its own setting through rake and splay edits; a lean built directly
      (a loaded file, a fixture) keeps what it stores. `LeanWorld.square` is the Set change (ruling: a `setLean` patch field, no
      new action): alone it keeps both slopes bit for bit; on a part that does not lean it writes nothing; it may combine with a
      slope edit. On a holed leaning part a Set change is refused when the TURNED end's τ is not 0 — the old lean when leaving
      turned, the new one when entering it (ruling T3a: a combined Set and slope edit judges that same end) — verbatim `Changing how
      this leg is set would turn it about its length and move its holes — remove the holes first.` (`LEAN_SET_TURNS_HOLES`); with
      τ = 0 it is allowed. The face-flip refusal (`LEAN_TURNS_HOLES`, inv 57) applies only when the old and the new lean are both
      turned: a square-set lean's `face` never reaches the map, so its re-choice turns nothing. The no-op test (inv 4) compares
      `square`. One undo entry, one write per Shape, `judgeHeld()` at the end, null while gesturing or exploded, as inv 57. The
      Lean section's **Set** select (label `Set`; `Square to the sides` / `Turned to the lean (one-cut ends)`; `mixed`, disabled,
      when the selected leaning parts differ) calls `setLean(ids, { square })` through the section's `run`, so a refusal shows as
      an alert and the select stays on the stored value; a Set change leaves levelled ends stale (the existing note).
    - **Level the ends on a square-set leg** (`levelPlan`, spec §3.3): each end is ONE miter whose plane is the floor (or the
      top) plane exactly. `along` is the cross dimension whose world height changes faster under the map (`|m·dir|_y`, ties
      within 1e-9 to width); `points` is its single-slope line through the end's through CENTRE (`t = T/2`, so R, the top cut's
      centre depth, stays exact); `across = { rise: |s|, from: s > 0 ? 'min' : 'max' }`, `s` the depth's slope per inch across the
      through dimension (the foot's and the top's opposite), stored only when `|s| > 1e-9` — a rake- or splay-only square-set lean
      writes plain miters. Each dimension's world direction comes from `axisFrame` SIGNED by `reversed` (`dirOf`; unsigned, a
      leg turned 180° got the wrong `across.from`). The floor-normal throw stays for a TURNED lean only, whose plan (`t = 0`, no
      `across`) is byte for byte as before. Every other rule of inv 57 stands: lengths rounded UP, the top through R or `topAt`,
      holes kept in the wood, any end miter replaced in place, other end kinds refuse, one edit per Shape. `sameLevelLine`
      compares `across` (both absent, or the same `from` and a rise within 1e-9), so `isLevelled` and Bore leg sockets'
      `sameCuts` follow (`legSockets.ts` needed no change). On the square stool fixture every foot corner is at y = 0 exactly.
    - **Every reader of a compound miter is correct, or refuses** (spec §4; the survey's 24 silent readers): the plane, the
      deepest corner and the touched box (inv 48); the field table, values and copies (inv 40; `copyAngleCut` gives a fresh
      `across`); mirrors by flag flips (inv 44); a round tenon's tip by `max(0, centre − r·hypot(k, rise))` (inv 58). **Words**:
      the bench line (`angleLine`) `Compound miter at the length <min|max> end: <a>° across the <along>, <b>° across the
      <through>, long corner at the <along> <min|max> side and the <through> <min|max> side` (one decimal, display only; `<b>` is
      `miterDegrees(|rise|)`; the long corner is the end face's corner of least full depth, `compoundLongCorner`, so mirror twins
      print different rows; ruling TFa); `shortPointLine` from the four corners' full depths;
      the Plans feature key `Compound miter <a>° × <b>°` (along, then across, the chamfer's form; ruling T5a). **Part diagrams**:
      the wedge on BOTH cross faces' views, each side's polygon on its own face (`wedgeOn(board, h, face, at)`: the offset
      `n[face]·at + d`; a single-slope cut takes the old expression, so `diagramIdentity` holds), opening a face's min view (else
      its max view, for a cut biting at one corner) when neither exists, so an along face's view is added (ruling T5b; fu 472: a
      face whose only views show nothing draws the cut nowhere). **Authoring**: `miterFields` is null for one (the Angles row
      shows the bench line and Remove only, as a levelled offset miter does) and `miterCut` never writes one; only Level the ends
      makes a compound cut (fu 470 a hand-authored one; fu 471 a compound bevel, chamfer or taper).
    - **AI paths refuse or keep, never misread.** `hasCompoundCut(b)` (`angleCuts.ts`, in `document` so both `generate` and
      `leanKeep.ts` read it) is the ONE predicate. Joinery, Repair and a joined Refine refuse by `compoundRefusal`, the ONE
      decider's third step (inv 41); Refine keeps such a part exactly (`keepsExactly`, inv 56; model-facing reason `has a compound
      end cut`, ruling T6a); `worldAngles` returns null for any part with an `across` cut and `angleRatiosOf` skips one (ruling
      T6b, defence in depth: every caller then refuses, keeps or does not snap that degree). The design schema is byte for byte
      the same (fu 322).
    - **Clear lean keeps the compound cuts** (spec §4.1): the cleared part is a non-leaning part with a compound cut — its rows show
      the bench line and Remove, joinery refuses it, Refine keeps it.
    - Test-only fixtures (`stoolFixture.ts`): `squareStoolLegs` / `squareStoolDocument` (the chunk 1 stool square-set and levelled, its legs
      17.125 in long) and `clearedSquareStoolDocument` (the same after Clear lean). Follow-ups 470–474.

60. **A stretcher is an ordinary part with two round tenons seated in two blind sockets; `stretchers.ts` is the ONE planner of
    Add stretcher and Fit the stretcher again, and nothing about a stretcher is stored** (splayed legs chunk 3, fu 438; NO schema
    change; spec `2026-10-25-sloyd-stretchers-design.md` and its *Amended (build)* block). The rung is a `flat` part, its length
    along world X (turn 0) or Z (turn 90), its section the typed rung size (square), grain along the length, one `min` and one `max`
    `RoundTenon` (inv 58); its sockets are ordinary count-1 BLIND `HoleRow`s in the legs (a linked leg's on its Shape, inv 45).
    Which legs a rung joins is FOUND from the geometry every time (`rungLegAt`, `stretcherOf`), never stored. **A project without a
    stretcher is byte for byte as before**; no check, reader, drawing or loader changes (the rung is held by the existing joint,
    inv 39 (d), inv 58: support is never granted by proximity).
    - **The axis** (`rungLine`, spec §3.1): the points where the two legs' axes (`partAxis`, inv 50) cross `y = h`, `h` strictly
      between each axis's lowest and highest world Y by more than 1e-9 (else `<Leg> doesn't reach that height.`); they must differ in EXACTLY one of
      X and Z by more than 1e-6 (else `These legs aren't square to each other at that height — a stretcher must run straight along
      the front, back or sides.`), and the axis is then made EXACTLY axis-aligned — its cross coordinate the two points' midpoint,
      Y = h — so both sockets are bored along one exact line and the joints seat at 1e-9 by construction. Diagonal and X rungs
      refuse (fu 475).
    - **The fit** (`fitOn`, Add's and Fit's one computation): `D` the axis points' distance; the stock length `L` = `D` rounded
      DOWN to the drag grid (`snapStep`: 1/16", 1 mm, `floorToGrid`), centred, so each tip stops `(D − L)/2` short of its leg's
      axis; each end's shoulder station is the largest distance, over the four lines parallel to the axis through the section's
      corners, at which that line leaves the leg's LEANED bodies (`worldBodies`, R1; `bodySpans` the ONE line-vs-body clip,
      `cornerExits`); `S = D − sA − sB` rounded DOWN to the same grid, the slack split evenly, so the shoulder never enters a leg;
      each tenon the length that placement leaves, stored exact (the two sum to `L − S`). Before any station is measured, the
      section's centre line and four corner lines must cross each leg's entry face inside its rectangle and the tip must stop
      short of the centre line's crossing (`onEntryFace`, ruling T1a, through `faceCrossing`), else out of reach; a tenon whose
      length comes out ≤ 1e-9 is out of reach too. The shoulder stays SQUARE; the readout prints the gap (`gapOf` over
      `cornerExits`: the shoulder's distance less the nearest corner line's exit, the larger end's).
    - **The sockets** (`rungSocketRow`, inv 50's bore core): blind, along the exact axis, entering the leg's LONG face whose leaned
      outward normal is nearest the direction toward the other leg (`rungEntryOf`, first in `axisFrame` order on a tie), its mouth
      where the axis crosses that face, its bit along the axis, the tenon's diameter, its depth along the bit from the mouth to the
      tip ROUNDED UP to `tenonStep` (1/64", 0.1 mm) so the tip always seats. A leg already holding a row the planned tenon is
      `seatedIn` (inv 58's own test, never a looser tolerance) REUSES it — a linked mate's copy of a socket — unless that row
      already holds ANOTHER part's seated tenon in this leg (`holderOf`, THE held test, shared with Fit's `usedRow`): a second
      rung on the first refuses (`These legs already have a stretcher at that height: <Rung>.`, ruling TFa); a count-1 bore along the axis the tenon would enter by
      more than `TOUCH` but not be seated in refuses (`<Leg> already has a different socket there — remove it first.`); a socket
      past the tilt bound refuses (`socketTooSteep`, unreachable on any legal lean: the lean bound is the tilt bound); a socket with
      any `holeFaults` fault (THE decider, inv 50) refuses the WHOLE action, naming the leg (`<Leg>'s socket would <words> —
      choose a different height, or a smaller tenon.`, `socketFaultWords`) — unlike Bore leg sockets, which bores the rest. The
      second leg is judged on a trial document holding the first socket (two legs on one Shape carry both).
    - **Add stretcher** (`stretcherPlan(doc, legIds, { height, size, diameter })`, the store's `addStretcher`): every refusal is
      decided before `edit()`, in this order: a height, rung size or tenon diameter not finite and more than zero (`A
      stretcher's height, rung size and tenon diameter must be more than zero.`; the loader would drop such a socket), a leg
      leaning TURNED with a non-zero twist (`leanTwist`; `Set <Leg> square to the
      sides first (Lean).`, spec Amended S1; a turned lean with zero twist is the square-set map and allowed), legs in different
      containers (`Select two legs in the same assembly.`), a leg reached through ANY mirrored instance on its chain (`A stretcher
      can't join a leg inside a mirrored copy yet: <Leg>.`), out of reach, not square, out of reach on the entry face, the tenons'
      faults (`tenonFaults`, inv 58; its first sentence), then per leg a taken row (TFa), a different socket, too steep, a
      socket fault. Then ONE
      `edit`: the rung inserted into the legs' container (named `uniqueName('Stretcher', …)` among that container's parts and
      assemblies, inv 8; the legs' material when they share one, else the default) and written to its world placement through
      `mapWorld` (inv 46's Properties rule, no `keepWorld`), each leg's holes in the same pass, ONE entry per storage target (a
      Shape once); the rung selected; `judgeHeld()` (inv 24). One undo entry; null and nothing done while exploded (inv 47) or
      gesturing (no sentence, as every sibling action; ruling T4a), and for a stale id. The plan's `notes` name every OTHER world
      part whose holes gained the row (`<Part> got this socket too, through its link.`); a rung added on one side of a linked
      stool bores the mates' sockets too, and the other side's rung then reuses them.
    - **Finding a stretcher** (`rungLegAt`, `stretcherOf`; a NEW predicate, not `tenonInSeat`): a tenon's leg is the FIRST part
      in world order, other than the rung, that is UPRIGHT and whose world bodies the tenon's centre segment (shoulder centre →
      tip centre) meets by more than `TOUCH`; a rung is a stretcher only when it is UNLEANED, its length LEVEL (along world X or
      Z), and its `min` and `max` tenons find two DIFFERENT legs. `seated` when both are `seatedIn` a row of their leg; otherwise
      it is stale. The legs are listed in TENON order (the `min` tenon's first; ruling T5b).
    - **Fit the stretcher again** (`refitPlan(doc, rungId)`, the store's `fitStretcher`; spec §6.3, §6.4): re-fits the CLOSURE —
      the rung, and every other stretcher that uses (seated in, or, stale, found at) a row a member uses, repeated until stable
      (ruling T3e: the safe side of §6.3's "moves"), ONE member per STORED rung (ruling T3d) — each at its OWN axis height
      through the same `legRefusal`, `rungLine`, `fitOn` and socket builder as Add, its own section and tenons. A stale tenon's
      row is the single blind bore of its diameter nearest its tip (bottom centre to tip centre), never a row another part's
      tenon is seated in; two equally near (1e-9) refuse (`<Leg> has two sockets this tenon could be in — remove one.`); a tenon
      with no row reuses one an earlier member just bored that it seats in, else a new one is bored (ruling T3b). It changes
      ONLY each rung's `length`, `position` and tenon lengths (ids kept by end) and moves each used row IN PLACE (index and id
      kept); a value within 1e-9 of the stored one is the stored one. Refusals, all before any write: the ambiguous tenon; per
      member its legs' checks, the axis, an axis now along the other world axis (`<Rung> would now run the other way — add it
      again.`), the fit, a rung now reversed along its axis (the same sentence), the tenons' faults, too steep; a shared row two members plan
      differently (to 1e-9; `These linked legs need their shared socket in different places: <rungs>.`); then, on the final rows,
      a different socket and a socket fault. One `mapWorld` edit, one undo entry, `judgeHeld()`; **a fitted rung's Fit pushes NO
      entry** (inv 4: the store's own no-change check by name — `length`, `position`, `tenons` — and any other patched key
      throws). `refitPlan` throws for a part that is not a stretcher; the store returns the internal `This part is not a
      stretcher.` first.
    - **The default height** (`defaultHeight`): one third of the LOWER leg's top (`axisTop`, its axis's highest world Y),
      snapped to the grid (`snapToGrid`), stepped up by 1-1/2" (40 mm) while a trial plan at the default rung size refuses with a
      `meets-hole` socket fault on either leg or a taken row (TFa: a second Add on one pair defaults to the next free
      height), at most 20 steps (no fixture reaches the cap, ruling T2b), then the last height
      tried.
    - **The UI**: the **Stretcher** section in the multi-selection panel when exactly two upright parts are selected (Height,
      Rung size, Tenon diameter, `Add stretcher`; a refusal is the section's alert; the Height default memoised on a pair
      signature, never on `gesturing`, inv 34; ruling T5c); the rung's own panel, under Round tenons, shows `Between <A> and <B>,
      <h> up · shoulder gap up to <g>` (`<g>` rounded UP to the display grid, `ceilToTick`: a bound never understated)
      when seated, else `No longer fits <A> and <B> — Fit the stretcher again.` and the button;
      the last Add's link notes show there while that rung is selected and the document is the Add's (ruling T5a). Copy has ONE
      home, `stretcherText.ts`, which imports `units` (the edge rule); `stretchers.ts` takes only a TYPE-only `Units` (its sentences, from
      `stretcherText.ts`, carry no length).
    - Joinery, Repair and Refine are unchanged (a tenoned part refuses or is kept, inv 41, 56); the design schema is byte for byte
      the same. Follow-ups 475–483.

61. **A box joint is ORDINARY rectangular cuts; `boxJoints.ts` is the ONE layout, the ONE recogniser and the ONE planner, and they are
    each other's inverse** (box joints, dovetails chunk 1; NO schema change; spec `2026-10-26-sloyd-box-joints-design.md` and its
    *Amended (build)* block). Nothing is stored that says "box joint": a corner is two parts whose ends carry full-thickness
    notches (`Cut`: `face` the dimension running into the corner, `from` that end, `across: 'thickness'`, `stopMin: 0`,
    `stopMax: 0`, `offset`/`width` the segment along the part's `J` dimension), so an older build reads the same file as plain
    cuts. **A box-joint-free project is byte for byte as before**: no reader, check, drawing, loader or cut-list line changes for it
    (`CURRENT_VERSION` stays 25; every existing test passes unchanged).
    - **The layout** (`fingerLayout(H, w)`; spec, *Amended 2026-10-27*, the user's ruling after the build: equal fingers): `k = ⌊H/w⌋`
      (an `H` within 1e-9 of a multiple counts as that multiple), `r = H − k·w`; `r ≤ 1e-9`: `N = k`, every finger exactly `w`
      (`odd === width`); `r < w/4` (judged to 1e-9: an `r` within 1e-9 of `w/4` is `w/4`, not a sliver): `N = k`, the odd finger `w + r`
      (the sliver merged into its neighbour); else `N = k + 1`, the odd finger `r`. The odd finger is always `H − (N − 1)·w`, computed
      directly. `N` may be even. Null when `w` is not more than zero or `N < 5`. **At least five fingers**: three read as a tenon to
      `findTenons` (`boxJoints.test.ts` pins that a three-segment set IS claimed as one, so the floor cannot be mutated away silently).
      (The symmetric layout and its tie rule, spec difference 4, are gone: no tie arises.) `segment(l, k, oddEnd)` is computed
      directly from `w`, `odd` and `H`, never as a running sum, from the part-local J min with the odd segment at `oddEnd` (with no
      odd finger one formula, so both ends give the same bytes). A part with a finger at J's min is notched at EVEN `k`, the other at
      ODD `k`; each notch is the other part's thickness deep, exactly. **Where the odd finger goes:** full fingers start at the
      START edge — J's world MAX on every axis, so the odd finger is at J's world MIN: the BOTTOM for Y, the BACK for Z (+Z is the
      front, `drawing.ts`), the LEFT for X (ruled 2026-10-27 after review; the amendment's first reading put it at the visible
      front for Z) — and
      each part reads that edge in its OWN J terms (`endFacing`) and computes its segments directly from it, never by converting
      offsets through the world. **One layout per corner, exact complements** (to 1e-9): the two parts of a corner are cut from
      the ONE planned layout over the one shared J span, so they never overlap and leave no gap. Phase: the part whose run axis
      comes first in Z, X, Y takes a FINGER in the start-edge segment (with an even `N` it then has a notch at the other edge;
      `fingerAtMaxOf` is the parity); **Swap fingers** inverts it for every corner.
    - **The recogniser reads SHAPE, never stored fields** (`fingerSets(board)`, `fingerSetAt`): per length/width end, the
      stock-removing cuts open at that end and spanning the thickness, all the same depth, sorted along `P` with no overlap or gap,
      `N ≥ 5` alternating segments, every one the same width `w` (1e-9) except at most ONE END segment, any width in `(0, 1.25w)`
      (to 1e-9; two differing end segments are no set). It reports `fingerAtMin` (J's min segment carries a finger) and `oddEnd`
      (`'min' | 'max' | null`, null when every segment is `w`, and then `odd === width`), never anything world-relative. Re-stored notches (a resize
      re-faces a notch to the thickness face, `refaceFromEnd`) read back as the same set. A recognised width/depth may be an ulp off
      the planned value (exact for the usual cases, 1e-9 in general: Task 2's ruling), so nothing compares recognised numbers
      across boards exactly; the planner compares PLANNED parameters. A partial-thickness cut over the fingers does not stop
      recognition (the planner refuses to make that case, §3.5).
    - **The planner** (`boxJointPlan(doc, ids, { width, swap })`, `applyBoxJoints`, the store's `boxJointCorners`): finds every
      corner the selection makes in pairs (two parts meet when their end boxes interpenetrate along the run axis AND their `J` spans
      overlap beyond 1e-9), refuses before any mutation (`boxJointText.ts`, the ONE home of the words), runs both parts of a corner out
      to the other's OUTSIDE face (the run-out is exact, never grid-rounded, inv 25; `resizeEnd.ts` is the moved resize core,
      shared with joinery) and cuts the notches. Re-running re-plans in place: the old set is removed by cut ids, the new one added,
      ONE undo entry, none while exploded (inv 47) or gesturing, held points judged on the WRITTEN document (`judgeHeld`, inv 24).
      Plain stock only: a lean, angle cut, curve, profile, band or round tenon refuses; a cut or hole in the corner region refuses
      (a groove or dado outside it is kept; a cross-end cut counts as in the way only when it runs across the run dimension, through).
    - **The write-back is `writeBackParts` (`treeEdit.ts`) with `keepWorld`**, never `mapWorld`: `mapWorld` misplaces a part that
      grows at its world-MAX end inside a turned assembly (inv 46's two write-back rules; a new caller picks one) and cannot
      take a position-only linked mate beside a representative's size change. Every selected world part goes in with its FULL
      after-state, ONE edit per storage key, Shapes made plain (marked) and regrouped by `regroupShapes`; the planner's
      **link post-condition** refuses (`boxLinkSplit`) any result that would split a Shape's users, and linked parts that would need
      different layouts refuse (`boxLinkedDisagree`). The linked signature carries the phase and the odd end SHAPE-LOCAL: through
      a user's `mirrored` flag when `mirrorDim` is J (the finger at J's min becomes the one at J's max, by parity; the odd end flips;
      no odd finger compares as null), and the Shape's own board is notched with the same flipped values when its representative
      is mirrored. So a mirrored user at Mirror's own inverse turn agrees. **Two linked cases REFUSE with an asymmetric layout**
      (an odd finger, or an even `N`), with the disagreement sentence, by ruling (2026-10-27): **a user mirrored along J at the
      SAME turn as its mate** (a reflection along J), and **UNMIRRORED users at opposite turns** (carcass sides linked at 90° and
      270°: each sees the Shape's J reversed). Both succeed when the layout is symmetric along J (odd `N`, no odd finger). A linked mate not selected refuses (`boxLinkedMate`); a part inside a mirrored
      copy refuses; a selection is always one container's siblings (`selectionPatch`), so the container refusal is
      defensive only.
    - **Joinery leaves the size and place of any box-jointed part alone** (`recipes.ts`): a site that would resize, trim, move or
      carry (a rabbet rider) a part with ANY recognised finger set, on whatever axis, is skipped, or its unit refused, with
      `<part> has box joints, so joinery leaves its size and place alone`, decided before any mutation (inv 41); a pocket INTO such
      a part stays allowed. A skipped site is never a loss of the fingers.
    - **Refine keeps box-jointed parts and box-jointed ASSEMBLIES whole** (`keepsExactly`, `keptParts`; inv 56): the part (root) or
      the whole assembly, its definition (every part, jointed or not) and every placement, comes back exactly as stored,
      FIRST, before the load gate (so the first-wins repairs, invs 33 and 8, keep the user's names); a model loose part or
      placement reusing a kept name is dropped and listed as replaced. A kept Shape has only kept users: a kept assembly with a part
      linked to a part outside the kept set refuses (`keptAssemblyLinkRefusal`, `Unlink first`). The other kept kinds inside an
      assembly keep their refusal (fu 492). **Finger sets are claimed BEFORE the gate** (`fingerClaim.ts` `claimFingerSets`,
      `restoreFingerSets`): `gateUnjoin` and `readJoints` judge only the cuts left, and the claimed cuts (the same objects) go
      back after; **Repair claims them too** and refuses a result that breaks a set. A **joined** Refine still works: every
      NEW or unrecorded site touching a kept part is fixed as BUTT; a RECORDED joint into a kept part is kept as recorded (forcing it
      butt would drop the pocket the read-back took off the part); **(c) the guard**: after the re-join, a kept part (or any part of a kept
      assembly) whose finger sets, size or position differ from the original comes back UNJOINED with a `notJoined` reason
      (`boxJointJoinChanged`, inv 41's precedent), never joined over it; the gate changing a box-jointed part's sets refuses in words
      (`boxJointsThroughJoints`). **PROHIBITION: do not claim finger sets after the gate, do not force a recorded joint into a kept part
      butt, and do not drop the (c) guard.**
    - **The cut list and drawing never call a finger "a tenon" or print one notch per line**: `setupLines` claims each recognised set
      FIRST (one line per set, `fingerSetLine`), and `findTenons` and the per-cut lines run on the board without those cuts; the
      diagram opens the set's view, skips its cuts and notes the set (`fingerNotes`). Copy lives only in `boxJointText.ts`, which imports
      `units` (the edge rule); `boxJoints.ts` takes a TYPE-only `Units`. The design schema is byte for byte the same (Generate never
      authors a box joint). Follow-ups 484–496.
    - **Since dovetails (inv 62) the corner planner is shared and the keep is wider** (no box-joint behaviour changed; every box-joint
      test passes unedited): corner finding, the run-out, the corner-region refusals, linked-Shape planning and the write-back moved
      unchanged to `cornerPlan.ts` (`planCorners`, `writeCorners`, `cutRunsThrough`; the shared sentences to `cornerText.ts`,
      re-exported from `boxJointText.ts` under their old names), and box joints is one `JointKind` of it. Every KEEP and LEAVE-ALONE
      site above reads `cornerJointed` (a finger set OR a stored dovetail); the finger CLAIM sites stay finger-only, so the
      PROHIBITION above is unchanged. A dovetailed part refuses Box joint the corners with the plain-stock sentence (`dovetails`).

62. **A dovetail is a STORED parametric feature of a part's end (schema 26; half-blind's `lap`, schema 27), and `dovetails.ts` is its ONE fault decider, ONE
    view-curve source and ONE planner; the ONE layout is `dovetailLayout` in the leaf `dovetailModel.ts`** (dovetails chunk 2,
    through dovetails; spec `2026-10-27-sloyd-dovetails-design.md` and its *Amended (build)* block; half-blind dovetails, chunk 3, spec
    `2026-10-27-sloyd-half-blind-dovetails-design.md` and its *Amended (build)* block). `dovetails.ts` re-exports the
    layout as its documented home; the leaf exists so the copy home `dovetailText.ts` and `boxJoints.ts` read it without an import
    cycle. `Board.dovetails?: Dovetail[]`, `Dovetail = { id, dim: 'length' | 'width', end: 'min' | 'max', role: 'tails' | 'pins',
    count, slope, pin, depth, outside?, lap? }` (inches; `outside` on pins ONLY: the thickness face the pins are narrow on, the corner's
    outside face; `lap` half-blind ONLY, on BOTH entries of the corner, the same value, absent on a through one — never `0`, never
    `undefined`: below), at most one per `(dim, end)`, canonical order length min, length max, width min, width max (`withDovetails`).
    The user's numbers are stored, never the outline: the slope `1:s` and the count `N` typed (or Auto), the pin `p` fixed by the
    project's units at planning (1/4", 6 mm: `pinWidth`, never typed), `depth` the OTHER part's thickness. Each part's geometry
    derives from its own feature and its own sizes only, so a part is self-describing.
    - **A dovetail-free document is byte for byte as before**: no `dovetails` key on any part or Shape — never `[]`, never
      `undefined` (`withDovetails` drops the key on an empty list; the loader, `sharedOf`, `sharedPatch`, `resolveBoard`, every copy
      site and the write-back's `storedValue` keep it so). `geometryBoard` reads a dovetail-free part exactly as before (the part
      itself, or its profile view),
      `rowKey` appends `dovetailSignature` only when the part has one, a row without a tails dovetail has no `benches` key (never
      `[]`), and every reader, check, drawing, mesh and cut-list line is unchanged (`CutList.dovetailIdentity.test.tsx`, and every
      existing identity test passes unedited).
    - **The layout** (`dovetailLayout(H, N, s, p)`, spec §3.2, the user's rule: hand-cut, half pins at both edges): `H` is the part's
      own J size (`jointLineOf(dim)`: the non-thickness dimension other than `dim`); `Te = (H − (N + 1)·p) / N`; along J from J's
      min at the OUTSIDE plane (the tail part's end face = the pin part's outside face): a half pin `p`, `N` tails `Te` separated by
      `N − 1` pins `p`, a half pin `p`. Every boundary is computed DIRECTLY (`p + k·(Te + p)` for tail `k`, never a running sum),
      except that the last tail's far edge IS the last half pin's near edge, `H − p` (one boundary, computed one way: a build
      ruling), and the last bound is `H` itself. Moving inward by `x`, every tail–pin boundary moves INTO its tail by `x / s`. **The
      layout is a palindrome along J**, so a turn or a mirror along J moves nothing. Every reader of a boundary (the view curves,
      the snap corners, the inscribed contact boxes, the bench drawings) takes it from `dovetailLayout`, never recomputed. **`Te`
      has ONE home, `dovetailTailWidth(H, N, p)`** (O(1), in the leaf), read by `dovetailLayout`, `dovetailFaults` and the cut-list
      line, so judging or printing a dovetail never builds its bounds array (final review, 2026-10-27). **The count is bounded:
      `DOVETAIL_COUNT_MAX` = 100** (as `HOLE_COUNT_MAX`): load drops more, the planner refuses a typed count over it and starts Auto at
      most at it, and the Tails field reads more as a parse error.
    - **`dovetailFaults(b, d)` is the ONE fault decider**, on the part's own sizes, faults in this order: `count` (not an integer
      ≥ 1), `slope` (outside [4, 12]), `lap` (half-blind, schema 27: a PINS entry with a `lap` not strictly inside its own thickness,
      `!(lap > 1e-9 && lap < thickness − 1e-9)`, NaN included; a tails entry's `lap` is a record only and never faults), `depth` (`depth ≥ b[dim]`, OR with the part's other dovetail on the same `dim` the two depths
      together reach `b[dim]` to 1e-9: the overlap is folded into `depth`, a build ruling), `narrow` (a tail at its narrowest,
      `Te − 2·X/s`, narrower than a pin at its widest, `p + 2·X/s`, by more than 1e-9; `X` = `depth` for tails, the part's own
      `thickness − (lap ?? 0)` for pins — on a half-blind corner both are `tP − lap`; exactly equal passes). Copy lives only in `dovetailText.ts` (`dovetailFaultText`). **Authoring refuses
      ANY fault** (the planner: `narrow` through the count, a `lap` earlier at step 3a with the lap sentences, anything else `<part> is
      too short for its dovetails.`); a fault a later
      edit causes (a resize, a thickness change) is KEPT and noted in the part's Dovetails section, never clamped. **A faulted
      dovetail builds NOTHING** (`builtDovetails`, the ONE "which dovetails build" list, memoised per board OBJECT and frozen): the
      part reads as plain stock at that end — no geometry, snap corner, contact box or bench drawing — and only its cut-list line
      (every STORED dovetail is printed) and its fault note remain; the design check reports the misfit with the partner as overlap.
    - **Geometry is inv 48's path** (Spec difference 1: the round-tenon route, not new body code): `geometryBoard` appends each BUILT
      dovetail's waste as SQUARE-span VIEW curves (`dovetailViewCurves`, `CurveSpan.square`) after the round tenons'; ids
      `dovetail/<dovetail id>/<k>` (no loaded id holds `/`, inv 33). Tails: one curve per pin socket (half pins included), through
      the THICKNESS, widening by `depth / s` each side at the baseline; a half pin's board edge stays square. Pins: one curve per tail
      socket, through `dim` from the baseline to the end with ONE square stop at the baseline, narrowing by `thickness / s` each
      side from the `outside` face to the other; **half-blind (the STOPPED socket):** the same prism, its outline in (J, thickness)
      running from the LAP PLANE (`lap` in from the `outside` face, at the tail's outside-plane bounds) to the inside face, narrowing
      by `(thickness − lap) / s` each side — it touches the inside face and the end face only, and the lap slab is uncut wood (Task 1,
      the proof: no fallback was needed). Both describe the same prism. So bodies stay convex, the mesh is WATERTIGHT
      (`dovetailGeometry.test.ts`), `geometryKey` and `boardUVSignature` read the dovetail (inv 15), and every `squareSpan` reader
      skips it as a curve (the cut list's curve lines and signature, the diagram's curve layers, feature keys, `holeFaults`'
      `intoCurve`); the drawings tag no dovetail segment as a curve because every outline is straight (drawing.ts unchanged, a build
      ruling: a future arc-bearing joint view would need the exclusion). **One layout per corner, an exact partition**: the two parts'
      world kept pieces inside the corner square fill it exactly and share no volume (to 1e-9: `dovetailGeometry.test.ts`
      across H, N, s, metric and imperial `p`, turned parts, swapped roles and both run dimensions, mutated; half-blind across laps
      too, with the lap slab the pin part's alone, `expectLapSlab`; the planner's tests through
      the test-only `dovetailFixtures.ts` `expectPartition`).
    - **Snap points** (inv 16): a built dovetail offers its corners at the OUTSIDE plane only (`dovetailCorners`): a tail's end
      corners on the end face at both thickness faces, a pin's narrow corners on its `outside` face at the end and at the baseline —
      on wood by construction; the sockets are air to `stockProbe`, so nothing is offered in one. **A half-blind pin's corners sit on
      the LAP PLANE** (at the end face and at the baseline), never on the outside face, which is unbroken lap wood (its own outline
      corners stay offered: they are real wood; Task 1 ruling).
    - **Load** (v26, `docs/versioning.md`): `validateDovetails` DROPS a malformed entry, never the part (not an object, `dim` not
      length | width, `end` not min | max, `role` not tails | pins, `count` not an integer from 1 to `DOVETAIL_COUNT_MAX` (100), a non-finite or non-positive
      `slope`, `pin` or `depth`, a pins entry without `outside` min | max, a second one for a `(dim, end)`: the first in RAW order
      wins), drops a tails entry's stray `outside` (the entry kept), and KEEPS a well-formed faulted one (a slope of 1:20); ids per
      board (per Shape for a Shape) by `takeId`, a `/` re-minted. Copies (`copyBoard`, Duplicate, copy in a row) re-mint ids. A
      schema-25 build refuses a 26 file. No upgrade step (absent means none). **v27 (`lap`):** a present `lap` that is not finite and
      > 0 DROPS the ENTRY (the part kept); a valid one is copied as is on EITHER role, an absent one stores no key; a well-formed
      FAULTED lap (at or past the thickness) is KEPT and noted; a schema-26 build refuses a 27 file (it would rebuild each entry
      field by field, drop `lap` and load every half-blind corner as through). No upgrade step (absent means through).
    - **Shared and mirrored**: `dovetails` is SHARED in `LINK_FIELDS` (inv 45), exactly as `tenons`: stored once on the Shape, a fresh
      copy per user (`copyDovetail`), `sameShared` in order with ids, `groupSignature` its sorted `dovetailValues`, `alignedTo` adopts
      the representative's ids only when `sameDovetail` matches in canonical order; a key present as `[]` or `undefined` is a REMOVAL
      (inv 46). Every mirror is a FLAG FLIP (inv 44, `mirrorDovetails`, its own inverse; `lowerDovetails` lowers through one mirror,
      an untouched entry back to the stored object): along `dim` the `end` swaps, along the thickness a pins entry's `outside`
      swaps, along J nothing (the SAME array). `DOVETAIL_FIELDS` (inv 40, every field but `id`, `satisfies`) is "same dovetail":
      `sameDovetail`, the cut list's `dovetailSignature` (exact, order-independent, ids ignored, over the STORED dovetails). **`lap`
      is in `DOVETAIL_FIELDS`** (after `outside`; a half-blind side and a through side are different rows, and so are two laps), and
      **`dovetailValues` OMITS an absent `lap`** (a present one appends `|lap=<v>`), so every through row's key is byte for byte as
      before (pinned by literals). **`lap` flips under nothing** (a distance from `outside`, which already flips): `mirrorOne` is
      unchanged.
    - **The planner is the dovetail kind of the shared corner planner** (`dovetailPlan`, `applyDovetails`, the store's
      `dovetailCorners`; `cornerPlan.ts` holds box joints' corner finding, run-out, corner-region refusals, linked-Shape planning and
      `writeCorners`, factored out unchanged, inv 61; the kind supplies `featureOf`, `removeAt`, `planCorner`, `addAt`, `signature`).
      Every refusal before any mutation, in order (`dovetailPlan`'s doc comment): the slope, then a typed count; then the shared
      planner's (a part in a mirrored copy; the corners and their refusals; then, step 3a, before any end moves, per corner a
      half-blind lap not strictly inside the pin part — `DOVETAIL_LAP_PARSE` or `dovetailTooThin`, below; per part end the plain-stock
      test, the run-out and the corner region's cut and hole), with each corner's too-narrow sentence (`planCorner`) before the linked checks (mate,
      disagreement, the link post-condition); then any other fault of a NEW dovetail (too short). ONE undo entry; none while exploded (inv
      47) or gesturing; held points judged on the written document (`judgeHeld`, inv 24). **Which part takes the tails**: box
      joints' `RUN_RANK` (the part whose run axis ranks first in Z, X, Y; a drawer's sides), Swap inverts. **Auto**: `N =
      min(DOVETAIL_COUNT_MAX, max(1, round(H / 1.5")))` (38 mm metric), lowered by one while `narrow` holds on either part; `N = 1`
      still faulting refuses (`… too narrow for even one tail at 1:<s> — try a shallower slope or a wider part.`; a count of 2 or more
      that faults: `… too narrow for <N> tails at 1:<s> — try fewer tails.`; every printed count reads `1 tail` / `<N> tails` through
      `tailWord`). **Re-plan (spec G3, change only what is asked)**: on a corner whose two ends already carry one tails
      and one pins dovetail (read off the ORIGINAL parts), a null count KEEPS the stored count (lowered as Auto only when the new
      slope faults it), the corner KEEPS its stored pin width (the current tails end's: a units switch alone never changes a joint;
      a new corner takes `pinWidth(doc.units)`; final review, 2026-10-27), the current tails part keeps the tails, and Swap flips
      relative to it. **Linked users**: the Shape-local
      signature (role, count, slope, pin, the pins' `outside` through the user's thickness flip, plus the generic run dimension,
      Shape-local end, depth and size) is compared exactly (sizes at 1e-9, inv 61's R-F1); a user mirrored along J at the SAME turn as
      its mate SUCCEEDS when the Shape takes the TAILS (the palindrome), unmirrored users at opposite turns and Mirror's own pair (a
      mirrored user at the inverse turn) succeed taking the PINS; **a user mirrored along J at the SAME turn whose Shape takes the PINS
      refuses** with the disagreement sentence (its pins would be narrow on its INSIDE face; a build ruling, fu 507;
      `dovetailPlan.test.ts`' carcass cases) — Swap (the linked parts take the tails) or Unlink. Write-back is `writeBackParts` (`keepWorld`), the link post-condition refuses a split link.
    - **Half-blind (dovetails chunk 3, schema 27; half-blind spec §3, §4).** The drawer-front joint: the pin part P keeps a LAP of
      solid wood in front of its sockets, measured from its outside face; the tail part T runs out to the LAP PLANE (`lap` inside P's
      outside face), not to that face. Both ends of a corner always carry the same kind (one `lap`, on both entries).
      - **The inset hook (`cornerPlan.ts`):** `JointKind.inset?(c, side, doc, nameOf)` is the ONE optional hook (box joints do not
        implement it, so their plans are byte for byte as before). **Step 3a** of `planCorners`: per corner, side 0 then side 1,
        BEFORE any end moves, the kind gives the inset `L` (a string refuses; only `L > 0` is kept). Step 4 builds an inset end's
        `EndOp` with **`far` moved `L` back into the other part** (`far = e.far − e.side·L`: `moveEnd` lands a moving MIN face exactly
        on `far`, so moving only `size` would be wrong on the min side — mutated), the size computed from that `far` exactly as
        before, and `depth = e.depth − L`; an end with no inset takes the original three expressions. Every downstream reader (the
        exact run-out, inv 25; the corner region; the stored `depth`; the linked Shape's replay, which reuses the ops; the signature)
        reads those numbers. Consequence of the order: a lap refusal shows before step 4's plain-stock refusal on another part.
      - **`dovetailCornerStyle(c, doc, opts, nameOf)` is the ONE tails-side and lap decision** (exported; `inset` and `planCorner` both
        call it, so both read one answer): the tails side (the re-plan's current tails part, else `RUN_RANK`, then Swap); the kind
        from the `joint` option (`'keep'` default | `'through'` | `'half-blind'`; under `keep` a corner already dovetailed keeps its
        kind and **the PINS entry's `lap` decides** — present means half-blind, even when the tails entry disagrees; a new corner is
        through); the lap: a typed `lap` as typed (stored EXACTLY, inv 25), else a re-plan whose pins part is unchanged keeps the
        stored pins `lap`, else **`autoLap(P.thickness, units)`** = a third of the thickness rounded to 1/16" (whole mm metric), at
        least 1/8" (3 mm) — 3/4" → 1/4", 18 mm → 6 mm. So Swap on a half-blind corner re-chooses a blank lap by Auto against the NEW
        pin part. A typed lap ≤ 1e-9 or NaN refuses with `A lap must be a length more than 0.` (`DOVETAIL_LAP_PARSE`, also the Lap
        field's parse error); a lap ≥ `P.thickness − 1e-9` with `<part> is too thin for a <lap> lap.` (`dovetailTooThin`): the
        `lap` fault's own bounds, decided at step 3a, before any mutation. A lap typed while every corner ends up through is ignored
        (no key, the note silent on it).
      - **The planner reads the true extent:** `planCorner`'s `narrow` probe builds each side's trial `Dovetail` WITH the lap, so
        Auto counts and refuses on `X = tP − lap` (a 1-1/2" front at 1:4 takes 3 tails half-blind, 2 through). `addAt` spreads
        `lap` onto BOTH entries only when non-null (a through entry never gets the key); the kind's `signature` appends the lap, so
        linked users must agree on it; `DovetailPlan.corners[]` carries `lap: number | null`. A re-plan to `Through` moves each tail
        end back out by exactly `lap` (a side with two half-blind ends grows `2·lap`), and to `Half-blind` shortens it the same way.
      - **The words** (`dovetailText.ts`): the success note names the kind and the lap — one shared layout `Dovetailed <n> corners,
        half-blind: <N> tails, 1:<s>, <lap> lap.`, else per corner `<A> and <B>: <N> tails, 1:<s>, half-blind, <lap> lap.` (a mix of
        kinds or laps takes the per-corner form; a through corner's lines are byte for byte as before). `dovetailedLines`' `units`
        and `lap` are optional, and a layout with a lap and no units THROWS (no silent imperial default; a build ruling). The panel
        (`Dovetails.tsx`): a `Joint` select (`As they are` / `Through` / `Half-blind`) and a `Lap` field (blank is Auto, a length in
        the document's units, inv 5's draft rules; disabled for Through; a parse error disables the button unless Through). The
        store's `dovetailCorners(ids, slope, count, swap, joint = 'keep', lap = null)`: ONE undo entry, refused while exploded.
    - **What a dovetailed part may carry** (spec §3.6): plain stock only — a lean, angle cut, curve, edge profile, edge band, round
      tenon or box joint refuses dovetails (`<part> has <…> — dovetails work on plain stock for now.`), and Box joint the corners
      refuses a dovetailed part (`<part> has dovetails — box joints work on plain stock for now.`). On a dovetailed part the Lean,
      Angles, Curves, Profiles, Banding and Round tenons ADDS refuse (`<part> has dovetails — remove them first.`; a clear never
      does; Bore leg sockets' Tenon the legs too). **A cut or hole reaching a dovetailed end's ZONE** (`dovetailZones`: `depth` back
      from each STORED dovetail's end, the whole section, a faulted one included) refuses on add or edit (`<part> has dovetails at that end
      — keep cuts and holes clear of the joint.`): `addCut`/`updateCut` (`dovetailCutRefusal`), `addHoleRows`/`updateHoleRow`, Add stretcher and
      Bore leg sockets (`holeTouchesBox`). **A cut running straight THROUGH that end along the dovetail's run is exempt**
      (`cutRunsThrough`, the corner planner's ONE predicate: a drawer bottom's groove). Half-blind changes neither: the zone is
      `depth` back, whole section, so a pins part's zone includes its lap, and the through-groove exemption holds on a half-blind
      pins part too (a build ruling: a groove deeper than `tP − lap` would breach the lap unrefused). So `holeFaults`, `holes.ts` and `stockProbe`
      never meet dovetail waste at an authoring path (a resize moving an existing hole into a zone is fu 506; `fitStretcher` has no
      zone check, fu 508). The void store actions that refuse now return `string | null` (Spec difference 2) and each panel shows
      the sentence as its alert.
    - **The checks** (spec §5.3, the user's ruling; inv 38, 39): a part with a BUILT dovetail is `realBodied`, so overlap and
      `partMass` read its real bodies; `contactRegions` trims every region to the wood behind each baseline, then adds per tail (at
      its baseline span) or per pin and half pin (at its outside-face span) the box INSCRIBED at its narrowest J span over the
      dovetail's whole depth, intersected with the untrimmed regions. The angled cheeks are never contacts; the two parts'
      inscribed boxes only ever touch; a tail's flat underside rests on the pin part's wood behind its baseline. **No new kind of
      support** (inv 39 untouched): a dovetailed drawer on the floor and a carcass whose top takes the tails onto two sides check
      clean (`designCheck.dovetails.test.ts`). A part whose dovetails are all faulted checks exactly as its dovetail-free twin.
      **Half-blind:** the pins' inscribed boxes are unchanged (their narrowest span over the whole thickness; in front of the lap
      plane that is lap wood), plus ONE lap-slab box per built half-blind
      pins dovetail (whole J, run `depth`, outside face to lap plane; inv 38); a half-blind drawer (half-blind front, through back)
      and the carcass with a half-blind top check clean; a faulted half-blind front checks as its plain twin.
    - **Joinery, Refine and Repair** read ONE predicate, `cornerJointed(b)` (`leanKeep.ts`: a recognised finger set OR a stored
      dovetail, faulted or not), at every KEEP and LEAVE-ALONE site; the finger CLAIM sites (`fingerClaim.ts`, `refineDesign.ts`,
      `cutlist.ts`) stay finger-only — a dovetail is not a cut, so `gateUnjoin` never sees it and there is nothing to claim (pinned,
      `dovetailsRefine.test.ts`). **Joinery leaves a dovetailed part's size and place alone** (`<part> has dovetails, so joinery
      leaves its size and place alone`, decided before any mutation); **unlike box joints, a pocket INTO a dovetailed part is skipped
      or refused when it reaches a dovetailed end's zone** (`intoDovetails`, a PROBE pocket judged by the store's `dovetailCutRefusal`,
      so a groove running through the end joins), and a half-lap notch likewise. **Refine keeps dovetailed parts and dovetailed
      ASSEMBLIES whole** exactly as box-jointed ones (`keepsExactly`, `keptParts`, inv 56, 61), the words by kind (`has dovetails`,
      `"<placement>" is an assembly with dovetails …`, both kinds named when both); a joined Refine fixes new sites touching a kept
      part as butt, keeps a recorded joint as recorded, and the (c) guard (`changedBoxJointed`, `fingerClaim.ts`, which compares the dovetails too)
      returns the design UNJOINED with `Joinery would have changed <name>, which Refine keeps as it is for its dovetails, so the
      design comes back unjoined.` **Repair never changes a dovetailed part** (`changedDovetailed`: a result that would refuses the
      whole repair). Generate never authors a dovetail; the design schema and `toWireDesign` are byte for byte the same.
    - **The cut list** prints one line per STORED dovetail (`dovetailLine`, `dovetailText.ts`, after the finger-set lines and before
      the square-tenon lines; a faulted one still printed), and on the TAIL part's row only, beside its diagrams, the bench drawings
      (`dovetailBenches`, `dovetailBench.ts`: one pair per distinct fault-free tails layout, two equal ends one pair noted `both
      ends`; figure A the tail board's face, figure B the pin board's end grain, side by side at one scale, rendered by
      `DovetailBench.tsx`). Every string is assembled in `dovetailBench.ts` (inv 19), lengths through `formatLengthBare` (inv 52:
      bare mm in metric); the label size is PartDiagram's (each figure `FIG_W / VIEW_W` of the row); the chain is drawn in full only
      when every label fits its own span, else each distinct value once at its first span with the overall `H` on both figures.
      The pin part's row carries its line only. **Half-blind lines** (copy review owed, fu 518): tails `Half-blind dovetails — <N>
      <tail|tails>, 1:<s>, pins <p> at the narrow end, <depth> deep, at the <dim> <end> end; this part has the tails, each <Te> wide at
      the end.`; pins `…; this part has the pins, their narrow ends behind a <lap> lap on its thickness <outside> face.` — ONE
      template for both kinds (only the head word and the pins clause branch), a through line byte for byte as before. **Half-blind
      bench:** the bench's `layoutKey` includes the lap (a through and a half-blind tail end of one depth are two benches); figure B's
      pin-board thickness is `depth + lap`, its sockets run from the lap plane to the inside face, the chain sits at the lap plane, the
      ticks run down to it, a `.cutlist-bench-lap` band is drawn over `[0, lap]`, and a `lap <x>` label (`benchLap`,
      `formatLengthBare`) shares the outside face's label row; figure A is unchanged in form (its baseline at `tP − lap`); a through
      figure has no `lap` key. No third figure (spec §5.2; fu 517). Follow-ups 497–515 (fu 497 closed for the joint, its heights half
      in fu 485) and 516–521 (half-blind).
